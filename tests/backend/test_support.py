import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.app_db import get_support_tickets
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "777888999:SUPPORT_TEST_TOKEN"

class TestSupport(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "support_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        resp = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 888, "first_name": "SupportUser"}, TEST_TOKEN)}
        )
        self.token = resp.json()["session_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_submit_valid_support_ticket(self):
        payload = {
            "message": "Здравствуйте! Подскажите, можно ли заменить шпинат на рукколу?",
            "topic": "recipes",
            "contact": "@telegram_user"
        }
        resp = self.client.post("/api/support", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("ticket_id", data)
        self.assertEqual(data["status"], "open")
        self.assertIn("submitted successfully", data["message"].lower())

        # Проверка сохранения в БД
        tickets = get_support_tickets(888, db_path=self.db_path)
        self.assertEqual(len(tickets), 1)
        self.assertEqual(tickets[0]["topic"], "recipes")
        self.assertIn("шпинат", tickets[0]["message"])
        self.assertEqual(tickets[0]["contact"], "@telegram_user")

    def test_unauthenticated_support_submission_fails(self):
        payload = {"message": "Hello support", "topic": "general"}
        resp = self.client.post("/api/support", json=payload)
        self.assertEqual(resp.status_code, 401)

    def test_submit_empty_or_whitespace_message_fails(self):
        resp_empty = self.client.post("/api/support", json={"message": "   "}, headers=self.headers)
        self.assertEqual(resp_empty.status_code, 422)

        resp_short = self.client.post("/api/support", json={"message": "hi"}, headers=self.headers)
        self.assertEqual(resp_short.status_code, 422)

if __name__ == "__main__":
    unittest.main()
