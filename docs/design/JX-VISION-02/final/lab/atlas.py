"""万象天图 · 天下尺度（候选布局，非 Canon）。
Canon 只确定：万兽山脉东西横贯、把人族分为南北；洪荒妖林在山脉深处；中州居中；东瀚濒东海；冰神宫在极北。
候选：中州在山脉以北的中央、北境在北、南疆在南、西荒在西、东瀚在东（西荒与东瀚跨越山脉两侧）。
"""
import sys, os, math, numpy as np, bpy
sys.path.insert(0, os.path.dirname(__file__))
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'out/atlas.png'
rng = np.random.default_rng(3)
_p = np.random.default_rng(9).random((512, 512)).astype(np.float32)
def vn(x, y):
    xi = np.floor(x).astype(int); yi = np.floor(y).astype(int); xf = x - xi; yf = y - yi; u = xf * xf * (3 - 2 * xf); v = yf * yf * (3 - 2 * yf)
    g = lambda i, j: _p[i & 511, j & 511]
    return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v
def fbm(x, y, o=6):
    s = 0; a = 1; f = 1; n = 0
    for _ in range(o): s += a * vn(x * f, y * f); n += a; a *= .5; f *= 2
    return s / n
def ridged(x, y, o=6):
    s = 0; a = 1; f = 1; n = 0
    for _ in range(o): r = 1 - abs(vn(x * f, y * f) * 2 - 1); s += a * r * r; n += a; a *= .5; f *= 2.1
    return s / n
