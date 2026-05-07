#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"
WP_PATH="${WP_PATH:-/var/www/site1.local}"
SITE_DOMAIN="${SITE_DOMAIN:-site1.local}"
SITE_URL="${SITE_URL:-http://${SITE_DOMAIN}}"
API_KEY="${API_KEY:-}"
BATCHES="${BATCHES:-4}"
SESSIONS_PER_BATCH="${SESSIONS_PER_BATCH:-6}"
WAIT_SECONDS="${WAIT_SECONDS:-3}"
DASHBOARD_EMAIL="${DASHBOARD_EMAIL:-admin@woosaas.com}"
DASHBOARD_PASSWORD="${DASHBOARD_PASSWORD:-Admin123!}"

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
if (typeof value === 'object') {
  console.log(JSON.stringify(value));
} else {
  console.log(value);
}
" "$1"
}

normalize_domain() {
  local raw="$1"
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw#www.}"
  raw="${raw%%/*}"
  printf '%s' "$raw"
}

need curl
need node

DOMAIN_NORMALIZED="$(normalize_domain "$SITE_DOMAIN")"

if [ -z "$API_KEY" ] && command -v wp >/dev/null 2>&1; then
  if [ -d "$WP_PATH" ]; then
    API_KEY="$(wp option get woosaas_api_key --path="$WP_PATH" 2>/dev/null || true)"
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "API_KEY is empty. Export API_KEY or configure the WordPress plugin first." >&2
  exit 1
fi

echo "Checking API health at ${API_URL}..."
curl -fsS "${API_URL}/health" >/dev/null

echo "Logging into dashboard API..."
auth_response="$(
  curl -fsS -X POST "${API_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${DASHBOARD_EMAIL}\",\"password\":\"${DASHBOARD_PASSWORD}\"}"
)"
token="$(printf '%s' "$auth_response" | json_get token)"

echo "Resolving site_id for ${DOMAIN_NORMALIZED}..."
sites_response="$(
  curl -fsS "${API_URL}/api/v1/sites" \
    -H "Authorization: Bearer ${token}"
)"
site_id="$(
  SITES_RESPONSE="$sites_response" DOMAIN_NORMALIZED="$DOMAIN_NORMALIZED" node <<'NODE'
const sites = JSON.parse(process.env.SITES_RESPONSE || '[]');
const normalize = (value) =>
  String(value || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
const match = sites.find((site) => normalize(site.domain) === process.env.DOMAIN_NORMALIZED);
if (!match) {
  process.exit(1);
}
process.stdout.write(match.id);
NODE
)" || {
  echo "Could not find site for domain ${DOMAIN_NORMALIZED}" >&2
  exit 1
}

echo "Generating ${BATCHES} batch(es) with ${SESSIONS_PER_BATCH} session(s) each for site_id=${site_id}..."

total_events=0
for batch_index in $(seq 1 "$BATCHES"); do
  payload="$(
    SITE_URL="$SITE_URL" SITE_DOMAIN="$DOMAIN_NORMALIZED" BATCH_INDEX="$batch_index" SESSIONS_PER_BATCH="$SESSIONS_PER_BATCH" node <<'NODE'
const crypto = require('crypto');

const siteUrl = process.env.SITE_URL;
const domain = process.env.SITE_DOMAIN;
const batchIndex = Number(process.env.BATCH_INDEX || '1');
const sessionsPerBatch = Number(process.env.SESSIONS_PER_BATCH || '6');

const sources = [
  { source: 'newsletter', medium: 'email', campaign: 'launch-week' },
  { source: 'facebook', medium: 'paid_social', campaign: 'sale-push' },
  { source: 'google', medium: 'organic', campaign: 'spring-launch' },
  { source: 'direct', medium: '', campaign: '' },
];

const products = [
  { id: 'sku-demo-hoodie', name: 'Demo Hoodie', price: 29.99, slug: 'demo-hoodie' },
  { id: 'sku-demo-cap', name: 'Demo Cap', price: 24.99, slug: 'demo-cap' },
  { id: 'sku-demo-bag', name: 'Demo Bag', price: 89.99, slug: 'demo-bag' },
];

const collectionPaths = ['/collections/spring', '/landing/sale', '/blog/launch', '/'];
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
];

const now = Date.now();
const events = [];

function pick(list, seed) {
  return list[seed % list.length];
}

