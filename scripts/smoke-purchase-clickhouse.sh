#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
WP_PATH="${WP_PATH:-/var/www/site1.local}"
API_KEY="${API_KEY:-}"
SITE_ID="${SITE_ID:-}"
ORDER_ID="${ORDER_ID:-smoke-purchase-$(date +%s)}"
EVENT_ID="${EVENT_ID:-$(node -e "console.log(require('crypto').randomUUID())")}"
EVENT_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need curl
need docker
need node

if [ -z "$API_KEY" ] && command -v wp >/dev/null 2>&1; then
  API_KEY="$(wp option get woosaas_api_key --path="$WP_PATH" 2>/dev/null || true)"
fi
if [ -z "$SITE_ID" ] && command -v wp >/dev/null 2>&1; then
  SITE_ID="$(wp option get woosaas_verified_site_id --path="$WP_PATH" 2>/dev/null || true)"
fi
if [ -z "$API_KEY" ] || [ -z "$SITE_ID" ]; then
  echo "API_KEY and SITE_ID are required. Configure the WordPress plugin or export both values." >&2
  exit 1
fi

curl -fsS "${API_URL}/health" >/dev/null

echo "Posting purchase event ${ORDER_ID}..."
curl -fsS -X POST "${API_URL}/api/v1/collect" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${API_KEY}" \
  -d "{
    \"event_id\": \"${EVENT_ID}\",
    \"event_time\": \"${EVENT_TIME}\",
    \"event_name\": \"purchase\",
    \"client_id\": \"smoke-purchase-client\",
    \"session_id\": \"smoke-purchase-session\",
    \"url\": \"http://site1.local/checkout/order-received/${ORDER_ID}\",
    \"path\": \"/checkout/order-received/${ORDER_ID}\",
    \"user_agent\": \"woosaas-smoke-purchase\",
    \"order_id\": \"${ORDER_ID}\",
    \"product_id\": \"smoke-product\",
    \"product_name\": \"Smoke Product\",
    \"quantity\": 1,
    \"revenue\": 49.95,
    \"currency\": \"USD\",
    \"items_json\": \"[{\\\"sku\\\":\\\"SMOKE-1\\\"}]\"
  }" >/dev/null

for _ in $(seq 1 20); do
  rows="$(
    docker compose exec -T clickhouse clickhouse-client --database woosaas --query \
      "SELECT count() FROM analytics_events WHERE site_id = '${SITE_ID}' AND event_name = 'purchase' AND order_id = '${ORDER_ID}'"
  )"
  if [ "$rows" = "1" ]; then
    echo "Purchase ClickHouse smoke passed: ${ORDER_ID}"
    exit 0
  fi
  sleep 1
done

echo "Purchase ClickHouse smoke failed: ${ORDER_ID} was accepted but not materialized in ClickHouse." >&2
exit 1
