import json, time, torch

dev = torch.cuda.get_device_name(0)
cc = torch.cuda.get_device_capability(0)
torch.backends.cuda.matmul.allow_tf32 = True
a = torch.randn(8192, 8192, device="cuda", dtype=torch.float16)
b = torch.randn(8192, 8192, device="cuda", dtype=torch.float16)
for _ in range(3):
    c = a @ b
torch.cuda.synchronize()
t0 = time.time()
for _ in range(10):
    c = a @ b
torch.cuda.synchronize()
secs = time.time() - t0
flops = 10 * 2 * 8192 ** 3 / secs / 1e12
r = {"device": dev, "capability": cc, "torch": torch.__version__, "cuda": torch.version.cuda,
     "seconds_10matmul": round(secs, 3), "tflops_fp16": round(flops, 1),
     "mem_allocated_gib": round(torch.cuda.memory_allocated() / 2 ** 30, 2)}
print("JX_WSL_CUDA " + json.dumps(r))
