# Woosaas WordPress Plugin Setup

This guide is for store owners connecting a WooCommerce site to the Woosaas dashboard.

## Before You Start

Make sure these pieces are ready:

- A running Woosaas stack or hosted Woosaas API
- A dashboard account you can log into
- A WooCommerce site with admin access

If you are running locally, follow [Local Setup Guide](local-setup.md) first and keep the API server and worker running.

## 1. Create the Site in Woosaas

1. Open the dashboard.
2. Go to `Sites`.
3. Create a new site with your store name and domain.
4. Open the new site's `Setup Guide`.

The setup guide gives you:

- your site domain
- tracking readiness status
- a quick health check for verify and event flow

## 2. Create an API Key

1. Inside the site, open `Manage API Keys`.
2. Create a key for the WordPress plugin.
3. Copy the key immediately.

The full secret is only shown once. The dashboard will keep a short key prefix for reference later.

## 3. Install the Plugin in WordPress

For local development in this workspace, use the plugin already located at:

```bash
/var/www/site1.local/wp-content/plugins/plugin
```

Then:

1. Open WordPress Admin.
2. Go to `Plugins`.
3. Activate `Woosaas`.

## 4. Connect WordPress to Woosaas

In WordPress Admin:

1. Open `Woosaas`.
2. Enter the API URL.
3. Paste the API key.
4. Leave tracking enabled unless you are intentionally pausing collection.
5. Save settings.

Typical API URL values:

- local development: `http://localhost:8080`
- Docker-to-host setups may need your host IP instead of `localhost`
- production: your deployed Woosaas API base URL

## 5. Verify the Connection

In the WordPress plugin screen:

1. Click `Verify API Key`.
2. Confirm the plugin shows a successful verification.

Back in the Woosaas dashboard:

1. Open the site's `Setup Guide`.
2. Confirm `Last verified` updates.

If verification succeeds in WordPress but the dashboard stays stale, refresh the setup guide once.

## 6. Send a Test Event

You can test either side:

- from WordPress: use `Events Debug`
- from the dashboard: use `Send Debug Event`

After sending a test event, confirm:

1. `Last event` updates in the setup guide
2. the site status becomes `Active`
3. overview/realtime pages start showing activity

## 7. Launch Tracking

Once verify and test event both work:

1. Visit the storefront
2. Open a product page
3. Add a product to cart
4. Start checkout
5. Complete a test order

The plugin will send:

- `pageview`
- `product_view`
- `add_to_cart`
- `checkout_start`
- `purchase`

## 8. What to Check in the Dashboard

Use these pages after setup:

- `Overview`: traffic, revenue, conversion
- `Sources`: attribution and campaigns
- `Pages`: landing and top-viewed pages
- `Products`: product performance
- `Funnel`: drop-off through purchase flow
- `Realtime`: online users in the last 5 minutes
- `Bot Detection`: suspicious traffic review

## Troubleshooting

### Verify fails

Check:

- API URL is reachable from WordPress
- API key is correct
- the site domain in Woosaas matches the store domain you expect to track

### Verification works but no analytics appear

Check:

- the worker is running
- Redis is healthy
- ClickHouse is receiving rows
- tracking is still enabled in the plugin

### Events are missing for your own admin browsing

By default, logged-in traffic can be excluded. In the plugin settings, enable logged-in tracking if you need to test with an admin account.

### Debug event works but storefront events do not

Check:

- browser console errors
- blocked network requests
- caching or optimization plugins interfering with tracker JS
- WooCommerce hooks firing correctly on the active checkout flow
