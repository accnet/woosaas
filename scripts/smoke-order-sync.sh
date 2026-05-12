#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
WP_PATH="${WP_PATH:-/var/www/site1.local}"
API_KEY="${API_KEY:-}"
SITE_ID="${SITE_ID:-}"
ORDER_ID="${ORDER_ID:-smoke-order-$(date +%s)}"
MODIFIED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need curl
need docker

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

echo "Posting order snapshot ${ORDER_ID}..."
response="$(
  curl -fsS -X POST "${API_URL}/api/v1/woo/orders/sync" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${API_KEY}" \
    -d "{
      \"orders\": [{
        \"woo_order_id\": \"${ORDER_ID}\",
        \"woo_customer_id\": \"smoke-customer\",
        \"status\": \"processing\",
        \"payment_status\": \"paid\",
        \"fulfillment_status\": \"unfulfilled\",
        \"currency\": \"USD\",
        \"total_amount\": 49.95,
        \"subtotal_amount\": 45.00,
        \"discount_amount\": 0,
        \"shipping_amount\": 4.95,
        \"tax_amount\": 0,
        \"refund_amount\": 0,
        \"items_count\": 1,
        \"customer_email\": \"smoke-order@example.com\",
        \"customer_first_name\": \"Smoke\",
        \"customer_last_name\": \"Order\",
        \"customer_phone\": \"+10000000000\",
        \"billing_company\": \"Smoke\",
        \"billing_address\": {},
        \"shipping_address\": {},
        \"client_id\": \"smoke-order-client\",
        \"session_id\": \"smoke-order-session\",
        \"attribution\": {\"source\": \"smoke\", \"medium\": \"script\"},
        \"created_at_woo\": \"${MODIFIED_AT}\",
        \"paid_at_woo\": \"${MODIFIED_AT}\",
        \"completed_at_woo\": null,
        \"modified_at_woo\": \"${MODIFIED_AT}\",
        \"deleted_at_woo\": null,
        \"items\": [{
          \"line_item_id\": \"1\",
          \"product_id\": \"smoke-product\",
          \"variation_id\": \"\",
          \"sku\": \"SMOKE-1\",
          \"name\": \"Smoke Product\",
          \"quantity\": 1,
          \"unit_price\": 45,
          \"line_subtotal\": 45,
          \"line_total\": 45,
          \"line_tax\": 0
        }],
        \"raw_order\": {}
      }]
    }"
)"
printf '%s' "$response" | grep -q '"accepted":1'

for _ in $(seq 1 20); do
  rows="$(
    docker compose exec -T postgres psql -U postgres -d woosaas -Atc \
      "SELECT COUNT(*) FROM woo_orders WHERE site_id = '${SITE_ID}' AND woo_order_id = '${ORDER_ID}';"
  )"
  if [ "$rows" = "1" ]; then
    echo "Order sync smoke passed: ${ORDER_ID}"
    exit 0
  fi
  sleep 1
done

echo "Order sync smoke failed: ${ORDER_ID} was accepted but not materialized in PostgreSQL." >&2
exit 1
