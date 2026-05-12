#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/smoke-order-sync.sh"
"${SCRIPT_DIR}/smoke-purchase-clickhouse.sh"
