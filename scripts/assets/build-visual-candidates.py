#!/usr/bin/env python3
"""Build metadata-free visual derivatives and a provenance manifest from the local pack.

The source directory is deliberately supplied by the operator. Source originals
are never modified. The generated manifest keeps source hashes and derivative
hashes while excluding embedded metadata values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageOps


SCENES = {
    "mountain-gate": {
        "desktop": "01-场景海报/山门-月下入界-桌面.jpg",
        "mobile": "01-场景海报/山门-月下入界-移动.jpg",
    },
    "wilderness": {
        "desktop": "01-场景海报/野外-洪荒妖林外围-桌面.jpg",
        "mobile": "01-场景海报/野外-洪荒妖林外围-移动.jpg",
    },
    "sect-town": {
        "desktop": "01-场景海报/城镇-万宝浮空城-桌面.jpg",
        "mobile": "01-场景海报/城镇-万宝浮空城-移动.jpg",
    },
    "battle-anomaly": {
        "desktop": "01-场景海报/战斗-北境雪原对峙-桌面.jpg",
        "mobile": "01-场景海报/战斗-北境雪原对峙-移动.jpg",
    },
}
VIDEOS = {
    "mountain-gate": "04-视频/山门-月下入界-横屏.mp4",
    "wilderness": "04-视频/野外-洪荒妖林外围-竖屏.mp4",
}

# Titles and topic tags follow the supplied asset names. Topic tags are search
# hints only: they are not Canon IDs or evidence for reviewed text entries.
ILLUSTRATIONS = [
    ("world_jiuxiao", "world", "九霄大陆全图", "world_jiuxiao", "05-世界与地域/九霄大陆-全图.jpg"),
    ("region_zhongzhou_tianshu", "world", "中州天枢域", "region_zhongzhou_tianshu", "05-世界与地域/地域-中州天枢域.jpg"),
    ("region_donghan_longyin", "world", "东瀚龙吟域", "region_donghan_longyin", "05-世界与地域/地域-东瀚龙吟域.jpg"),
    ("region_xihuang_fentian", "world", "西荒焚天域", "region_xihuang_fentian", "05-世界与地域/地域-西荒焚天域.jpg"),
    ("region_beijing_shuanghan", "world", "北境霜寒域", "region_beijing_shuanghan", "05-世界与地域/地域-北境霜寒域.jpg"),
    ("region_nanjiang_wangu", "world", "南疆万蛊域", "region_nanjiang_wangu", "05-世界与地域/地域-南疆万蛊域.jpg"),
    ("region_honghuang_yaolin", "world", "洪荒妖林", "region_honghuang_yaolin", "05-世界与地域/地域-洪荒妖林.jpg"),
    ("faction_haotian_jianzong", "faction", "昊天剑宗 · 天枢剑山", "faction_haotian_jianzong", "06-势力宗门/昊天剑宗-天枢剑山.jpg"),
    ("faction_yuqing_ge", "faction", "玉清阁 · 百草谷", "faction_yuqing_ge", "06-势力宗门/玉清阁-百草谷.jpg"),
    ("faction_yantian_zong", "faction", "衍天宗 · 天衍城", "faction_yantian_zong", "06-势力宗门/衍天宗-天衍城.jpg"),
    ("faction_sihai_shanghui", "faction", "四海商会 · 万宝阁", "faction_sihai_shanghui", "06-势力宗门/四海商会-万宝阁内景.jpg"),
    ("faction_tiangong_ge", "faction", "天工阁 · 熔炉巨构", "faction_tiangong_ge", "06-势力宗门/天工阁-熔炉巨构.jpg"),
    ("faction_daguangming_si", "faction", "大光明寺 · 菩提山", "faction_daguangming_si", "06-势力宗门/大光明寺-菩提山.jpg"),
    ("faction_jixia_xuegong", "faction", "稷下学宫 · 问圣山", "faction_jixia_xuegong", "06-势力宗门/稷下学宫-问圣山.jpg"),
    ("faction_tingchao_ge", "faction", "听潮阁 · 静音岛", "faction_tingchao_ge", "06-势力宗门/听潮阁-静音岛.jpg"),
    ("faction_fuhai_zong", "faction", "覆海宗 · 镇海城", "faction_fuhai_zong", "06-势力宗门/覆海宗-镇海城.jpg"),
    ("faction_shenghuo_jiao", "faction", "圣火教 · 圣焰山火城", "faction_shenghuo_jiao", "06-势力宗门/圣火教-圣焰山火城.jpg"),
    ("faction_jingang_buhai_gu", "faction", "金刚不坏谷 · 万丈渊", "faction_jingang_buhai_gu", "06-势力宗门/金刚不坏谷-万丈渊.jpg"),
    ("faction_bingshen_gong", "faction", "冰神宫 · 无垢冰城", "faction_bingshen_gong", "06-势力宗门/冰神宫-无垢冰城.jpg"),
    ("faction_beijing_lianmeng", "faction", "北境联盟 · 狼神山", "faction_beijing_lianmeng", "06-势力宗门/北境联盟-狼神山.jpg"),
    ("faction_wudu_shenjiao", "faction", "五毒神教 · 万毒沼泽", "faction_wudu_shenjiao", "06-势力宗门/五毒神教-万毒沼泽.jpg"),
    ("faction_wanshou_shanzhuang", "faction", "万兽山庄 · 兽神殿", "faction_wanshou_shanzhuang", "06-势力宗门/万兽山庄-兽神殿.jpg"),
    ("faction_yanshi_fu", "faction", "偃师府 · 千机城", "faction_yanshi_fu", "06-势力宗门/偃师府-千机城.jpg"),
    ("system_foundations", "system", "修仙基础 · 吐纳灵气", "system_foundations", "07-体系图鉴/修仙基础-吐纳灵气.jpg"),
    ("system_cultivation_schools", "system", "修炼流派 · 九修器物", "system_cultivation_schools", "07-体系图鉴/修炼流派-九修器物.jpg"),
    ("system_heterodox_cultivation", "system", "邪修体系 · 禁忌器物", "system_heterodox_cultivation", "07-体系图鉴/邪修体系-禁忌器物.jpg"),
    ("system_resource_grade", "system", "资源品级 · 天材地宝", "system_resource_grade", "07-体系图鉴/资源品级-天材地宝.jpg"),
    ("system_cultivation_realm_core", "system", "修炼境界 · 结丹", "system_cultivation_realm", "07-体系图鉴/修炼境界-结丹金丹.jpg"),
    ("system_cultivation_realm_nascent", "system", "修炼境界 · 元婴", "system_cultivation_realm", "07-体系图鉴/修炼境界-元婴.jpg"),
    ("system_cultivation_realm_tribulation", "system", "修炼境界 · 渡劫", "system_cultivation_realm", "07-体系图鉴/修炼境界-渡劫天雷.jpg"),
    ("system_spiritual_root", "system", "灵根资质 · 五行灵根", "system_spiritual_root", "07-体系图鉴/灵根资质-五行灵根.jpg"),
    ("system_technique_grade", "system", "功法品阶 · 玉牒玉简", "system_technique_grade", "07-体系图鉴/功法品阶-玉牒玉简.jpg"),
    ("system_economy", "system", "经济体系 · 灵石货币", "system_economy", "07-体系图鉴/经济体系-灵石货币.jpg"),
    ("system_prices", "system", "物价参考 · 坊市交易", "system_prices", "07-体系图鉴/物价参考-坊市交易.jpg"),
    ("system_spirit_beasts", "system", "妖兽体系 · 神兽群像", "system_spirit_beasts", "07-体系图鉴/妖兽体系-上古神兽群像.jpg"),
    ("system_spirit_beasts_feral", "system", "妖兽体系 · 上古凶兽", "system_spirit_beasts", "07-体系图鉴/妖兽体系-上古凶兽.jpg"),
    ("system_realm_faction_tiers", "system", "境界金字塔 · 登天天梯", "system_realm_faction_tiers", "07-体系图鉴/境界金字塔-登天天梯.jpg"),
    ("brand_calligraphy", "brand", "九霄书法题字", None, "02-品牌装饰/九霄-书法题字.jpg"),
    ("brand_plum", "brand", "梅枝角饰", None, "02-品牌装饰/梅枝-角饰.jpg"),
    ("brand_seal", "brand", "九霄朱印", None, "02-品牌装饰/朱红-九霄印章.jpg"),
    ("brand_scroll", "brand", "山水横卷", None, "02-品牌装饰/山水-横卷.jpg"),
    ("texture_day-paper", "texture", "浅色宣纸", None, "03-纹理背景/纹理-浅色宣纸.jpg"),
    ("texture_night-ink", "texture", "深色夜墨", None, "03-纹理背景/纹理-深色夜墨.jpg"),
    ("texture_mist-mountains", "texture", "云雾远山", None, "03-纹理背景/云雾-远山氛围.jpg"),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def contained(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if root not in path.parents:
        raise ValueError(f"Source path escapes the candidate folder: {relative}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Candidate asset pack root")
    parser.add_argument("--output", type=Path, required=True, help="Web runtime output directory")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable with libx264")
    parser.add_argument("--ffprobe", default="ffprobe", help="ffprobe executable")
    parser.add_argument("--atlas-module", type=Path, required=True, help="Generated TypeScript illustration catalog")
    args = parser.parse_args()

    source_root = args.source.resolve()
    output_root = args.output.resolve()
    if output_root == source_root or source_root in output_root.parents:
        raise ValueError("Output must not be inside the source folder; originals must stay untouched.")
    source_manifest = json.loads((source_root / "manifest.json").read_text(encoding="utf-8"))
    expected = {entry["path"]: entry["sha256"] for entry in source_manifest.get("files", [])}
    output_root.mkdir(parents=True, exist_ok=True)

    files: list[dict[str, object]] = []
    for scene_id, variants in SCENES.items():
        for variant, relative in variants.items():
            source = contained(source_root, relative)
            source_hash = sha256(source)
            if expected.get(relative) != source_hash:
                raise ValueError(f"Source manifest hash mismatch: {relative}")
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
                source_dimensions = image.size
                maximum = (2048, 1200) if variant == "desktop" else (1536, 2730)
                image.thumbnail(maximum, Image.Resampling.LANCZOS)
                destination = output_root / f"{scene_id}.{variant}.webp"
                image.save(destination, "WEBP", quality=84, method=6, exact=True)
            files.append({
                "sceneId": scene_id,
                "variant": variant,
                "path": f"/scenes/candidate/{destination.name}",
                "mimeType": "image/webp",
                "width": image.width,
                "height": image.height,
                "sourcePath": relative,
                "sourceSha256": source_hash,
                "sha256": sha256(destination),
                "bytes": destination.stat().st_size,
                "sourceDimensions": list(source_dimensions),
                "metadataValuesCopied": False,
            })

    for scene_id, relative in VIDEOS.items():
        source = contained(source_root, relative)
        destination = output_root / f"{scene_id}.loop.mp4"
        command = [args.ffmpeg, "-nostdin", "-v", "error", "-y", "-i", str(source), "-an",
                   "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p",
                   "-movflags", "+faststart", str(destination)]
        subprocess.run(command, check=True)
        probe = subprocess.run([
            args.ffprobe, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-show_entries", "format=duration",
            "-of", "json", str(destination),
        ], check=True, capture_output=True, text=True)
        details = json.loads(probe.stdout)
        stream = details["streams"][0]
        if stream["codec_name"] != "h264" or float(details["format"]["duration"]) > 12:
            raise ValueError(f"Video derivative failed browser-compatibility bounds: {destination.name}")
        files.append({
            "sceneId": scene_id,
            "variant": "loop-video",
            "path": f"/scenes/candidate/{destination.name}",
            "mimeType": "video/mp4; codecs=avc1",
            "width": stream["width"],
            "height": stream["height"],
            "frameRate": stream["r_frame_rate"],
            "durationSeconds": round(float(details["format"]["duration"]), 3),
            "sourcePath": relative,
            "sourceSha256": sha256(source),
            "sha256": sha256(destination),
            "bytes": destination.stat().st_size,
            "audioTrack": False,
        })

    atlas: list[dict[str, object]] = []
    for asset_id, collection, title, topic_tag, relative in ILLUSTRATIONS:
        source = contained(source_root, relative)
        source_hash = sha256(source)
        if expected.get(relative) is not None and expected[relative] != source_hash:
            raise ValueError(f"Source manifest hash mismatch: {relative}")
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            source_dimensions = image.size
            limits = {
                "world": (1600, 1000), "faction": (1600, 1000), "system": (1200, 1200),
                "brand": (1600, 900), "texture": (1920, 1080),
            }[collection]
            image.thumbnail(limits, Image.Resampling.LANCZOS)
            atlas_dir = output_root / "atlas"
            atlas_dir.mkdir(parents=True, exist_ok=True)
            destination = atlas_dir / f"{asset_id}.webp"
            image.save(destination, "WEBP", quality=82, method=6)
        public_path = f"/scenes/candidate/atlas/{destination.name}"
        source_listed = relative in expected
        manifest_entry = {
            "assetId": asset_id, "collection": collection, "title": title, "topicTag": topic_tag,
            "path": public_path, "mimeType": "image/webp", "width": image.width, "height": image.height,
            "sourcePath": relative, "sourceSha256": source_hash,
            "sourceManifestVerification": "verified" if source_listed else "not-listed-in-source-manifest",
            "sha256": sha256(destination), "bytes": destination.stat().st_size,
            "sourceDimensions": list(source_dimensions), "metadataValuesCopied": False,
            "visualOnly": True,
        }
        files.append(manifest_entry)
        atlas.append({
            "id": asset_id, "collection": collection, "title": title, "topicTag": topic_tag,
            "src": public_path,
        })

    manifest = {
        "schemaVersion": 1,
        "status": "internal-candidate",
        "sourceAndLicense": "unverified",
        "authorApproval": "pending",
        "runtimeIntegrated": True,
        "generatedBy": "scripts/assets/build-visual-candidates.py",
        "files": files,
    }
    (output_root / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    module = (
        "/** Generated by scripts/assets/build-visual-candidates.py. Visual references only; not Canon evidence. */\n"
        "export type CandidateIllustrationCollection = 'world' | 'faction' | 'system' | 'brand' | 'texture';\n"
        "export type CandidateIllustration = { id: string; collection: CandidateIllustrationCollection; title: string; topicTag: string | null; src: string };\n"
        "export const CANDIDATE_ILLUSTRATIONS: readonly CandidateIllustration[] = "
        + json.dumps(atlas, ensure_ascii=False, indent=2) + " as const;\n"
    )
    args.atlas_module.parent.mkdir(parents=True, exist_ok=True)
    args.atlas_module.write_text(module, encoding="utf-8", newline="\n")
    print(f"Built {len(files)} derivatives in {output_root}")
    for file in files:
        print(f"{file['path']}\t{file['bytes']} bytes\t{file['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
