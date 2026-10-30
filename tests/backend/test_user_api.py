import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "222333444:USER_API_TEST_TOKEN_BOT"

class TestUserApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "user_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        # Создаем сессии для User A (id 1001) и User B (id 1002)
        resp_a = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 1001, "first_name": "UserA"}, TEST_TOKEN)}
        )
        self.token_a = resp_a.json()["session_token"]

        resp_b = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 1002, "first_name": "UserB"}, TEST_TOKEN)}
        )
        self.token_b = resp_b.json()["session_token"]

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_user_profile_and_state_roundtrip(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        update_data = {
            "profile": {"weight": 68.5, "height": 172.0, "goal": "keto_boost"},
            "state": {"onboarding_completed": True, "selected_day": 2, "cooked_recipe_ids": ["k1"]}
        }
        put_resp = self.client.put("/api/user", json=update_data, headers=headers_a)
        self.assertEqual(put_resp.status_code, 200)

        get_resp = self.client.get("/api/user", headers=headers_a)
        self.assertEqual(get_resp.status_code, 200)
        data = get_resp.json()
        self.assertEqual(data["user_id"], 1001)
        self.assertEqual(data["profile"]["weight"], 68.5)
        self.assertTrue(data["state"]["onboarding_completed"])
        self.assertEqual(data["state"]["selected_day"], 2)

    def test_user_isolation_cross_access_blocked(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}

        # User A пытается прочитать данные User B через query param ?user_id=1002
        get_cross = self.client.get("/api/user?user_id=1002", headers=headers_a)
        self.assertEqual(get_cross.status_code, 403)
        self.assertIn("forbidden", get_cross.text.lower())

        # User A пытается перезаписать данные User B
        put_cross = self.client.put("/api/user?user_id=1002", json={"profile": {"weight": 99.0}}, headers=headers_a)
        self.assertEqual(put_cross.status_code, 403)

    def test_shopping_state_isolation(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        headers_b = {"Authorization": f"Bearer {self.token_b}"}

        # User A сохраняет свой список покупок
        shop_a = {
            "items": [{"id": "item_a", "name": "Avocado", "amount": 3, "unit": "pcs", "checked": False}],
            "checked_map": {"item_a": False}
        }
        self.client.put("/api/shopping", json=shop_a, headers=headers_a)

        # User B читает свой список покупок — он должен быть пустым
        res_b = self.client.get("/api/shopping", headers=headers_b)
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.json()
        self.assertEqual(len(data_b.get("items", [])), 0)
