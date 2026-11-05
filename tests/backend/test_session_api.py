import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "111222333:TEST_BOT_TOKEN_FOR_SESSION_API"

class TestSessionApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "session_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        fixture_path = Path(__file__).resolve().parents[1] / "fixtures" / "pilot" / "catalog.json"
        self.fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            settings=self.settings,
            catalog_provider=lambda: self.fixture,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_create_session_with_valid_init_data(self):
        user = {"id": 12345, "first_name": "Anna", "username": "anna_keto"}
        init_data = generate_telegram_init_data(user, TEST_TOKEN)

        resp = self.client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("session_token", data)
        self.assertEqual(data["user_id"], 12345)
        self.assertEqual(data["username"], "anna_keto")

        # Проверка GET /api/session с Bearer токеном
        token = data["session_token"]
        get_resp = self.client.get("/api/session", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(get_resp.status_code, 200)
        session_info = get_resp.json()
        self.assertEqual(session_info["user_id"], 12345)

    def test_create_session_with_invalid_init_data_fails(self):
        resp = self.client.post("/api/session", json={"init_data": "auth_date=1&hash=fake"})
        self.assertEqual(resp.status_code, 401)

    def test_get_session_missing_or_invalid_bearer_token(self):
        resp_no_auth = self.client.get("/api/session")
        self.assertEqual(resp_no_auth.status_code, 401)

        resp_bad_auth = self.client.get("/api/session", headers={"Authorization": "Bearer deadbeef12345678"})
        self.assertEqual(resp_bad_auth.status_code, 401)

    def test_webapp_button_generation_and_local_fallback(self):
        from bot.bot import webapp_button
        # 1. HTTPS URL creates valid WebAppInfo button
        btn_https = webapp_button("📱 Открыть", url="https://tma.ketobalance.ru")
        self.assertIsNotNone(btn_https.web_app)
        self.assertEqual(btn_https.web_app.url, "https://tma.ketobalance.ru")
        self.assertIsNone(btn_https.callback_data)

        # 2. Local/HTTP URL creates callback_data fallback without WebAppInfo (Telegram API restriction)
        btn_http = webapp_button("📱 Открыть", url="http://localhost:5173")
        self.assertIsNone(btn_http.web_app)
        self.assertEqual(btn_http.callback_data, "open_app_local")

    def test_create_session_with_missing_or_empty_init_data(self):
        # Empty string
        resp_empty = self.client.post("/api/session", json={"init_data": ""})
        self.assertEqual(resp_empty.status_code, 401)

        # Whitespace-only string
        resp_ws = self.client.post("/api/session", json={"init_data": "   "})
        self.assertEqual(resp_ws.status_code, 401)

        # Missing hash parameter
        resp_no_hash = self.client.post("/api/session", json={"init_data": "auth_date=1700000000&query_id=123"})
        self.assertEqual(resp_no_hash.status_code, 401)

    def test_create_session_with_tampered_payload_fails(self):
        user = {"id": 1001, "first_name": "AuthenticUser"}
        valid_init = generate_telegram_init_data(user, TEST_TOKEN)
        # Attacker tampers user ID to 1084557944 without updating hash signature
        tampered_init = valid_init.replace("1001", "1084557944")
        resp = self.client.post("/api/session", json={"init_data": tampered_init})
        self.assertEqual(resp.status_code, 401)

    def test_create_session_with_expired_auth_date_fails(self):
        import time
        user = {"id": 2002, "first_name": "ExpiredUser"}
        old_time = int(time.time()) - 90000  # older than 86400s
        expired_init = generate_telegram_init_data(user, TEST_TOKEN, auth_date=old_time)
        resp = self.client.post("/api/session", json={"init_data": expired_init})
        self.assertEqual(resp.status_code, 401)

    def test_create_session_with_owner_allowlist_enforcement(self):
        staging_settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            owner_allowlist=[1084557944],
        )
        staging_app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=staging_settings)
        staging_client = TestClient(staging_app)

        # Non-owner with valid signature is rejected (403 Forbidden)
        intruder_init = generate_telegram_init_data({"id": 9999999, "first_name": "Intruder"}, TEST_TOKEN)
        resp_intruder = staging_client.post("/api/session", json={"init_data": intruder_init})
        self.assertEqual(resp_intruder.status_code, 403)

        # Owner with valid signature is accepted (200 OK)
        owner_init = generate_telegram_init_data({"id": 1084557944, "first_name": "Olga"}, TEST_TOKEN)
        resp_owner = staging_client.post("/api/session", json={"init_data": owner_init})
        self.assertEqual(resp_owner.status_code, 200)

    def test_full_sequential_tma_flow_and_repeat_login(self):
        user = {"id": 1084557944, "first_name": "Olga", "username": "olga_wellness"}
        init_data_first = generate_telegram_init_data(user, TEST_TOKEN)

        # Step 1: Client opens via button and creates session
        resp_session = self.client.post("/api/session", json={"init_data": init_data_first})
        self.assertEqual(resp_session.status_code, 200)
        session_token = resp_session.json()["session_token"]
        headers = {"Authorization": f"Bearer {session_token}"}

        # Step 2: Fetch initial user data (empty profile before onboarding)
        resp_user_init = self.client.get("/api/user", headers=headers)
        self.assertEqual(resp_user_init.status_code, 200)
        init_data = resp_user_init.json()
        self.assertEqual(init_data["revision"], 0)
        self.assertIsNone(init_data["profile"])

        # Step 3: Complete onboarding & pass Start Gate
        profile_to_save = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": ["exclude_dairy", "exclude_eggs"],
                "prepTimeMax": 20,
                "mealsPerDay": 3,
                "planDays": 3,
                "preferenceNote": "",
            },
            "goal": "maintenance",
        }
        state_to_save = {
            "schema_version": 1,
            "menu": {
                "mode": "keto",
                "numDays": 3,
                "meals": 3,
                "portion": 1,
                "saved": True,
                "created": 1730764800,
                "days": [{"date": "2026-11-05", "slots": {"breakfast": "k1", "lunch": "k2", "dinner": "k3"}}],
            },
            "selected_date": "2026-11-05",
            "checked_steps": {"k1:0": True},
            "shopping_stale": False,
        }
        put_resp = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 0, "profile": profile_to_save, "state": state_to_save},
            headers=headers,
        )
        self.assertEqual(put_resp.status_code, 200)
        self.assertEqual(put_resp.json()["revision"], 1)

        # Step 4: Save shopping list items
        shopping_items = [
            {
                "id": "item-1",
                "name": "Авокадо",
                "amountLabel": "2 шт",
                "department": "Овощи и зелень",
                "linkedRecipeTitles": [],
                "alreadyHave": False,
                "checkedInStore": False,
            }
        ]
        shop_resp = self.client.put(
            "/api/shopping",
            json={"schema_version": 1, "expected_revision": 0, "items": shopping_items},
            headers=headers,
        )
        self.assertEqual(shop_resp.status_code, 200)

        # Step 5: User closes MiniApp and returns later (Repeat Login)
        init_data_second = generate_telegram_init_data(user, TEST_TOKEN)
        resp_second_session = self.client.post("/api/session", json={"init_data": init_data_second})
        self.assertEqual(resp_second_session.status_code, 200)
        second_token = resp_second_session.json()["session_token"]
        second_headers = {"Authorization": f"Bearer {second_token}"}

        # Step 6: Verify all data persisted and Start Gate is bypassed (confirmed18Plus is True)
        resp_reentrant = self.client.get("/api/user", headers=second_headers)
        self.assertEqual(resp_reentrant.status_code, 200)
        reentrant_data = resp_reentrant.json()
        self.assertEqual(reentrant_data["revision"], 1)
        self.assertTrue(reentrant_data["profile"]["settings"]["confirmed18Plus"])
        self.assertEqual(reentrant_data["profile"]["settings"]["approach"], "keto")
        self.assertEqual(reentrant_data["state"]["selected_date"], "2026-11-05")
        self.assertEqual(reentrant_data["state"]["menu"]["days"][0]["slots"]["breakfast"], "k1")

        # Step 7: Verify shopping items persisted across repeat login
        shop_reentrant = self.client.get("/api/shopping", headers=second_headers)
        self.assertEqual(shop_reentrant.status_code, 200)
        self.assertEqual(len(shop_reentrant.json()["items"]), 1)
        self.assertEqual(shop_reentrant.json()["items"][0]["name"], "Авокадо")
