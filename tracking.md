# Order Shipment Tracking + Provider APIs

## Summary

- Add shipment tracking to order detail with an `Add Tracking` button and popup for `tracking_number` and carrier.
- Persist tracking records in PostgreSQL and support multiple tracking numbers per order.
- Add user-scoped Settings for shipment tracking API credentials, with support for AfterShip, 17TRACK, and TrackingMore.
- On add tracking, save locally and register the tracking with the selected provider when credentials are configured.
- Update shipment status through provider webhooks or refresh, with manual refresh as a fallback.
- **Push tracking number and status updates back to the WooCommerce plugin at site1.local** via a dedicated REST endpoint in the plugin.
- Keep existing site/event tracking code unchanged; use `shipment_tracking` naming for the new shipping domain.

## Supported API Providers

The SaaS side supports one configured provider at a time per user:

- AfterShip
- 17TRACK
- TrackingMore

Provider credentials are stored per user. The active provider can be changed without changing the canonical tracking model.

## Backend Schema

Migration file: `api/migrations_postgres/015_shipment_tracking.sql`

Create `shipment_trackings`:

```sql
CREATE TABLE IF NOT EXISTS shipment_trackings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    woo_order_id TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    carrier_slug TEXT,
    carrier_name TEXT,
    provider TEXT NOT NULL,
    provider_tracking_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    status_raw TEXT,
    tracking_url TEXT,
    last_checkpoint_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    wc_push_status TEXT,          -- 'ok' | 'error' | NULL (not attempted)
    wc_push_error TEXT,
    wc_pushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_trackings_unique
    ON shipment_trackings (site_id, source_platform, woo_order_id, tracking_number, COALESCE(carrier_slug, ''));

CREATE INDEX IF NOT EXISTS idx_shipment_trackings_order
    ON shipment_trackings (site_id, source_platform, woo_order_id);

CREATE INDEX IF NOT EXISTS idx_shipment_trackings_provider_id
    ON shipment_trackings (provider_tracking_id)
    WHERE provider_tracking_id IS NOT NULL;
```

Create `shipment_tracking_provider_settings`:

```sql
CREATE TABLE IF NOT EXISTS shipment_tracking_provider_settings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'aftership',
    api_key_encrypted TEXT,
    webhook_secret_encrypted TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (provider IN ('aftership', '17track', 'trackingmore')),
    PRIMARY KEY (user_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_tracking_one_enabled_provider
    ON shipment_tracking_provider_settings (user_id)
    WHERE enabled = true;
```

## Backend Files to Create

```
api/internal/shipment_tracking/
    repository.go          — CRUD for shipment_trackings + provider_settings
    provider.go            — provider interface + active provider resolution
    aftership_client.go    — HTTP client wrapping AfterShip Tracking API 2026-01
    aftership_status.go    — status mapping table + MapAfterShipStatus()
    track17_client.go      — HTTP client wrapping 17TRACK tracking APIs
    track17_status.go      — status mapping table + Map17TrackStatus()
    trackingmore_client.go — HTTP client wrapping TrackingMore tracking APIs
    trackingmore_status.go — status mapping table + MapTrackingMoreStatus()
    wc_push_client.go      — HTTP client for pushing back to WooCommerce plugin REST endpoint
    service.go             — orchestrates add/refresh/delete + active provider + WC push

api/internal/api/handlers/
    shipment_tracking.go           — order tracking CRUD handlers
    shipment_tracking_settings.go  — per-user provider settings handlers
    shipment_tracking_webhook.go   — provider webhook receivers + signature validation
```

Router registration in `api/internal/api/router.go`:

