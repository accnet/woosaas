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
# Start the full dev stack from .env
./start.sh start
```

The dev script builds the stack, runs migrations, checks API health, and uses the WordPress plugin already installed at `/var/www/site1.local/wp-content/plugins/plugin`.

# woosaas

## Documentation

- [Execution Roadmap](ROADMAP_EXECUTION.md)
- [Local Setup Guide](docs/local-setup.md)
- [Observability and Alerts](docs/observability-alerts.md)
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
├── docker/               # Docker configs
├── docs/                 # Documentation
└── docker-compose.yml
```

## License

MIT
