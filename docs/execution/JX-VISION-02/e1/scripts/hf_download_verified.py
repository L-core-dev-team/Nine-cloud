#!/usr/bin/env python3
"""下载单个 HF 权重并校验 SHA-256 / 字节数。

依赖：pip install huggingface_hub
环境变量：HF_ENDPOINT（可选，镜像端点）、HF_HOME（可选，缓存目录）
"""
import argparse
import hashlib
import json
import os
import time

from huggingface_hub import hf_hub_download


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 24), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="org/name")
    ap.add_argument("--file", required=True, help="仓库内文件路径")
    ap.add_argument("--dest", required=True, help="本地目标目录")
    ap.add_argument("--sha256", default=None, help="期望的整文件 SHA-256")
    ap.add_argument("--bytes", type=int, default=None, help="期望的字节数")
    args = ap.parse_args()

    os.makedirs(args.dest, exist_ok=True)
    t0 = time.time()
    path = hf_hub_download(repo_id=args.repo, filename=args.file, local_dir=args.dest)

    size = os.path.getsize(path)
    digest = sha256(path)
    size_ok = (size == args.bytes) if args.bytes else None
    hash_ok = (digest.lower() == args.sha256.lower()) if args.sha256 else None
    ok = all(v is not False for v in (size_ok, hash_ok))

    receipt = {
        "repo": args.repo, "file": args.file, "path": path,
        "bytes": size, "expected_bytes": args.bytes, "size_match": size_ok,
        "sha256": digest, "expected_sha256": args.sha256, "hash_match": hash_ok,
        "seconds": round(time.time() - t0, 1), "ok": ok,
    }
    print(json.dumps(receipt, ensure_ascii=False))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
