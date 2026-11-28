import json, time
import numpy as np
from numba import njit
import taichi as ti

@njit(cache=False)
def nsum(a):
    s = 0.0
    for i in range(a.size):
        s += a[i]
    return s

a = np.arange(1_000_000, dtype=np.float64)
t0 = time.time(); s = nsum(a); t1 = time.time()
ti.init(arch=ti.cpu)
N = 1_000_000
x = ti.field(ti.f32, shape=N)
y = ti.field(ti.f32, shape=())

@ti.kernel
def fill():
    for i in x:
        x[i] = i * 0.5

@ti.kernel
def total():
    s = 0.0
    for i in x:
        s += x[i]
    ti.atomic_add(y[None], s)

y[None] = 0.0
fill(); total()
exp = float((np.arange(N) * 0.5).sum())
rel = abs(float(y[None]) - exp) / exp
r = {"numba_ok": bool(abs(s - a.sum()) < 1e-3), "numba_seconds": round(t1 - t0, 4),
     "taichi_version": list(ti.__version__), "taichi_arch": "cpu", "taichi_sum": round(float(y[None]), 1),
     "expected": round(exp, 1), "taichi_rel_error": round(rel, 6), "taichi_ok": bool(rel < 1e-4)}
print("JX_SCI " + json.dumps(r))
