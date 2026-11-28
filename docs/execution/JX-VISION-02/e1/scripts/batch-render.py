"""batch-render.py —— Blender 5.3 批量渲染（3 帧 PNG 序列，Cycles OptiX）"""
import json, os, sys, time
import bpy

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.getcwd()
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.mesh.primitive_uv_sphere_add(location=(0, 0, 1.2))
sph = bpy.context.object
bpy.ops.mesh.primitive_plane_add(size=12)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
sc.collection.objects.link(cam)
cam.location = (6, -7, 3.5)
cam.rotation_euler = (1.1, 0, 0.7)
sc.camera = cam
light = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "AREA"))
sc.collection.objects.link(light)
light.location = (3, -3, 6)
light.data.energy = 800
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
sc.cycles.device = "GPU"
sc.cycles.samples = 16
sc.render.resolution_x = 480
sc.render.resolution_y = 270
sc.render.image_settings.file_format = "PNG"
sc.frame_start, sc.frame_end = 1, 3
sc.render.filepath = os.path.join(out, "batch_")
t0 = time.time()
bpy.ops.render.render(animation=True)
files = sorted(f for f in os.listdir(out) if f.startswith("batch_") and f.endswith(".png"))
print("JX_BATCH " + json.dumps({"ok": len(files) == 3, "files": files, "seconds": round(time.time() - t0, 2),
                               "blender": bpy.app.version_string}))
