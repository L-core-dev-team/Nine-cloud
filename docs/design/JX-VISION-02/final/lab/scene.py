"""芦花渡—望气台 连续地理场景（非生产，设计验证用）。

用法：python scene.py --view wqt --minute 330 --out out/wqt-0530.png [--samples 64] [--res 1600x900] [--preview]
坐标：x 东、y 北、z 上，单位米；原点 = 芦花渡渡槽口。
全部几何与材质均为程序化生成，不含任何第三方素材。
"""
import sys, math, argparse, os
import numpy as np
import bpy, bmesh
sys.path.insert(0, os.path.dirname(__file__))
import astro

ap = argparse.ArgumentParser()
ap.add_argument('--view', default='wqt')
ap.add_argument('--minute', type=int, default=330)
ap.add_argument('--day', type=int, default=266)         # 秋分前后
ap.add_argument('--out', default='out/test.png')
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--res', default='1600x900')
ap.add_argument('--fog', type=float, default=1.0)
ap.add_argument('--state', default='blocked')          # blocked | cleared
ap.add_argument('--crows', default='perched')          # perched | burst | none
ap.add_argument('--preview', action='store_true')
ap.add_argument('--exposure', type=float, default=None)
ap.add_argument('--save-blend', default='')
ap.add_argument('--lamp', action='store_true')
ap.add_argument('--mask', action='store_true')
ap.add_argument('--maskset', default='rock,crow,boat,nest')   # 事实遮罩：绑定事实的物体为白，其余为黑
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

LAT, LON = 30.0, 15.0
rng = np.random.default_rng(7)

# ---------------- noise (numpy value noise + fbm) ----------------
_perm = np.random.default_rng(11).random((512, 512)).astype(np.float32)
def vnoise(x, y):
    xi = np.floor(x).astype(np.int64); yi = np.floor(y).astype(np.int64)
    xf = x - xi; yf = y - yi
    u = xf * xf * (3 - 2 * xf); v = yf * yf * (3 - 2 * yf)
    def g(i, j): return _perm[i & 511, j & 511]
    a = g(xi, yi); b = g(xi + 1, yi); c = g(xi, yi + 1); d = g(xi + 1, yi + 1)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
def fbm(x, y, oct=5, lac=2.0, gain=0.5):
    s = 0; a = 1; f = 1; n = 0
    for _ in range(oct):
        s = s + a * vnoise(x * f, y * f); n += a; a *= gain; f *= lac
    return s / n
def ridged(x, y, oct=5):
    s = 0; a = 1; f = 1; n = 0
    for _ in range(oct):
        r = 1 - np.abs(vnoise(x * f, y * f) * 2 - 1); s = s + a * r * r; n += a; a *= 0.5; f *= 2.1
    return s / n
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

# ---------------- geography ----------------
WQT = np.array([-1100.0, -1000.0])          # 望气台：渡口西南约三里
def river_center(x):
    return 40 * np.sin(x / 520.0) + 25 * np.sin(x / 190.0 + 1.3) + 180.0 * smooth(-3000, -800, -x) * (np.sin(x / 900.0))
def river_half(x):
    return 70 + 0.06 * (x + 3000) + 900 * smooth(1400, 4200, x)   # 向东展宽成水口
def height(x, y):
    rc = river_center(x); hw = river_half(x)
    dy = y - rc
    d = np.abs(dy) - hw                       # >0 outside water
    base = 1.2 + 6 * fbm(x / 900, y / 900, 4) + 2.5 * fbm(x / 120, y / 120, 3)
    floodplain = np.clip(d / 260.0, 0, 1)
    h = 0.6 + base * (0.25 + 0.75 * floodplain)
    # river bed
    bed = -2.5 - 3.0 * (1 - np.clip((np.abs(dy) / np.maximum(hw, 1)), 0, 1) ** 2)
    h = np.where(d < 0, bed + 0.4 * fbm(x / 40, y / 40, 2), h * smooth(0, 35, d) + (-0.6) * (1 - smooth(0, 35, d)))
    # 望气台所在的丘
    r = np.hypot(x - WQT[0], y - WQT[1])
    h = h + 62 * np.exp(-(r / 300.0) ** 2) + 18 * np.exp(-(r / 700.0) ** 2) * fbm(x / 200, y / 200, 3)
    # 北岸低丘
    north = smooth(150, 900, dy - hw)
    h = h + north * (40 + 170 * ridged(x / 1300 + 3, y / 1300, 5))
    # 南方远山（那片白所在）
    south = smooth(-2600, -5200, y)
    h = h + south * (300 + 1100 * ridged(x / 2600 + 7, y / 2600 + 2, 6))
    # 西方上游峡口
    west = smooth(-2200, -5500, x) * smooth(60, 600, np.abs(dy) - hw)
    h = h + west * (120 + 380 * ridged(x / 1800, y / 1800 + 5, 5))
    # 渡槽（渡口作业位的水道）：从渡槽口向西南切入南岸
    t = np.clip(((x - 0) * -0.6 + (y - (rc - hw)) * -0.8) / 70.0, 0, 1)       # along channel
    px = 0 - 0.6 * 70 * t; py = (rc - hw) - 0.8 * 70 * t
    dc = np.hypot(x - px, y - py)
    chan = (1 - smooth(5, 9, dc)) * (t < 0.999)
    h = np.where(chan > 0, h * (1 - chan) + (-1.2) * chan, h)
    return h.astype(np.float32)

def bank_y(x):
    return river_center(x) - river_half(x)     # 南岸

FERRY_MOUTH = np.array([0.0, float(bank_y(np.array([0.0]))[0])])

# ---------------- utilities ----------------
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name):
    m = bpy.data.materials.new(name); return m, m.node_tree.nodes, m.node_tree.links
def principled(name, color, rough=0.6, spec=0.5, **kw):
    m, N, L = mat(name); p = N['Principled BSDF']; p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough
    for k, v in kw.items(): p.inputs[k].default_value = v
    return m
