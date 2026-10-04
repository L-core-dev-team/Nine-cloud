# -*- coding: utf-8 -*-
"""G-09 真实供应商验收探针（仅 story 岗位，不替代五岗位验收）

设计约束（不可放宽）：
  1. Key 只从环境变量读取；本脚本不写盘、不打印、不回显 Key。
  2. 输出只含脱敏字段；响应正文不写入报告或日志，仅保留非空长度。
  3. 任一步失败即以非零码退出，不伪造成功。
  4. 不做任何重试掩盖：重试次数如实记录。

用法（PowerShell；Key 通过安全的当前进程环境注入，不写入命令历史或文件）：
  $env:JIUXIAO_BASE_URL = "https://api.deepseek.com"
  $env:JIUXIAO_MODEL = "<已批准的真实 Model ID>"
  $env:JIUXIAO_RC_SHA = "<当前候选 SHA>"
  $env:JIUXIAO_EVIDENCE_OUT = "$env:TEMP\\g09-provider-packet.json" # 仓库外绝对路径
  # 通过本机密钥管理工具将 JIUXIAO_API_KEY 注入当前进程环境
  python tools/verify_provider.py
  Remove-Item Env:JIUXIAO_API_KEY, Env:JIUXIAO_BASE_URL, Env:JIUXIAO_MODEL, Env:JIUXIAO_RC_SHA, Env:JIUXIAO_EVIDENCE_OUT -ErrorAction SilentlyContinue

该探针只检查 story 岗的兼容接口与非空响应；它不是五岗位、完整游戏回合或真实成本验收。
"""
import json
import ipaddress
from pathlib import Path
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROLES = ["story"]           # P1 只需 story 必验；其余四岗位在 P6 追加
TIMEOUT = 30


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Never forward an Authorization header to a redirected endpoint."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def endpoint_for(base: str) -> str:
    """Validate a provider URL without ever returning it to the evidence packet."""
    try:
        parsed = urlsplit(base)
        hostname = parsed.hostname
        # Accessing .port also validates malformed ports.
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("BASE_URL_INVALID") from exc

    if not hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("BASE_URL_INVALID")
    if parsed.scheme == "https":
        pass
    elif parsed.scheme == "http":
        try:
            local = hostname.lower() == "localhost" or ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            local = False
        if not local:
            raise ValueError("BASE_URL_INVALID")
    else:
        raise ValueError("BASE_URL_INVALID")
    return f"{base.rstrip('/')}/chat/completions"


def safe_usage(value: object) -> dict | None:
    """Keep only non-negative integer token counters from an untrusted response."""
    if not isinstance(value, dict):
        return None
    allowed = {"prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_tokens"}
    return {
        key: count
        for key, count in value.items()
        if key in allowed and isinstance(count, int) and not isinstance(count, bool) and count >= 0
    }


def call(endpoint: str, key: str, model: str, prompt: str) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "你只输出正文，不解释，不列点。"},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 200,
        "stream": False,
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    t0 = time.monotonic()
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(req, timeout=TIMEOUT) as r:
            raw = r.read().decode("utf-8", "replace")
            ms = int((time.monotonic() - t0) * 1000)
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise json.JSONDecodeError("response must be an object", raw, 0)
            choices = data.get("choices")
            message = choices[0].get("message") if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
            text = message.get("content") if isinstance(message, dict) else None
            if not isinstance(text, str) or not text.strip():
                return {
                    "httpStatus": r.status,
                    "latencyMs": ms,
                    "errorCategory": "invalid_response",
                    "result": "fail",
                }
            return {
                "httpStatus": r.status,
                "latencyMs": ms,
                "usage": safe_usage(data.get("usage")),
                "responseChars": len(text),
                "requestIdPresent": bool(r.headers.get("x-request-id") or r.headers.get("request-id")),
            }
    except urllib.error.HTTPError as e:
        e.close()
        return {
            "httpStatus": e.code,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "errorCategory": "http_error",
            "result": "fail",
        }
    except urllib.error.URLError:
        return {
            "httpStatus": None,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "errorCategory": "transport_error",
            "result": "fail",
        }
    except json.JSONDecodeError:
        return {
            "httpStatus": None,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "errorCategory": "invalid_response",
            "result": "fail",
        }
    except Exception:  # noqa: BLE001
        return {
            "httpStatus": None,
            "latencyMs": int((time.monotonic() - t0) * 1000),
            "errorCategory": "unexpected_error",
            "result": "fail",
        }


def main() -> int:
    if any(arg in ("-h", "--help") for arg in sys.argv[1:]):
        print((__doc__ or "").strip())
        return 0

    key = os.environ.get("JIUXIAO_API_KEY", "").strip()
    base = os.environ.get("JIUXIAO_BASE_URL", "https://api.deepseek.com").strip()
    model = os.environ.get("JIUXIAO_MODEL", "").strip()
    rc = os.environ.get("JIUXIAO_RC_SHA", "").strip()
    evidence_out = os.environ.get("JIUXIAO_EVIDENCE_OUT", "").strip()

    if not key:
        print("缺少环境变量 JIUXIAO_API_KEY。拒绝在命令行参数或文件中传 Key。", file=sys.stderr)
        return 2
    if not model:
        print("缺少环境变量 JIUXIAO_MODEL（必须是已批准的真实 Model ID，不接受占位）。", file=sys.stderr)
        return 2
    if not rc:
        print("缺少环境变量 JIUXIAO_RC_SHA（验收必须绑定同一 RC）。", file=sys.stderr)
        return 2
    if not evidence_out:
        print("缺少环境变量 JIUXIAO_EVIDENCE_OUT；请将脱敏报告保存到仓库外。", file=sys.stderr)
        return 2
    out_path = Path(evidence_out).expanduser()
    if not out_path.is_absolute():
        print("JIUXIAO_EVIDENCE_OUT 必须是仓库外的绝对路径。", file=sys.stderr)
        return 2
    out_path = out_path.resolve()
    repo_root = Path(__file__).resolve().parents[5]
    try:
        out_path.relative_to(repo_root)
    except ValueError:
        pass
    else:
        print("拒绝将真实供应商验收报告写入 Git 仓库。", file=sys.stderr)
        return 2
    try:
        endpoint = endpoint_for(base)
    except ValueError:
        print("JIUXIAO_BASE_URL 无效；需使用 HTTPS，或仅在本机使用 HTTP，且不得嵌入凭据、查询参数或片段。", file=sys.stderr)
        return 2

    prompt = "用不超过四十字，写一个清晨的渡口。只写画面。"

    packet = {
        "rcSha": rc,
        "probe": "verify_provider.py",
        "probedAt": now(),
        "providerEndpointConfigured": True,
        "model": model,
        "roles": [],
    }

    ok = True
    for role in ROLES:
        r = call(endpoint, key, model, prompt)
        r["role"] = role
        r["required"] = role == "story"
        r.setdefault("result", "pass" if r.get("httpStatus") == 200 else "fail")
        ok = ok and r["result"] == "pass"
        packet["roles"].append(r)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(packet, f, ensure_ascii=False, indent=2)

    for r in packet["roles"]:
        print(f"[{r['role']}] {r['result']}  http={r.get('httpStatus')} "
              f"latency={r.get('latencyMs')}ms usage={r.get('usage')} "
              f"errorCategory={r.get('errorCategory', '')}")
    print("已写出脱敏供应商验收报告（不含 Key 或响应正文）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
