#!/usr/bin/env bash
# Smoke-test the Explain API. Prints PASS or FAIL per check. Does not print document text.
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
speak_code="$(
  curl -sS -m 30 -D "$speak_headers" -o "$tmp/speak.mp3" -w "%{http_code}" \
    -X POST "$API_URL/api/speak" \
    -H "Content-Type: application/json" \
    -d '{"text":"Hello.","lang":"en","voice":"female"}'
)"
if [ "$speak_code" = "200" ] \
  && grep -qi "^content-type: audio/mpeg" "$speak_headers" \
  && [ -s "$tmp/speak.mp3" ]; then
  pass "speak"
else
  fail "speak (HTTP ${speak_code:-none})"
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
exit 0
