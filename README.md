# Woosaas - Analytics for WooCommerce

> Analytics SaaS platform for WordPress/WooCommerce store owners

Woosaas helps you track traffic sources, revenue, conversion funnels, and customer behavior on your WooCommerce store.

## Features

- **Pageview Tracking** - Track all page views with client/session identification
- **E-commerce Events** - Product views, add to cart, checkout, purchase tracking
- **Attribution** - UTM parameters, referrer, click IDs (gclid, fbclid, etc.)
- **Revenue Analytics** - Track orders, revenue, AOV, conversion rates
- **Funnel Analysis** - View → Cart → Checkout → Purchase conversion
- **Real-time Dashboard** - See online users live
- **Bot Detection** - Flag and filter bot traffic

## Tech Stack

| Component | Technology |
|-----------|-------------|
| Client | WordPress Plugin (JS + PHP) |
| Backend | Go (Gin framework) |
| Analytics DB | ClickHouse |
| Business DB | PostgreSQL |
| Cache/Queue | Redis |
| Frontend | Next.js + ECharts |

## Quick Start

```bash
# Start infrastructure
docker-compose up -d

# Terminal 1: start API server
(cd api && go run cmd/server/main.go)

# Terminal 2: start event worker
(cd api && go run cmd/worker/main.go)

# Terminal 3: start dashboard
(cd dashboard && npm install && npm run dev)
```

The worker is part of the normal local runtime. Events are queued through Redis first, then flushed to ClickHouse by the worker.

# woosaas

## Documentation

- [Execution Roadmap](ROADMAP_EXECUTION.md)
- [Local Setup Guide](docs/local-setup.md)
- [WordPress Plugin Setup](docs/plugin-setup.md)
- [WordPress Plugin Test Checklist](docs/plugin-test-checklist.md)

## Project Structure

```
woosaas/
├── api/                   # Go backend
│   ├── cmd/server/       # API server
│   ├── cmd/worker/        # Background worker
│   └── internal/          # Core packages
├── dashboard/            # Next.js dashboard
├── plugin/               # WordPress plugin
├── docker/               # Docker configs
├── docs/                 # Documentation
└── docker-compose.yml
```

## License

MIT
