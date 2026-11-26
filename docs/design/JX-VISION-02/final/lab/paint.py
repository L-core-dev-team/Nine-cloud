"""AI 重绘层：以 Blender 路径追踪渲染为构图与光照依据，图生图重绘表面细节。
模型：stable-diffusion-v1-5（CreativeML OpenRAIL-M，可商用但有用途限制）；本机 CPU 推理，零费用。
用法：python paint.py in.png out.png "prompt" [strength] [steps] [seed]
"""
import sys, time, json, hashlib, torch
from PIL import Image
from diffusers import StableDiffusionImg2ImgPipeline, DPMSolverMultistepScheduler

src, dst, prompt = sys.argv[1], sys.argv[2], sys.argv[3]
strength = float(sys.argv[4]) if len(sys.argv) > 4 else 0.45
steps = int(sys.argv[5]) if len(sys.argv) > 5 else 24
seed = int(sys.argv[6]) if len(sys.argv) > 6 else 1
MODEL = 'stable-diffusion-v1-5/stable-diffusion-v1-5'
torch.set_num_threads(4)
pipe = StableDiffusionImg2ImgPipeline.from_pretrained(MODEL, torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
img = Image.open(src).convert('RGB')
W, H = img.size; s = 768 / max(W, H); w8, h8 = int(W * s) // 8 * 8, int(H * s) // 8 * 8
init = img.resize((w8, h8), Image.LANCZOS)
neg = 'text, watermark, signature, logo, cartoon, anime, 3d render, cgi, low poly, plastic, blurry, deformed, oversaturated'
t = time.time()
out = pipe(prompt=prompt, negative_prompt=neg, image=init, strength=strength, num_inference_steps=steps, guidance_scale=6.5, generator=torch.Generator().manual_seed(seed)).images[0]
out = out.resize((W, H), Image.LANCZOS); out.save(dst)
meta = {'source_render': src, 'model': MODEL, 'license': 'CreativeML OpenRAIL-M', 'prompt': prompt, 'negative': neg, 'strength': strength, 'steps': steps, 'seed': seed,
        'aigc': True, 'seconds': round(time.time() - t, 1), 'sha256': hashlib.sha256(open(dst, 'rb').read()).hexdigest()}
json.dump(meta, open(dst + '.json', 'w'), ensure_ascii=False, indent=1)
print('DONE', dst, meta['seconds'])
