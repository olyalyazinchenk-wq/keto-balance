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
