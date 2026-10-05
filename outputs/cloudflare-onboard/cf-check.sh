#!/usr/bin/env bash
# ============================================================
# Cloudflare NS 委派状态检查 — juxiaogame.cn
# 用法：bash cf-check.sh
# 退出码：0 = 已委派到 Cloudflare / 1 = 未委派或未生效
# ============================================================
set -uo pipefail

DOMAIN="${1:-juxiaogame.cn}"
export PATH="/usr/bin:/bin:/mingw64/bin:$PATH"

echo "=============================================="
echo " Cloudflare NS 委派检查 — ${DOMAIN}"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================="
echo

# ---------- 1. 公网 NS 查询（走 DoH，避免本地缓存干扰）----------
echo "[1/3] 公网 NS 记录（DoH / Google）"
NS_JSON=$(curl -s -m 15 -H "accept: application/dns-json" \
  "https://dns.google/resolve?name=${DOMAIN}&type=NS")

STATUS=$(echo "$NS_JSON" | grep -o '"Status":[0-9]*' | head -1 | cut -d: -f2)
echo "     RCODE = ${STATUS}   (0=OK, 3=NXDOMAIN)"

if [ "$STATUS" = "3" ]; then
  echo "     ✗ 域名在公网不存在（NXDOMAIN）"
  echo "       → 注册局层面尚未建立委派，Cloudflare 无法激活"
  echo "       → 见报告 §1，这是当前的首要阻塞"
  echo
  echo "     直接问 .cn 权威服务器确认："
  for NS in a.dns.cn b.dns.cn c.dns.cn e.dns.cn; do
    R=$(nslookup -type=NS "${DOMAIN}" "${NS}" 2>&1 | grep -c "Non-existent")
    if [ "$R" -gt 0 ]; then
      echo "       ${NS}  → 无该域名记录"
    else
      echo "       ${NS}  → 返回了记录（委派可能已建立）"
    fi
  done
  exit 1
fi

NS_LIST=$(echo "$NS_JSON" | grep -o '"data":"[a-z0-9.-]*\.cloudflare\.com\."' | sed 's/"data":"//;s/"$//' | sort -u)
echo "     当前生效 NS："
echo "$NS_LIST" | sed 's/^/       /'
echo

CF_COUNT=$(echo "$NS_LIST" | grep -c "cloudflare.com")
TOTAL=$(echo "$NS_LIST" | grep -c ".")
echo "[2/3] 判定：共 ${TOTAL} 条 NS，其中 Cloudflare ${CF_COUNT} 条"

if [ "$CF_COUNT" -ge 2 ]; then
  echo "     ✓ 委派已指向 Cloudflare"
else
  echo "     ✗ 委派尚未完全指向 Cloudflare（可能仍在传播）"
fi
echo

# ---------- 3. SOA / DNS 记录抽查 ----------
echo "[3/3] 关键记录抽查"
for T in A AAAA CNAME; do
  R=$(curl -s -m 10 -H "accept: application/dns-json" \
      "https://dns.google/resolve?name=${DOMAIN}&type=${T}")
  ST=$(echo "$R" | grep -o '"Status":[0-9]*' | head -1 | cut -d: -f2)
  CNT=$(echo "$R" | grep -o '"type":[0-9]*' | grep -c "$T" || true)
  if [ "$ST" = "0" ]; then
    printf "     %-6s ✓ 存在\n" "$T"
  else
    printf "     %-6s ✗ 无记录 (RCODE=%s)\n" "$T" "$ST"
  fi
done

echo
echo "=============================================="
echo " Cloudflare 控制台对应状态：Active / Pending"
echo " 若仍为 Pending，通常是注册局委派未同步"
echo " （.cn 域名一般 10 分钟~24 小时，偶发更久）"
echo "=============================================="
