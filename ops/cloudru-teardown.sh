#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Keto Balance — Cloud.ru Zero-Residual Teardown Runner
# Usage:
#   ./ops/cloudru-teardown.sh --backup-file /path/to/backup.db.enc [options]
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[TEARDOWN] Starting Cloud.ru safe teardown utility..."
python3 "$ROOT_DIR/scripts/cloudru_teardown.py" "$@"
