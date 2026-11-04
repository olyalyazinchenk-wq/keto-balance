#!/usr/bin/env python3
"""
scripts/backup_db.py — Онлайн-резервное копирование базы данных SQLite (WAL-режим)
с опциональным шифрованием AES (Fernet) для защиты персональных данных клиентов (152-ФЗ / GDPR).

Использует sqlite3 backup API для создания консистентного снапшота без блокировки запросов.
"""
import argparse
import base64
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot.app_db import backup_database, get_settings


def derive_key(passphrase_or_key: str) -> bytes:
    """Нормализует ключ или выводит 32-байтный base64-ключ для Fernet через PBKDF2."""
    raw = passphrase_or_key.strip()
    # Если уже 32 url-safe base64 байта
    try:
        decoded = base64.urlsafe_b64decode(raw)
        if len(decoded) == 32:
            return raw.encode("ascii")
    except Exception:
        pass
    # Выводим детерминированный ключ через PBKDF2
    derived = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), b"keto_balance_backup_salt_v1", 100_000)
    return base64.urlsafe_b64encode(derived)


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def count_db_stats(db_path: Path) -> dict:
    conn = sqlite3.connect(str(db_path))
    try:
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
        return stats
    finally:
        conn.close()


class SecurityError(RuntimeError):
    """Исключение при попытке передачи секрета через небезопасный интерфейс в production."""
    pass


