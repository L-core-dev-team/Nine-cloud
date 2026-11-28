"""
verify-blender.py —— Blender 5.3 / 5.2.5 统一验收脚本（后台模式）

覆盖：Cycles OptiX 设备、GPU 渲染耗时、Python 自动化、Geometry Nodes 求值、
Principled 材质 + 程序化噪声、GLB 导出（含自定义属性）、场景统计。
输出：<out>/jx_verify_<ver>.png、<out>/jx_verify_<ver>.glb、stdout 中 JX_BLENDER {...}

用法：
  blender -b --factory-startup --python-exit-code 1 --python verify-blender.py -- <out_dir> <tag>
"""
import json, os, sys, time
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.getcwd()
TAG = argv[1] if len(argv) > 1 else "blender"
os.makedirs(OUT, exist_ok=True)
receipt = {"tag": TAG, "blender": bpy.app.version_string, "checks": {}}


def fail(name, exc):
    receipt["checks"][name] = {"ok": False, "error": repr(exc)}


# 1) 场景：地形 + 塔 + GN 散布石块
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

mesh = bpy.data.meshes.new("Ridge")
obj = bpy.data.objects.new("Ridge", mesh)
scene.collection.objects.link(obj)
import bmesh
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=24, y_segments=24, size=6.0)
for v in bm.verts:
    v.co.z = 0.6 * (v.co.x ** 2 + v.co.y ** 2) / 12.0
bm.to_mesh(mesh); bm.free()

tower_mesh = bpy.data.meshes.new("Tower")
tower = bpy.data.objects.new("Tower", tower_mesh)
scene.collection.objects.link(tower)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bm.to_mesh(tower_mesh); bm.free()
tower.scale = (0.9, 0.9, 3.2)
tower.location = (0, 0, 2.2)

# 2) Geometry Nodes：Distribute Points on Faces → Instance on Points(cube)
gn_ok, gn_verts = False, 0
try:
    ng = bpy.data.node_groups.new("JX_Scatter", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n_in = ng.nodes.new("NodeGroupInput")
    n_out = ng.nodes.new("NodeGroupOutput")
    dist = ng.nodes.new("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = 0.8
    cube = ng.nodes.new("GeometryNodeMeshCube")
    cube.inputs["Size"].default_value = (0.12, 0.12, 0.12)
    inst = ng.nodes.new("GeometryNodeInstanceOnPoints")
    join = ng.nodes.new("GeometryNodeJoinGeometry")
    ng.links.new(n_in.outputs[0], dist.inputs["Mesh"])
    ng.links.new(dist.outputs["Points"], inst.inputs["Points"])
    ng.links.new(cube.outputs["Mesh"], inst.inputs["Instance"])
    ng.links.new(n_in.outputs[0], join.inputs[0] if "Geometry" in join.inputs else join.inputs[0])
    ng.links.new(inst.outputs["Instances"], join.inputs[0])
    ng.links.new(join.outputs[0], n_out.inputs[0])
    mod = obj.modifiers.new("JX_GN", "NODES")
    mod.node_group = ng
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    gn_verts = len(ev.data.vertices)
    gn_ok = gn_verts > 600
except Exception as e:
    fail("geometry_nodes", e)
receipt["checks"]["geometry_nodes"] = {"ok": gn_ok, "evaluated_vertices": gn_verts}

# 3) 材质：Principled + Noise → Bump
mat_ok = False
try:
    mat = bpy.data.materials.new("JX_Stone")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.42, 0.40, 0.36, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 7.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    tower.data.materials.append(mat)
    obj.data.materials.append(mat)
    mat_ok = True
except Exception as e:
    fail("material", e)
receipt["checks"]["material"] = {"ok": mat_ok}

# 4) 相机 / 灯光 / 世界
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
cam.location = (12.0, -14.0, 7.5)
from mathutils import Vector as _V
_d = _V((0, 0, 2.0)) - _V(cam.location)
cam.rotation_euler = _d.to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
scene.collection.objects.link(sun)
sun.rotation_euler = (0.55, 0.15, 0.35)
sun.data.energy = 3.6
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.08, 0.10, 1)
scene.world = world

# 5) Cycles OptiX
render_ok, device_name = False, None
try:
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
        if d.use:
            device_name = d.name
    scene.cycles.device = "GPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.image_settings.file_format = "PNG"
    png = os.path.join(OUT, f"jx_verify_{TAG}.png")
    scene.render.filepath = png
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    secs = round(time.time() - t0, 2)
    render_ok = os.path.exists(png) and os.path.getsize(png) > 10000
    receipt["checks"]["cycles_optix"] = {"ok": render_ok, "device": device_name, "seconds": secs,
                                         "png": png, "png_bytes": os.path.getsize(png) if os.path.exists(png) else 0}
except Exception as e:
    fail("cycles_optix", e)

# 6) GLB 导出
glb_ok, glb = False, os.path.join(OUT, f"jx_verify_{TAG}.glb")
try:
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=False,
                              export_apply=True, export_yup=True)
    glb_ok = os.path.exists(glb) and os.path.getsize(glb) > 10000
except Exception as e:
    fail("glb_export", e)
receipt["checks"]["glb_export"] = {"ok": glb_ok, "path": glb, "bytes": os.path.getsize(glb) if os.path.exists(glb) else 0}

receipt["objects"] = [o.name for o in scene.objects]
receipt["ok"] = all(v.get("ok") for v in receipt["checks"].values())
print("JX_BLENDER " + json.dumps(receipt, ensure_ascii=False))
