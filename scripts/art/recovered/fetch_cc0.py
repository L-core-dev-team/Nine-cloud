"""Materialize the recovered Poly Haven cache from the checked-in per-file hashes."""
import argparse
import csv
import hashlib
import os
from pathlib import Path
import shutil
from tempfile import NamedTemporaryFile
from urllib.request import Request, urlopen

CATALOG = Path(__file__).resolve().parents[3] / "docs/execution/JX-VISION-02/art-cache.tsv"


def verify(path, row):
    if path.stat().st_size != int(row["bytes"]):
        raise ValueError(f"Unexpected length: {row['file']}")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != row["sha256"]:
        raise ValueError(f"Unexpected SHA-256: {row['file']}")


def ensure_file(root, row, verify_only):
    destination = (root / row["file"]).resolve()
    if not destination.is_relative_to(root):
        raise ValueError(f"Path outside cache: {row['file']}")
    if destination.exists() or verify_only:
        verify(destination, row)
        return
    url = row["source"]
    if not url.startswith("https://dl.polyhaven.org/"):
        raise ValueError(f"Unexpected source for {row['file']}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "Nine-cloud/asset-recovery"})
    temp = None
    try:
        with NamedTemporaryFile(dir=destination.parent, delete=False) as output:
            temp = Path(output.name)
            with urlopen(request, timeout=120) as response:
                shutil.copyfileobj(response, output)
        verify(temp, row)
        os.replace(temp, destination)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path, help="External cache directory")
    parser.add_argument("--verify-only", action="store_true", help="Check every file offline")
    args = parser.parse_args()
    with CATALOG.open(newline="", encoding="utf-8") as source:
        records = list(csv.DictReader(source, delimiter="\t"))
    root = args.cache.resolve()
    for record in records:
        ensure_file(root, record, args.verify_only)
    print(f"Verified {len(records)} files against the recovery catalog.")


if __name__ == "__main__":
    main()