```go
// In Router struct
shipmentTrackingHandler *handlers.ShipmentTrackingHandler
shipmentTrackingSettingsHandler *handlers.ShipmentTrackingSettingsHandler
shipmentTrackingWebhookHandler *handlers.ShipmentTrackingWebhookHandler

// Public (no JWT) — provider webhook receivers. user_id selects the per-user webhook secret.
v1.POST("/shipment-tracking/webhooks/:provider/:user_id", r.shipmentTrackingWebhookHandler.Receive)

// JWT-protected — order tracking
dash.GET("/sites/:site_id/orders/:woo_order_id/trackings", r.shipmentTrackingHandler.List)
dash.POST("/sites/:site_id/orders/:woo_order_id/trackings", r.shipmentTrackingHandler.Add)
dash.DELETE("/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id", r.shipmentTrackingHandler.Delete)
dash.POST("/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id/refresh", r.shipmentTrackingHandler.Refresh)

// JWT-protected — settings
dash.GET("/settings/shipment-tracking/providers", r.shipmentTrackingSettingsHandler.List)
dash.GET("/settings/shipment-tracking/providers/:provider", r.shipmentTrackingSettingsHandler.Get)
dash.PUT("/settings/shipment-tracking/providers/:provider", r.shipmentTrackingSettingsHandler.Update)
dash.PUT("/settings/shipment-tracking/active-provider", r.shipmentTrackingSettingsHandler.SetActiveProvider)
```

Encryption uses the existing `INTEGRATION_ENCRYPTION_KEY` / `handlers.LoadEncryptionKey()` pattern (same as ShopBase).

## Backend API

Order tracking endpoints:

- `GET /api/v1/sites/:site_id/orders/:woo_order_id/trackings`
- `POST /api/v1/sites/:site_id/orders/:woo_order_id/trackings`
  - Body: `tracking_number` (required), `carrier_slug` (optional), `carrier_name` (optional).
- `DELETE /api/v1/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id`
- `POST /api/v1/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id/refresh`

Settings endpoints:

- `GET /api/v1/settings/shipment-tracking/providers`
  - Response lists AfterShip, 17TRACK, and TrackingMore with `enabled`, `api_key_configured bool`, `webhook_secret_configured bool`, and provider capability metadata.
- `GET /api/v1/settings/shipment-tracking/providers/:provider`
- `PUT /api/v1/settings/shipment-tracking/providers/:provider`
  - `:provider` is one of `aftership`, `17track`, `trackingmore`.
  - Body: `enabled`, optional `api_key`, optional `webhook_secret`.
  - Response exposes only `provider`, `enabled`, `api_key_configured bool`, `webhook_secret_configured bool` — never raw secrets.
  - If `enabled=true`, disable every other provider setting for the same user in the same transaction.
- `PUT /api/v1/settings/shipment-tracking/active-provider`
  - Body: `provider`.
  - Enables the selected provider only if credentials are configured; disables the other providers.

Webhook endpoint:

- `POST /api/v1/shipment-tracking/webhooks/:provider/:user_id`
  - `:provider` is one of `aftership`, `17track`, `trackingmore`.
  - `:user_id` selects the per-user provider setting and webhook secret.
- Validate the provider-specific signature header with the stored webhook secret for the matching user/provider setting before applying any update.
- Reject with 401 on invalid signature or missing credentials.
- Update matching tracking by `provider_tracking_id`; fallback to `tracking_number + carrier_slug`.
- After status update, trigger async WC push if `wc_push_status` is not `'ok'` or status changed.

## Status Mapping

Each provider adapter maps raw provider status into the shared internal status contract:

| AfterShip tag | Internal status |
|---|---|
| InfoReceived | `info_received` |
| InTransit | `in_transit` |
| OutForDelivery | `out_for_delivery` |
| Delivered | `delivered` |
| FailedAttempt | `failed_attempt` |
| Exception | `exception` |
| Expired | `expired` |
| Pending | `pending` |
| AvailableForPickup | `available_for_pickup` |

Unknown tags: convert to lowercase snake_case; preserve original in `status_raw`.

`aftership_status.go`, `track17_status.go`, and `trackingmore_status.go` each expose provider-specific mapping functions. Equivalent 17TRACK and TrackingMore raw statuses must normalize into the same internal statuses wherever possible; unknown statuses use lowercase snake_case fallback and preserve the raw value in `status_raw`.

## Provider API Integration Behavior

Each provider integration should follow the same shape:

- Load the provider configuration from the current user.
- Decrypt the provider API credential using the existing encryption key pattern.
- Register the tracking with the selected provider when the provider is enabled.
- Store provider tracking IDs, URLs, raw statuses, sync errors, and last sync timestamps locally.
- Keep the canonical SaaS payload provider-agnostic so the active provider can be switched in settings.

Provider-specific notes:

