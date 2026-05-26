#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${WOOSAAS_MODE:-base}"
COMMAND="${1:-start}"

BASE_COMPOSE_FILE="docker-compose.yml"
PROD_COMPOSE_FILE="docker-compose.prod.yml"
BASE_ENV_FILE=".env"
PROD_ENV_FILE=".env.prod"

COMPOSE_FILE="$BASE_COMPOSE_FILE"
ENV_FILE="$BASE_ENV_FILE"

if [[ "$MODE" == "prod" ]]; then
  COMPOSE_FILE="$PROD_COMPOSE_FILE"
  ENV_FILE="$PROD_ENV_FILE"
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

API_URL="${API_URL:-${API_BASE_URL:-http://localhost:8080}}"
DASHBOARD_URL="${DASHBOARD_URL:-${APP_BASE_URL:-http://localhost:3000}}"
WP_PLUGIN_PATH="${WP_PLUGIN_PATH:-/var/www/site1.local/wp-content/plugins/plugin}"
DASHBOARD_DEV_PORT="${DASHBOARD_DEV_PORT:-${DASHBOARD_PORT:-3001}}"
DASHBOARD_DEV_PUBLIC_URL="${DASHBOARD_DEV_PUBLIC_URL:-http://localhost:${DASHBOARD_DEV_PORT}}"
PLATFORM_ADMIN_EMAIL="${PLATFORM_ADMIN_EMAIL:-admin@woosaas.com}"
PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-Admin123!}"
PLATFORM_ADMIN_NAME="${PLATFORM_ADMIN_NAME:-Platform Admin}"
PLATFORM_ADMIN_ROLE="${PLATFORM_ADMIN_ROLE:-owner}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
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

show_runtime() {
  echo "Mode:      ${MODE}"
  echo "Compose:   ${COMPOSE_FILE}"
  echo "Env file:  ${ENV_FILE}"
  echo "API:       ${API_URL}"
  echo "Dashboard: ${DASHBOARD_URL}"
}

start_base() {
  need docker
  need curl
  compose up -d --build
  compose --profile tools run --rm migrate
  check_plugin
  wait_for_health
  echo ""
  echo "Woosaas environment is ready"
  show_runtime
  echo "Plugin:    ${WP_PLUGIN_PATH}"
}

start_prod() {
  need docker
  need curl
  compose up -d --build
  compose --profile tools run --rm migrate
  wait_for_health
  echo ""
  echo "Woosaas production environment is ready"
  show_runtime
}

start_stack() {
  if [[ "$MODE" == "prod" ]]; then
    start_prod
  else
    start_base
  fi
}

start_dashboard_dev() {
  if [[ "$MODE" == "prod" ]]; then
    echo "Dashboard dev server is only available in base mode" >&2
    exit 1
  fi

  need npm
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-$API_URL}"
  echo "Starting dashboard dev server..."
  echo "Mode:      ${MODE}"
  echo "Dashboard: ${DASHBOARD_DEV_PUBLIC_URL}"
  echo "API:       ${NEXT_PUBLIC_API_URL}"
  cd "$ROOT_DIR/dashboard"
  npm run dev -- -p "$DASHBOARD_DEV_PORT"
}

run_migrate() {
  need docker
  compose --profile tools run --rm migrate
}

bootstrap_platform_admin() {
  need docker

  if [[ "$MODE" == "prod" ]]; then
    echo "Platform admin bootstrap is disabled in prod mode via start.sh" >&2
    exit 1
  fi

  compose run --rm api ./platform-admin-bootstrap \
    -email "$PLATFORM_ADMIN_EMAIL" \
    -password "$PLATFORM_ADMIN_PASSWORD" \
    -name "$PLATFORM_ADMIN_NAME" \
    -role "$PLATFORM_ADMIN_ROLE"
}

run_smoke() {
  API_URL="$API_URL" ./scripts/smoke.sh
}

run_seed() {
  bootstrap_platform_admin
  API_URL="$API_URL" WP_PATH="${WP_PATH%/wp-content/plugins/plugin}" ./scripts/seed-dev-data.sh
}

stop_stack() {
  need docker
  compose down
}

logs_stack() {
  need docker
  compose logs -f "${@:2}"
}

ps_stack() {
  need docker
  compose ps
}

usage() {
  cat <<EOF
Usage: $0 [start|dev|sync-plugin|bootstrap-platform-admin|migrate|smoke|seed|stop|logs|ps]

Environment selection:
  WOOSAAS_MODE=base  Uses ${BASE_COMPOSE_FILE} + ${BASE_ENV_FILE} (default)
  WOOSAAS_MODE=prod  Uses ${PROD_COMPOSE_FILE} + ${PROD_ENV_FILE}

Examples:
  ./start.sh start
  ./start.sh dev
  ./start.sh bootstrap-platform-admin
  WOOSAAS_MODE=prod ./start.sh start
  WOOSAAS_MODE=prod ./start.sh logs api
EOF
}

case "$COMMAND" in
  start)
    start_stack
    ;;
  dev)
    start_dashboard_dev
    ;;
  sync-plugin)
    check_plugin
    ;;
  bootstrap-platform-admin)
    bootstrap_platform_admin
    ;;
  migrate)
    run_migrate
    ;;
  smoke)
    run_smoke
    ;;
  seed)
    run_seed
    ;;
  stop)
    stop_stack
    ;;
  logs)
    logs_stack "$@"
    ;;
  ps)
    ps_stack
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
