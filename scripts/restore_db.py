#!/usr/bin/env python3
"""
scripts/restore_db.py — Утилита верифицированного восстановления базы данных из резервной копии.
Поддерживает стандартные .db и зашифрованные .enc резервные копии.
Проверяет целостность SHA256 и выполняет PRAGMA integrity_check.
"""
import argparse
import base64
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from typing import Optional

from bot.app_db import restore_database, get_settings
from scripts.backup_db import resolve_encryption_key, SecurityError, LEGACY_BACKUP_SALT


def derive_key(passphrase_or_key: str, salt: Optional[bytes] = None) -> bytes:
    """Нормализует ключ или выводит 32-байтный base64-ключ для Fernet через PBKDF2."""
    raw = passphrase_or_key.strip()
    try:
        decoded = base64.urlsafe_b64decode(raw)
        if len(decoded) == 32:
            return raw.encode("ascii")
    except Exception:
        pass
    effective_salt = salt if salt is not None else LEGACY_BACKUP_SALT
    derived = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), effective_salt, 100_000)
    return base64.urlsafe_b64encode(derived)


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_integrity(db_path: Path) -> bool:
    conn = None
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        cur.execute("PRAGMA integrity_check")
        rows = cur.fetchall()
        return len(rows) == 1 and rows[0][0] == "ok"
    except Exception as e:
        print(f"[ERROR] Integrity check failed: {e}", file=sys.stderr)
        return False
    finally:
        if conn is not None:
            conn.close()


def find_meta_file(backup_file: Path) -> Path:
    if backup_file.name.endswith(".db.enc"):
        candidate = backup_file.parent / f"{backup_file.name[:-7]}.json"
        if candidate.is_file():
            return candidate
    return backup_file.with_suffix(".json")


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore SQLite database from backup (supports encrypted backups)")
    parser.add_argument("backup_file", type=Path, help="Path to .db or .enc backup file")
    parser.add_argument("--target", type=Path, default=None, help="Target database path to restore into")
    parser.add_argument("--key", type=str, default="", help="Decryption key or passphrase if backup is encrypted (insecure; prefer --key-file, --key-stdin or KETO_BACKUP_ENCRYPTION_KEY)")
    parser.add_argument("--key-file", type=Path, default=None, help="Path to file containing decryption key")
    parser.add_argument("--key-stdin", action="store_true", help="Read decryption key from stdin")
    parser.add_argument("--skip-checksum", action="store_true", help="Skip SHA256 check against meta JSON")
    args = parser.parse_args()

    backup_file = args.backup_file
    if not backup_file.is_file():
        print(f"[ERROR] Backup file not found: {backup_file}", file=sys.stderr)
        return 1

    target_db = args.target if args.target else Path(get_settings().db_path)
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
        print(f"[ERROR] Failed to resolve decryption key: {err}", file=sys.stderr)
        return 1

    meta_file = find_meta_file(backup_file)
    meta = {}
    if meta_file.is_file():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[WARNING] Could not parse metadata file: {e}")

    is_encrypted = meta.get("encrypted") or backup_file.name.endswith(".enc")

    # Validate ciphertext checksum
    if not args.skip_checksum and meta:
        expected_sha = meta.get("sha256_ciphertext") or meta.get("sha256")
        actual_sha = compute_sha256(backup_file)
        if expected_sha and actual_sha != expected_sha:
            print(f"[FATAL] Checksum mismatch! Expected: {expected_sha}, Actual: {actual_sha}", file=sys.stderr)
            return 1
        print(f"[INFO] Backup file checksum verified: {actual_sha[:12]}...")

    if is_encrypted:
        if not encryption_key:
            print("[FATAL] Backup is encrypted, but no decryption key was supplied. Pass KETO_BACKUP_ENCRYPTION_KEY, --key-file, or --key-stdin.", file=sys.stderr)
            return 1

        try:
            from cryptography.fernet import Fernet
        except ImportError:
            print("[FATAL] 'cryptography' library is required to decrypt backup. Install via pip install cryptography.", file=sys.stderr)
            return 1

        salt_hex = meta.get("kdf_salt_hex") or meta.get("salt_hex") or (meta.get("kdf", {}).get("salt_hex") if isinstance(meta.get("kdf"), dict) else None)
        salt = bytes.fromhex(salt_hex) if salt_hex else None
        fernet_key = derive_key(encryption_key, salt=salt)
        fernet = Fernet(fernet_key)

        with tempfile.NamedTemporaryFile(suffix=".decrypted.tmp.db", delete=False) as tmp:
            tmp_db = Path(tmp.name)

        try:
            print(f"[RESTORE] Step 1: Decrypting backup...")
            encrypted_bytes = backup_file.read_bytes()
            try:
                decrypted_bytes = fernet.decrypt(encrypted_bytes)
            except Exception as e:
                print(f"[FATAL] Decryption failed! Invalid key or corrupted file: {e}", file=sys.stderr)
                return 1

            tmp_db.write_bytes(decrypted_bytes)

            # Check plaintext sha256 against metadata
            expected_plain_sha = meta.get("sha256_plaintext")
            if expected_plain_sha and not args.skip_checksum:
                actual_plain_sha = compute_sha256(tmp_db)
                if actual_plain_sha != expected_plain_sha:
                    print(f"[FATAL] Plaintext checksum mismatch! Expected: {expected_plain_sha}, Got: {actual_plain_sha}", file=sys.stderr)
                    return 1
                print(f"[INFO] Plaintext SHA256 verified: {actual_plain_sha[:12]}...")

            print(f"[RESTORE] Step 2: Restoring database to {target_db}...")
            restore_database(tmp_db, target_db)
        finally:
            if tmp_db.is_file():
                tmp_db.unlink(missing_ok=True)

    else:
        # Standard unencrypted restore
        print(f"[RESTORE] Restoring: {backup_file} -> {target_db}")
        restore_database(backup_file, target_db)

    # Step 3: Verify integrity on restored database
    if not verify_integrity(target_db):
        print(f"[FATAL] Database integrity check failed on {target_db}!", file=sys.stderr)
        return 1

    print(f"[SUCCESS] Database restored and integrity verified on {target_db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