- AfterShip: `as-api-key: <decrypted key>` and base URL `https://api.aftership.com/tracking/2026-01`.
- 17TRACK: use the provider's API key / token contract, register trackings with its create/register endpoint, refresh through its lookup endpoint, and normalize all returned statuses into the shared status model.
- TrackingMore: use the provider's API key / token contract, register trackings with its create/register endpoint, refresh through its lookup endpoint, and normalize all returned statuses into the shared status model.

Add tracking flow:
1. Save local row with `status='pending'`.
2. If the selected provider is enabled and api_key present: call the provider create-tracking endpoint.
3. On success: update `provider_tracking_id`, `tracking_url`, `last_synced_at`, clear `sync_error`.
4. On failure: keep row, save `sync_error`.
5. Always attempt WC push (step in service layer).

Manual refresh flow:
1. Call the selected provider's tracking lookup endpoint, or search by number if no provider ID is available.
2. Update `status`, `status_raw`, `last_checkpoint_at`, `tracking_url`, `last_synced_at`, `sync_error`.
3. Trigger WC push if status changed.

## WC Push-Back to Plugin (site1.local)

### Goal
When tracking is added or status changes, push the update to the WooCommerce order at `site1.local` so the order notes and meta stay in sync without manual intervention.

### Plugin changes — new REST endpoint

Add to `includes/class-order-sync.php` (or a new `includes/class-tracking-receiver.php`):

```php
add_action('rest_api_init', function () {
    register_rest_route('woosaas/v1', '/orders/(?P<order_id>\d+)/tracking', [
        'methods'             => 'POST',
        'callback'            => 'woosaas_receive_tracking_update',
        'permission_callback' => 'woosaas_verify_push_token',
        'args' => [
            'order_id'        => ['required' => true, 'sanitize_callback' => 'absint'],
            'tracking_number' => ['required' => true, 'sanitize_callback' => 'sanitize_text_field'],
            'carrier_name'    => ['default'  => '', 'sanitize_callback' => 'sanitize_text_field'],
            'status'          => ['required' => true, 'sanitize_callback' => 'sanitize_text_field'],
            'tracking_url'    => ['default'  => '', 'sanitize_callback' => 'esc_url_raw'],
        ],
    ]);
});

function woosaas_verify_push_token(WP_REST_Request $request): bool {
    $token = $request->get_header('X-Woosaas-Push-Token');
    return hash_equals(get_option('woosaas_push_token', ''), (string) $token);
}

function woosaas_receive_tracking_update(WP_REST_Request $request): WP_REST_Response {
    $order_id        = $request->get_param('order_id');
    $tracking_number = $request->get_param('tracking_number');
    $carrier_name    = $request->get_param('carrier_name');
    $status          = $request->get_param('status');
    $tracking_url    = $request->get_param('tracking_url');

    $order = wc_get_order($order_id);
    if (!$order) {
        return new WP_REST_Response(['error' => 'Order not found'], 404);
    }

    // Save meta
    $order->update_meta_data('_woosaas_tracking_number', $tracking_number);
    $order->update_meta_data('_woosaas_tracking_carrier', $carrier_name);
    $order->update_meta_data('_woosaas_tracking_status', $status);
    $order->update_meta_data('_woosaas_tracking_url', $tracking_url);
    $order->save();

    // Add order note
    $note = sprintf(
        'Woosaas tracking update: %s (%s) — Status: %s%s',
        $tracking_number,
        $carrier_name ?: 'unknown carrier',
        $status,
        $tracking_url ? " — $tracking_url" : ''
    );
    $order->add_order_note($note);

    return new WP_REST_Response(['ok' => true], 200);
}
```

`woosaas_push_token` is stored in WordPress options and set from the plugin admin page.

### SaaS side — `wc_push_client.go`

```go
type WCPushClient struct {
    baseURL   string // e.g. https://site1.local/wp-json/woosaas/v1
    pushToken string
    http      *http.Client
}

func (c *WCPushClient) PushTracking(ctx context.Context, wooOrderID, trackingNumber, carrierName, status, trackingURL string) error
```

Site's `wc_push_url` and `wc_push_token` are stored in a new nullable columns on the `sites` table (migration 015 or a separate 016):

```sql
ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS wc_push_url   TEXT,
    ADD COLUMN IF NOT EXISTS wc_push_token_encrypted TEXT;
```

