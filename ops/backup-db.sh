#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Keto Balance — Online Database Backup Script (Linux / Docker)
# Performs online WAL-safe SQLite backup with integrity verification and SHA256
# ==============================================================================

echo "[BACKUP] Initiating database backup..."

if command -v docker &>/dev/null && docker compose ps --services 2>/dev/null | grep -q "web"; then
    echo "[BACKUP] Executing inside running web container..."
    docker compose exec -T web python scripts/backup_db.py --source /app/data/keto_balance.db --dest /app/data/backups "$@"
else
    echo "[BACKUP] Executing directly via local python runtime..."
    python3 scripts/backup_db.py "$@"
fi

echo "[BACKUP] Backup completed successfully."