def grid_mesh(name, x0, x1, y0, y1, nx, ny, hole=None, extra_noise=0.0):
    xs = np.linspace(x0, x1, nx, dtype=np.float32); ys = np.linspace(y0, y1, ny, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys)
    Z = height(X, Y)
    if extra_noise: Z = Z + extra_noise * (fbm(X / 3.0, Y / 3.0, 3) - 0.5) * (Z > -0.3)
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    i = np.arange(nx * ny).reshape(ny, nx)
    q = np.stack([i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, 1:].ravel(), i[1:, :-1].ravel()], 1)
    if hole is not None:
        cx = (X[:-1, :-1] + X[1:, 1:]).ravel() / 2; cy = (Y[:-1, :-1] + Y[1:, 1:]).ravel() / 2
        keep = ~((cx > hole[0]) & (cx < hole[1]) & (cy > hole[2]) & (cy < hole[3])); q = q[keep]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(q.size); me.loops.foreach_set('vertex_index', q.ravel().astype(np.int32))
    me.polygons.add(len(q)); me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(q), 4, np.int32))
    me.update(calc_edges=True); me.validate()
    me.polygons.foreach_set('use_smooth', np.ones(len(q), bool))
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    # per-vertex masks for the shader: wet mud, rock, snow, reed
    Zr = Z.ravel(); Xr = X.ravel(); Yr = Y.ravel()
    gx, gy = np.gradient(Z, xs, ys[::1], axis=(1, 0)) if nx > 2 else (0, 0)
    slope = np.hypot(gx, gy).ravel()
    rc = river_center(Xr); hw = river_half(Xr); d = np.abs(Yr - rc) - hw
    wet = (1 - smooth(0, 18, d)) * (Zr > -0.8)
    rock = smooth(0.55, 1.1, slope) + smooth(900, 1300, Zr) * 0.4
    snow = smooth(1050, 1350, Zr + 120 * fbm(Xr / 500, Yr / 500, 3))
    reed = (1 - smooth(4, 60, d)) * (d > 1.0) * (Zr > -0.2) * (fbm(Xr / 40, Yr / 40, 3) > 0.42)
    for nm, arr in (('wet', wet), ('rock', np.clip(rock, 0, 1)), ('snow', snow)):
        a = me.color_attributes.new(nm, 'FLOAT_COLOR', 'POINT'); col = np.zeros((len(arr), 4), np.float32); col[:, 0] = arr; col[:, 3] = 1; a.data.foreach_set('color', col.ravel())
    return ob