Or reuse the existing `integration_credentials` approach from ShopBase if a site is already linked.

The service calls `WCPushClient.PushTracking` after any status change. On failure, records `wc_push_status='error'`, `wc_push_error`, leaves `wc_pushed_at` unchanged. On success, sets `wc_push_status='ok'`, `wc_pushed_at=NOW()`.

### Settings UI for WC Push

Add to site integration settings:
- `WC Push URL` (base URL of the plugin REST endpoint, e.g. `https://site1.local/wp-json/woosaas/v1`)
- `WC Push Token` (the value stored in `woosaas_push_token` WordPress option)
- Save sends `PATCH /api/v1/sites/:site_id` or a dedicated endpoint.

### Settings UI for Provider APIs

Add a user-scoped shipment tracking settings area:

- `Provider` select: AfterShip / 17TRACK / TrackingMore
- `API Key` or token field for the selected provider
- `Webhook Secret` where the provider supports signed callbacks
- `Enabled` toggle for the selected provider
- Only one provider can be enabled at a time for the user
- Save should preserve existing credentials for inactive providers but only one provider is treated as active

## Frontend Changes

### Types (`dashboard/src/lib/types.ts`)

```ts
export interface ShipmentTracking {
  id: string
  woo_order_id: string
  tracking_number: string
  carrier_slug: string | null
  carrier_name: string | null
  provider: string
  status: string
  status_raw: string | null
  tracking_url: string | null
  last_checkpoint_at: string | null
  last_synced_at: string | null
  sync_error: string | null
  wc_push_status: string | null
  wc_push_error: string | null
  wc_pushed_at: string | null
  created_at: string
}
```

Extend `OrderDetail` with `trackings: ShipmentTracking[]`.

### API helpers (`dashboard/src/lib/api.ts`)

```ts
ordersApi.listTrackings(siteId, wooOrderId)
ordersApi.addTracking(siteId, wooOrderId, data)
ordersApi.deleteTracking(siteId, wooOrderId, trackingId)
ordersApi.refreshTracking(siteId, wooOrderId, trackingId)

shipmentTrackingSettingsApi.listProviders()
shipmentTrackingSettingsApi.getProvider(provider)
shipmentTrackingSettingsApi.updateProvider(provider, data)
shipmentTrackingSettingsApi.setActiveProvider(provider)
```

### Order detail UI

- Add `Shipment Tracking` `SectionCard` in the left column below Items.
- Each tracking row shows: carrier badge, tracking number (link if `tracking_url` set), status `StatusChip`, `last_checkpoint_at`, `wc_push_status` indicator, Refresh button, Delete button.
- `sync_error` and `wc_push_error` shown inline in red under the row.
- `+ Add Tracking` button opens a modal with `tracking_number` (required), `carrier_name`, `carrier_slug`.
- Disable submit while saving; reload trackings list on success.

### Settings UI

- Add nav item `Shipment Tracking` to `settingsNav` in `lib/navigation.ts`.
- New page `dashboard/src/app/dashboard/settings/shipment-tracking/page.tsx`.
- Provider section: provider select, enabled toggle, API key field, webhook secret field when applicable, Save button.
- Show `configured` badge when the selected provider has credentials set; field placeholder `••••••••` when configured.

## Scope Boundaries

- Included: normalized shipment tracking payloads, user-scoped provider API settings, one active provider at a time, and plugin adapter projection.
- Included: AfterShip, 17TRACK, and TrackingMore as the supported SaaS provider options.
- Excluded: multi-provider fan-out, auto-detection of arbitrary Woo plugins, and reverse editing from Woo back into SaaS.

## Detailed Implementation Tasks

### Phase 1 — Data Model and Local Tracking

1. Create PostgreSQL migration `api/migrations_postgres/015_shipment_tracking.sql`.
   - Add `shipment_trackings`.
   - Add `shipment_tracking_provider_settings`.
   - Add unique index for duplicate prevention per order/tracking/carrier.
   - Add partial unique index so each user has only one enabled provider.
   - Add nullable `wc_push_url` and `wc_push_token_encrypted` to `sites`, or document the selected existing credential storage path.

2. Add Go domain models in `api/internal/shipment_tracking`.
   - `ShipmentTracking`
   - `ProviderSetting`
   - request structs for add/update settings/refresh
   - response structs that never expose decrypted secrets

