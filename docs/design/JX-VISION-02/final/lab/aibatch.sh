#!/bin/bash
cd "$(dirname "$0")"
LOG=${LOG:-./render.log}
until grep -q ALLDONE $LOG; do sleep 20; done
B=../bvenv/bin/python; P=../sdvenv/bin/python
mask(){ $B scene.py -- --res 1280x720 --mask "$@" 2>&1 | grep -E "Error|Trace"; }
mask --view talk --minute 315 --out out/m-talk-F.png
mask --view ferry --minute 330 --out out/m-ferry-F.png
mask --view wqt-tele --minute 330 --out out/m-tele-F.png
mask --view burst --minute 345 --crows burst --out out/m-burst-F.png
mask --view macro --minute 345 --out out/m-macro-F.png
paint(){ HF_HUB_DISABLE_PROGRESS_BARS=1 $P paint.py "out/F-$1.png" "out/A-$1.png" "$2" "$3" 22 7 2>&1 | grep -E "DONE|Error"; }
comp(){ $P composite.py "out/F-$1.png" "out/A-$1.png" "out/m-$2-F.png" "out/C-$1.png" x 2>&1 | tail -1; }
paint talk-0515 "cinematic film still, old ferryman in straw rain cape and conical bamboo hat on a muddy riverbank at dawn, back view, long bamboo pole, boulders blocking a river channel, grey crows on the rocks, golden morning mist, reeds, ancient rural China, photorealistic" 0.5; comp talk-0515 talk
paint ferry-0530 "cinematic film still, a pile of large boulders blocking a ferry channel on a calm river at dawn, the largest rock as tall as a door, dozens of grey crows perched on the rocks, reeds with white plumes, misty hills, ancient China, photorealistic" 0.45; comp ferry-0530 ferry
paint arrive-0500 "cinematic film still, dawn on a wide calm river mouth in ancient China, pink and gold sky, distant misty mountains, reed flowers on sandbars, mirror reflections, small ferry settlement on the far bank, photorealistic" 0.42
paint wqt-0530 "cinematic film still, view from an old weathered wooden watchtower with posts and roof beams framing a river valley at sunrise, autumn grassland, scattered trees, river mist, distant hills, ancient China, photorealistic" 0.42
paint tele-0530 "telephoto film still, small riverside ferry village with thatched houses at dawn, a pile of boulders blocking the ferry channel, crows on the rocks, morning haze, autumn grass, ancient China, photorealistic" 0.42; comp tele-0530 tele
paint burst-0545 "cinematic film still, dozens of grey crows bursting into flight from a pile of boulders in a river at morning, motion blur, reeds, hills, ancient China, photorealistic" 0.45; comp burst-0545 burst
paint macro-0545 "macro photograph, crevice between large river boulders with a nest of soft fresh dry grass, pressed ring marks, morning light, shallow depth of field, photorealistic" 0.5; comp macro-0545 macro
paint wqt-1715 "cinematic film still, blue hour after sunset viewed from an old wooden watchtower, dark river valley, pink band above the eastern horizon, deep blue sky, quiet, ancient China, photorealistic" 0.38
paint aerial-0530 "aerial photograph at sunrise over a winding river widening into a delta, autumn floodplain, low hills, morning mist in the valley, small villages, ancient China landscape, photorealistic" 0.45
paint wqt-1200 "cinematic film still, view from an old wooden watchtower framing a river valley at noon, clear sky, autumn grassland, scattered trees, distant hills, ancient China, photorealistic" 0.42
paint wqt-1645 "cinematic film still, view from an old wooden watchtower framing a river valley in golden late afternoon light, long shadows, autumn grassland, trees, distant hills, ancient China, photorealistic" 0.42
paint ferry-cleared "cinematic film still, calm river ferry channel in the morning, boulders pushed aside, an open dark water channel, reeds with white plumes, misty hills, ancient China, photorealistic" 0.45
echo AIDONE
