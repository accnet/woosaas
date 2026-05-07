# Observability and Alerts

This guide defines the minimum operating view for Woosaas ingestion.

## Runtime Surfaces

### API Health

- `GET /health`
- Expected: `{"status":"ok"}`
- Use this for container and load balancer health checks.

### Prometheus Metrics

- `GET /metrics`
- Scrape from the API service.

Key metrics:

| Metric | Meaning |
| --- | --- |
| `http_requests_total` | API request volume by method, endpoint, and status |
| `http_request_duration_seconds` | API latency distribution |
| `events_received_total` | Events accepted into Redis Stream |
| `events_processed_total` | Events flushed into ClickHouse by the worker |
| `events_failed_total` | Event validation, queue, or processing failures |
| `queue_size` | Last observed Redis stream size from the worker |
| `bot_score_distribution` | Distribution of bot scores seen by ingestion |

### Dashboard Pipeline Health

Open:

`Dashboard -> Site -> Health`

The page reads:

- Redis stream length
- worker consumer count
- lag and pending messages
- dead-letter length
- last processed event timestamp in ClickHouse

Use this page first when a site says data is missing or delayed.

## Suggested Alerts

These thresholds are intentionally conservative for early production.

| Alert | Suggested Rule | Severity |
| --- | --- | --- |
| API error rate high | 5xx responses exceed 2% for 5 minutes | Page |
| API latency high | p95 request duration exceeds 1s for 10 minutes | Ticket |
| Event receive failures | `events_failed_total` increases for 5 minutes | Page |
| Worker stalled | `events_received_total` increases but `events_processed_total` does not for 10 minutes | Page |
| Queue growing | pipeline health `queue_depth > 1000` for 10 minutes | Page |
| Dead letters present | pipeline health `dead_letter_length > 0` | Ticket |
| Site data stale | active site has no processed event for 15 minutes after receiving events | Ticket |

## Triage Flow

1. Check `docker compose ps` and confirm API, Redis, ClickHouse, and worker are running.
2. Open the site Health page and inspect `queue_depth`, `pending`, `lag`, and `dead_letter_length`.
3. If `lag` grows, inspect worker logs for ClickHouse insert errors.
4. If `pending` grows, restart or scale the worker and check whether messages are acknowledged.
5. If `dead_letter_length > 0`, inspect `events:dead` and replay only after fixing the root cause.
6. If Redis is empty but reports are stale, check ClickHouse connectivity and query errors.

## Local Commands

```bash
docker compose ps
docker compose logs --tail=200 api worker redis clickhouse
docker compose exec -T redis redis-cli XINFO GROUPS events:stream
docker compose exec -T redis redis-cli XLEN events:dead
docker compose --profile tools run --rm migrate
./scripts/smoke.sh
```

## Dead-Letter Replay Policy

Do not replay `events:dead` blindly.

Before replaying:

1. read the stored `error`
2. confirm the event payload is valid
3. confirm ClickHouse schema accepts the event
4. replay a small sample first
5. run the smoke test after replay

The current MVP stores dead-letter events for operator review. A dedicated replay command is a future hardening task.