NX, NY = 720, 480; xs = np.linspace(-1.5, 1.5, NX); ys = np.linspace(-1.0, 1.0, NY); X, Y = np.meshgrid(xs, ys)
# continent mask: an irregular landmass; east coast broken into islands (东瀚)
edge = 1 - ((X / 1.32) ** 2 + (Y / 0.86) ** 2) + 0.35 * (fbm(X * 2.2 + 5, Y * 2.2) - 0.5)
edge -= 0.55 * np.clip((X - 0.95) / 0.4, 0, 1) * (fbm(X * 7, Y * 7) < 0.55)        # eastern archipelago
land = edge > 0
cst = np.clip(edge / 0.12, 0, 1); H = np.where(land, cst * (0.012 + 0.05 * fbm(X * 3, Y * 3)), -0.05)
wid = 0.09 + 0.06 * fbm(X * 3 + 4, Y * 3)
mtn = np.exp(-((Y - 0.05 * np.sin(X * 2.4) - 0.06 * (fbm(X * 2.5, 7 + Y) - 0.5)) / wid) ** 2) * land            # 万兽山脉
H += mtn * cst * (0.05 + 0.4 * ridged(X * 6, Y * 6) ** 1.6)
north = np.clip((Y - 0.55) / 0.3, 0, 1) * land; H += north * 0.08 * ridged(X * 5 + 2, Y * 5)
west_volcano = np.exp(-(((X + 0.95) ** 2 + (Y + 0.0) ** 2) / 0.003)) * 0.25; H += west_volcano * land
H = np.where(land, H, -0.05 + 0.02 * fbm(X * 4, Y * 4))
# biomes (候选)
col = np.zeros(X.shape + (3,))
zhong = np.array([0.33, 0.40, 0.20]); bei = np.array([0.88, 0.91, 0.95]); xi_ = np.array([0.62, 0.30, 0.12]); nan = np.array([0.10, 0.22, 0.12]); dong = np.array([0.30, 0.42, 0.33]); yao = np.array([0.08, 0.18, 0.09])
Xw = X + 0.22 * (fbm(X * 2 + 11, Y * 2) - 0.5); Yw = Y + 0.18 * (fbm(X * 2, Y * 2 + 13) - 0.5)
sm = lambda e0, e1, v: np.clip((v - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((v - e0) / (e1 - e0), 0, 1))
w_bei = sm(0.42, 0.62, Yw); w_xi = sm(0.45, 0.8, -Xw); w_dong = sm(0.6, 0.9, Xw); w_nan = sm(0.1, 0.32, -Yw); w_yao = np.exp(-((Xw / 0.42) ** 2 + ((Yw - 0.03) / 0.1) ** 2))
c = zhong[None, None] * np.ones_like(col)
for w, cc in ((w_nan, nan), (w_bei, bei), (w_xi, xi_), (w_dong, dong), (w_yao, yao)):
    c = c * (1 - w[..., None]) + cc * w[..., None]
c = c * (0.85 + 0.3 * fbm(X * 9, Y * 9)[..., None])
c = np.where((mtn > 0.4)[..., None], c * 0.75 + np.array([0.28, 0.27, 0.25]) * 0.25, c)
c = np.where((H > 0.38)[..., None], np.array([0.9, 0.9, 0.92]), c)
# scene
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.render.resolution_x = 1600; sc.render.resolution_y = 1000
verts = np.stack([X.ravel() * 10, Y.ravel() * 10, np.maximum(H, -0.02).ravel() * 2.0], 1).astype(np.float32)
i = np.arange(NX * NY).reshape(NY, NX); q = np.stack([i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, 1:].ravel(), i[1:, :-1].ravel()], 1)
me = bpy.data.meshes.new('t'); me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
me.loops.add(q.size); me.loops.foreach_set('vertex_index', q.ravel().astype(np.int32)); me.polygons.add(len(q))
me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(q), 4, np.int32)); me.update(calc_edges=True)
me.polygons.foreach_set('use_smooth', np.ones(len(q), bool))
a = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT'); cc = np.concatenate([c.reshape(-1, 3), np.ones((NX * NY, 1))], 1).astype(np.float32); a.data.foreach_set('color', cc.ravel())
ob = bpy.data.objects.new('t', me); sc.collection.objects.link(ob)
m = bpy.data.materials.new('m'); N = m.node_tree.nodes; L = m.node_tree.links; at = N.new('ShaderNodeAttribute'); at.attribute_name = 'col'
L.new(at.outputs['Color'], N['Principled BSDF'].inputs['Base Color']); N['Principled BSDF'].inputs['Roughness'].default_value = 0.9; me.materials.append(m)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0.0)); sea = bpy.context.active_object
sm = bpy.data.materials.new('sea'); p = sm.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0.03, 0.07, 0.11, 1); p.inputs['Roughness'].default_value = 0.25; sea.data.materials.append(sm)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; sk = w.node_tree.nodes.new('ShaderNodeTexSky'); sk.sky_type = 'MULTIPLE_SCATTERING'; sk.sun_elevation = math.radians(28); sk.sun_rotation = math.radians(230)
w.node_tree.links.new(sk.outputs['Color'], w.node_tree.nodes['Background'].inputs['Color'])
ld = bpy.data.lights.new('s', 'SUN'); ld.energy = 2.0; ld.angle = math.radians(1.5); so = bpy.data.objects.new('s', ld); sc.collection.objects.link(so); so.rotation_euler = (math.radians(60), 0, math.radians(-40))
cd = bpy.data.cameras.new('c'); cd.lens = 42; cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -13, 25); cam.rotation_euler = (math.radians(27), 0, 0)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -4.2
sc.render.filepath = os.path.abspath(out); bpy.ops.render.render(write_still=True); print('WROTE', out)
# export projected label anchors for the overlay
import bpy_extras
anchors = {'中州天枢域': (0.0, 0.32), '北境霜寒域': (0.0, 0.72), '西荒焚天域': (-0.95, 0.05), '东瀚龙吟域': (1.08, 0.12), '南疆万蛊域': (0.05, -0.5), '洪荒妖林': (0.0, 0.03), '万兽山脉': (-0.55, 0.0), '芦花渡（候选）': (0.62, 0.22)}
res = {}
for k, (x, y) in anchors.items():
    j = int((x + 1.5) / 3 * (NX - 1)); ii = int((y + 1) / 2 * (NY - 1)); z = max(H[ii, j], 0) * 2.0
    co = bpy_extras.object_utils.world_to_camera_view(sc, cam, __import__('mathutils').Vector((x * 10, y * 10, z)))
    res[k] = (round(co.x * 1600), round((1 - co.y) * 1000))
import json; json.dump(res, open(out + '.anchors.json', 'w'), ensure_ascii=False); print(res)
