"""Make a complete, explicitly provisional reading index for the original screenshots.

This never edits OCR text. Its purpose is to keep every source visible in the
standalone game until the original screenshots can be transcribed and reviewed.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "outputs" / "设定OCR数据.json"
TARGET = ROOT / "outputs" / "九霄世界书" / "世界书原图索引.json"

# These groupings are navigation aids, not claims that OCR has been verified.
CORE_IDS = {
    "修仙体系核心要素": "9c2e5d21 616463b4",
    "常见修炼流派": "14d62285 bb5e9140",
    "邪修体系": "0f96a01b 3456f385 3beaebeb 69fee6bd 8bd3b40e 99427f1a b3be1137 e8b92f89",
    "资源的品级与境界划分": "407f80dd",
    "修炼境界介绍": "0a4ee938 24348e0b 48080103 4e899d6e 6928c253 75b45334 79f6a94c 7be44060 7bf57e5f a2e14dac b1b94077 b238cbe8 b4c85283 f4949664",
    "灵根资质与影响": "21bcdcff",
    "功法的品阶划分": "13fc9509 2c863620 84dcda59 aaa37a4c ab387ff6",
    "经济体系": "",
    "经济与物价参考": "803ebfe5 ca98368f",
    "妖兽体系总览": "ed1d2454",
    "境界金字塔与宗门设定": "37d1233b 3b0d28e2 5ecebb85 6d413f50 a76ec40d bcca7347 f7655a06",
}


def main() -> None:
    records = json.loads(SOURCE.read_text(encoding="utf-8"))["records"]
    by_prefix = {record["id"][:8]: record["id"] for record in records}
    assert len(by_prefix) == len(records) == 182
    sections = [{"title": "九霄大陆地图", "ids": []}]
    sections += [{"title": title, "ids": []} for title in CORE_IDS]
    sections += [
        {"title": "中州宗门与势力原图", "ids": []},
        {"title": "其他地域与势力原图", "ids": []},
        {"title": "其他原始截图", "ids": []},
    ]
    assigned: set[str] = set()
    for section in sections[1:12]:
        for prefix in CORE_IDS[section["title"]].split():
            record_id = by_prefix[prefix]
            assert record_id not in assigned, record_id
            section["ids"].append(record_id)
            assigned.add(record_id)

    for record in records:
        record_id = record["id"]
        if record_id in assigned:
            continue
        time = re.search(r"\b(\d{2})[：:](\d{2})", record["text"][:100])
        hour, minute = (int(time[1]), int(time[2])) if time else (0, 0)
        if hour == 9 and minute == 24:
            section = sections[0] if record_id.startswith("62f33bc2") else sections[-1]
        elif hour == 9 and minute == 27:
            section = sections[0]
        elif hour == 9 and minute in {28, 29, 30}:
            section = sections[-3]
        elif hour == 11 and minute in {11, 12, 13, 14}:
            section = sections[-2]
        else:
            section = sections[-1]
        section["ids"].append(record_id)
        assigned.add(record_id)

    # Put the actual map overview ahead of screenshots of its expanded entries.
    map_priority = ["6de114d1", "b92ae65c", "08f483cc", "62f33bc2"]
    sections[0]["ids"].sort(key=lambda record_id: (
        map_priority.index(record_id[:8]) if record_id[:8] in map_priority else len(map_priority),
        record_id,
    ))

    assert assigned == {record["id"] for record in records}
    assert sum(len(section["ids"]) for section in sections) == len(records)
    TARGET.write_text(json.dumps(sections, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Indexed all {len(records)} original OCR screenshots in {len(sections)} navigable sections")


if __name__ == "__main__":
    main()
