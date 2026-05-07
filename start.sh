#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

API_URL="${API_URL:-http://localhost:8080}"
WP_PLUGIN_PATH="${WP_PLUGIN_PATH:-/var/www/site1.local/wp-content/plugins/plugin}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

wait_for_health() {
  echo "Waiting for API health at ${API_URL}..."
  for _ in $(seq 1 60); do
    if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
      echo "API is healthy"
      return
    fi
    sleep 1
  done
  echo "API did not become healthy in time" >&2
  exit 1
}

check_plugin() {
  if [ ! -d "$WP_PLUGIN_PATH" ]; then
    echo "Plugin path does not exist: ${WP_PLUGIN_PATH}" >&2
    exit 1
  fi
  if [ ! -f "$WP_PLUGIN_PATH/woosaas.php" ]; then
    echo "Plugin entry file missing: ${WP_PLUGIN_PATH}/woosaas.php" >&2
    exit 1
  fi
  echo "Using plugin at ${WP_PLUGIN_PATH}"
}

start() {
  need docker
  need curl
  docker compose --env-file .env up -d --build
  docker compose --env-file .env --profile tools run --rm migrate
  check_plugin
  wait_for_health
  echo ""
  echo "Woosaas dev environment is ready"
  echo "API:       ${API_URL}"
  echo "Dashboard: ${DASHBOARD_URL:-http://localhost:3000}"
  echo "Plugin:    ${WP_PLUGIN_PATH}"
}

case "${1:-start}" in
  start)
    start
    ;;
  sync-plugin)
    check_plugin
    ;;
  migrate)
    docker compose --env-file .env --profile tools run --rm migrate
    ;;
  smoke)
    API_URL="$API_URL" ./scripts/smoke.sh
    ;;
  seed)
    API_URL="$API_URL" WP_PATH="${WP_PATH%/wp-content/plugins/plugin}" ./scripts/seed-dev-data.sh
    ;;
  stop)
    docker compose --env-file .env down
    ;;
  logs)
    docker compose --env-file .env logs -f "${@:2}"
    ;;
  ps)
    docker compose --env-file .env ps
    ;;
  *)
    echo "Usage: $0 [start|sync-plugin|migrate|smoke|seed|stop|logs|ps]" >&2
    exit 1
    ;;
esac
