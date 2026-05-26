# Woosaas Help

## Default Accounts

Tenant dashboard account:

```text
Email: admin@woosaas.com
Password: Admin123!
```

Platform admin account:

```text
Email: admin@woosaas.com
Password: Admin123!
```

Notes:

- The tenant dashboard account is used by `./start.sh seed`.
- `./start.sh seed` now bootstraps the platform admin account first in base mode.
- The platform admin login is separate from the tenant login, even if the default credentials are the same.

## Local URLs

Default local URLs from [`.env.example`](/home/accnet/woosaas/.env.example):

```text
Dashboard: http://localhost:3000
Dashboard dev: http://localhost:3001
API: http://localhost:8080
Platform admin: http://localhost:3000/admin/login
Tenant login: http://localhost:3000/login
```

## Current NAT Test Setup

The current NAT-based test environment is driven by [`.env`](/home/accnet/woosaas/.env).

Current public URLs:

```text
API: http://103.130.215.21:36973
Dashboard: http://103.130.215.21:47906
Dashboard dev: http://103.130.215.21:40169
```

Port mapping:

```text
103.130.215.21:36973 -> 8080
103.130.215.21:47906 -> 3000
103.130.215.21:40169 -> 3001
```

## Compose Files

Base deploy/test stack:

- File: [docker-compose.yml](/home/accnet/woosaas/docker-compose.yml)
- Runtime env file: [`.env`](/home/accnet/woosaas/.env)
- Intended for local Docker runs and NAT-based testing

Production stack:

- File: [docker-compose.prod.yml](/home/accnet/woosaas/docker-compose.prod.yml)
- Runtime env file: [`.env.prod`](/home/accnet/woosaas/.env.prod)
- Template: [`.env.prod.example`](/home/accnet/woosaas/.env.prod.example)
- Intended for reverse-proxy / HTTPS deployment

## Common Commands

Start base stack with `.env`:

```bash
docker compose --env-file .env up -d --build
docker compose --env-file .env --profile tools run --rm migrate
```

Start production stack with `.env.prod`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tools run --rm migrate
```

Use helper script for the base stack:

```bash
./start.sh start
./start.sh dev
./start.sh bootstrap-platform-admin
./start.sh stop
./start.sh logs api
./start.sh ps
```

## Dashboard Dev Mode

`./start.sh dev` reads the public API URL from [`.env`](/home/accnet/woosaas/.env) and starts the Next.js dev server on `DASHBOARD_DEV_PORT`.

With the current NAT config:

```text
Dashboard dev public URL: http://103.130.215.21:40169
API URL used by frontend: http://103.130.215.21:36973
```

## Plugin Setup

Local plugin path expected by the helper script:

```text
/var/www/site1.local/wp-content/plugins/plugin
```

Configured in:

- [`.env`](/home/accnet/woosaas/.env)
- [`.env.example`](/home/accnet/woosaas/.env.example)

The plugin connect modal expects:

- API URL
- public tracking / write API key

Important:

- Plugin connect is server-to-server from WordPress PHP to Woosaas API.
- Browser CORS is not the cause of plugin connect failures.
- If plugin connect says `cURL error 7` or `connection refused`, the WordPress server cannot open TCP to the Woosaas API URL you entered.

## Seeding

Seed command:

```bash
./start.sh seed
```

What `seed` does in base mode:

- bootstraps the platform admin account
- logs into the tenant dashboard API
- resolves the target site
- sends synthetic analytics events

Default tenant account used by seed:

```text
Email: admin@woosaas.com
Password: Admin123!
```

Default platform admin account bootstrapped by seed:

```text
Email: admin@woosaas.com
Password: Admin123!
Role: owner
```

Override seed login:

```bash
DASHBOARD_EMAIL=john@woosaas.com DASHBOARD_PASSWORD='Admin123!' ./start.sh seed
```

Bootstrap the platform admin account only:

```bash
./start.sh bootstrap-platform-admin
```

## Production Notes

Production should use [`.env.prod`](/home/accnet/woosaas/.env.prod), not [`.env`](/home/accnet/woosaas/.env).

Before real deployment, update at least:

- `NEXT_PUBLIC_API_URL`
- `APP_BASE_URL`
- `API_BASE_URL`
- `TRACKER_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `JWT_SECRET`
- `INTEGRATION_ENCRYPTION_KEY`
- database and ClickHouse passwords

Recommended production shape:

- reverse proxy with HTTPS in front
- `api` bound to `127.0.0.1:8080`
- `dashboard` bound to `127.0.0.1:3000`
- no public ports for Postgres, Redis, or ClickHouse

## HTTP Test Mode

The base NAT test environment currently allows public `http` URLs:

```text
ALLOW_INSECURE_PUBLIC_URLS=true
```

This is only for test/deploy via NAT.

For production:

```text
ALLOW_INSECURE_PUBLIC_URLS=false
```

and use real `https` public URLs in [`.env.prod`](/home/accnet/woosaas/.env.prod).