for (let i = 0; i < sessionsPerBatch; i += 1) {
  const seed = batchIndex * 100 + i;
  const attributionSeed = pick(sources, seed);
  const product = pick(products, seed + 1);
  const sessionId = `seed-session-${batchIndex}-${i}`;
  const clientId = `seed-client-${batchIndex}-${i}`;
  const ua = pick(userAgents, seed + 2);
  const landingPath = pick(collectionPaths, seed + 3);
  const sessionStart = new Date(now - (batchIndex * sessionsPerBatch + i) * 45_000);
  const quantity = (seed % 3) + 1;
  const cartRevenue = Number((product.price * quantity).toFixed(2));
  const purchase = i % 2 === 0;

  const attribution = attributionSeed.source === 'direct'
    ? undefined
    : attributionSeed;

  const common = {
    client_id: clientId,
    session_id: sessionId,
    user_agent: ua,
  };

  events.push({
    event_id: crypto.randomUUID(),
    event_time: sessionStart.toISOString(),
    event_name: 'pageview',
    url: `${siteUrl}${landingPath}`,
    path: landingPath,
    ...common,
    ...(attribution ? { attribution } : {}),
  });

  events.push({
    event_id: crypto.randomUUID(),
    event_time: new Date(sessionStart.getTime() + 8_000).toISOString(),
    event_name: 'product_view',
    url: `${siteUrl}/product/${product.slug}`,
    path: `/product/${product.slug}`,
    product_id: product.id,
    product_name: product.name,
    ...common,
    ...(attribution ? { attribution } : {}),
  });

  events.push({
    event_id: crypto.randomUUID(),
    event_time: new Date(sessionStart.getTime() + 16_000).toISOString(),
    event_name: 'add_to_cart',
    url: `${siteUrl}/cart`,
    path: '/cart',
    product_id: product.id,
    product_name: product.name,
    quantity,
    revenue: cartRevenue,
    currency: 'USD',
    ...common,
    ...(attribution ? { attribution } : {}),
  });

  if (purchase) {
    events.push({
      event_id: crypto.randomUUID(),
      event_time: new Date(sessionStart.getTime() + 24_000).toISOString(),
      event_name: 'checkout_start',
      url: `${siteUrl}/checkout`,
      path: '/checkout',
      ...common,
      ...(attribution ? { attribution } : {}),
    });

    events.push({
      event_id: crypto.randomUUID(),
      event_time: new Date(sessionStart.getTime() + 32_000).toISOString(),
      event_name: 'purchase',
      url: `${siteUrl}/checkout/order-received/${batchIndex}${i}`,
      path: `/checkout/order-received/${batchIndex}${i}`,
      order_id: `seed-order-${batchIndex}-${i}`,
      product_id: product.id,
      product_name: product.name,
      quantity,
      revenue: cartRevenue,
      currency: 'USD',
      ...common,
      ...(attribution ? { attribution } : {}),
    });
  }
}

process.stdout.write(JSON.stringify({ events }));
NODE
  )"

  response="$(
    curl -fsS -X POST "${API_URL}/api/v1/collect/batch" \
      -H "Content-Type: application/json" \
      -H "X-Api-Key: ${API_KEY}" \
      -d "$payload"
  )"
  batch_events="$(printf '%s' "$payload" | json_get events | node -e 'const events = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(events.length)')"
  total_events=$((total_events + batch_events))
  statuses="$(printf '%s' "$response" | json_get events | node -e '
const rows = JSON.parse(require("fs").readFileSync(0, "utf8"));
const counts = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
process.stdout.write(JSON.stringify(counts));
')"
  echo "Batch ${batch_index}: ${statuses}"
done

echo "Waiting ${WAIT_SECONDS}s for worker aggregation..."
sleep "$WAIT_SECONDS"

from="$(date -u +%Y-%m-%dT00:00:00Z)"
to="$(date -u +%Y-%m-%dT23:59:59Z)"

overview="$(
  curl -fsS "${API_URL}/api/v1/stats/overview?site_id=${site_id}&from=${from}&to=${to}&timezone=UTC" \
    -H "Authorization: Bearer ${token}"
)"
realtime="$(
  curl -fsS "${API_URL}/api/v1/stats/realtime?site_id=${site_id}" \
    -H "Authorization: Bearer ${token}"
)"
sources="$(
  curl -fsS "${API_URL}/api/v1/stats/sources?site_id=${site_id}&from=${from}&to=${to}" \
    -H "Authorization: Bearer ${token}"
)"

echo "Seed complete"
echo "site_id=${site_id}"
echo "domain=${DOMAIN_NORMALIZED}"
echo "events_sent=${total_events}"
echo "overview=$(printf '%s' "$overview" | tr -d '\n')"
echo "realtime=$(printf '%s' "$realtime" | tr -d '\n')"
echo "sources=$(printf '%s' "$sources" | tr -d '\n')"
