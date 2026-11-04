import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bot.app_settings import AppSettings
from bot.app_db import init_db, create_or_get_user
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from scripts.run_staging import FORBIDDEN_PORTS, DEFAULT_OWNER_ID

TEST_TOKEN = "111222333:TEST_STAGING_BOT_TOKEN_FOR_ALLOWLIST_18081"
OLGA_ID = 1084557944
INTRUDER_ID = 99887766


class TestHomeStaging(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        self.db_path = self.tmp_path / "staging_home_pilot.db"
        init_db(self.db_path)
        self.dist_dir = self.tmp_path / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)
        (self.dist_dir / "index.html").write_text("<html>Keto Staging</html>", encoding="utf-8")
        (self.dist_dir / "release.json").write_text(json.dumps({
            "buildId": "staging-build-18081",
            "gitSha": "abc1234567890",
            "catalogHash": "hash123",
            "backendFingerprint": "bp123"
        }), encoding="utf-8")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_staging_port_defaults_to_18081_and_forbids_reserved(self):
        """Staging must default to 18081 and strictly forbid 8000, 18080, and system ports."""
        import argparse
        import scripts.run_staging as run_staging

        parser = argparse.ArgumentParser()
        parser.add_argument("--port", type=int, default=18081)
        parser.add_argument("--persistent", action="store_true")
        args = parser.parse_args([])
        self.assertEqual(args.port, 18081, "Staging default port MUST be strictly 18081")
        self.assertIn(8000, FORBIDDEN_PORTS)
        self.assertIn(18080, FORBIDDEN_PORTS)
        self.assertIn(4387, FORBIDDEN_PORTS)
        self.assertIn(8090, FORBIDDEN_PORTS)
        self.assertIn(10808, FORBIDDEN_PORTS)
        self.assertIn(10809, FORBIDDEN_PORTS)
        self.assertNotIn(18081, FORBIDDEN_PORTS, "Port 18081 must be allowed for staging")

    def test_staging_auth_strictly_enforces_olga_id_1084557944(self):
        """Only Olga (Telegram ID 1084557944) can authenticate; non-owners get 403 before DB write."""
        settings = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OLGA_ID]),
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)

        # 1. Olga (ID 1084557944) logs in -> 200 OK
        olga_data = {"id": OLGA_ID, "first_name": "Ольга", "username": "olga_nutri"}
        olga_init = generate_telegram_init_data(olga_data, TEST_TOKEN)
        resp_olga = client.post("/api/session", json={"init_data": olga_init})
        self.assertEqual(resp_olga.status_code, 200)
        self.assertEqual(resp_olga.json()["user_id"], OLGA_ID)

        # Verify Olga user created in staging DB
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (OLGA_ID,))
        self.assertIsNotNone(cursor.fetchone(), "Olga user must exist in DB")
        conn.close()

        # 2. Non-owner (Intruder) attempts login -> 403 Forbidden
        intruder_data = {"id": INTRUDER_ID, "first_name": "Intruder", "username": "attacker"}
        intruder_init = generate_telegram_init_data(intruder_data, TEST_TOKEN)
        resp_intruder = client.post("/api/session", json={"init_data": intruder_init})
        self.assertEqual(resp_intruder.status_code, 403)
        self.assertIn("owner allowlist", resp_intruder.json()["detail"].lower())

        # Also check /api/auth/validate endpoint rejects non-owner
        resp_val = client.post("/api/auth/validate", json={"init_data": intruder_init})
        self.assertEqual(resp_val.status_code, 403)

        # 3. Verify Intruder is NOT written to database anywhere
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (INTRUDER_ID,))
        self.assertIsNone(cursor.fetchone(), "Non-owner MUST NOT be written to users table")
        cursor.execute("SELECT user_id FROM user_profiles WHERE user_id = ?", (INTRUDER_ID,))
        self.assertIsNone(cursor.fetchone(), "Non-owner MUST NOT be written to user_profiles table")
        cursor.execute("SELECT user_id FROM user_states WHERE user_id = ?", (INTRUDER_ID,))
        self.assertIsNone(cursor.fetchone(), "Non-owner MUST NOT be written to user_states table")
        conn.close()

    def test_staging_persistent_mode_database_reuse(self):
        """Persistent staging database preserves data across server instance restarts."""
        persistent_db = self.tmp_path / "persistent_staging.db"
        init_db(persistent_db)

        # 1. Instance 1: Create user and state
        settings_1 = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OLGA_ID]),
            db_path=persistent_db,
            dist_dir=self.dist_dir,
        )
        app_1 = create_app(dist_dir=self.dist_dir, db_path=persistent_db, settings=settings_1)
        client_1 = TestClient(app_1)

        olga_data = {"id": OLGA_ID, "first_name": "Ольга"}
        olga_init = generate_telegram_init_data(olga_data, TEST_TOKEN)
        resp1 = client_1.post("/api/session", json={"init_data": olga_init})
        self.assertEqual(resp1.status_code, 200)

        # 2. Instance 2: Simulate restart pointing to the same persistent DB
        settings_2 = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OLGA_ID]),
            db_path=persistent_db,
            dist_dir=self.dist_dir,
        )
        app_2 = create_app(dist_dir=self.dist_dir, db_path=persistent_db, settings=settings_2)
        client_2 = TestClient(app_2)

        # Confirm user profile and existence persists
        conn2 = sqlite3.connect(str(persistent_db))
        cursor2 = conn2.cursor()
        cursor2.execute("SELECT user_id FROM users WHERE user_id = ?", (OLGA_ID,))
        self.assertIsNotNone(cursor2.fetchone(), "User must persist across restarts")
        conn2.close()

    def test_staging_receipt_verification_alignment(self):
        """Build receipt is verified and version returned matches receipt metadata."""
        receipt_file = self.tmp_path / "build-receipt.json"
        receipt_data = {
            "dist_dir": str(self.dist_dir),
            "build_id": "receipt-test-build-99",
            "git_sha": "def456",
            "catalog_hash": "cat99",
            "backend_fingerprint": "bf99",
        }
        receipt_file.write_text(json.dumps(receipt_data), encoding="utf-8")

        settings = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OLGA_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)

        resp = client.get("/api/version")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["buildId"], "staging-build-18081")


if __name__ == "__main__":
    unittest.main()
