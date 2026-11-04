import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parent.parent.parent

class TestBackupRestoreCLI(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        self.src_db = self.tmp_path / "origin.db"
        self.dest_backup = self.tmp_path / "backups" / "snap.db"
        self.restored_db = self.tmp_path / "restored.db"

        # Populate source DB
        conn = sqlite3.connect(str(self.src_db))
        cur = conn.cursor()
        cur.execute("CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT)")
        cur.execute("CREATE TABLE orders (order_id TEXT PRIMARY KEY, amount REAL)")
        cur.execute("INSERT INTO users VALUES (101, 'tester1')")
        cur.execute("INSERT INTO orders VALUES ('ord_101', 1900.0)")
        conn.commit()
        conn.close()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_backup_and_restore_cli_drill(self):
        # 1. Run backup script
        backup_script = ROOT / "scripts" / "backup_db.py"
        res = subprocess.run(
            [sys.executable, str(backup_script), "--source", str(self.src_db), "--dest", str(self.dest_backup)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Backup failed: {res.stderr}")
        self.assertTrue(self.dest_backup.is_file(), "Backup file not created")
        meta_json = self.dest_backup.with_suffix(".json")
        self.assertTrue(meta_json.is_file(), "Meta JSON not created")

        # 2. Run restore script
        restore_script = ROOT / "scripts" / "restore_db.py"
        res_rest = subprocess.run(
            [sys.executable, str(restore_script), str(self.dest_backup), "--target", str(self.restored_db)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_rest.returncode, 0, f"Restore failed: {res_rest.stderr}")
        self.assertTrue(self.restored_db.is_file(), "Restored DB file not created")

        # 3. Verify restored data
        conn = sqlite3.connect(str(self.restored_db))
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE user_id = 101")
        row = cur.fetchone()
        self.assertEqual(row[0], "tester1")

        cur.execute("SELECT amount FROM orders WHERE order_id = 'ord_101'")
        row_ord = cur.fetchone()
        self.assertEqual(row_ord[0], 1900.0)
        conn.close()

    def test_encrypted_backup_and_restore_cycle(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        restore_script = ROOT / "scripts" / "restore_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_encrypted.db.enc"
        enc_restored = self.tmp_path / "restored_enc.db"
        secret_key = "olga-super-secure-production-passphrase-2026"

        # 1. Run encrypted backup
        res = subprocess.run(
            [
                sys.executable,
                str(backup_script),
                "--source",
                str(self.src_db),
                "--dest",
                str(enc_backup),
                "--encrypt",
                "--key",
                secret_key,
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Encrypted backup failed: {res.stderr}")
        self.assertTrue(enc_backup.is_file(), "Encrypted backup file missing")
        # Verify it is not readable as plain SQLite
        bad_conn = sqlite3.connect(str(enc_backup))
        try:
            with self.assertRaises(sqlite3.DatabaseError):
                bad_conn.execute("SELECT count(*) FROM users")
        finally:
            bad_conn.close()

        # 2. Restore with wrong key must fail safely
        res_bad = subprocess.run(
            [
                sys.executable,
                str(restore_script),
                str(enc_backup),
                "--target",
                str(enc_restored),
                "--key",
                "wrong-key-should-fail",
            ],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(res_bad.returncode, 0, "Restore with wrong key must fail")

        # 3. Restore with correct key must succeed
        res_ok = subprocess.run(
            [
                sys.executable,
                str(restore_script),
                str(enc_backup),
                "--target",
                str(enc_restored),
                "--key",
                secret_key,
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_ok.returncode, 0, f"Encrypted restore failed: {res_ok.stderr}")
        self.assertTrue(enc_restored.is_file(), "Restored DB file missing")

        # 4. Verify contents in restored DB
        conn = sqlite3.connect(str(enc_restored))
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE user_id = 101")
        self.assertEqual(cur.fetchone()[0], "tester1")
        conn.close()

    def test_key_arg_warning_emitted_in_non_prod(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_warn.db.enc"
        res = subprocess.run(
            [
                sys.executable,
                str(backup_script),
                "--source",
                str(self.src_db),
                "--dest",
                str(enc_backup),
                "--encrypt",
                "--key",
                "test-warning-key",
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("[SECURITY WARNING]", res.stderr)
        self.assertIn("Passing encryption key via CLI argument '--key' is insecure", res.stderr)

    def test_key_arg_forbidden_in_production_mode(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        restore_script = ROOT / "scripts" / "restore_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_prod_fail.db.enc"
        prod_env = os.environ.copy()
        prod_env["APP_STAGE"] = "production"

        # 1. Backup with --key in production must be blocked
        res_backup = subprocess.run(
            [
                sys.executable,
                str(backup_script),
                "--source",
                str(self.src_db),
                "--dest",
                str(enc_backup),
                "--encrypt",
                "--key",
                "secret-key",
            ],
            env=prod_env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_backup.returncode, 1)
        self.assertIn("[FATAL SECURITY]", res_backup.stderr)
        self.assertIn("forbidden in production mode", res_backup.stderr)

        # 2. Restore with --key in production must also be blocked
        res_restore = subprocess.run(
            [
                sys.executable,
                str(restore_script),
                str(self.src_db),
                "--key",
                "secret-key",
            ],
            env=prod_env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_restore.returncode, 1)
        self.assertIn("[FATAL SECURITY]", res_restore.stderr)
        self.assertIn("forbidden in production mode", res_restore.stderr)

    def test_encrypted_backup_and_restore_with_env_var(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        restore_script = ROOT / "scripts" / "restore_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_env.db.enc"
        restored_db = self.tmp_path / "restored_env.db"
        secret_key = "secure-env-key-for-test-2026"
        env = os.environ.copy()
        env["KETO_BACKUP_ENCRYPTION_KEY"] = secret_key

        # 1. Backup using env var (no CLI key)
        res_b = subprocess.run(
            [sys.executable, str(backup_script), "--source", str(self.src_db), "--dest", str(enc_backup), "--encrypt"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_b.returncode, 0, f"Env backup failed: {res_b.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_b.stderr)
        self.assertTrue(enc_backup.is_file())

        # 2. Restore using env var (no CLI key)
        res_r = subprocess.run(
            [sys.executable, str(restore_script), str(enc_backup), "--target", str(restored_db)],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_r.returncode, 0, f"Env restore failed: {res_r.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_r.stderr)

        conn = sqlite3.connect(str(restored_db))
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE user_id = 101")
        self.assertEqual(cur.fetchone()[0], "tester1")
        conn.close()

    def test_encrypted_backup_and_restore_with_key_file(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        restore_script = ROOT / "scripts" / "restore_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_file.db.enc"
        restored_db = self.tmp_path / "restored_file.db"
        key_file = self.tmp_path / "secret.key"
        key_file.write_text("secure-file-key-2026\n", encoding="utf-8")

        # 1. Backup using --key-file
        res_b = subprocess.run(
            [
                sys.executable,
                str(backup_script),
                "--source",
                str(self.src_db),
                "--dest",
                str(enc_backup),
                "--encrypt",
                "--key-file",
                str(key_file),
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_b.returncode, 0, f"File backup failed: {res_b.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_b.stderr)
        self.assertTrue(enc_backup.is_file())

        # 2. Restore using --key-file
        res_r = subprocess.run(
            [
                sys.executable,
                str(restore_script),
                str(enc_backup),
                "--target",
                str(restored_db),
                "--key-file",
                str(key_file),
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_r.returncode, 0, f"File restore failed: {res_r.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_r.stderr)

        conn = sqlite3.connect(str(restored_db))
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE user_id = 101")
        self.assertEqual(cur.fetchone()[0], "tester1")
        conn.close()

    def test_encrypted_backup_and_restore_with_key_stdin(self):
        backup_script = ROOT / "scripts" / "backup_db.py"
        restore_script = ROOT / "scripts" / "restore_db.py"
        enc_backup = self.tmp_path / "backups" / "snap_stdin.db.enc"
        restored_db = self.tmp_path / "restored_stdin.db"
        secret_key = "secure-stdin-streamed-passphrase-2026"

        # 1. Backup using --key-stdin
        res_b = subprocess.run(
            [
                sys.executable,
                str(backup_script),
                "--source",
                str(self.src_db),
                "--dest",
                str(enc_backup),
                "--encrypt",
                "--key-stdin",
            ],
            input=secret_key,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_b.returncode, 0, f"Stdin backup failed: {res_b.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_b.stderr)
        self.assertTrue(enc_backup.is_file())

        # 2. Restore using --key-stdin
        res_r = subprocess.run(
            [
                sys.executable,
                str(restore_script),
                str(enc_backup),
                "--target",
                str(restored_db),
                "--key-stdin",
            ],
            input=secret_key,
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_r.returncode, 0, f"Stdin restore failed: {res_r.stderr}")
        self.assertNotIn("[SECURITY WARNING]", res_r.stderr)

        conn = sqlite3.connect(str(restored_db))
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE user_id = 101")
        self.assertEqual(cur.fetchone()[0], "tester1")
        conn.close()
