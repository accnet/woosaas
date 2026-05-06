#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
EMAIL="smoke+$(date +%s)@woosaas.local"
PASSWORD="${PASSWORD:-smoke12345}"
NAME="Smoke Test"
SITE_NAME="Smoke Store"
SITE_DOMAIN="https://smoke-$(date +%s).example.com"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_get() {
  node -e "
const path = process.argv[1].split('.');
let value = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const key of path) value = value?.[key];
if (value === undefined || value === null) process.exit(1);
console.log(value);
" "$1"
}

need curl
need node

echo "Checking API health at ${API_URL}..."
curl -fsS "${API_URL}/health" >/dev/null

echo "Registering smoke user..."
auth_response="$(
  curl -fsS -X POST "${API_URL}/api/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"name\":\"${NAME}\"}"
)"
token="$(printf '%s' "$auth_response" | json_get token)"

echo "Creating smoke site..."
site_response="$(
  curl -fsS -X POST "${API_URL}/api/v1/sites" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "{\"name\":\"${SITE_NAME}\",\"domain\":\"${SITE_DOMAIN}\"}"
)"
site_id="$(printf '%s' "$site_response" | json_get id)"

echo "Creating API key..."
key_response="$(
  curl -fsS -X POST "${API_URL}/api/v1/sites/${site_id}/api-keys" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "{\"name\":\"Smoke Key\"}"
)"
api_key="$(printf '%s' "$key_response" | json_get key)"

event_id="$(node -e "console.log(crypto.randomUUID())")"
event_time="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "Collecting pageview event..."
curl -fsS -X POST "${API_URL}/api/v1/collect" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${api_key}" \
  -d "{
    \"event_id\":\"${event_id}\",
    \"event_time\":\"${event_time}\",
    \"event_name\":\"pageview\",
    \"client_id\":\"smoke-client\",
    \"session_id\":\"smoke-session\",
    \"url\":\"${SITE_DOMAIN}/products/test\",
    \"path\":\"/products/test\",
    \"user_agent\":\"woosaas-smoke-test\",
    \"attribution\":{\"source\":\"smoke\",\"medium\":\"test\"}
  }" >/dev/null

from="$(date -u -d '5 minutes ago' +"%Y-%m-%dT%H:%M:%SZ")"
to="$(date -u -d '5 minutes' +"%Y-%m-%dT%H:%M:%SZ")"

echo "Waiting for worker ingest..."
for _ in $(seq 1 15); do
  overview="$(
    curl -fsS "${API_URL}/api/v1/stats/overview?site_id=${site_id}&from=${from}&to=${to}&timezone=UTC" \
      -H "Authorization: Bearer ${token}"
  )"
  pageviews="$(printf '%s' "$overview" | json_get pageviews)"
  if [ "$pageviews" -ge 1 ]; then
    echo "Smoke test passed: pageviews=${pageviews}, site_id=${site_id}"
    exit 0
  fi
  sleep 1
done

echo "Smoke test failed: event was collected but stats did not show it in time." >&2
exit 1
