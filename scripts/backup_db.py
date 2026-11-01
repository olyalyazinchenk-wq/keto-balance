#!/usr/bin/env python3
"""
scripts/backup_db.py — Утилита онлайн-резервного копирования базы данных SQLite (WAL-режим).
Использует sqlite3 backup API для создания консистентного снапшота без блокировки запросов.
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot.app_db import backup_database, get_settings


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def count_db_stats(db_path: Path) -> dict:
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM sqlite_master WHERE type='table'")
    table_count = cur.fetchone()[0]
    stats = {"tables": table_count}
    for tbl in ["users", "user_profiles", "orders", "subscriptions", "user_consents"]:
        try:
            cur.execute(f"SELECT count(*) FROM {tbl}")
            stats[tbl] = cur.fetchone()[0]
        except Exception:
            stats[tbl] = 0
    conn.close()
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Create consistent SQLite backup")
    parser.add_argument("--source", type=Path, default=None, help="Source database file")
    parser.add_argument("--dest", type=Path, default=None, help="Destination directory or file")
    args = parser.parse_args()

    source_db = args.source if args.source else Path(get_settings().db_path)
    if not source_db.is_file():
        print(f"[ERROR] Source database not found: {source_db}", file=sys.stderr)
        return 1

    dest_dir = args.dest if args.dest else ROOT / "backups"
    if dest_dir.is_dir() or not dest_dir.suffix:
        dest_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
        dest_file = dest_dir / f"keto_balance_{timestamp}.db"
    else:
        dest_file = dest_dir
        dest_file.parent.mkdir(parents=True, exist_ok=True)

    print(f"[BACKUP] Backing up: {source_db} -> {dest_file}")
    backup_database(source_db, dest_file)

    checksum = compute_sha256(dest_file)
    stats = count_db_stats(dest_file)

    meta = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "source_db": str(source_db),
        "backup_file": dest_file.name,
        "sha256": checksum,
        "size_bytes": dest_file.stat().st_size,
        "stats": stats,
    }
    meta_path = dest_file.with_suffix(".json")
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"[SUCCESS] Backup created successfully: {dest_file} (SHA256: {checksum[:12]}...)")
    print(f"[INFO] Stats: {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
