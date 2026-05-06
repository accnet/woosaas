# Woosaas Execution Roadmap

This document turns the product vision into an execution backlog for getting Woosaas production-ready.

It is intentionally more operational than `plan.md`.

## Goals

We want Woosaas to be:

1. trustworthy
2. operable
3. useful on day one
4. ready to expand into a paid SaaS

That means the priority is not "more features first".
The priority is:

1. correct data
2. reliable ingestion
3. safe multi-tenant access
4. clear onboarding
5. high-value reports

---

## Current Assessment

### What already exists

- local infra and runtime flow with API, worker, Redis, PostgreSQL, ClickHouse, dashboard
- WordPress plugin with pageview and ecommerce event tracking
- dashboard pages for overview, trend, sources, pages, products, funnel, realtime, bots
- onboarding flow with verification and debug events
- event dedupe, API key caching, and basic observability wiring
- role-aware site access based on `site_members`

### What still blocks real-world usage

- no UI/API yet for team member management
- limited automated confidence around analytics correctness
- observability exists, but not yet packaged into a real ops workflow
- attribution and realtime are still fairly shallow
- exports and customer-facing operational tools are not exposed

---

## Delivery Priorities

## Priority 1: Make The Product Trustworthy

This is the most important layer. If users do not trust the numbers, the rest of the product does not matter.

### Features

- analytics correctness checks
- data freshness visibility
- stronger attribution validation
- WooCommerce parity checks

### Tasks

#### Ingestion and data integrity

- add integration tests for:
  - `pageview`
  - `product_view`
  - `add_to_cart`
  - `checkout_start`
  - `purchase`
- add tests for duplicate `event_id` not increasing revenue or order count
- add tests for malformed event payloads by event type
- add tests for batch ingestion mixed with valid, invalid, and duplicate events
- verify `purchase` payload always carries `order_id`, `revenue`, `currency`
- add explicit event-type validation rules beyond generic struct validation

#### Attribution quality

- test last non-direct click behavior end to end
- test that direct traffic does not overwrite valid non-direct attribution
- test order meta persistence for attribution on checkout and purchase completion
- add a debug endpoint or admin report to inspect attribution attached to recent orders

#### User-facing trust signals

- add `data freshness` timestamp to dashboard overview
- add `last successful worker flush` surface in admin or setup flow
- add `last analytics event received` and `last analytics event processed`
- show "dashboard data may be delayed" state when worker or ClickHouse lag is detected

### Acceptance criteria

- duplicate events do not inflate orders or revenue
- a real WooCommerce test order produces correct source, revenue, and order metadata
- user can tell whether data is current or stale without reading logs

---

## Priority 2: Make The System Operable

The application should be diagnosable by the team without guesswork.

### Features

- production-grade health visibility
- actionable metrics
- queue and worker diagnostics
- backup and recovery workflow

### Tasks

#### Observability

- expose Prometheus metrics in deployment docs
- document key dashboards:
  - HTTP request rate/error rate
  - Redis queue depth
  - worker flush success/failure
  - ClickHouse insert failures
  - event receive/process/fail counters
- add structured logging around:
  - API key auth failures
  - worker retry and dead-letter moves
  - slow analytics queries
  - verification failures

#### Alerts

- alert when Redis queue depth grows beyond threshold
- alert when worker has not processed events for N minutes
- alert when ClickHouse insert error rate rises
- alert when API error rate spikes
- alert when no events have been processed recently in an active environment

#### Reliability

- document PostgreSQL backup and restore workflow
- document Redis/ClickHouse failure expectations
- verify dead-letter replay strategy
- add smoke script for:
  - verify endpoint
  - collect event
  - worker flush
  - ClickHouse visibility

### Acceptance criteria

- on-call can identify ingest failure source in minutes
- dead-letter and queue growth are visible
- there is a written recovery path for PostgreSQL

---

## Priority 3: Make Multi-Tenant Collaboration Real

The backend now has role-aware access, but the product surface does not yet expose it.

### Features

- team member management
- invites
- role changes
- membership audit trail

### Tasks

#### Backend

- add endpoint to list site members
- add endpoint to invite member by email
- add endpoint to update member role
- add endpoint to remove member
- add validation for allowed roles
- add permission checks per action
- add audit logging for:
  - invite sent
  - role changed
  - member removed

#### Frontend

- add `Team` page under site management
- show members and roles
- add invite form
- add role selector
- add remove member action with confirmation
- show current user role in the UI

