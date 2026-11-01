#!/usr/bin/env python3
"""
scripts/restore_db.py — Утилита верифицированного восстановления базы данных из резервной копии.
Проверяет целостность SHA256 и выполняет PRAGMA integrity_check.
"""
import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot.app_db import restore_database, get_settings


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_integrity(db_path: Path) -> bool:
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        cur.execute("PRAGMA integrity_check")
        rows = cur.fetchall()
        conn.close()
        return len(rows) == 1 and rows[0][0] == "ok"
    except Exception as e:
        print(f"[ERROR] Integrity check failed: {e}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore SQLite database from backup")
    parser.add_argument("backup_file", type=Path, help="Path to .db backup file")
    parser.add_argument("--target", type=Path, default=None, help="Target database path to restore into")
    parser.add_argument("--skip-checksum", action="store_true", help="Skip SHA256 check against meta JSON")
    args = parser.parse_args()

    backup_file = args.backup_file
    if not backup_file.is_file():
        print(f"[ERROR] Backup file not found: {backup_file}", file=sys.stderr)
        return 1

    target_db = args.target if args.target else Path(get_settings().db_path)

    # Validate checksum if meta json exists
    meta_file = backup_file.with_suffix(".json")
    if meta_file.is_file() and not args.skip_checksum:
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            expected_sha = meta.get("sha256")
            actual_sha = compute_sha256(backup_file)
            if expected_sha and actual_sha != expected_sha:
                print(f"[FATAL] SHA256 mismatch! Expected: {expected_sha}, Actual: {actual_sha}", file=sys.stderr)
                return 1
            print(f"[INFO] Backup checksum verified: {actual_sha[:12]}...")
        except Exception as e:
            print(f"[WARNING] Could not parse metadata file: {e}")

    # Restore database
    print(f"[RESTORE] Restoring: {backup_file} -> {target_db}")
    restore_database(backup_file, target_db)

    # Verify integrity
    if not verify_integrity(target_db):
        print(f"[FATAL] Database integrity check failed on {target_db}!", file=sys.stderr)
        return 1

    print(f"[SUCCESS] Database restored and integrity verified on {target_db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
