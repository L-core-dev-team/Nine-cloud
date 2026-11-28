"""Recovered two-seed SDXL experiment. Requires local, licensed weights and cached pipeline configuration."""
import json, os, time
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
import numpy as np, torch
from PIL import Image
from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline

OUT = os.environ["JX_SMOKE_OUTPUT"]
os.makedirs(OUT, exist_ok=False)
W, H = 1344, 768
# Synthetic depth: far sky band, a receding river plain and a near bank on the left.
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
depth = np.clip((y - H * 0.38) / (H * 0.62), 0, 1) ** 0.7
depth = np.maximum(depth, np.clip(1 - x / (W * 0.45), 0, 1) * np.clip((y - H * 0.45) / (H * 0.55), 0, 1))
Image.fromarray((depth * 255).astype(np.uint8)).convert("RGB").save(os.path.join(OUT, "depth.png"))

t0 = time.time()
cn = ControlNetModel.from_pretrained(os.path.join(os.environ["JX_MODEL_DIR"], "controlnet", "controlnet-depth-sdxl-1.0"), variant="fp16", torch_dtype=torch.float16, local_files_only=True)
pipe = StableDiffusionXLControlNetPipeline.from_single_file(
    os.path.join(os.environ["JX_MODEL_DIR"], "checkpoints", "sd_xl_base_1.0.safetensors"), controlnet=cn, torch_dtype=torch.float16, local_files_only=True)
pipe.to("cuda")
pipe.vae.config.force_upcast = True
load_s = time.time() - t0
torch.cuda.reset_peak_memory_stats()
prompt = ("early autumn dawn over a wide slow river in southern China, reed beds with pale plumes, muddy bank, "
          "low mist on the water, soft overcast light, photographic, natural color, 35mm")
negative = "people, buildings, boats, text, watermark, modern objects, oversaturated, cartoon"
runs = []
for seed in (1, 2):
    t = time.time()
    image = pipe(prompt, negative_prompt=negative, image=Image.open(os.path.join(OUT, "depth.png")),
                 controlnet_conditioning_scale=0.7, num_inference_steps=30, guidance_scale=6.0,
                 width=W, height=H, generator=torch.Generator("cuda").manual_seed(seed)).images[0]
    runs.append(round(time.time() - t, 2))
    image.save(os.path.join(OUT, f"smoke_seed{seed}.png"))
rec = {"model": "sd_xl_base_1.0 + controlnet-depth-sdxl-1.0 (fp16)", "size": [W, H], "steps": 30,
       "load_s": round(load_s, 1), "seconds_per_image": runs,
       "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 2**30, 2), "device": torch.cuda.get_device_name(0),
       "torch": torch.__version__}
json.dump(rec, open(os.path.join(OUT, "smoke.json"), "w"), indent=1)
print(json.dumps(rec))
