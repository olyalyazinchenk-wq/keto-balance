import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.cloudru_teardown import (
    verify_backup_readiness,
    execute_teardown_plan,
    TeardownGateError,
    CONFIRMATION_PHRASE,
)
from scripts.backup_db import compute_sha256


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


if __name__ == "__main__":
    unittest.main()
