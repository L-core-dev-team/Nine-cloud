"""Run with Blender --background --factory-startup --python-exit-code 1 --python FILE -- NEW.png."""
import json
import sys
import time
from pathlib import Path

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 1:
        raise ValueError("Specify a new PNG path after --")
    output = Path(args[0]).resolve()
    if output.suffix.lower() != ".png" or output.exists():
        raise ValueError("Choose an unused PNG output path")
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = "OPTIX"
    preferences.refresh_devices()
    for device in preferences.devices:
        device.use = device.type == "OPTIX"
    enabled = [device.name for device in preferences.devices if device.use]
    if not enabled:
        raise RuntimeError("OptiX device unavailable")

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 320
    scene.render.resolution_y = 180
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    start = time.monotonic()
    bpy.ops.render.render(write_still=True)
    elapsed = time.monotonic() - start

    image = bpy.data.images.load(str(output), check_existing=False)
    red = image.pixels[0::4]
    if tuple(image.size) != (320, 180) or max(red) <= min(red):
        raise RuntimeError("Expected a nonuniform 320 by 180 image")
    print("JX_RENDER " + json.dumps({
        "blender": bpy.app.version_string,
        "devices": enabled,
        "backend": preferences.compute_device_type,
        "seconds": round(elapsed, 3),
        "bytes": output.stat().st_size,
    }))


main()
