"""Run offline with the CUDA-enabled Python. Pass an optional local SDXL depth ControlNet directory."""
import argparse
import json
import math
import os

import torch
from scipy.integrate import solve_ivp


def check_controlnet(directory):
    # Keep model loading local even if the caller has a network-enabled cache.
    os.environ["HF_HUB_OFFLINE"] = "1"
    from diffusers import ControlNetModel

    model = ControlNetModel.from_pretrained(
        directory, local_files_only=True, variant="fp16", torch_dtype=torch.float16
    ).to("cuda").eval()
    torch.manual_seed(19)

    def sample(shape):
        return torch.randn(shape, device="cuda", dtype=torch.float16)

    with torch.inference_mode():
        output = model(
            sample((1, 4, 16, 16)), 1,
            encoder_hidden_states=sample((1, 77, 2048)),
            controlnet_cond=sample((1, 3, 128, 128)),
            added_cond_kwargs={
                "text_embeds": sample((1, 1280)),
                "time_ids": torch.tensor([[128, 128, 0, 0, 128, 128]], device="cuda", dtype=torch.float16),
            },
        )
        torch.cuda.synchronize()
        tensors = [*output.down_block_res_samples, output.mid_block_res_sample]
        if not all(t.is_cuda and torch.isfinite(t).all().item() for t in tensors):
            raise RuntimeError("ControlNet returned a non-finite or non-CUDA tensor")
        return {
            "outputs": len(tensors),
            "mid_shape": list(tensors[-1].shape),
            "mid_abs_mean": tensors[-1].float().abs().mean().item(),
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--controlnet", help="existing local SDXL depth ControlNet directory")
    args = parser.parse_args()

    torch.manual_seed(17)
    torch.set_float32_matmul_precision("highest")
    a = torch.randn(512, 512)
    b = torch.randn(512, 512)
    product = a.cuda() @ b.cuda()
    torch.cuda.synchronize()
    reference = (a.double() @ b.double()).float()
    torch.testing.assert_close(product.cpu(), reference, atol=0.0002, rtol=0.00002)

    solution = solve_ivp(lambda t, y: -y, (0, 1), [1.0], rtol=1e-10, atol=1e-12)
    ode_error = abs(solution.y[0, -1] - math.exp(-1))
    if not solution.success or ode_error > 1e-9:
        raise RuntimeError("ODE integration failed analytic check")

    result = {
        "device": torch.cuda.get_device_name(),
        "capability": torch.cuda.get_device_capability(),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "matmul_max_abs_error": (product.cpu() - reference).abs().max().item(),
        "ode_absolute_error": ode_error,
    }
    if args.controlnet:
        result["controlnet"] = check_controlnet(args.controlnet)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
