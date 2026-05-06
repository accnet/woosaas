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

# 5. Start backend
go run cmd/server/main.go

# 6. Start dashboard (in another terminal)
cd dashboard
npm install
npm run dev
```

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
| Dashboard | 3000 | Next.js dashboard |
| PostgreSQL | 5432 | Business database |
| ClickHouse | 9000 | Analytics database |
| Redis | 6380 | Cache & queue |

## WordPress Plugin Setup

1. Copy plugin folder to WordPress plugins directory:
   ```bash
   cp -r plugin /path/to/wordpress/wp-content/plugins/woosaas
   ```

2. Activate plugin in WordPress admin

3. Go to WooCommerce > Woosaas Settings

4. Enter your API URL and API key from the dashboard

5. Click "Verify API Key" to test connection

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
