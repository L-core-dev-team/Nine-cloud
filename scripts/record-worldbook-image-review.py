"""Record the delegated page-by-page OCR crosscheck without publishing source images.

The output stays in the private review directory. A high OCR match is corroboration,
not a claim that a person visually read the page. Low-match pages were opened and
compared with their transcriptions separately; their identifiers are explicit below.
"""

import json
import sys
from pathlib import Path

review_dir = Path(sys.argv[1])
comparison = json.loads((review_dir / "independent-ocr-comparison.json").read_text(encoding="utf-8"))
source_registry = json.loads((review_dir / "source-registry.json").read_text(encoding="utf-8"))
legacy = json.loads((review_dir / "legacy-182-review-ledger.json").read_text(encoding="utf-8"))

visually_resolved = {
    "原008", "原023", "原025", "原033", "原041", "原054", "原058",
    "原078", "原093", "原094", "原109", "原118", "原129", "原138",
    "原147", "原148", "原159", "原174", "补004", "补020", "补024",
    "补026",
}

by_name = {record["image"]: record for record in comparison["records"]}
assert len(by_name) == 207
sources = {source["id"]: source for source in source_registry["sources"]}
assert len(legacy["records"]) == 182


def adjudicate(name: str, source_id: str) -> dict:
    record = by_name[name]
    source = sources[source_id]
    assert record["imageSha256"] == source["imageSha256"], name
    assert record["textSha256"] == source["transcriptionSha256"], name
    visual = name in visually_resolved
    assert not record["requiresVisualAdjudication"] or visual, name
    return {
        "name": name,
        "sourceId": source_id,
        "imageSha256": record["imageSha256"],
        "transcriptionSha256": record["textSha256"],
        "independentOcrSha256": record["independentOcrSha256"],
        "ocrFourgramCoverageInSupplied": record["ocrFourgramCoverageInSupplied"],
        "reviewMethod": "source_image_direct_comparison" if visual else "independent_image_ocr_crosscheck",
        "disposition": "excluded_non_worldbook" if name == "补004" else "no_substantive_transcription_mismatch_detected",
        "personalAuthorSignoff": False,
    }


originals = []
legacy_records = []
for item in legacy["records"]:
    if item["disposition"] == "user_excluded":
        legacy_records.append({
            "legacy182Number": item["legacy182Number"],
            "disposition": "user_excluded_no_corresponding_original_image",
            "personalAuthorSignoff": False,
        })
        continue
    name = "原" + str(item["originalNumber"]).zfill(3)
    result = adjudicate(name, "original_" + str(item["originalNumber"]).zfill(3))
    originals.append(result)
    legacy_records.append({
        "legacy182Number": item["legacy182Number"],
        "originalImage": name,
        "reviewMethod": result["reviewMethod"],
        "disposition": result["disposition"],
        "personalAuthorSignoff": False,
    })

supplements = [adjudicate("补" + str(i).zfill(3), "supplement_" + str(i).zfill(3))
               for i in range(1, 29)]
assert len(originals) == 179 and len(supplements) == 28 and len(legacy_records) == 182
assert len({item["name"] for item in originals + supplements}) == 207

summary = {
    "legacyRecordsReconciled": 182,
    "userExcludedLegacyRecords": 3,
    "originalImagesIndependentlyOcrCrosschecked": 179,
    "supplementImagesIndependentlyOcrCrosschecked": 28,
    "lowCoverageOriginalImagesDirectlyCompared": 18,
    "lowCoverageSupplementImagesDirectlyCompared": 3,
    "additionalSupplementDirectlyCompared": 1,
    "personalAuthorVisualSignoffComplete": False,
}
report = {
    "schemaVersion": 1,
    "method": "Windows OCR from every source image, compared to supplied per-image text; all below-85% pages directly viewed; three legacy records excluded by user. This is delegated AI-assisted adjudication, not personal author visual signoff.",
    "summary": summary,
    "legacyRecords": legacy_records,
    "originalImages": originals,
    "supplementImages": supplements,
}
(review_dir / "image-by-image-review-20260925.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(summary, ensure_ascii=False))
