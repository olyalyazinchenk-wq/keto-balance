#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Keto Balance — Database Restore Script (Linux / Docker)
# Verifies SHA256, restores SQLite database and runs PRAGMA integrity_check
# ==============================================================================

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path_to_backup.db>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[ERROR] Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "[RESTORE] Starting restore from: $BACKUP_FILE"

if command -v docker &>/dev/null && docker compose ps --services 2>/dev/null | grep -q "web"; then
    echo "[RESTORE] Pausing bot poller before database restore..."
    docker compose stop bot || true

    echo "[RESTORE] Restoring database via web container..."
    docker compose exec -T web python scripts/restore_db.py "$BACKUP_FILE" --target /app/data/keto_balance.db

    echo "[RESTORE] Restarting stack..."
    docker compose restart
else
    echo "[RESTORE] Restoring directly via local python runtime..."
    python3 scripts/restore_db.py "$BACKUP_FILE"
fi

echo "[RESTORE] Database restored and integrity verified successfully."
