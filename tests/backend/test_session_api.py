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
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
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
