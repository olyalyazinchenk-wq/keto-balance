import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.cloudru_teardown import (
    verify_backup_readiness,
    execute_teardown_plan,
    TeardownGateError,
    CONFIRMATION_PHRASE,
)
from scripts.backup_db import compute_sha256, derive_key


class TestCloudRuTeardown(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        self.backup_db = self.tmp_path / "valid_backup.db"
        self.meta_json = self.tmp_path / "valid_backup.json"

        # Create valid SQLite database
        conn = sqlite3.connect(str(self.backup_db))
        cur = conn.cursor()
        cur.execute("CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT)")
        cur.execute("INSERT INTO users VALUES (10, 'olga_user')")
        conn.commit()
        conn.close()

        sha = compute_sha256(self.backup_db)
        meta = {
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256": sha,
            "encrypted": False,
        }
        self.meta_json.write_text(json.dumps(meta), encoding="utf-8")

        # Create encrypted backup fixture
        from cryptography.fernet import Fernet
        self.enc_key = "secure-teardown-key-2026"
        fernet = Fernet(derive_key(self.enc_key))
        self.enc_backup_db = self.tmp_path / "encrypted_backup.db.enc"
        self.enc_meta_json = self.tmp_path / "encrypted_backup.json"
        enc_bytes = fernet.encrypt(self.backup_db.read_bytes())
        self.enc_backup_db.write_bytes(enc_bytes)
        enc_sha = compute_sha256(self.enc_backup_db)
        self.enc_meta_json.write_text(json.dumps({
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256_ciphertext": enc_sha,
            "sha256_plaintext": sha,
            "encrypted": True,
        }), encoding="utf-8")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_gate_blocks_when_backup_missing(self):
        missing = self.tmp_path / "does_not_exist.db"
        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(missing)
        self.assertIn("не найдена", str(ctx.exception))

    def test_gate_blocks_when_meta_missing(self):
        no_meta = self.tmp_path / "orphan.db"
        no_meta.write_bytes(b"some content")
        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(no_meta)
        self.assertIn("Отсутствуют метаданные", str(ctx.exception))

    def test_gate_blocks_when_sha256_mismatch(self):
        meta = json.loads(self.meta_json.read_text(encoding="utf-8"))
        meta["sha256"] = "badhash1234567890"
        self.meta_json.write_text(json.dumps(meta), encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.backup_db)
        self.assertIn("не совпадает", str(ctx.exception))

    def test_gate_succeeds_when_backup_and_integrity_valid(self):
        res = verify_backup_readiness(self.backup_db)
        self.assertTrue(res["verified"])
        self.assertEqual(res["user_count"], 1)

    def test_dry_run_by_default_deletes_nothing(self):
        inv = {
            "instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}],
            "volumes": [{"id": "vol-1", "name": "root-disk", "size_gb": 30, "cost_rub_month": 360}],
            "floating_ips": [{"id": "fip-1", "ip": "1.2.3.4", "cost_rub_month": 200}],
            "snapshots": [{"id": "snap-1", "name": "s1", "cost_rub_month": 100}],
        }
        actions_performed = []

        def mock_executor(kind, res_id):
            actions_performed.append((kind, res_id))

        result = execute_teardown_plan(inv, dry_run=True, executor=mock_executor)
        self.assertEqual(result["mode"], "DRY_RUN")
        self.assertFalse(result["executed"])
        self.assertEqual(actions_performed, [], "Dry run must never execute deletions")
        self.assertEqual(result["total_monthly_rub_prevented"], 2260)

    def test_live_destroy_executes_complete_zero_residual_sequence(self):
        inv = {
            "instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}],
            "volumes": [{"id": "vol-1", "name": "root-disk", "size_gb": 30, "cost_rub_month": 360}],
            "floating_ips": [{"id": "fip-1", "ip": "1.2.3.4", "cost_rub_month": 200}],
            "snapshots": [{"id": "snap-1", "name": "s1", "cost_rub_month": 100}],
        }
        actions_performed = []

        def mock_executor(kind, res_id):
            actions_performed.append((kind, res_id))

        result = execute_teardown_plan(inv, dry_run=False, executor=mock_executor)
        self.assertEqual(result["mode"], "LIVE_DESTROY")
        self.assertTrue(result["executed"])
        self.assertTrue(result["zero_residual_confirmed"])
        self.assertEqual(len(actions_performed), 4)
        self.assertEqual(actions_performed[0], ("instance", "inst-1"))
        self.assertEqual(actions_performed[1], ("volume", "vol-1"))
        self.assertEqual(actions_performed[2], ("floating_ip", "fip-1"))
        self.assertEqual(actions_performed[3], ("snapshot", "snap-1"))

    def test_gate_encrypted_backup_with_env_var(self):
        old_val = os.environ.get("KETO_BACKUP_ENCRYPTION_KEY")
        try:
            os.environ["KETO_BACKUP_ENCRYPTION_KEY"] = self.enc_key
            res = verify_backup_readiness(self.enc_backup_db)
            self.assertTrue(res["verified"])
            self.assertTrue(res["is_encrypted"])
            self.assertEqual(res["user_count"], 1)
        finally:
            if old_val is None:
                os.environ.pop("KETO_BACKUP_ENCRYPTION_KEY", None)
            else:
                os.environ["KETO_BACKUP_ENCRYPTION_KEY"] = old_val

    def test_gate_encrypted_backup_with_key_file(self):
        key_file = self.tmp_path / "teardown.key"
        key_file.write_text(self.enc_key, encoding="utf-8")
        res = verify_backup_readiness(self.enc_backup_db, key_file=key_file)
        self.assertTrue(res["verified"])
        self.assertEqual(res["user_count"], 1)

    def test_gate_encrypted_backup_with_key_stdin(self):
        import io
        old_stdin = sys.stdin
        try:
            sys.stdin = io.StringIO(self.enc_key)
            res = verify_backup_readiness(self.enc_backup_db, key_stdin=True)
            self.assertTrue(res["verified"])
            self.assertEqual(res["user_count"], 1)
        finally:
            sys.stdin = old_stdin

    def test_gate_rejects_key_cli_arg_in_production(self):
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "cloudru_teardown.py"
        prod_env = os.environ.copy()
        prod_env["APP_STAGE"] = "production"
        res = subprocess.run(
            [
                sys.executable,
                str(script),
                "--backup-file",
                str(self.enc_backup_db),
                "--key",
                self.enc_key,
            ],
            env=prod_env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 2)
        self.assertIn("Безопасность нарушена", res.stderr)
        self.assertIn("forbidden in production mode", res.stderr)

    def test_teardown_cli_dry_run_with_key_file_deletes_zero_resources(self):
        key_file = self.tmp_path / "teardown.key"
        key_file.write_text(self.enc_key, encoding="utf-8")
        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "cloudru_teardown.py"

        # Safe dry-run via CLI
        res = subprocess.run(
            [
                sys.executable,
                str(script),
                "--backup-file",
                str(self.enc_backup_db),
                "--key-file",
                str(key_file),
                "--json",
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Teardown failed: {res.stderr}")
        out = json.loads(res.stdout)
        self.assertEqual(out["mode"], "DRY_RUN")
        self.assertFalse(out["executed"], "Dry run must NOT execute deletion")
        self.assertIn("actions_planned", out)
        self.assertTrue(out["backup_verification"]["verified"])
        self.assertEqual(out["backup_verification"]["user_count"], 1)

    def test_gate_blocks_corrupted_encrypted_backup_with_teardown_gate_error(self):
        corrupt_backup = self.tmp_path / "corrupt.db.enc"
        corrupt_backup.write_bytes(b"corrupted-ciphertext-content")
        corrupt_meta = self.tmp_path / "corrupt.json"
        corrupt_meta.write_text(json.dumps({
            "encrypted": True,
            "sha256_ciphertext": compute_sha256(corrupt_backup),
        }), encoding="utf-8")

        key_file = self.tmp_path / "teardown.key"
        key_file.write_text(self.enc_key, encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(corrupt_backup, key_file=key_file)
        self.assertIn("Ошибка расшифровки бэкапа", str(ctx.exception))

    def test_gate_blocks_wrong_decryption_key_with_teardown_gate_error(self):
        key_file = self.tmp_path / "wrong.key"
        key_file.write_text("completely-wrong-key-value", encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.enc_backup_db, key_file=key_file)
        self.assertIn("Ошибка расшифровки бэкапа", str(ctx.exception))

    def test_gate_blocks_empty_key_file_with_teardown_gate_error(self):
        empty_key = self.tmp_path / "empty.key"
        empty_key.write_text("   \n", encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.enc_backup_db, key_file=empty_key)
        self.assertIn("is empty", str(ctx.exception))

    def test_gate_blocks_corrupted_sqlite_header_without_permission_error(self):
        # Fernet encrypted data that is not a valid sqlite database
        from cryptography.fernet import Fernet
        fernet = Fernet(derive_key(self.enc_key))
        bad_sqlite_backup = self.tmp_path / "bad_sqlite.db.enc"
        bad_sqlite_backup.write_bytes(fernet.encrypt(b"This is definitely not a sqlite database header!"))
        bad_sqlite_meta = self.tmp_path / "bad_sqlite.json"
        bad_sqlite_meta.write_text(json.dumps({
            "encrypted": True,
            "sha256_ciphertext": compute_sha256(bad_sqlite_backup),
        }), encoding="utf-8")

        key_file = self.tmp_path / "teardown.key"
        key_file.write_text(self.enc_key, encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(bad_sqlite_backup, key_file=key_file)
        # Must fail gate without unhandled PermissionError [WinError 32]
        self.assertTrue("PRAGMA integrity_check" in str(ctx.exception) or "не содержит пользователей" in str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


