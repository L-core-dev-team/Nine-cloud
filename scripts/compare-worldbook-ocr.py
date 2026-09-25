"""Compare supplied per-image transcriptions with independent local Windows OCR.

This is a triage aid, not a substitute for viewing disputed source images.
Outputs remain in the private review directory.
"""

import hashlib
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

source_dir, ocr_dir, output_dir = map(Path, sys.argv[1:4])
output_dir.mkdir(parents=True, exist_ok=True)


def normalize(value: str) -> str:
    value = re.sub(r"【(?:图片编号|正文|小标题|大标题|三级标题)[^】]*】", "", value)
    value = re.sub(r"\[看不清[^\]]*\]", "", value)
    return "".join(re.findall(r"[\u4e00-\u9fffA-Za-z0-9]+", value)).lower()


def coverage(a: str, b: str, size: int = 4) -> float:
    if len(a) < size:
        return 1.0 if a and a in b else 0.0
    windows = [a[index : index + size] for index in range(len(a) - size + 1)]
    return sum(window in b for window in windows) / len(windows)


records = []
for prefix, count in (("原", 179), ("补", 28)):
    for number in range(1, count + 1):
        name = f"{prefix}{number:03d}"
        image_path = source_dir / f"{name}.png"
        text_path = source_dir / f"{name}.txt"
        ocr_path = ocr_dir / f"{name}.windows-ocr.txt"
        assert image_path.is_file() and text_path.is_file() and ocr_path.is_file(), name
        supplied = normalize(text_path.read_text(encoding="utf-8-sig"))
        independent = normalize(ocr_path.read_text(encoding="utf-8-sig"))
        unmatched_ocr = [independent[a0:a1] for kind, a0, a1, _, _ in
                         SequenceMatcher(None, independent, supplied, autojunk=False).get_opcodes()
                         if kind != "equal"]
        unmatched_supplied = [supplied[a0:a1] for kind, a0, a1, _, _ in
                              SequenceMatcher(None, supplied, independent, autojunk=False).get_opcodes()
                              if kind != "equal"]
        records.append(
            {
                "image": name,
                "imageSha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
                "textSha256": hashlib.sha256(text_path.read_bytes()).hexdigest(),
                "independentOcrSha256": hashlib.sha256(ocr_path.read_bytes()).hexdigest(),
                "suppliedCharacters": len(supplied),
                "independentOcrCharacters": len(independent),
                "ocrFourgramCoverageInSupplied": round(coverage(independent, supplied), 4),
                "suppliedFourgramCoverageInOcr": round(coverage(supplied, independent), 4),
                "longestIndependentUnmatchedSpan": max(unmatched_ocr, key=len, default="")[:100],
                "longestSuppliedUnmatchedSpan": max(unmatched_supplied, key=len, default="")[:100],
                "requiresVisualAdjudication": coverage(independent, supplied) < 0.85,
            }
        )

report = {
    "schemaVersion": 1,
    "method": "Independent Windows OCR plus four-character substring comparison; low coverage requires source-image inspection and is not an automatic rejection.",
    "records": records,
}
(output_dir / "independent-ocr-comparison.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
originals = [item for item in records if item["image"].startswith("原")]
supplements = [item for item in records if item["image"].startswith("补")]
print(
    json.dumps(
        {
            "originals": len(originals),
            "supplements": len(supplements),
            "originalsBelow85Percent": sum(item["requiresVisualAdjudication"] for item in originals),
            "supplementsBelow85Percent": sum(item["requiresVisualAdjudication"] for item in supplements),
            "lowestOriginals": sorted(originals, key=lambda item: item["ocrFourgramCoverageInSupplied"])[:15],
        },
        ensure_ascii=False,
        indent=2,
    )
)
