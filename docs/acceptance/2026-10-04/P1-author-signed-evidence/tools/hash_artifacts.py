# -*- coding: utf-8 -*-
"""Portable SHA-256 inventory for Jiuxiao Canon and media artifacts.

The tool never changes repository files. Output goes only to the required
--output-dir and existing outputs are protected unless --force is supplied.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

MEDIA_EXT = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".json"}
CANON_FILES = ("canon.registry.json", "canon-runtime.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def git_head(repo_root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def canon_digests(repo_root: Path) -> tuple[dict, list[dict]]:
    canon_dir = repo_root / "packages" / "content" / "src"
    files = {}
    for name in CANON_FILES:
        path = canon_dir / name
        if not path.is_file():
            raise FileNotFoundError(f"Required Canon file not found: {path}")
        files[name] = {"sha256": sha256(path), "bytes": path.stat().st_size}

    registry_path = canon_dir / "canon.registry.json"
    with registry_path.open(encoding="utf-8") as stream:
        registry = json.load(stream)

    rows = []
    for entry in registry.get("entries", []):
        canonical = json.dumps(
            entry, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        rows.append(
            {
                "canonId": entry.get("id") or entry.get("canonId") or "",
                "status": entry.get("status", ""),
                "reviewDigest": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            }
        )

    summary = {
        "gitHead": git_head(repo_root),
        "files": files,
        "approvalMode": registry.get("approvalMode"),
        "activeVersion": registry.get("activeVersion"),
        "reviewQueue": len(registry.get("reviewQueue", [])),
        "entryCount": len(rows),
        "statusDistribution": dict(Counter(row["status"] for row in rows)),
    }
    return summary, rows


def media_digests(repo_root: Path, source_media_root: Path | None) -> list[dict]:
    sources: list[tuple[Path, str, str]] = []
    candidate = repo_root / "apps" / "web" / "public" / "scenes" / "candidate"
    if candidate.is_dir():
        sources.append((candidate, "B 构建派生（发布候选）", "apps/web/public/scenes/candidate"))
    if source_media_root is not None:
        if not source_media_root.is_dir():
            raise NotADirectoryError(f"Source media directory not found: {source_media_root}")
        sources.append((source_media_root, "A 源素材（作者原创候选）", "九霄素材-水墨古风"))

    rows = []
    for base, group, display_prefix in sources:
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in MEDIA_EXT:
                continue
            relative = path.relative_to(base).as_posix()
            rows.append(
                {
                    "group": group,
                    "path": f"{display_prefix}/{relative}",
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
            )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[5],
        help="Jiuxiao repository root (defaults to this script's checkout).",
    )
    parser.add_argument(
        "--output-dir", type=Path, required=True,
        help="Directory for digest JSON/CSV outputs; never writes into the repository by default.",
    )
    parser.add_argument(
        "--source-media-root", type=Path,
        help="Optional source-media directory. Defaults to <repo-root>/九霄素材-水墨古风 when present.",
    )
    parser.add_argument(
        "--skip-media", "--skip-source-media", action="store_true",
        help="Skip external source-media files; repository candidate media is still hashed.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Allow replacing canon-digests.json and digest CSVs already in --output-dir.",
    )
    args = parser.parse_args()
    repo_root = args.repo_root.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not (repo_root / ".git").exists():
        parser.error(f"--repo-root is not a Git checkout: {repo_root}")
    try:
        output_dir.relative_to(repo_root)
    except ValueError:
        pass
    else:
        parser.error("--output-dir must be outside the repository to protect tracked and signed artifacts.")

    source_root = None
    if not args.skip_media:
        source_root = args.source_media_root
        if source_root is None:
            default_source = repo_root / "九霄素材-水墨古风"
            source_root = default_source if default_source.is_dir() else None
        elif not source_root.is_absolute():
            source_root = (repo_root / source_root)
        if source_root is not None:
            source_root = source_root.expanduser().resolve()

    targets = [output_dir / "canon-digests.json", output_dir / "canon-entry-digests.csv", output_dir / "media-digests.csv"]
    if not args.force and any(path.exists() for path in targets):
        parser.error("An output file already exists; choose a fresh --output-dir or pass --force.")

    output_dir.mkdir(parents=True, exist_ok=True)
    summary, entries = canon_digests(repo_root)
    media = media_digests(repo_root, source_root)
    with (output_dir / "canon-digests.json").open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    for filename, rows, fields in (
        ("canon-entry-digests.csv", entries, ["canonId", "status", "reviewDigest"]),
        ("media-digests.csv", media, ["group", "path", "bytes", "sha256"]),
    ):
        with (output_dir / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    print("Git HEAD      :", summary["gitHead"])
    for name, metadata in summary["files"].items():
        print(f"  {name:24s} {metadata['sha256']} ({metadata['bytes']} B)")
    print("Canon 条目    :", summary["entryCount"], summary["statusDistribution"])
    print("approvalMode  :", summary["approvalMode"], "| reviewQueue:", summary["reviewQueue"])
    print("媒体文件      :", len(media), "个，", round(sum(row["bytes"] for row in media) / 1048576, 1), "MB")
    if args.skip_media:
        print("源素材        : 已按参数跳过；只统计仓库内发布候选素材（如存在）")
    elif source_root is None:
        print("源素材        : 未发现；如需完整复算，请传入 --source-media-root")
    for group, count in Counter(row["group"] for row in media).items():
        print("  ", group, count)
    print("输出目录      :", output_dir)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"ERROR: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