def resolve_encryption_key(
    key_arg: str = "",
    key_file: Optional[Path] = None,
    key_stdin: bool = False,
    env_var_name: str = "KETO_BACKUP_ENCRYPTION_KEY",
) -> str:
    """
    Безопасное получение ключа шифрования/дешифрования.
    Приоритет:
    1. --key-stdin (потоковый ввод через stdin)
    2. --key-file (чтение из отдельного файла)
    3. Переменная окружения (по умолчанию KETO_BACKUP_ENCRYPTION_KEY)
    4. --key (CLI аргумент):
       - В production режиме (APP_STAGE=production/prod или get_settings().is_production):
         вызывает SecurityError и блокирует выполнение, т.к. аргументы CLI
         видны всем пользователям в ps aux, Process Explorer и shell history.
       - В непродовом окружении: выводит предупреждение [SECURITY WARNING] в sys.stderr.
    """
    stripped_key_arg = key_arg.strip() if key_arg else ""
    if stripped_key_arg:
        is_prod = False
        app_stage = os.getenv("APP_STAGE", "").strip().lower()
        if app_stage in {"production", "prod"}:
            is_prod = True
        else:
            try:
                from bot.app_settings import get_settings as _get_settings
                is_prod = _get_settings().is_production
            except Exception:
                pass

        if is_prod:
            raise SecurityError(
                "Passing encryption key via CLI argument '--key' is forbidden in production mode "
                "because it exposes secrets to process listing and shell history. "
                f"Use {env_var_name}, --key-file, or --key-stdin instead."
            )

        print(
            "[SECURITY WARNING] Passing encryption key via CLI argument '--key' is insecure "
            "and exposes secrets to process listing and shell history. "
            f"Prefer {env_var_name}, --key-file, or --key-stdin.",
            file=sys.stderr,
        )

    if key_stdin:
        stdin_key = sys.stdin.read().strip()
        if not stdin_key:
            raise ValueError("Encryption key provided via stdin is empty.")
        return stdin_key

    if key_file:
        key_path = Path(key_file)
        if not key_path.is_file():
            raise FileNotFoundError(f"Key file not found: {key_path}")
        try:
            file_key = key_path.read_text(encoding="utf-8").strip()
        except UnicodeDecodeError as err:
            raise ValueError(f"Key file '{key_path}' contains invalid text encoding (must be UTF-8): {err}")
        if not file_key:
            raise ValueError(f"Key file '{key_path}' is empty.")
        return file_key

    env_key = os.getenv(env_var_name, "").strip()
    if env_key:
        return env_key

    if stripped_key_arg:
        return stripped_key_arg

    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Create consistent SQLite backup with optional encryption")
    parser.add_argument("--source", type=Path, default=None, help="Source database file")
    parser.add_argument("--dest", type=Path, default=None, help="Destination directory or file")
    parser.add_argument("--encrypt", action="store_true", help="Encrypt backup using AES-Fernet")
    parser.add_argument("--key", type=str, default="", help="Encryption key or passphrase (insecure; prefer --key-file, --key-stdin or KETO_BACKUP_ENCRYPTION_KEY)")
    parser.add_argument("--key-file", type=Path, default=None, help="Path to file containing encryption key")
    parser.add_argument("--key-stdin", action="store_true", help="Read encryption key from stdin")
    args = parser.parse_args()

    source_db = args.source if args.source else Path(get_settings().db_path)
    if not source_db.is_file():
        print(f"[ERROR] Source database not found: {source_db}", file=sys.stderr)
        return 1

    try:
        encryption_key = resolve_encryption_key(
            key_arg=args.key,
            key_file=args.key_file,
            key_stdin=args.key_stdin,
        )
    except SecurityError as err:
        print(f"[FATAL SECURITY] {err}", file=sys.stderr)
        return 1
    except Exception as err:
        print(f"[ERROR] Failed to resolve encryption key: {err}", file=sys.stderr)
        return 1

    should_encrypt = args.encrypt or bool(encryption_key)

    dest_dir = args.dest if args.dest else ROOT / "backups"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")

    if dest_dir.is_dir() or not dest_dir.suffix:
        dest_dir.mkdir(parents=True, exist_ok=True)
        suffix = ".db.enc" if should_encrypt else ".db"
        dest_file = dest_dir / f"keto_balance_{timestamp}{suffix}"
    else:
        dest_file = dest_dir
        dest_file.parent.mkdir(parents=True, exist_ok=True)

    if should_encrypt:
        if not encryption_key:
            print("[ERROR] Encryption requested, but no key provided. Pass via KETO_BACKUP_ENCRYPTION_KEY, --key-file, or --key-stdin.", file=sys.stderr)
            return 1
        try:
            from cryptography.fernet import Fernet
        except ImportError:
            print("[ERROR] 'cryptography' library is required for encrypted backups. Install via pip install cryptography.", file=sys.stderr)
            return 1

        fernet_key = derive_key(encryption_key)
        fernet = Fernet(fernet_key)

        with tempfile.NamedTemporaryFile(suffix=".tmp.db", delete=False) as tmp:
            tmp_db = Path(tmp.name)

        try:
            print(f"[BACKUP] Step 1: Performing online WAL snapshot -> {tmp_db.name}")
            backup_database(source_db, tmp_db)
            plaintext_sha = compute_sha256(tmp_db)
            stats = count_db_stats(tmp_db)
            plaintext_size = tmp_db.stat().st_size

            print(f"[BACKUP] Step 2: Encrypting backup (AES-Fernet) -> {dest_file}")
            raw_data = tmp_db.read_bytes()
            encrypted_data = fernet.encrypt(raw_data)
            dest_file.write_bytes(encrypted_data)
        finally:
            if tmp_db.is_file():
                tmp_db.unlink(missing_ok=True)

        ciphertext_sha = compute_sha256(dest_file)
        meta = {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "source_db": str(source_db),
            "backup_file": dest_file.name,
            "encrypted": True,
            "cipher": "AES-128-CBC/HMAC-SHA256 (Fernet)",
            "sha256": ciphertext_sha,
            "sha256_ciphertext": ciphertext_sha,
            "sha256_plaintext": plaintext_sha,
            "size_bytes": dest_file.stat().st_size,
            "size_plaintext_bytes": plaintext_size,
            "stats": stats,
        }
        meta_path = dest_file.with_suffix(".json") if not dest_file.name.endswith(".db.enc") else dest_file.parent / f"{dest_file.name[:-7]}.json"
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

        print(f"[SUCCESS] Encrypted backup created: {dest_file} (Ciphertext SHA256: {ciphertext_sha[:12]}...)")
        print(f"[INFO] Plaintext SHA256: {plaintext_sha[:12]}..., Stats: {stats}")
        return 0

    else:
        # Standard unencrypted backup (original behavior)
        print(f"[BACKUP] Backing up: {source_db} -> {dest_file}")
        backup_database(source_db, dest_file)

        checksum = compute_sha256(dest_file)
        stats = count_db_stats(dest_file)

        meta = {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "source_db": str(source_db),
            "backup_file": dest_file.name,
            "encrypted": False,
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
