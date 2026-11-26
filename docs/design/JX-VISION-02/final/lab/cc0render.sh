#!/bin/bash
cd "$(dirname "$0")"
for v in "ferry 330 ferry-0530" "talk 315 talk-0515" "wqt 330 wqt-0530"; do set -- $v; ../bvenv/bin/python scene.py -- --view $1 --minute $2 --res 1280x720 --samples 48 --cc0 cc0 --out out/K-$3.png 2>&1 | grep -E "WROTE|Error"; done; echo CC0DONE
