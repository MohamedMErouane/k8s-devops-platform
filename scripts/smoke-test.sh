#!/usr/bin/env bash
# End-to-end smoke test against a running deployment.
#   BASE_URL=http://localhost:8080 ./scripts/smoke-test.sh
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:8080}"
code="smoke$RANDOM"

echo "→ waiting for $BASE_URL/readyz"
for i in $(seq 1 30); do
  if curl -fsS "$BASE_URL/readyz" >/dev/null 2>&1; then break; fi
  [ "$i" = 30 ] && { echo "✗ API never became ready"; exit 1; }
  sleep 2
done

echo "→ home page served by nginx"
curl -fsS "$BASE_URL/" | grep -q "Linkly"

echo "→ create short link /$code"
status=$(curl -s -o /tmp/create.json -w '%{http_code}' -X POST "$BASE_URL/api/links" \
  -H 'content-type: application/json' -d "{\"url\":\"https://mohamedmerouane.me\",\"code\":\"$code\"}")
[ "$status" = 201 ] || { echo "✗ expected 201, got $status: $(cat /tmp/create.json)"; exit 1; }

echo "→ follow redirect"
location=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE_URL/$code")
[ "$location" = "https://mohamedmerouane.me/" ] || [ "$location" = "https://mohamedmerouane.me" ] \
  || { echo "✗ unexpected redirect: $location"; exit 1; }

echo "→ click was counted"
curl -fsS "$BASE_URL/api/links/$code" | grep -q '"clicks":"1"'

echo "→ /metrics is not exposed publicly"
status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/metrics")
[ "$status" = 404 ] || { echo "✗ /metrics should be hidden, got $status"; exit 1; }

echo "✓ smoke test passed"
