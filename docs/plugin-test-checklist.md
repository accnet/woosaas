# WordPress Plugin Test Checklist

Use this checklist against a local WordPress + WooCommerce install after the Woosaas stack is running.

## Setup

- Use the plugin already installed at `/var/www/site1.local/wp-content/plugins/plugin`.
- Activate the plugin in WordPress Admin.
- In the Woosaas dashboard, create a site and API key.
- Configure the plugin with API URL `http://localhost:8080` and the API key.
- Use the plugin verify action and confirm it succeeds.

## Event Flow

- Visit the storefront and confirm a `pageview` request reaches `/api/v1/collect`.
- View a product page and confirm product metadata is included when WooCommerce hooks fire.
- Add a product to cart and confirm `add_to_cart` includes `product_id`, `product_name`, `quantity`, `revenue`, and `currency`.
- Start checkout and confirm `checkout_start` is sent immediately.
- Complete a test order and confirm `purchase` includes `order_id`, `revenue`, `currency`, and `items`.

## Data Verification

- Run `./scripts/smoke.sh` to confirm the backend ingest path is healthy.
- In ClickHouse, query `woosaas.analytics_events` for the dashboard site ID.
- In the dashboard, check overview, sources, funnel, realtime, and API key last-used state.
- Confirm bot user agents set `bot_score` and do not count in standard analytics.

## Failure Cases

- Remove the API key and confirm the plugin does not send events.
- Use an invalid API key and confirm `/api/v1/collect/verify` fails.
- Disable Redis or the worker and confirm events queue or errors are visible in logs.
