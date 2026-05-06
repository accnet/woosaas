#!/bin/bash
set -e

echo "Starting Woosaas development environment..."

# Create .env from example if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

# Create docker directories
mkdir -p docker/postgres docker/clickhouse docker/redis

# Start services with docker-compose
docker-compose up -d

echo "Waiting for services to be ready..."
sleep 5

# Check PostgreSQL
echo "Checking PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U postgres; do
    sleep 1
done
echo "PostgreSQL is ready"

# Check ClickHouse
echo "Checking ClickHouse..."
until docker-compose exec -T clickhouse clickhouse-client --query "SELECT 1" > /dev/null 2>&1; do
    sleep 1
done
echo "ClickHouse is ready"

# Check Redis
echo "Checking Redis..."
until docker-compose exec -T redis redis-cli ping | grep -q PONG; do
    sleep 1
done
echo "Redis is ready"

# Run ClickHouse migrations
echo "Running ClickHouse migrations..."
docker-compose exec -T clickhouse clickhouse-client --multiquery < api/migrations/clickhouse/001_create_events.sql

echo ""
echo "=========================================="
echo "Woosaas is ready!"
echo ""
echo "Services:"
echo "  - API:      http://localhost:8080"
echo "  - Postgres: localhost:5432"
echo "  - ClickHouse: localhost:8123 (HTTP) / 9000 (Native)"
echo "  - Redis:    localhost:6380"
echo ""
echo "API Endpoints:"
echo "  - POST /api/v1/collect - Send events (X-Api-Key auth)"
echo "  - POST /api/v1/auth/register - Register user"
echo "  - POST /api/v1/auth/login - Login user"
echo "  - GET  /health - Health check"
echo ""
echo "To build and run locally:"
echo "  cd api && go mod tidy && go run ./cmd/server"
echo "  docker compose --profile tools run --rm migrate"
echo ""
echo "To stop:"
echo "  docker-compose down"
echo "==========================================="