#### Schema and workflow

- decide whether invite flow is immediate or email-token based
- support pending invites if email flow is not ready yet
- prevent removing the only owner

### Acceptance criteria

- owner can invite admin/editor/viewer
- viewer cannot mutate site settings or API keys
- role changes take effect immediately

---

## Priority 4: Make Onboarding Self-Serve

A store owner should be able to connect the plugin and confirm the pipeline is healthy without developer help.

### Features

- richer setup diagnostics
- plugin-side setup clarity
- end-to-end self-check

### Tasks

#### Dashboard onboarding

- add a single `Tracking Health` card with:
  - API verification status
  - latest received event
  - latest processed event
  - latest worker activity
- add explicit error copy for common failures:
  - invalid API key
  - worker not running
  - no events seen yet
  - domain mismatch
- add "copy config" helpers for plugin setup

#### Plugin UX

- improve settings labels and inline help
- show whether tracking is paused or active
- show last verify result and last debug event clearly
- surface common connection failures directly in admin

#### Documentation

- keep `docs/plugin-setup.md` in sync with actual UI
- add screenshots later if this becomes a customer-facing product

### Acceptance criteria

- a non-technical operator can install, verify, and test tracking from docs + UI alone

---

## Priority 5: Make Reports Valuable Enough To Keep Using

The current reports are a good base, but some high-value ecommerce views are still missing.

### Features

- campaign reporting
- better page and product decision support
- richer realtime
- bot review controls

### Tasks

#### Attribution and campaigns

- add campaign-level report page
- group by `source / medium / campaign`
- add revenue and conversion rate per campaign
- expose click-ID diagnostics for paid traffic
- add first-touch vs last-touch comparison as a later enhancement

#### Pages and products

- add landing page metrics
- add exit page metrics
- add page revenue attribution where possible
- add product add-to-cart rate
- add product purchase rate
- add previous-period comparison

#### Realtime

- add live event feed
- add top active pages
- add top active sources
- add currently converting sessions or carts if feasible

#### Bots

- wire more advanced bot scorer into ingest path
- add toggle to include/exclude bots in reports
- add bot trend over time
- add internal traffic whitelist

### Acceptance criteria

- a store owner can answer:
  - which campaigns drive revenue
  - which products convert poorly
  - where funnel drop-off is happening right now

---

## Priority 6: Add Practical Operator Features

These features are less foundational than data correctness, but they unlock daily usefulness.

### Features

- exports
- lightweight customer analytics
- anomaly alerts

### Tasks

#### Export

- add export endpoints for:
  - events
  - orders
  - customers
- add export UI with date range and type selector
- add download audit log if needed later

#### Customer 360 Lite

- add customer list page
- add customer detail page
- show:
  - first seen
  - last seen
  - sessions
  - orders
  - revenue
  - last source / campaign
  - recent event timeline

#### Alerts

- add simple threshold alerts:
  - traffic drop
  - revenue drop
  - conversion drop
  - data stale

### Acceptance criteria

- user can export usable data without direct database access
- user can inspect high-value customers without raw queries

---

## Priority 7: Post-MVP Commercial Layer

Only do this after the core product is trusted and stable.

### Features

- billing
- subscriptions
- support workflows
- email workflows

### Tasks

- wire billing service to real provider
- add subscription state to dashboard
- enforce plan limits carefully
- add support ticket UI if support becomes productized
- add outbound email provider integration
- add inbound parsing only if support workflow justifies it

---

## Suggested Sprint Order

## Sprint 1

- team members API
- team management UI
- role enforcement audit
- analytics integrity integration tests
- data freshness indicators

## Sprint 2

- worker and queue health surfaces
- observability docs and alerts
- campaign reporting
- pages/products comparison metrics

## Sprint 3

- export UI and API
- customer 360 lite
- realtime activity feed
- advanced bot scoring integration

## Sprint 4

- anomaly alerts
- billing integration prep
- plan enforcement

---

## Highest ROI Tasks Right Now

If the team only does a few things next, do these:

1. team management API and UI
2. end-to-end analytics correctness tests
3. worker and queue health visibility
4. campaign attribution report
5. export CSV

---

## Notes For Execution

- prefer finishing operational depth over adding broad but shallow features
- do not ship billing before data trust and onboarding are strong
- keep docs updated in the same PR when setup behavior changes
- every new analytics feature should answer a real merchant question, not just expose more rows
