#!/usr/bin/env bash
# ops/agent-ctl.sh — Единая точка запуска Agent-First инфраструктуры в среде Linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

PYTHON_BIN="python3"
if [ -f "$ROOT_DIR/.venv-p0/bin/python" ]; then
    PYTHON_BIN="$ROOT_DIR/.venv-p0/bin/python"
fi

exec "$PYTHON_BIN" "$ROOT_DIR/scripts/agent_ops.py" "$@"
