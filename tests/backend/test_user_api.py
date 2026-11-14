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

        # Первичное чтение для нового пользователя: revision=0, profile=None, state=None
        initial_resp = self.client.get("/api/user", headers=headers_a)
        self.assertEqual(initial_resp.status_code, 200)
        self.assertEqual(initial_resp.json()["revision"], 0)
        self.assertIsNone(initial_resp.json()["profile"])
        self.assertIsNone(initial_resp.json()["state"])

        update_data = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {
                "settings": {
                    "confirmed18Plus": True,
                    "approach": "keto",
                    "restrictions": ["exclude_eggs"],
                    "prepTimeMax": 45,
                    "mealsPerDay": 3,
                    "preferenceNote": ""
                },
                "weight": 68.5,
                "height": 172.0,
                "goal": "keto_boost"
            },
            "state": {
                "schema_version": 1,
                "menu": None,
                "selected_date": None,
                "checked_ingredients": {},
                "checked_steps": {},
                "shopping_batches": 1,
                "shopping_stale": False
            }
        }
        put_resp = self.client.put("/api/user", json=update_data, headers=headers_a)
        self.assertEqual(put_resp.status_code, 200)
        save_res = put_resp.json()
        self.assertEqual(save_res["status"], "ok")
        self.assertEqual(save_res["revision"], 1)

        get_resp = self.client.get("/api/user", headers=headers_a)
        self.assertEqual(get_resp.status_code, 200)
        data = get_resp.json()
        self.assertEqual(data["user_id"], 1001)
        self.assertEqual(data["revision"], 1)
        self.assertEqual(data["profile"]["weight"], 68.5)
        self.assertTrue(data["profile"]["settings"]["confirmed18Plus"])
        self.assertEqual(data["profile"]["settings"]["prepTimeMax"], 45)
        self.assertFalse(data["state"]["shopping_stale"])

        # Оптимистическая блокировка CAS: попытка сохранить с устаревшей revision 0 -> 409 Conflict
        stale_resp = self.client.put("/api/user", json=update_data, headers=headers_a)
        self.assertEqual(stale_resp.status_code, 409)

        # Сохранение с актуальной expected_revision=1 -> успех, revision=2
        update_data["expected_revision"] = 1
        update_data["profile"]["weight"] = 67.8
        ok_resp = self.client.put("/api/user", json=update_data, headers=headers_a)
        self.assertEqual(ok_resp.status_code, 200)
        self.assertEqual(ok_resp.json()["revision"], 2)

    def test_user_isolation_cross_access_blocked(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}

        # User A пытается прочитать данные User B через query param ?user_id=1002
        get_cross = self.client.get("/api/user?user_id=1002", headers=headers_a)
        self.assertEqual(get_cross.status_code, 403)
        self.assertIn("forbidden", get_cross.text.lower())

        # User A пытается перезаписать данные User B
        payload = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {"settings": None, "weight": 99.0},
            "state": None
        }
        put_cross = self.client.put("/api/user?user_id=1002", json=payload, headers=headers_a)
        self.assertEqual(put_cross.status_code, 403)

    def test_shopping_state_isolation_and_cas(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        headers_b = {"Authorization": f"Bearer {self.token_b}"}

        # User A сохраняет список покупок
        shop_a = {
            "schema_version": 1,
            "expected_revision": 0,
            "items": [
                {
                    "id": "item_a",
                    "name": "Авокадо",
                    "amountLabel": "2 шт.",
                    "department": "Овощи",
                    "linkedRecipeTitles": ["Салат"],
                    "alreadyHave": False,
                    "checkedInStore": False
                }
            ]
        }
        put_a = self.client.put("/api/shopping", json=shop_a, headers=headers_a)
        self.assertEqual(put_a.status_code, 200)
        self.assertEqual(put_a.json()["revision"], 1)

        # User B читает свой список покупок — он пустой с revision 0
        res_b = self.client.get("/api/shopping", headers=headers_b)
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.json()
        self.assertEqual(data_b["revision"], 0)
        self.assertEqual(len(data_b["items"]), 0)

        # Shopping CAS conflict: User A отправляет expected_revision=0 -> 409
        conflict_a = self.client.put("/api/shopping", json=shop_a, headers=headers_a)
        self.assertEqual(conflict_a.status_code, 409)

if __name__ == "__main__":
    unittest.main()
