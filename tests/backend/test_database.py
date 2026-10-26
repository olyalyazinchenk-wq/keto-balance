import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
import tempfile
import sqlite3
from pathlib import Path
from unittest.mock import patch

import bot.database as db

class TestDatabase(unittest.TestCase):
    def test_temp_db_created_only_on_explicit_init_db(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_db = Path(tmp_dir) / "test_keto.db"
            self.assertFalse(tmp_db.exists())
            
            with patch.object(db, "DB_PATH", tmp_db):
                db.init_db()
                self.assertTrue(tmp_db.exists())
                
                with db.get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                    tables = {row[0] for row in cursor.fetchall()}
                    self.assertTrue({"users", "calculations", "orders", "water_logs"}.issubset(tables))

    def test_get_db_connection_closed_after_exit(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_db = Path(tmp_dir) / "test_keto.db"
            with patch.object(db, "DB_PATH", tmp_db):
                db.init_db()
                captured_conn = None
                with db.get_db() as conn:
                    captured_conn = conn
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    self.assertEqual(cursor.fetchone()[0], 1)
                
                # After context exit, the connection must be closed
                with self.assertRaises(sqlite3.ProgrammingError):
                    captured_conn.execute("SELECT 1")

    def test_get_db_exception_rolls_back(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_db = Path(tmp_dir) / "test_keto.db"
            with patch.object(db, "DB_PATH", tmp_db):
                db.init_db()
                
                try:
                    with db.get_db() as conn:
                        conn.execute(
                            "INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)",
                            (9999, "rollback_user", "Rollback")
                        )
                        raise RuntimeError("Simulated failure")
                except RuntimeError:
                    pass
                
                # Verify the record was rolled back
                with db.get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM users WHERE user_id = 9999")
                    self.assertIsNone(cursor.fetchone())

    def test_water_tracker_in_isolated_db(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_db = Path(tmp_dir) / "test_keto.db"
            with patch.object(db, "DB_PATH", tmp_db):
                db.init_db()
                
                total = db.log_water(12345, 250)
                self.assertEqual(total, 250)
                total = db.log_water(12345, 500)
                self.assertEqual(total, 750)
                
                current = db.get_today_water(12345)
                self.assertEqual(current, 750)
                
                db.reset_today_water(12345)
                self.assertEqual(db.get_today_water(12345), 0)

if __name__ == '__main__':
    unittest.main()
