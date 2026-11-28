import json, os, hashlib, time, urllib.request
UA = {"User-Agent": "jx-asset-fetch/1.0"}
ROOT = os.path.abspath(os.environ["JX_CC0_DIR"])
TEX = ["brown_mud_02","brown_mud_rocks_01","mud_cracked_dry_riverbed_002","damp_sand","forrest_ground_01","aerial_grass_rock",
       "sparse_grass","withered_grass","river_small_rocks","ganges_river_pebbles","coast_sand_rocks_02","rock_face","mossy_rock",
       "dry_riverbed_rock","rock_pitted_mossy","old_planks_02","brown_planks_05","wood_planks_dirt","bark_willow","bark_willow_02",
       "chinese_cedar_bark","japanese_zelkova_bark","clay_plaster","patterned_clay_wall","clay_block_wall","reed_roof_04",
       "thatch_roof_angled","grey_roof_tiles","stacked_stone_wall","japanese_stone_wall"]
HDR = ["qwantani_dawn_puresky","qwantani_sunrise_puresky","qwantani_morning_puresky","qwantani_mid_morning_puresky",
       "qwantani_noon_puresky","qwantani_afternoon_puresky","qwantani_late_afternoon_puresky","qwantani_sunset_puresky",
       "qwantani_dusk_1_puresky","qwantani_dusk_2_puresky","qwantani_moonrise_puresky","qwantani_night_puresky",
       "kloofendal_misty_morning_puresky","kloofendal_overcast_puresky","kloppenheim_07_puresky"]
MAPS = {"Diffuse":"jpg","nor_gl":"png","Rough":"jpg","Displacement":"png","AO":"jpg"}
def get(url):
    for a in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r: return r.read()
        except Exception as e: print("retry", url, e, flush=True); time.sleep(8)
    raise RuntimeError(url)
ledger = []
failed = []
def save(asset, kind, url, md5, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        data = get(url)
        if md5 and hashlib.md5(data).hexdigest() != md5: raise RuntimeError("md5 mismatch " + url)
        open(dest, "wb").write(data)
    data = open(dest, "rb").read()
    info = json.loads(get(f"https://api.polyhaven.com/info/{asset}")) if not any(l["asset"] == asset for l in ledger) else None
    authors = info.get("authors") if info else next(l["authors"] for l in ledger if l["asset"] == asset)
    ledger.append({"asset": asset, "kind": kind, "file": os.path.relpath(dest, ROOT), "sourceUrl": url,
                   "page": f"https://polyhaven.com/a/{asset}", "license": "CC0-1.0", "authors": authors,
                   "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "downloaded": time.strftime("%Y-%m-%d")})
    print(asset, kind, len(data), flush=True)
for a in TEX:
    files = json.loads(get(f"https://api.polyhaven.com/files/{a}"))
    for m, ext in MAPS.items():
        f = files.get(m, {}).get("2k", {}).get(ext)
        if f:
            try: save(a, m, f["url"], f.get("md5"), os.path.join(ROOT, "textures", a, os.path.basename(f["url"])))
            except Exception as e: failed.append({"asset": a, "map": m, "error": str(e)}); print("FAILED", a, m, flush=True)
for a in HDR:
    f = json.loads(get(f"https://api.polyhaven.com/files/{a}"))["hdri"]["4k"]["hdr"]
    try: save(a, "hdri", f["url"], f.get("md5"), os.path.join(ROOT, "hdris", os.path.basename(f["url"])))
    except Exception as e: failed.append({"asset": a, "map": "hdri", "error": str(e)}); print("FAILED", a, flush=True)
json.dump(ledger, open(os.path.join(ROOT, "cc0-ledger.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(failed, open(os.path.join(ROOT, "cc0-failed.json"), "w"), indent=1)
print("FAILED COUNT", len(failed))
print("DONE", len(ledger), "files", round(sum(l["bytes"] for l in ledger)/1e9, 2), "GB")

if failed:
    raise SystemExit(1)
