# Plan: Sync WooCommerce Order Item Meta

## Context

Order `14697` (`site1.local`) uses a simple product (`variation_id = 0`) with Wootify variant metadata in its line items:

| Meta key | Value |
|---|---|
| `_wootify_variant_id` | `568161` |
| `Style` | `Classic T-Shirt` |
| `Color` | `Black` |
| `Size` | `S` |
| `_wootify_customizer_json` | `[]` |

Current sync (`class-order-sync.php`) only sends canonical item fields. Meta is lost — not in PostgreSQL, API, or dashboard.

**Out of scope:** revenue calculation changes, Wootify variant analytics aggregation.

## Target Item Payload

```json
{
  "line_item_id": "55",
  "product_id": "13754",
  "variation_id": "0",
  "external_variant_id": "568161",
  "variant_attributes": { "Style": "Classic T-Shirt", "Color": "Black", "Size": "S" },
  "meta": [
    { "key": "_wootify_variant_id", "value": "568161" },
    { "key": "Style", "value": "Classic T-Shirt" },
    { "key": "Color", "value": "Black" },
    { "key": "Size", "value": "S" },
    { "key": "_wootify_customizer_json", "value": "[]" }
  ]
}
```

> `variation_id` stays `0` (WooCommerce native). `external_variant_id` is Wootify-only, kept separate.

## Phase 1 — Plugin Payload

**File:** `/var/www/site1.local/wp-content/plugins/plugin/includes/class-order-sync.php`

In `build_order_payload()`, for each line item:
- `meta`: iterate `$item->get_meta_data()`, output `[{"key":..., "value":...}]`. Encode non-scalar values as JSON string.
- `variant_attributes`: pick public label-like keys (non-`_` prefixed, string values).
- `external_variant_id`: read `_wootify_variant_id` meta, default `""`.
- `variation_id`: keep `$item->get_variation_id()` — do not replace with Wootify ID.

## Phase 2 — Go Models

**File:** `api/pkg/models/orders.go`

Add struct:
```go
type WooOrderItemMeta struct {
    Key   string      `json:"key"`
    Value interface{} `json:"value"`
}
```

Add fields to both `WooOrderItemInput` and `WooOrderItem`:
```go
ExternalVariantID  string                 `json:"external_variant_id,omitempty"`
VariantAttributes  map[string]interface{} `json:"variant_attributes,omitempty"`
Meta               []WooOrderItemMeta     `json:"meta,omitempty"`
```

## Phase 3 — PostgreSQL Migration

**File:** `api/migrations_postgres/003_woo_order_item_meta.sql`

```sql
ALTER TABLE woo_order_items
    ADD COLUMN IF NOT EXISTS external_variant_id TEXT,
    ADD COLUMN IF NOT EXISTS variant_attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_woo_order_items_site_ext_variant
    ON woo_order_items (site_id, external_variant_id)
    WHERE external_variant_id IS NOT NULL;
```

> `raw_item_json` (already exists) continues to hold the full item payload including `meta`.

## Phase 4 — Repository

**File:** `api/internal/orders/repository.go`

Item insert (in `UpsertOrderSnapshot`):
- Add `external_variant_id` and `variant_attributes_json` columns to the `INSERT` and `ON CONFLICT DO UPDATE`.
- `variant_attributes_json` ← marshal `item.VariantAttributes`.
- `external_variant_id` ← `nullIfEmpty(item.ExternalVariantID)`.
- `raw_item_json` already captures the full item struct (including `meta`), no change needed there.

Order detail read:
- Scan `external_variant_id` and `variant_attributes_json` into `WooOrderItem`.
- Unmarshal `raw_item_json` to surface `meta` in the response.

## Phase 5 — Dashboard UI

In the order detail item list:
- Display `variant_attributes` values inline under the product name (e.g., `Black / S / Classic T-Shirt`).
- Show `external_variant_id` in a collapsed technical details section.
- Hide `_`-prefixed meta keys by default; show on expand.

## Phase 6 — Backfill

After deploying Phase 1–4:
1. Trigger order backfill from plugin for `site1.local`.
2. Confirm existing item rows are overwritten (delete-insert pattern already in `UpsertOrderSnapshot`).
3. Verify order `14697` in Woosaas.

## Phase 7 — Tests

**Plugin:**
- `build_order_payload()` includes `meta`, `variant_attributes`, `external_variant_id`.
- `variation_id = 0` is preserved for Wootify simple-product variants.

**Go:**
- `POST /api/v1/woo/orders/sync` accepts item meta fields without error.
- Repository persists `external_variant_id` and `variant_attributes_json`.
- Order detail response includes `meta`, `variant_attributes`, `external_variant_id`.

**Integration — order `14697`, item `55`:**
```
product_id             = 13754
variation_id           = 0
external_variant_id    = 568161
variant_attributes_json ⊇ { Style, Color, Size }
raw_item_json.meta     = full meta array
```

## Risks

| Risk | Mitigation |
|---|---|
| Meta value is array/object | Plugin encodes non-scalar values as JSON string before sending |
| Private `_` meta keys pollute UI | Store in `raw_item_json`; UI filters by default |
| `external_variant_id` ≠ `variation_id` confusion | Always map to separate field; never overwrite `variation_id` |
