#!/usr/bin/env bash
# Smoke-test the Explain API. Prints PASS or FAIL per check. Does not print document text or audio.
set -u

if [ "$#" -ne 2 ]; then
  echo "usage: scripts/smoke.sh <API_URL> <WEB_ORIGIN>" >&2
  exit 2
fi

API_URL="${1%/}"
WEB_ORIGIN="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAMPLE="$ROOT/web/public/samples/sample-lab-report.pdf"
failed=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if curl -fsS -m 20 -o "$tmp/health.json" "$API_URL/health"; then
  if python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get("status")=="ok" else 1)' "$tmp/health.json"; then
    pass "health"
  else
    fail "health (unexpected body)"
  fi
else
  fail "health"
fi

cors_headers="$tmp/cors.headers"
if curl -sS -m 20 -D "$cors_headers" -o /dev/null \
  -X OPTIONS "$API_URL/api/explain" \
  -H "Origin: $WEB_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"; then
  if tr -d '\r' < "$cors_headers" | grep -qi "^access-control-allow-origin: ${WEB_ORIGIN}$"; then
    pass "cors"
  else
    fail "cors (origin not allowed)"
  fi
else
  fail "cors"
fi

if [ ! -f "$SAMPLE" ]; then
  fail "explain (sample file missing)"
else
  explain_code="$(
    curl -sS -m 90 -o "$tmp/explain.json" -w "%{http_code}" \
      -X POST "$API_URL/api/explain" \
      -F "lang=en" \
      -F "files=@${SAMPLE};type=application/pdf"
  )"
  if [ "$explain_code" = "200" ] && python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
sys.exit(0 if isinstance(data.get("title"), str) and data["title"] else 1)
' "$tmp/explain.json"; then
    pass "explain"
  else
    fail "explain (HTTP ${explain_code:-none})"
  fi
fi

speak_headers="$tmp/speak.headers"
speak_body="$tmp/speak.audio"
speak_code="$(
  curl -sS -m 30 -D "$speak_headers" -o "$speak_body" -w "%{http_code}" \
    -X POST "$API_URL/api/speak" \
    -H "Content-Type: application/json" \
    -d '{"text":"Hello.","lang":"en","voice":"female"}'
)"
if [ "$speak_code" = "200" ] \
  && tr -d '\r' < "$speak_headers" | grep -qiE '^content-type:[[:space:]]*audio/(wav|mpeg)([[:space:]]|;|$)' \
  && python3 -c '
import os, sys
path = sys.argv[1]
min_bytes = 1024
try:
    size = os.path.getsize(path)
except OSError:
    sys.exit(1)
if size < min_bytes:
    sys.exit(1)
with open(path, "rb") as fh:
    head = fh.read(12)
if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
    sys.exit(0)
if head[:3] == b"ID3":
    sys.exit(0)
if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
    sys.exit(0)
sys.exit(1)
' "$speak_body"; then
  pass "speak"
else
  fail "speak (HTTP ${speak_code:-none})"
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
exit 0
