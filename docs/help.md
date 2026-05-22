# Woosaas Help

## Dev Seed Account

`./start.sh seed` uses the tenant dashboard account below by default:

```text
Email: admin@woosaas.com
Password: Admin123!
```

This account is used for the dashboard API at:

```text
http://localhost:3000/login
```

`./start.sh seed` does not create or use the platform admin account in `platform_admin_users`; it only logs in with the tenant/dashboard account to seed site and event data.

Override the seed login account with:

```bash
DASHBOARD_EMAIL=john@woosaas.com DASHBOARD_PASSWORD='Admin123!' ./start.sh seed
```

## Platform Admin Login

The local platform admin account is separate from the tenant dashboard account:

```text
URL: http://localhost:3000/admin/login
Email: admin@woosaas.com
Password: Admin123!
```