3. Implement repository methods.
   - `ListTrackings(ctx, siteID, sourcePlatform, wooOrderID)`
   - `CreateTracking(ctx, input)`
   - `GetTracking(ctx, siteID, trackingID)`
   - `UpdateProviderFields(ctx, trackingID, provider fields)`
   - `UpdateStatus(ctx, trackingID, status fields)`
   - `DeleteTracking(ctx, siteID, trackingID)`
   - `GetProviderSetting(ctx, userID, provider)`
   - `ListProviderSettings(ctx, userID)`
   - `UpsertProviderSetting(ctx, userID, provider, encrypted fields, enabled)`
   - `SetActiveProvider(ctx, userID, provider)`

4. Implement local tracking service flow.
   - Validate `tracking_number`.
   - Verify the current user can access `site_id`.
   - Save tracking locally with status `pending`.
   - Return local tracking even if provider registration later fails.
   - Make delete local-first; provider delete/deregister can be best-effort if provider supports it.

Acceptance:
- A user can add, list, refresh, and delete local tracking records for an order.
- Duplicate tracking number + carrier for the same order is rejected.
- Tracking persists without any provider credentials configured.

### Phase 2 — Provider Abstraction and Settings

1. Add provider interface in `provider.go`.
   - `Name() string`
   - `Capabilities() ProviderCapabilities`
   - `RegisterTracking(ctx, req) (ProviderTracking, error)`
   - `RefreshTracking(ctx, req) (ProviderTracking, error)`
   - `ParseWebhook(ctx, body, headers, secret) (WebhookUpdate, error)`
   - `MapStatus(raw string) string`

2. Implement provider settings API.
   - `GET /api/v1/settings/shipment-tracking/providers`
   - `GET /api/v1/settings/shipment-tracking/providers/:provider`
   - `PUT /api/v1/settings/shipment-tracking/providers/:provider`
   - `PUT /api/v1/settings/shipment-tracking/active-provider`

3. Encrypt and decrypt provider credentials.
   - Use `INTEGRATION_ENCRYPTION_KEY`.
   - Preserve old encrypted values when form fields are omitted.
   - Clear credentials only through an explicit clear flag if added later.
   - Never return raw API key or webhook secret.

4. Enforce one active provider per user.
   - Disable other providers in the same DB transaction when enabling one provider.
   - Reject active provider changes when selected provider has no API key configured.
   - Return provider capability metadata for frontend rendering.

Acceptance:
- User can configure AfterShip, 17TRACK, and TrackingMore credentials independently.
- Only one provider can be active for the user.
- Settings reload shows configured badges but never raw secrets.

### Phase 3 — Provider Clients

1. Implement AfterShip adapter.
   - Use `as-api-key`.
   - Base URL: `https://api.aftership.com/tracking/2026-01`.
   - Implement create/register tracking.
   - Implement refresh/lookup tracking.
   - Implement webhook signature validation.
   - Implement `MapAfterShipStatus`.

2. Implement 17TRACK adapter.
   - Use the provider token/header contract.
   - Implement create/register tracking.
   - Implement refresh/lookup tracking.
   - Implement webhook validation if supported by configured secret.
   - Implement `Map17TrackStatus`.

3. Implement TrackingMore adapter.
   - Use the provider token/header contract.
   - Implement create/register tracking.
   - Implement refresh/lookup tracking.
   - Implement webhook validation if supported by configured secret.
   - Implement `MapTrackingMoreStatus`.

4. Normalize provider responses.
   - Store `provider`.
   - Store `provider_tracking_id`.
   - Store `tracking_url`.
   - Store normalized `status`.
   - Store raw provider status in `status_raw`.
   - Store `last_checkpoint_at` and `last_synced_at`.
   - Store provider failures in `sync_error`.

Acceptance:
- Add tracking registers with the currently active provider when credentials exist.
- Manual refresh updates status and timestamps from the active provider.
- Provider errors do not delete or hide the local tracking row.

### Phase 4 — Webhooks

1. Register public webhook route.
   - `POST /api/v1/shipment-tracking/webhooks/:provider/:user_id`
   - Validate provider name.
   - Load provider setting by `user_id + provider`.
   - Verify provider-specific signature before parsing update.

