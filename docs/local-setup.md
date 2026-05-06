# Woosaas - Local Development Setup

## Prerequisites

- Docker & Docker Compose
- Go 1.21+
- Node.js 18+
- npm or yarn

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/woosaas/woosaas.git
cd woosaas

# 2. Copy environment file
cp .env.example .env

# 3. Start infrastructure
docker-compose up -d

# 4. Run migrations
docker compose --profile tools run --rm migrate

# 5. Terminal 1: start backend
(cd api && go run cmd/server/main.go)

# 6. Terminal 2: start worker
(cd api && go run cmd/worker/main.go)

# 7. Terminal 3: start dashboard
(cd dashboard && npm install && npm run dev)
```

Important:

- The API accepts tracking events and pushes them into Redis.
- The worker consumes those events and writes them to ClickHouse.
- If the worker is not running, plugin requests can still succeed while the dashboard remains empty.

## Architecture Overview

```
Woosaas/
├── api/              # Go backend (Gin + ClickHouse + Redis)
├── dashboard/        # Next.js frontend  
├── plugin/           # WordPress plugin
├── docker/           # Docker configurations
└── docker-compose.yml
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API Server | 8080 | Backend API |
| Worker | - | Redis stream consumer and ClickHouse batch writer |
| Dashboard | 3000 | Next.js dashboard |
| PostgreSQL | 5432 | Business database |
| ClickHouse | 9000 | Analytics database |
| Redis | 6380 | Cache & queue |

## WordPress Plugin Setup

For a full end-user walkthrough, use [WordPress Plugin Setup](plugin-setup.md).

Quick version:

1. Copy the plugin folder into `wp-content/plugins/woosaas`
2. Activate `Woosaas` in WordPress Admin
3. Create a site and API key in the dashboard
4. Enter the API URL and API key in the plugin
5. Verify the connection and send a debug event

## API Endpoints

### Public (API Key Auth)
- `POST /api/v1/collect` - Collect events
- `GET /api/v1/collect/verify` - Verify API key

### Protected (JWT Auth)
- `POST /api/v1/auth/register` - Register account
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/me` - Current user
- `POST /api/v1/sites` - Create site
- `GET /api/v1/sites` - List sites
- `GET /api/v1/stats/*` - Analytics endpoints

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `JWT_SECRET` - JWT signing secret
- `CLICKHOUSE_*` - ClickHouse connection
- `POSTGRES_*` - PostgreSQL connection
- `REDIS_*` - Redis connection
- `NEXT_PUBLIC_API_URL` - Dashboard API URL

## Testing

```bash
# Run backend tests
cd api && go test ./...

# Build dashboard
cd dashboard && npm run build

# Run an end-to-end smoke test against a running stack
./scripts/smoke.sh
```

For manual verification during development, keep both the API server and worker running before testing plugin or dashboard data flows.

## Migrations

Fresh PostgreSQL containers initialize from `api/migrations_postgres/001_init.sql`. For an existing volume, run:

```bash
docker compose --profile tools run --rm migrate
```

The migration command is idempotent for the current MVP schema and applies both PostgreSQL and ClickHouse setup.

## Troubleshooting

### ClickHouse connection issues
Ensure ClickHouse is running and accepting connections on port 9000.

### Redis connection issues
Check Redis is running and `REDIS_HOST` is correct.

### Plugin not sending events
1. Check browser console for JS errors
2. Verify API key is correct
3. Check network tab for failed requests
4. Verify site domain matches in dashboard

### Dashboard shows no analytics after events are sent
1. Confirm the worker process is running
2. Check Redis for queued events and worker logs for flush failures
3. Verify ClickHouse has recent rows for the site
4. Re-run `./scripts/smoke.sh` against the live stack
