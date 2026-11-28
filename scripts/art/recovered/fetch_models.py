import os, sys, json, hashlib, time
if not os.environ.get("HF_HOME"):
    raise SystemExit("Set HF_HOME to an external model cache.")
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
from huggingface_hub import hf_hub_download
M = os.path.abspath(os.environ["JX_MODEL_DIR"])
jobs = [
  # (repo, filename, local_dir)
  ("stabilityai/stable-diffusion-xl-base-1.0", "sd_xl_base_1.0.safetensors", os.path.join(M, 'checkpoints')),
  ("diffusers/controlnet-depth-sdxl-1.0", "config.json", os.path.join(M, 'controlnet', 'controlnet-depth-sdxl-1.0')),
  ("diffusers/controlnet-depth-sdxl-1.0", "diffusion_pytorch_model.fp16.safetensors", os.path.join(M, 'controlnet', 'controlnet-depth-sdxl-1.0')),
  ("diffusers/controlnet-canny-sdxl-1.0", "config.json", os.path.join(M, 'controlnet', 'controlnet-canny-sdxl-1.0')),
  ("diffusers/controlnet-canny-sdxl-1.0", "diffusion_pytorch_model.fp16.safetensors", os.path.join(M, 'controlnet', 'controlnet-canny-sdxl-1.0')),
  ("depth-anything/Depth-Anything-V2-Small-hf", "config.json", os.path.join(M, 'geometry_estimation', 'Depth-Anything-V2-Small-hf')),
  ("depth-anything/Depth-Anything-V2-Small-hf", "preprocessor_config.json", os.path.join(M, 'geometry_estimation', 'Depth-Anything-V2-Small-hf')),
  ("depth-anything/Depth-Anything-V2-Small-hf", "model.safetensors", os.path.join(M, 'geometry_estimation', 'Depth-Anything-V2-Small-hf')),
]
if len(sys.argv) != 2 or sys.argv[1] not in {job[0] for job in jobs}:
    raise SystemExit("Choose one model repository: " + ", ".join(sorted({job[0] for job in jobs})))
jobs = [job for job in jobs if job[0] == sys.argv[1]]
os.makedirs(M, exist_ok=True)
out = []
for repo, fn, d in jobs:
    t = time.time()
    for attempt in range(4):
        try:
            p = hf_hub_download(repo, fn, local_dir=d); break
        except Exception as e:
            print("retry", repo, fn, e, flush=True); time.sleep(10)
    else:
        print("FAILED", repo, fn, flush=True); continue
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""): h.update(chunk)
    rec = {"repo": repo, "file": fn, "path": p, "bytes": os.path.getsize(p), "sha256": h.hexdigest(), "seconds": round(time.time() - t)}
    out.append(rec); print(json.dumps(rec), flush=True)
json.dump(out, open(os.path.join(M, jobs[0][0].replace("/", "--") + "-fetch-results.json"), "w", encoding="utf-8"), indent=1)
print("DONE", len(out), "of", len(jobs))

if len(out) != len(jobs):
    raise SystemExit(1)