2. Apply webhook updates.
   - Match by `provider_tracking_id`.
   - Fallback to `tracking_number + carrier_slug` when provider ID is missing.
   - Update normalized status and raw status.
   - Update checkpoint timestamp and tracking URL when provided.
   - Trigger Woo push when status changes.

3. Add webhook idempotency protection.
   - Ignore stale updates when provider checkpoint timestamp is older than current `last_checkpoint_at`.
   - Keep operation safe if the same webhook is delivered multiple times.

Acceptance:
- Valid webhooks update tracking rows.
- Invalid signatures return 401.
- Wrong `user_id` cannot validate another user's webhook secret.

### Phase 5 — WooCommerce Push-Back

1. Add SaaS WC push credential storage.
   - Store per-site `wc_push_url`.
   - Store encrypted per-site `wc_push_token`.
   - Add settings endpoint or extend site update payload.

2. Implement `wc_push_client.go`.
   - POST to `{wc_push_url}/orders/{woo_order_id}/tracking`.
   - Send `X-Woosaas-Push-Token`.
   - Send `tracking_number`, `carrier_name`, `status`, `tracking_url`.
   - Treat 2xx as success.
   - Store non-2xx responses as `wc_push_error`.

3. Integrate WC push in service.
   - Attempt push after local add.
   - Attempt push after status change from refresh or webhook.
   - Mark `wc_push_status='ok'` and `wc_pushed_at` on success.
   - Mark `wc_push_status='error'` and `wc_push_error` on failure.
   - Do not block add/refresh response when WC push fails.

4. Add plugin REST receiver.
   - Register `/wp-json/woosaas/v1/orders/{order_id}/tracking`.
   - Validate `X-Woosaas-Push-Token`.
   - Save order meta.
   - Add order note.
   - Return 404 when Woo order is missing.

Acceptance:
- Adding tracking from SaaS creates/updates Woo order tracking meta.
- Status changes create Woo order notes.
- SaaS UI shows whether the last push succeeded or failed.

### Phase 6 — Backend Routing and Order Integration

1. Wire handlers in `api/internal/api/router.go`.
   - Add shipment tracking handlers to router struct.
   - Instantiate repository/service/handlers in `NewRouter`.
   - Register protected tracking routes.
   - Register public webhook route.

2. Extend order detail response.
   - Add `trackings: []ShipmentTracking` to order detail payload, or load trackings separately via frontend API helper.
   - Keep order detail backwards compatible when no tracking rows exist.

3. Connect export columns.
   - Replace empty `tracking_number`, `tracking_carrier`, `tracking_url` export values.
   - Decide whether exports use latest tracking only or join multiple tracking numbers with a delimiter.
   - Document delimiter behavior.

Acceptance:
- Existing order detail endpoints still work.
- New tracking routes are tenant-safe.
- Export tracking columns no longer return empty strings when tracking exists.

### Phase 7 — Dashboard API and Types

1. Update `dashboard/src/lib/types.ts`.
   - Add `ShipmentTracking`.
   - Add provider settings response types.
   - Add request input types.
   - Extend `OrderDetail` if trackings are embedded.

2. Update `dashboard/src/lib/api.ts`.
   - Add `ordersApi.listTrackings`.
   - Add `ordersApi.addTracking`.
   - Add `ordersApi.deleteTracking`.
   - Add `ordersApi.refreshTracking`.
   - Add `shipmentTrackingSettingsApi.listProviders`.
   - Add `shipmentTrackingSettingsApi.getProvider`.
   - Add `shipmentTrackingSettingsApi.updateProvider`.
   - Add `shipmentTrackingSettingsApi.setActiveProvider`.

Acceptance:
- Frontend compiles with typed tracking and settings APIs.
- API helpers match backend routes exactly.

### Phase 8 — Order Detail UI

1. Add tracking section.
   - Place `Shipment Tracking` below Items in order detail.
   - Load tracking rows on page load.
   - Show empty state when no tracking exists.

2. Build Add Tracking modal.
   - `tracking_number` required.
   - `carrier_name` optional.
   - `carrier_slug` optional.
   - Disable submit while saving.
   - Show API errors inline.
   - Reload tracking list after success.

