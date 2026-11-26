#!/bin/bash
cd "$(dirname "$0")"
P=../bvenv/bin/python
r(){ $P scene.py -- --res 1280x720 --samples 48 "$@" 2>&1 | grep -E "WROTE|Error|Traceback"; }
r --view talk --minute 315 --out out/F-talk-0515.png
r --view arrive --minute 300 --out out/F-arrive-0500.png
r --view wqt --minute 330 --out out/F-wqt-0530.png
r --view wqt-tele --minute 330 --out out/F-tele-0530.png
r --view ferry --minute 330 --out out/F-ferry-0530.png
r --view burst --minute 345 --crows burst --out out/F-burst-0545.png
r --view wqt --minute 1035 --out out/F-wqt-1715.png
r --view macro --minute 345 --out out/F-macro-0545.png
r --view aerial --minute 330 --out out/F-aerial-0530.png
r --view wqt --minute 720 --out out/F-wqt-1200.png
r --view wqt --minute 1005 --out out/F-wqt-1645.png
r --view ferry --minute 345 --state cleared --crows none --out out/F-ferry-cleared.png
echo ALLDONE
