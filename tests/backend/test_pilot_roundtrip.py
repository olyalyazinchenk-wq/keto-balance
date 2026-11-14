import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.app_db import save_user_subscription
from datetime import datetime,timedelta,timezone
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "333444555:ROUNDTRIP_TEST_BOT_TOKEN"
FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "pilot" / "catalog.json"

class TestPilotRoundtrip(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "roundtrip_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            settings=self.settings,
            catalog_provider=lambda: fixture,
        )
        self.client = TestClient(self.app)

        resp = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 2001, "first_name": "RoundtripUser"}, TEST_TOKEN)}
        )
        save_user_subscription(self.db_path,2001,"premium","active",(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
        self.token = resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_menu_and_state_deep_equal_roundtrip(self):
        menu_payload = {
            "mode": "keto",
            "numDays": 3,
            "meals": 2,
            "portion": 1,
            "saved": True,
            "created": 1730332800,
            "days": [
                {"date": "2026-10-31", "slots": {"m1": "k1", "m2": "k2"}},
                {"date": "2026-11-01", "slots": {"m1": "k3", "m2": "k4"}},
                {"date": "2026-11-02", "slots": {"m1": "k5", "m2": "k1"}},
            ]
        }

        state_payload = {
            "schema_version": 1,
            "menu": menu_payload,
            "selected_date": "2026-11-01", # День 2
            "checked_ingredients": {"k1:0": True, "k1:1": False},
            "checked_steps": {"k1:step:0": True},
            "shopping_batches": 2,
            "shopping_stale": False,
        }

        profile_payload = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": ["exclude_mushrooms"],
                "prepTimeMax": 45,
                "mealsPerDay": 2,
                "preferenceNote": "simple_daily",
            },
            "goal": "maintenance"
        }

        write_body = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": profile_payload,
            "state": state_payload,
        }

        put_res = self.client.put("/api/user", json=write_body, headers=self.headers)
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.json()["revision"], 1)

        get_res = self.client.get("/api/user", headers=self.headers)
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertEqual(data["revision"], 1)

        loaded_state = data["state"]
        self.assertEqual(loaded_state["schema_version"], 1)
        self.assertEqual(loaded_state["selected_date"], "2026-11-01")
        self.assertEqual(loaded_state["shopping_batches"], 2)
        self.assertFalse(loaded_state["shopping_stale"])
        self.assertEqual(loaded_state["checked_ingredients"], {"k1:0": True, "k1:1": False})
        self.assertEqual(loaded_state["checked_steps"], {"k1:step:0": True})

        # Deep equal check of menu days and slots
        loaded_menu = loaded_state["menu"]
        self.assertEqual(loaded_menu["mode"], "keto")
        self.assertEqual(loaded_menu["numDays"], 3)
        self.assertEqual(loaded_menu["days"], menu_payload["days"])

        # dayIndex must NOT be present in persisted menu or state
        for d in loaded_menu["days"]:
            self.assertNotIn("dayIndex", d)
        self.assertNotIn("dayIndex", loaded_state)

        # Update checks with revision 1
        state_payload["checked_ingredients"]["k1:1"] = True
        state_payload["shopping_stale"] = True
        update_body = {
            "schema_version": 1,
            "expected_revision": 1,
            "profile": profile_payload,
            "state": state_payload,
        }
        put_update = self.client.put("/api/user", json=update_body, headers=self.headers)
        self.assertEqual(put_update.status_code, 200)
        self.assertEqual(put_update.json()["revision"], 2)

        # Stale CAS rejects with 409 and leaves data intact
        conflict_res = self.client.put("/api/user", json=update_body, headers=self.headers)
        self.assertEqual(conflict_res.status_code, 409)

        re_read = self.client.get("/api/user", headers=self.headers).json()
        self.assertEqual(re_read["revision"], 2)
        self.assertTrue(re_read["state"]["checked_ingredients"]["k1:1"])

    def test_explicit_null_profile_clears_profile(self):
        # 1. Save initial profile
        initial_body = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {
                "settings": {
                    "confirmed18Plus": True,
                    "approach": "keto",
                    "restrictions": [],
                    "prepTimeMax": 30,
                    "mealsPerDay": 3
                }
            },
            "state": None
        }
        res1 = self.client.put("/api/user", json=initial_body, headers=self.headers)
        self.assertEqual(res1.status_code, 200)

        get1 = self.client.get("/api/user", headers=self.headers).json()
        self.assertIsNotNone(get1["profile"])

        # 2. Explicit null profile in update
        null_body = {
            "schema_version": 1,
            "expected_revision": 1,
            "profile": None,
            "state": None
        }
        res2 = self.client.put("/api/user", json=null_body, headers=self.headers)
        self.assertEqual(res2.status_code, 200)

        get2 = self.client.get("/api/user", headers=self.headers).json()
        self.assertIsNone(get2["profile"], "Explicit null profile must clear profile from DB")

    def test_missing_required_fields_rejected_by_model(self):
        # Missing expected_revision must be rejected with 422
        bad_body = {
            "schema_version": 1,
        }
        res = self.client.put("/api/user", json=bad_body, headers=self.headers)
        self.assertEqual(res.status_code, 422)

    def test_concurrent_cas_prevents_lost_update(self):
        import concurrent.futures
        from bot.app_db import save_pilot_shopping, StaleRevisionError

        user_id = 9999

        def worker(item_name: str):
            payload = {
                "schema_version": 1,
                "expected_revision": 0,
                "items": [
                    {"id": f"item-{item_name}", "name": item_name, "amountLabel": "1 шт.", "department": "other"}
                ]
            }
            try:
                res = save_pilot_shopping(user_id, payload, db_path=self.db_path)
                return ("ok", res)
            except StaleRevisionError:
                return ("conflict", None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(worker, "A")
            f2 = executor.submit(worker, "B")
            results = [f1.result(), f2.result()]

        statuses = [r[0] for r in results]
        self.assertEqual(statuses.count("ok"), 1, f"Exactly one worker must succeed, got {statuses}")
        self.assertEqual(statuses.count("conflict"), 1, f"One worker must get conflict, got {statuses}")

if __name__ == "__main__":
    unittest.main()