3. Render tracking rows.
   - Carrier badge.
   - Tracking number link when `tracking_url` exists.
   - Status chip.
   - Last checkpoint timestamp.
   - Provider label.
   - WC push status.
   - Refresh button.
   - Delete button.
   - Inline `sync_error` and `wc_push_error`.

Acceptance:
- User can manage tracking from order detail without leaving the page.
- UI clearly distinguishes provider sync errors from Woo push errors.

### Phase 9 — Shipment Tracking Settings UI

1. Add settings navigation.
   - Add `Shipment Tracking` to `settingsNav`.
   - Route to `/dashboard/settings/shipment-tracking`.

2. Build settings page.
   - Provider selector: AfterShip / 17TRACK / TrackingMore.
   - Enabled toggle.
   - API key/token field.
   - Webhook secret field when provider supports signed webhooks.
   - Configured badges.
   - Save button.
   - Active provider state.

3. Preserve secret UX.
   - Use masked placeholder when credential is configured.
   - Do not prefill raw secret.
   - Do not clear existing secret on blank field unless explicit clear behavior exists.

Acceptance:
- User can configure any of the three providers.
- Switching active provider is explicit and visible.
- Secrets are never displayed after save.

### Phase 10 — QA and Release Checklist

1. Backend automated tests.
   - Repository duplicate handling.
   - Settings one-active-provider transaction.
   - Provider status mapping.
   - Provider client success/failure.
   - Webhook signature validation.
   - WC push success/failure.
   - Handler validation.

2. Frontend verification.
   - `npm run build`.
   - Add tracking empty state.
   - Add tracking success.
   - Provider sync error display.
   - WC push error display.
   - Refresh and delete flows.
   - Settings save/reload behavior.

3. Manual integration.
   - Configure provider credentials.
   - Add tracking on a Woo order.
   - Verify provider registration.
   - Verify Woo order note/meta at `site1.local`.
   - Trigger webhook and verify SaaS + Woo update.
   - Export order and verify tracking columns.

4. Operational notes.
   - Document webhook URL format for each provider.
   - Document required env var `INTEGRATION_ENCRYPTION_KEY`.
   - Document WC push token setup in plugin admin.
   - Document retry/manual refresh behavior.

Acceptance:
- Full backend suite passes.
- Dashboard build passes.
- End-to-end add tracking and status update works with at least one real provider sandbox/account before release.

## Test Plan

Backend:

- `go test ./internal/shipment_tracking/...`
- Unit tests for `MapAfterShipStatus`, `Map17TrackStatus`, and `MapTrackingMoreStatus`, covering known statuses and unknown fallback.
- Repository: add two trackings, reject duplicate, allow different tracking numbers.
- Handler: missing `site_id` → 400; empty `tracking_number` → 400.
- Provider client tests with `httptest` for AfterShip, 17TRACK, and TrackingMore: correct auth header/token, create success, refresh success, create error → `sync_error` persisted.
- `wc_push_client_test.go` with `httptest`: correct `X-Woosaas-Push-Token`, handles 404 order gracefully.
- Webhook: valid provider signature updates status; invalid signature → 401; wrong `user_id` cannot validate another user's secret.
- Full suite: `go test ./...`

Frontend:

- `npm run build`
- Manual: add tracking with each active provider → verify provider row + WC order note appears.
- Manual: webhook fires → status chip updates + `wc_push_status` shows ok.
- Manual: Settings → save key → masked reload; disable → re-enable.

Plugin:

- `php -l includes/class-tracking-receiver.php`
- Manual: `curl -X POST https://site1.local/wp-json/woosaas/v1/orders/14752/tracking -H "X-Woosaas-Push-Token: ..." -d '{"tracking_number":"1Z...","status":"in_transit"}'`
- Verify order note added and meta saved in WP admin.

## Assumptions

- Shipment provider credentials are global per user, not per site, for AfterShip, 17TRACK, and TrackingMore.
- WC push credentials (URL + token) are per site.
- Carrier can be saved as both a human label and optional provider carrier slug; if slug is blank, the selected provider may auto-detect carrier when supported.
- Add Tracking still saves locally if selected-provider registration fails.
- WC push is best-effort; failure does not block the SaaS response.
- Existing site/event tracking and tracker script features remain unchanged.
- `INTEGRATION_ENCRYPTION_KEY` is reused for encrypting provider and WC push credentials (no new env var needed).