def make_tree(name, seed):
    r = np.random.default_rng(seed); h = r.uniform(6, 11)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.25, radius2=0.08, depth=h * 0.7, location=(0, 0, h * 0.35)); tr = bpy.context.active_object
    tr.data.materials.append(bpy.data.materials.get('bark') or principled('bark', (0.12, 0.1, 0.08), 0.9))
    parts = [tr]
    leaf = bpy.data.materials.get('leaf')
    if leaf is None:
        leaf, N, L = mat('leaf'); p = N['Principled BSDF']
        oi = N.new('ShaderNodeObjectInfo'); ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.16, 0.17, 0.06, 1); ramp.color_ramp.elements[1].color = (0.45, 0.28, 0.07, 1)
        e = ramp.color_ramp.elements.new(0.6); e.color = (0.3, 0.26, 0.08, 1); L.new(oi.outputs['Random'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.8; p.inputs['Subsurface Weight'].default_value = 0.0
        tl = N.new('ShaderNodeBsdfTranslucent'); L.new(ramp.outputs['Color'], tl.inputs['Color']); mxs = N.new('ShaderNodeMixShader'); mxs.inputs['Fac'].default_value = 0.3; L.new(p.outputs['BSDF'], mxs.inputs[1]); L.new(tl.outputs['BSDF'], mxs.inputs[2]); L.new(mxs.outputs['Shader'], N['Material Output'].inputs['Surface'])
        tc = N.new('ShaderNodeTexCoord'); vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 9; L.new(tc.outputs['Object'], vo.inputs['Vector'])
        b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.9; L.new(vo.outputs['Distance'], b.inputs['Height']); L.new(b.outputs['Normal'], p.inputs['Normal'])
    bm = bmesh.new(); crown_r = r.uniform(2.0, 3.4); cz = h * 0.78
    for k in range(420):
        u = r.normal(size=3); u /= np.linalg.norm(u); rr = crown_r * r.uniform(0.35, 1.0) ** 0.4
        c = (u[0] * rr * 1.1, u[1] * rr * 1.1, cz + u[2] * rr * 0.75)
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r.uniform(0.14, 0.3))
        for v in res['verts']: v.co.x += c[0]; v.co.y += c[1]; v.co.z += c[2]
    lm = bpy.data.meshes.new(name + '_leaf'); bm.to_mesh(lm); bm.free(); lm.materials.append(leaf)
    for f in lm.polygons: f.use_smooth = True
    o = add_obj(name + '_leaf', lm); parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = tr; bpy.ops.object.join(); tr.name = name; tr.hide_render = True; tr.location = (0, 0, -2000)
    return tr

def terrain_material():
    m, N, L = mat('terrain'); p = N['Principled BSDF']
    def attr(nm):
        a = N.new('ShaderNodeAttribute'); a.attribute_name = nm; return a.outputs['Fac']
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.08; nz.inputs['Detail'].default_value = 8
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 1.7; nz2.inputs['Detail'].default_value = 10; L.new(tc.outputs['Object'], nz2.inputs['Vector'])
    # autumn grass: ochre ↔ olive by large noise
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.13, 0.13, 0.06, 1); ramp.color_ramp.elements[1].color = (0.24, 0.19, 0.09, 1)
    e = ramp.color_ramp.elements.new(0.5); e.color = (0.09, 0.12, 0.05, 1)
    L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    def mix(a, b, fac):
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L.new(fac, mx.inputs['Factor']);
        if isinstance(a, tuple): mx.inputs[6].default_value = (*a, 1)
        else: L.new(a, mx.inputs[6])
        if isinstance(b, tuple): mx.inputs[7].default_value = (*b, 1)
        else: L.new(b, mx.inputs[7])
        return mx.outputs[2]
    nz3 = N.new('ShaderNodeTexNoise'); nz3.inputs['Scale'].default_value = 0.012; nz3.inputs['Detail'].default_value = 4; L.new(tc.outputs['Object'], nz3.inputs['Vector'])
    ramp2 = N.new('ShaderNodeValToRGB'); ramp2.color_ramp.elements[0].color = (0.17, 0.2, 0.08, 1); ramp2.color_ramp.elements[1].color = (0.5, 0.4, 0.2, 1); L.new(nz3.outputs['Fac'], ramp2.inputs['Fac'])
    vo2 = N.new('ShaderNodeTexVoronoi'); vo2.inputs['Scale'].default_value = 0.6; L.new(tc.outputs['Object'], vo2.inputs['Vector'])
    m1 = N.new('ShaderNodeMix'); m1.data_type = 'RGBA'; m1.blend_type = 'MULTIPLY'; m1.inputs['Factor'].default_value = 0.5; L.new(ramp.outputs['Color'], m1.inputs[6]); L.new(ramp2.outputs['Color'], m1.inputs[7])
    m2 = N.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; L.new(vo2.outputs['Distance'], m2.inputs['Factor']); L.new(m1.outputs[2], m2.inputs[6]); m2.inputs[7].default_value = (0.55, 0.55, 0.5, 1)
    c = m2.outputs[2]
    c = mix(c, (0.11, 0.09, 0.06), attr('wet'))          # 湿泥
    c = mix(c, (0.33, 0.31, 0.29), attr('rock'))         # 岩
    c = mix(c, (0.86, 0.88, 0.92), attr('snow'))         # 远山顶的白
    L.new(c, p.inputs['Base Color'])
    rgh = N.new('ShaderNodeMapRange'); L.new(attr('wet'), rgh.inputs['Value']); rgh.inputs['To Min'].default_value = 0.85; rgh.inputs['To Max'].default_value = 0.25
    L.new(rgh.outputs['Result'], p.inputs['Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; L.new(nz2.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def water_material():
    m, N, L = mat('water'); p = N['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.055, 0.045, 0.025, 1)   # 水发黄（淤）
    p.inputs['Roughness'].default_value = 0.035; p.inputs['IOR'].default_value = 1.333
    tc = N.new('ShaderNodeTexCoord'); w = N.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = 'Y'; w.inputs['Scale'].default_value = 0.35; w.inputs['Distortion'].default_value = 6; w.inputs['Detail'].default_value = 6
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.02, 0.6, 1); L.new(tc.outputs['Object'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], w.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.9; nz.inputs['Detail'].default_value = 6; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    add = N.new('ShaderNodeMath'); add.operation = 'ADD'; L.new(w.outputs['Fac'], add.inputs[0]); L.new(nz.outputs['Fac'], add.inputs[1])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08; bump.inputs['Distance'].default_value = 0.05; L.new(add.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def add_obj(name, me):
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob

def make_reed(name, h=2.4, seed=0):
    r = np.random.default_rng(seed); bm = bmesh.new()
    segs = 10; ring = 4; rad = 0.007; bend = r.uniform(0.05, 0.25)
    rings = []
    for i in range(segs + 1):
        t = i / segs; z = h * t; x = bend * t * t * h * 0.3
        rr = rad * (1 - 0.6 * t)
        rings.append([bm.verts.new((x + rr * math.cos(a), rr * math.sin(a), z)) for a in np.linspace(0, 2 * math.pi, ring, endpoint=False)])
    for i in range(segs):
        for j in range(ring): bm.faces.new((rings[i][j], rings[i][(j + 1) % ring], rings[i + 1][(j + 1) % ring], rings[i + 1][j]))
    # plume: a fan of thin drooping strands (芦花)
    tipx = bend * h * 0.3
    for k in range(48):
        a = r.uniform(0, 2 * math.pi); L = r.uniform(0.14, 0.3); droop = r.uniform(0.3, 0.8); z0 = h - r.uniform(0, 0.22)
        p0 = (tipx, 0, z0); p1 = (tipx + math.cos(a) * L * 0.5, math.sin(a) * L * 0.5, z0 + L * 0.35); p2 = (tipx + math.cos(a) * L + bend * 0.2, math.sin(a) * L, z0 + L * (0.35 - droop))
        w = 0.006
        vs = [bm.verts.new((p0[0], p0[1] - w, p0[2])), bm.verts.new((p0[0], p0[1] + w, p0[2])), bm.verts.new((p1[0], p1[1] + w * 1.6, p1[2])), bm.verts.new((p1[0], p1[1] - w * 1.6, p1[2]))]
        bm.faces.new(vs)
        vs2 = [vs[3], vs[2], bm.verts.new((p2[0], p2[1] + w * 0.5, p2[2])), bm.verts.new((p2[0], p2[1] - w * 0.5, p2[2]))]; bm.faces.new(vs2)
    # two long leaves
    for k in range(3):
        a = r.uniform(0, 2 * math.pi); z0 = r.uniform(0.4, 1.4); L = r.uniform(0.5, 0.9)
        d = (math.cos(a), math.sin(a)); w = 0.02
        v = [bm.verts.new((0, 0, z0)), bm.verts.new((d[0] * L * 0.5 - d[1] * w, d[1] * L * 0.5 + d[0] * w, z0 + L * 0.25)), bm.verts.new((d[0] * L, d[1] * L, z0 - L * 0.15)), bm.verts.new((d[0] * L * 0.5 + d[1] * w, d[1] * L * 0.5 - d[0] * w, z0 + L * 0.25))]
        bm.faces.new(v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    stem = principled('reed_stem', (0.32, 0.27, 0.15), 0.6)
    plume = principled('reed_plume', (0.80, 0.74, 0.62), 0.7)
    pn = plume.node_tree.nodes['Principled BSDF']; pn.inputs['Subsurface Weight'].default_value = 0.0
    # 逆光通透：混入半透明
    N = plume.node_tree.nodes; L = plume.node_tree.links
    tr = N.new('ShaderNodeBsdfTranslucent'); tr.inputs['Color'].default_value = (0.95, 0.82, 0.6, 1)
    mx = N.new('ShaderNodeMixShader'); mx.inputs['Fac'].default_value = 0.45
    out = N['Material Output']; L.new(pn.outputs['BSDF'], mx.inputs[1]); L.new(tr.outputs['BSDF'], mx.inputs[2]); L.new(mx.outputs['Shader'], out.inputs['Surface'])
    me.materials.append(stem); me.materials.append(plume)
    for f in me.polygons: f.material_index = 1 if f.index >= segs * ring and f.index < segs * ring + 96 else 0
    ob = add_obj(name, me); ob.hide_render = True; ob.location = (0, 0, -1000); return ob

def scatter(target, inst_obj, vgroup, count, scale=(0.8, 1.2), seed=1, hair=False, hair_len=0.25, mat_name=None):
    ps = target.modifiers.new(f'ps_{inst_obj.name if inst_obj else vgroup}', 'PARTICLE_SYSTEM').particle_system
    s = ps.settings; s.type = 'HAIR'; s.count = count; s.use_advanced_hair = True; s.emit_from = 'FACE'; s.use_emit_random = True; s.use_even_distribution = True
    ps.vertex_group_density = vgroup; ps.seed = seed
    if hair:
        s.hair_length = hair_len; s.render_type = 'PATH'; s.child_type = 'INTERPOLATED'; s.child_percent = 6; s.rendered_child_count = 6; s.root_radius = 0.6; s.radius_scale = 0.004; s.tip_radius = 0.0
        s.use_rotations = True; s.rotation_mode = 'NOR'; s.roughness_2 = 0.08; s.roughness_endpoint = 0.04; s.clump_factor = 0.2
        if mat_name:
            target.data.materials.append(bpy.data.materials[mat_name]); s.material_slot = mat_name
    else:
        s.render_type = 'OBJECT'; s.instance_object = inst_obj; s.particle_size = 1.0; s.size_random = (scale[1] - scale[0]) / scale[1]
        s.use_rotations = True; s.rotation_mode = 'GLOB_Z'; s.phase_factor_random = 2.0; s.rotation_factor_random = 0.06
        s.use_rotation_instance = True
    return ps

def rock_mesh(name, radius, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=radius)
    ob = bpy.context.active_object; ob.name = name
    r = np.random.default_rng(seed)
    co = np.zeros(len(ob.data.vertices) * 3, np.float32); ob.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    n = co / np.linalg.norm(co, axis=1, keepdims=True)
    k = 1 + 0.28 * (fbm(n[:, 0] * 2.5 + seed, n[:, 1] * 2.5 + n[:, 2] * 1.7, 4) - 0.5) * 2
    # facets: flatten along a few random planes
    for _ in range(4):
        pn = r.normal(size=3); pn /= np.linalg.norm(pn); d = co @ pn; cut = radius * r.uniform(0.55, 0.8)
        co = co - np.outer(np.clip(d - cut, 0, None), pn)
    co = co * k[:, None]; co[:, 2] *= r.uniform(0.6, 0.85)
    ob.data.vertices.foreach_set('co', co.ravel()); ob.data.update()
    for f in ob.data.polygons: f.use_smooth = False
    return ob

def stone_material():
    m, N, L = mat('stone'); p = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 3.5; L.new(tc.outputs['Object'], vo.inputs['Vector'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 6; nz.inputs['Detail'].default_value = 12; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.16, 0.15, 0.14, 1); ramp.color_ramp.elements[1].color = (0.34, 0.32, 0.29, 1); L.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.8
    mx = N.new('ShaderNodeMath'); mx.operation = 'ADD'; L.new(vo.outputs['Distance'], mx.inputs[0]); L.new(nz.outputs['Fac'], mx.inputs[1])
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.6; L.new(mx.outputs['Value'], b.inputs['Height']); L.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

def wood_material(name='wood', base=(0.20, 0.15, 0.10), old=True):
    m, N, L = mat(name); p = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 14); L.new(tc.outputs['Object'], mp.inputs['Vector'])
    w = N.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.inputs['Scale'].default_value = 4; w.inputs['Distortion'].default_value = 9; w.inputs['Detail'].default_value = 8; L.new(mp.outputs['Vector'], w.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (base[0] * 0.6, base[1] * 0.6, base[2] * 0.6, 1); ramp.color_ramp.elements[1].color = (*[min(1, c * 1.7) for c in base], 1)
    L.new(w.outputs['Fac'], ramp.inputs['Fac'])
    if old:   # 朽：灰化与苔斑
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 6; L.new(tc.outputs['Object'], nz.inputs['Vector'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L.new(nz.outputs['Fac'], mx.inputs['Factor']); L.new(ramp.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (0.36, 0.35, 0.32, 1)
        L.new(mx.outputs[2], p.inputs['Base Color'])
    else: L.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 0.5; L.new(w.outputs['Fac'], b.inputs['Height']); L.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

def box(name, size, loc, rot=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); ob = bpy.context.active_object; ob.name = name; ob.scale = size
    if material: ob.data.materials.append(material)
    return ob

def house(x, y, w, d, h, ang, roof_mat, wall_mat, wood):
    z = float(height(np.array([x], np.float32), np.array([y], np.float32))[0])
    box('wall', (w, d, h), (x, y, z + h / 2 - 0.2), (0, 0, ang), wall_mat)
    # gable roof from two slabs
    pitch = math.radians(32); rl = (d / 2 + 0.5) / math.cos(pitch)
    for s in (-1, 1):
        cx = x - math.sin(ang) * s * (d / 4 + 0.25) * 1.0; cy = y + math.cos(ang) * s * (d / 4 + 0.25)
        box('roof', (w + 1.0, rl, 0.22), (cx, cy, z + h - 0.2 + math.tan(pitch) * (d / 4 + 0.25)), (-s * pitch, 0, ang), roof_mat)
    box('door', (0.9, 0.08, 1.8), (x + math.cos(ang) * 0 - math.sin(ang) * (-d / 2 - 0.02), y + math.sin(ang) * 0 + math.cos(ang) * (-d / 2 - 0.02), z + 0.7), (0, 0, ang), wood)

def crow_mesh():
    bm = bmesh.new()
    def ell(c, r, segs=8):
        res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=6, radius=1)
        for v in res['verts']: v.co = (v.co.x * r[0] + c[0], v.co.y * r[1] + c[1], v.co.z * r[2] + c[2])
    ell((0, 0, 0.16), (0.17, 0.08, 0.09)); ell((0.15, 0, 0.25), (0.06, 0.055, 0.055))
    # beak, tail, legs
    v = [bm.verts.new(p) for p in ((0.2, -0.015, 0.25), (0.2, 0.015, 0.25), (0.27, 0, 0.235))]; bm.faces.new(v)
    v = [bm.verts.new(p) for p in ((-0.14, -0.05, 0.16), (-0.14, 0.05, 0.16), (-0.33, 0.07, 0.1), (-0.33, -0.07, 0.1))]; bm.faces.new(v)
    for s in (-1, 1):
        v = [bm.verts.new(p) for p in ((0.0, s * 0.03, 0.08), (0.01, s * 0.03, 0.08), (0.01, s * 0.03, 0.0), (0.0, s * 0.03, 0.0))]; bm.faces.new(v)
    me = bpy.data.meshes.new('crow'); bm.to_mesh(me); bm.free()
    me.materials.append(principled('crow', (0.16, 0.16, 0.17), 0.45))      # 灰羽
    for f in me.polygons: f.use_smooth = True
    ob = add_obj('crow_src', me); ob.hide_render = True; ob.location = (0, 0, -1000); return ob

def boat(loc, ang, tilt):
    bm = bmesh.new(); L = 7.5; W = 1.5; H = 0.55; n = 14
    prof = []
    for i in range(n + 1):
        t = i / n; x = (t - 0.5) * L; w = W / 2 * (1 - (2 * t - 1) ** 4) ** 0.7; zlift = 0.25 * (2 * t - 1) ** 2
        prof.append([bm.verts.new((x, -w, H + zlift)), bm.verts.new((x, -w * 0.6, 0.05 + zlift * 0.5)), bm.verts.new((x, w * 0.6, 0.05 + zlift * 0.5)), bm.verts.new((x, w, H + zlift))])
    for i in range(n):
        for j in range(3): bm.faces.new((prof[i][j], prof[i + 1][j], prof[i + 1][j + 1], prof[i][j + 1]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.05)
    me = bpy.data.meshes.new('boat'); bm.to_mesh(me); bm.free(); me.materials.append(wood_material('boatwood', (0.16, 0.11, 0.07), True))
    ob = add_obj('boat', me); ob.location = loc; ob.rotation_euler = (tilt, 0.05, ang)
    # 篙
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=5.5, location=(loc[0] + 1.0, loc[1], loc[2] + 2.0), rotation=(0.5, 0.2, ang)); bpy.context.active_object.data.materials.append(bpy.data.materials['boatwood'])
    return ob

def figure(loc, ang, hat=True, pole=True):
    """岑九的剪影级人物：骨架 + 皮肤修改器。只用于远景与逆光剪影。"""
    bm = bmesh.new()
    pts = {'pelvis': (0, 0, 0.95), 'chest': (0.03, 0, 1.35), 'neck': (0.05, 0, 1.52), 'head': (0.07, 0, 1.68),
           'lh': (0.0, 0.12, 0.95), 'lk': (0.05, 0.13, 0.5), 'lf': (0.02, 0.13, 0.05), 'rh': (0.0, -0.12, 0.95), 'rk': (-0.04, -0.12, 0.5), 'rf': (-0.06, -0.12, 0.05),
           'ls': (0.03, 0.2, 1.42), 'le': (0.22, 0.26, 1.18), 'lw': (0.4, 0.2, 1.3), 'rs': (0.03, -0.2, 1.42), 're': (0.2, -0.27, 1.12), 'rw': (0.38, -0.18, 1.05)}
    V = {k: bm.verts.new(v) for k, v in pts.items()}
    for a, b in (('pelvis', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('pelvis', 'lh'), ('lh', 'lk'), ('lk', 'lf'), ('pelvis', 'rh'), ('rh', 'rk'), ('rk', 'rf'), ('chest', 'ls'), ('ls', 'le'), ('le', 'lw'), ('chest', 'rs'), ('rs', 're'), ('re', 'rw')):
        bm.edges.new((V[a], V[b]))
    me = bpy.data.meshes.new('fig'); bm.to_mesh(me); bm.free()
    ob = add_obj('cenjiu', me); ob.location = loc; ob.rotation_euler = (0, 0, ang)
    sk = ob.modifiers.new('skin', 'SKIN'); ob.modifiers.new('sub', 'SUBSURF').levels = 2
    radii = {'pelvis': 0.16, 'chest': 0.19, 'neck': 0.06, 'head': 0.1, 'lh': 0.1, 'lk': 0.075, 'lf': 0.05, 'rh': 0.1, 'rk': 0.075, 'rf': 0.05, 'ls': 0.07, 'le': 0.05, 'lw': 0.04, 'rs': 0.07, 're': 0.05, 'rw': 0.04}
    for i, k in enumerate(pts): ob.data.skin_vertices[0].data[i].radius = (radii[k], radii[k])
    ob.data.skin_vertices[0].data[0].use_root = True
    ob.data.materials.append(principled('cloth', (0.07, 0.065, 0.06), 0.8))
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.34, radius2=0.2, depth=0.78, location=(loc[0] + 0.02, loc[1], loc[2] + 0.62)); rb = bpy.context.active_object; rb.data.materials.append(bpy.data.materials['cloth'])
    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=0.42, radius2=0.12, depth=0.62, location=(loc[0] + 0.03, loc[1], loc[2] + 1.22)); cp = bpy.context.active_object
    straw = principled('cape', (0.15, 0.12, 0.07), 0.95); cp.data.materials.append(straw)
    co = np.zeros(len(cp.data.vertices) * 3, np.float32); cp.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3); co[:, :2] *= (1 + 0.12 * np.random.default_rng(1).random(len(co)))[:, None]; cp.data.vertices.foreach_set('co', co.ravel())
    if hat:
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.38, depth=0.2, location=(loc[0] + 0.07, loc[1], loc[2] + 1.83)); h = bpy.context.active_object; h.data.materials.append(principled('straw', (0.42, 0.34, 0.2), 0.9))
    if pole:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=4.6, location=(loc[0] + 0.45, loc[1] - 0.05, loc[2] + 1.6), rotation=(0.0, -0.35, ang)); bpy.context.active_object.data.materials.append(wood_material('pole', (0.25, 0.19, 0.12), False))
    return ob

def platform(cx, cy):
    """望气台：渡口外三里的旧观测台，木料朽了。"""
    z0 = float(height(np.array([cx], np.float32), np.array([cy], np.float32))[0])
    wood = wood_material('oldwood', (0.19, 0.15, 0.11), True)
    H = 5.5; S = 5.0
    PH = H + 3.1
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('post', (0.3, 0.3, PH), (cx + sx * S / 2, cy + sy * S / 2, z0 + PH / 2 - 0.3), (0.0, 0.012 * sx, 0), wood)
    # 台顶：檐梁与残破的顶棚
    for sy in (-1, 1): box('beam', (S + 0.9, 0.22, 0.26), (cx, cy + sy * S / 2, z0 + PH - 0.4), (0, 0, 0), wood)
    for sx in (-1, 1): box('beam', (0.22, S + 0.9, 0.26), (cx + sx * S / 2, cy, z0 + PH - 0.4), (0, 0, 0), wood)
    thatch = bpy.data.materials.get('thatch') or principled('thatch', (0.18, 0.15, 0.11), 0.95)
    for k in range(7):
        if k == 4: continue
        box('roofboard', (S + 1.4, 0.75, 0.08), (cx, cy - S / 2 - 0.3 + k * 0.95, z0 + PH - 0.1 + 0.25 * math.sin(k / 6 * math.pi)), (0.06, 0, 0), thatch)
    # deck planks with a few missing
    r = np.random.default_rng(3)
    for i in range(16):
        if i in (5, 11): continue
        box('plank', (S + 0.6, 0.3, 0.07), (cx, cy - S / 2 + 0.16 + i * 0.32, z0 + H), (0, 0, r.uniform(-0.02, 0.02)), wood)
    for sy in (-1, 1):
        box('rail', (S + 0.3, 0.12, 0.12), (cx, cy + sy * S / 2, z0 + H + 1.0), (0.0, 0.0, 0), wood)
    box('rail', (0.12, S + 0.3, 0.12), (cx - S / 2, cy, z0 + H + 1.0), (0, 0, 0), wood)
    box('rail_broken', (0.12, S * 0.55, 0.12), (cx + S / 2, cy - S * 0.2, z0 + H + 0.92), (0.12, 0, 0), wood)   # 断了一截
    for i in range(10):    # braces
        a = i * math.pi / 5
        box('brace', (0.1, 0.1, 3.2), (cx + math.cos(a) * S * 0.48, cy + math.sin(a) * S * 0.48, z0 + 2.2), (0.6 * math.sin(a), 0.6 * math.cos(a), a), wood)
    return z0 + H

# ---------------- build ----------------
clear()
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
W, Hh = map(int, args.res.split('x')); sc.render.resolution_x = W; sc.render.resolution_y = Hh; sc.render.resolution_percentage = 100
sc.cycles.samples = 12 if args.preview else args.samples; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 3; sc.cycles.transmission_bounces = 4; sc.cycles.volume_bounces = 1
sc.cycles.volume_step_rate = 4.0; sc.cycles.volume_max_steps = 256
sc.render.film_transparent = False
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'

ter = terrain_material(); wat = water_material()
far = grid_mesh('far', -16000, 16000, -16000, 16000, 401, 401, hole=(-3500, 3500, -3500, 3500))
mid = grid_mesh('mid', -3600, 3600, -3600, 3600, 721, 721, hole=(-1700, 500, -1600, 400))
near = grid_mesh('near', -1720, 520, -1620, 420, 1121, 1021, extra_noise=0.25)
for o in (far, mid, near): o.data.materials.append(ter)
bpy.ops.mesh.primitive_plane_add(size=40000, location=(0, 0, 0)); bpy.context.active_object.data.materials.append(wat)

# reeds and grass near the cameras
reeds = [make_reed(f'reed{i}', h=float(np.random.default_rng(i).uniform(1.8, 2.8)), seed=i) for i in range(4)]
coll = bpy.data.collections.new('reeds'); sc.collection.children.link(coll)
for r in reeds: coll.objects.link(r)
reed_src = reeds[0]
grass_m = principled('grass', (0.30, 0.25, 0.12), 0.7)
def grass_patch(name, cx, cy, size, step):
    n = int(size / step) + 1
    xs = np.linspace(cx - size / 2, cx + size / 2, n, dtype=np.float32); ys = np.linspace(cy - size / 2, cy + size / 2, n, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys); Z = height(X, Y) + 0.25 * (fbm(X / 3.0, Y / 3.0, 3) - 0.5) * (height(X, Y) > -0.3) + 0.01
    keep = Z > 0.15
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1); i = np.arange(n * n).reshape(n, n)
    q = np.stack([i[:-1, :-1].ravel(), i[:-1, 1:].ravel(), i[1:, 1:].ravel(), i[1:, :-1].ravel()], 1)
    q = q[keep.ravel()[q].all(1)]
    me = bpy.data.meshes.new(name); me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(q.size); me.loops.foreach_set('vertex_index', q.ravel().astype(np.int32)); me.polygons.add(len(q))
    me.polygons.foreach_set('loop_start', np.arange(0, q.size, 4, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(q), 4, np.int32)); me.update(calc_edges=True)
    ob = add_obj(name, me); ob.data.materials.append(ter)
    ps = ob.modifiers.new('g', 'PARTICLE_SYSTEM').particle_system; st = ps.settings; st.type = 'HAIR'; st.count = 60000 if args.preview else 420000
    st.hair_length = 0.32; st.use_advanced_hair = True; st.render_type = 'PATH'; st.root_radius = 0.6; st.radius_scale = 0.005; st.tip_radius = 0
    st.roughness_2 = 0.1; st.roughness_endpoint = 0.06; st.use_rotations = True; st.rotation_mode = 'NOR'; st.child_type = 'NONE'
    ob.data.materials.append(bpy.data.materials['grass']); st.material_slot = 'grass'; ob.show_instancer_for_render = False
    return ob
grass_patch('gp_wqt', WQT[0] + 40, WQT[1] + 30, 120, 0.8)
grass_patch('gp_ferry', -40.0, FERRY_MOUTH[1] - 60, 160, 0.8)
trees = [make_tree(f'tree{i}', i) for i in range(5)]
def vert_instances(name, src, pts, rot=0.0):
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts)); me.vertices.foreach_set('co', pts.astype(np.float32).ravel())
    par = add_obj(name, me); par.instance_type = 'VERTS'; par.use_instance_vertices_rotation = False
    
    if src.name not in bpy.context.scene.collection.all_objects: bpy.context.scene.collection.objects.link(src)
    src.parent = par; src.location = (0, 0, 0); src.rotation_euler = (0, 0, rot); src.hide_render = False
    return par
def sample(maskfn, x0, x1, y0, y1, n, seed):
    r = np.random.default_rng(seed); X = r.uniform(x0, x1, n * 6).astype(np.float32); Y = r.uniform(y0, y1, n * 6).astype(np.float32)
    w = maskfn(X, Y); keep = r.random(len(X)) < w; X, Y = X[keep][:n], Y[keep][:n]
    return np.stack([X, Y, height(X, Y) - 0.05], 1)
CAMPTS = np.array([[-26.0, FERRY_MOUTH[1] - 30], [-140.0, FERRY_MOUTH[1] + 60]])
def reed_mask(X, Y):
    rc = river_center(X); hw = river_half(X); d = np.abs(Y - rc) - hw; Z = height(X, Y)
    m = (d > 0.5) * (1 - smooth(10, 70, d)) * (Z > -0.25) * smooth(0.36, 0.5, fbm(X / 35, Y / 35, 3))
    m = m * smooth(14, 22, np.hypot(X - FERRY_MOUTH[0], Y - FERRY_MOUTH[1])) * smooth(8, 16, np.min(np.hypot(X[:, None] - CAMPTS[None, :, 0], Y[:, None] - CAMPTS[None, :, 1]), 1))
    hx = X + 0.6 * 40; hy = Y - FERRY_MOUTH[1] + 0.8 * 40      # keep the channel and settlement clear
    m = m * smooth(10, 18, np.hypot(hx, hy)) * (1 - ((X > -140) & (X < 50) & (Y < FERRY_MOUTH[1] - 25) & (Y > FERRY_MOUTH[1] - 240)))
    return m
NR = 9000 if args.preview else 90000
for i, r_ in enumerate(reeds):
    pts = sample(reed_mask, -1700, 500, -1600, 400, NR // len(reeds), 100 + i)
    for k in range(3): vert_instances(f'reeds{i}_{k}', r_ if k == 0 else r_.copy(), pts[k::3], rot=k * 2.1 + i)
def tree_mask(X, Y):
    rc = river_center(X); hw = river_half(X); d = np.abs(Y - rc) - hw; Z = height(X, Y)
    return smooth(40, 140, d) * (Z < 700) * smooth(0.48, 0.6, fbm(X / 260 + 9, Y / 260, 4)) * smooth(70, 160, np.hypot(X - WQT[0] - 40, Y - WQT[1] - 30))
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.35, radius2=0.0, depth=0.5, location=(0, 0, 0.2)); tus = bpy.context.active_object; tus.name = 'tussock'
tus.data.materials.append(principled('tus', (0.2, 0.17, 0.08), 0.9))
def tus_mask(X, Y):
    rc = river_center(X); hw = river_half(X); d = np.abs(Y - rc) - hw; Z = height(X, Y)
    return smooth(3, 20, d) * (Z < 600) * smooth(0.3, 0.55, fbm(X / 18, Y / 18, 3))
for k in range(3):
    pts = sample(tus_mask, -1700, 500, -1600, 400, (20000 if args.preview else 160000) // 3, 300 + k)
    vert_instances(f'tus{k}', tus if k == 0 else tus.copy(), pts, rot=k * 1.7)
NT = 1500 if args.preview else 9000
for i, t in enumerate(trees):
    pts = sample(tree_mask, -3500, 3500, -3500, 3500, NT // len(trees), 200 + i)
    vert_instances(f'trees{i}', t, pts, rot=i * 1.3)

# 芦花渡：房屋、栈桥
roof = principled('thatch', (0.18, 0.15, 0.11), 0.95); wall = principled('earthwall', (0.42, 0.37, 0.30), 0.9); wood = wood_material('wood', (0.2, 0.15, 0.1), True)
for (x, y, w, d, h, a) in ((-60, -110, 8, 6, 3.2, 0.3), (-30, -140, 7, 5, 3.0, 0.5), (-95, -150, 9, 6, 3.4, 0.2), (-15, -175, 6, 5, 2.8, 0.6), (-120, -100, 6, 5, 2.9, 0.1), (25, -150, 7, 5, 3.0, 0.7), (-70, -190, 8, 6, 3.3, 0.35)):
    house(x, FERRY_MOUTH[1] + y + 40, w, d, h, a, roof, wall, wood)
# 渡槽内的栈桥（作业位）
cx0, cy0 = FERRY_MOUTH[0] - 0.6 * 52, FERRY_MOUTH[1] - 0.8 * 52
for i in range(9):
    box('pier', (3.2, 0.32, 0.08), (cx0 - 4 + 0.0, cy0 + i * 0.36, 0.55), (0, 0, 0.64), wood)
for i in range(4):
    box('pile', (0.18, 0.18, 2.2), (cx0 - 5.5 + i * 0.9, cy0 + i * 0.7, -0.3), (0, 0, 0), wood)

# 落石：从上游冲下，堆在渡槽口；最大的一块有门板高
stone = stone_material(); stones = []
if args.state == 'blocked':
    r = np.random.default_rng(21)
    for i in range(46):
        ang = r.uniform(0, 2 * math.pi); rad = abs(r.normal(0, 5.5))
        x = FERRY_MOUTH[0] + math.cos(ang) * rad * 1.3; y = FERRY_MOUTH[1] + math.sin(ang) * rad - 1
        rr = r.uniform(0.35, 1.1) * (1.2 - min(rad, 9) / 12)
        o = rock_mesh(f'rock{i}', rr, i); o.location = (x, y + 3.0, max(-0.6, float(height(np.array([x], np.float32), np.array([y], np.float32))[0])) + rr * 0.3)
        o.rotation_euler = tuple(r.uniform(0, 6.28, 3)); o.data.materials.append(stone); stones.append(o)
    big = rock_mesh('rock_door', 1.25, 99); big.scale = (0.9, 0.55, 1.65); big.location = (FERRY_MOUTH[0] + 0.5, FERRY_MOUTH[1] - 0.5, 1.1); big.data.materials.append(stone); stones.append(big)
    # crows
    cs = crow_mesh(); r = np.random.default_rng(5)
    if args.crows == 'perched':
        for i in range(44):
            s = stones[r.integers(len(stones))]; sc_ = max(s.dimensions) if s.dimensions else 1
            x = s.location.x + r.uniform(-0.4, 0.4); y = s.location.y + r.uniform(-0.4, 0.4); z = s.location.z + s.dimensions.z * 0.45
            c = bpy.data.objects.new(f'crow{i}', cs.data); sc.collection.objects.link(c); c.location = (x, y, z); c.rotation_euler = (0, 0, r.uniform(0, 6.28)); c.scale = (1.5,) * 3
    elif args.crows == 'burst':
        for i in range(60):
            c = bpy.data.objects.new(f'crow{i}', cs.data); sc.collection.objects.link(c)
            c.location = (FERRY_MOUTH[0] + r.normal(0, 6), FERRY_MOUTH[1] + r.normal(0, 6), 2 + abs(r.normal(4, 3))); c.rotation_euler = tuple(r.uniform(-0.8, 0.8, 3)); c.scale = (1.5,) * 3

boat((cx0 - 2.0, cy0 - 3.0, -0.25), math.radians(37), 0.07)
figure((cx0 - 6.5, cy0 - 1.0, float(height(np.array([cx0 - 6.5], np.float32), np.array([cy0 - 1.0], np.float32))[0]) + 0.05), math.radians(40))
deck = platform(WQT[0] + 40, WQT[1] + 30)

# ---------------- sky, sun, atmosphere ----------------
alt, az = astro.sun_alt_az(args.minute, args.day, LAT, LON)
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
Nw = world.node_tree.nodes; Lw = world.node_tree.links
sky = Nw.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_disc = True
sky.sun_elevation = max(alt, math.radians(-8)); sky.sun_rotation = az      # 实测：0 = 正北，π/2 = 正东，与方位角同向
sky.altitude = 80; sky.air_density = 1.0; sky.aerosol_density = 2.2; sky.ozone_density = 1.0
bg = Nw['Background']; bg.inputs['Strength'].default_value = 1.0
Lw.new(sky.outputs['Color'], bg.inputs['Color'])
# night floor: faint starlight & airglow so that night is not pure black
if alt < math.radians(-4):
    add = Nw.new('ShaderNodeAddShader'); b2 = Nw.new('ShaderNodeBackground'); b2.inputs['Color'].default_value = (0.004, 0.006, 0.012, 1)
    Lw.new(bg.outputs['Background'], add.inputs[0]); Lw.new(b2.outputs['Background'], add.inputs[1]); Lw.new(add.outputs['Shader'], Nw['World Output'].inputs['Surface'])
# valley mist (a volume slab over the river plain)
if args.fog > 0:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-800, -500, 20)); fogb = bpy.context.active_object; fogb.scale = (7000, 6000, 40)
    fm, N, L = mat('mist'); N.remove(N['Principled BSDF']); vs = N.new('ShaderNodeVolumePrincipled'); vs.inputs['Density'].default_value = 0.0
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
    # density falls with height (object z in [-0.5,0.5])
    mr = N.new('ShaderNodeMapRange'); L.new(sep.outputs['Z'], mr.inputs['Value']); mr.inputs['From Min'].default_value = -0.5; mr.inputs['From Max'].default_value = 0.1
    base_d = 0.0011 * args.fog * (1.6 if alt < math.radians(12) else 0.5)
    mr.inputs['To Min'].default_value = base_d; mr.inputs['To Max'].default_value = 0.0
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    ml = N.new('ShaderNodeMath'); ml.operation = 'MULTIPLY'; L.new(mr.outputs['Result'], ml.inputs[0]); L.new(nz.outputs['Fac'], ml.inputs[1])
    L.new(ml.outputs['Value'], vs.inputs['Density']); vs.inputs['Anisotropy'].default_value = 0.65; vs.inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
    L.new(vs.outputs['Volume'], N['Material Output'].inputs['Volume']); fogb.data.materials.append(fm)

# ---------------- cameras ----------------
def look(cam, frm, to, lens):
    cam.location = frm; d = np.array(to) - np.array(frm)
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    cam.data.lens = lens; cam.data.clip_end = 40000; cam.data.clip_start = 0.05
camd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', camd); sc.collection.objects.link(cam); sc.camera = cam
fm_ = FERRY_MOUTH
def gz(x, y): return float(height(np.array([x], np.float32), np.array([y], np.float32))[0])
FIG = (cx0 - 6.5, cy0 - 1.0)
V = args.view
if V == 'wqt':        # 望气台台上，向东北俯瞰渡口；台柱入画作框
    look(cam, (WQT[0] + 40 - 1.9, WQT[1] + 30 - 1.9, deck + 1.6), (fm_[0] - 40, fm_[1] - 40, 0), 30)
elif V == 'wqt-tele':  # 观察：推近（同一机位，长焦）
    look(cam, (WQT[0] + 40 - 1.9, WQT[1] + 30 - 1.9, deck + 1.6), (fm_[0] - 6, fm_[1] + 2, 1.0), 420)
elif V == 'ferry':     # 渡口东侧岸上，平视落石与鸦群
    px, py = fm_[0] + 16, fm_[1] - 14; look(cam, (px, py, max(gz(px, py), 0.2) + 1.6), (fm_[0] - 1, fm_[1] + 1.5, 1.4), 35)
elif V == 'talk':      # 交谈：岑九在作业位旁，逆光；船与落石在背景
    px, py = FIG[0] - 5.0, FIG[1] - 6.5; look(cam, (px, py, max(gz(px, py), 0.2) + 1.55), (FIG[0] + 0.3, FIG[1] + 0.6, gz(*FIG) + 1.45), 50)
elif V == 'burst':     # 打鸦：鸦群炸起
    px, py = fm_[0] + 9, fm_[1] - 9; look(cam, (px, py, max(gz(px, py), 0.2) + 1.2), (fm_[0], fm_[1] + 1, 4.0), 24)
elif V == 'arrive':    # 开场：水面低机位，芦花擦过镜头，渡口在前
    look(cam, (fm_[0] - 120, fm_[1] + 34, 1.1), (fm_[0] - 10, fm_[1] - 6, 1.6), 32)
elif V == 'macro':     # 细察落石：石缝里的干草
    s = bpy.data.objects.get('rock_door'); c0 = np.array(s.location) if s else np.array([fm_[0], fm_[1], 1.0])
    tgt = (c0[0] - 0.9, c0[1] - 0.4, 0.55)                       # 巨石脚下与小石之间的缝
    look(cam, (c0[0] - 4.2, c0[1] - 3.0, 1.25), tgt, 85)
    camd.dof.use_dof = True; camd.dof.focus_distance = float(np.linalg.norm(np.array(tgt) - np.array((c0[0] - 4.2, c0[1] - 3.0, 1.25)))); camd.dof.aperture_fstop = 2.0
    # 鸦巢：干草与一圈浅痕（clue_crow_nest）
    nb = bmesh.new(); rr_ = np.random.default_rng(4)
    for k in range(260):
        a0 = rr_.uniform(0, 6.28); rad = 0.18 + rr_.normal(0, 0.03); L0 = rr_.uniform(0.08, 0.2); z0 = 0.02 + rr_.uniform(0, 0.05)
        p0 = (tgt[0] + math.cos(a0) * rad, tgt[1] + math.sin(a0) * rad, tgt[2] - 0.12 + z0); t0 = a0 + math.pi / 2 + rr_.normal(0, 0.4)
        p1 = (p0[0] + math.cos(t0) * L0, p0[1] + math.sin(t0) * L0, p0[2] + rr_.normal(0, 0.01)); w = 0.004
        nb.faces.new([nb.verts.new((p0[0], p0[1], p0[2])), nb.verts.new((p1[0], p1[1], p1[2])), nb.verts.new((p1[0], p1[1], p1[2] + w)), nb.verts.new((p0[0], p0[1], p0[2] + w))])
    nm = bpy.data.meshes.new('nest'); nb.to_mesh(nm); nb.free(); nm.materials.append(principled('straw2', (0.55, 0.45, 0.25), 0.8)); add_obj('nest', nm)
elif V == 'aerial':    # 万象尺度：从西南高空看整片水口
    look(cam, (-2600, -3400, 1500), (-300, -300, 0), 30)
elif V == 'zhegui':    # 折桂坪：望气台北侧缓坡，俯瞰渡口
    look(cam, (WQT[0] + 120, WQT[1] + 380, float(height(np.array([WQT[0] + 120], np.float32), np.array([WQT[1] + 380], np.float32))[0]) + 1.6), (fm_[0], fm_[1], 0), 28)

# sun lamp (sharp shadows); sky disc kept for the visible sun
if args.lamp and alt > math.radians(-1.5):
    ld = bpy.data.lights.new('sun', 'SUN'); ld.angle = math.radians(0.53)
    el = max(alt, 0.0); ld.energy = 3.2 * min(1.0, 0.15 + math.sin(el) * 3)
    so = bpy.data.objects.new('sun', ld); sc.collection.objects.link(so)
    # light travels from the sun towards the scene
    so.rotation_euler = (math.pi / 2 - el, 0, math.pi - az)   # -Z points from the sun toward the scene
    # colour: atmospheric transmittance tint
    t = max(0.0, math.sin(el)); ld.color = (1.0, 0.55 + 0.45 * min(1, t * 4), 0.25 + 0.75 * min(1, t * 3))
    sky.sun_intensity = 0.0 if False else 1.0

if args.mask:
    FACT = tuple(args.maskset.split(','))
    def emis(c):
        m = bpy.data.materials.new('em'); N = m.node_tree.nodes; L = m.node_tree.links; N.remove(N['Principled BSDF']); e = N.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (c, c, c, 1); e.inputs['Strength'].default_value = 1; L.new(e.outputs[0], N['Material Output'].inputs['Surface']); return m
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and any(m and m.name == 'mist' for m in o.data.materials)]: o.hide_render = True
    white, black = emis(1.0), emis(0.0)
    for m in list(bpy.data.materials):
        if m.name in ('em', 'em.001'): continue
    fact_mats = {m.name for o in bpy.data.objects if o.name.startswith(FACT) and o.type == 'MESH' for m in o.data.materials if m}
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        isfact = o.name.startswith(FACT) or (o.data.name == 'crow')
        for i in range(len(o.data.materials)): o.data.materials[i] = white if isfact else black
        for ps_ in o.particle_systems: pass
    bpy.data.materials['grass'].node_tree  # hair keeps 'grass' slot -> make it black
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.particle_systems:
            for i in range(len(o.data.materials)): o.data.materials[i] = black
    for ob_ in [o for o in bpy.data.objects if o.name.startswith('cube') or (o.type == 'MESH' and o.data.materials and o.data.materials[0] == black and o.dimensions.z > 30 and o.dimensions.x > 5000)]: pass
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    sc.cycles.samples = 8; sc.cycles.use_denoising = False; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.filepath = os.path.abspath(args.out); sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True); print('WROTE', sc.render.filepath); sys.exit(0)
ev = args.exposure if args.exposure is not None else (-3.6 if alt > math.radians(20) else -3.0 if alt > math.radians(4) else -1.8 if alt > 0 else 1.0 if alt > math.radians(-6) else 3.5)
sc.view_settings.exposure = ev
sc.render.filepath = os.path.abspath(args.out)
sc.render.image_settings.file_format = 'PNG'
if args.save_blend: bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend))
print('SUN', round(math.degrees(alt), 2), round(math.degrees(az), 1), 'EV', ev)
bpy.ops.render.render(write_still=True)
print('WROTE', sc.render.filepath)
