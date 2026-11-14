import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import create_or_get_user, create_order, get_order, get_user_subscription

TEST_TOKEN = "111222333:STARS_TEST_BOT_TOKEN"

class TestTelegramStarsWebhook(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {"PAYMENT_MODE": "enabled", "PAYMENTS_ENABLED": "1"})
        self.env_patcher.start()

        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "stars_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            app_stage="test",
            allow_demo_auth=True,
            allow_demo_payments=True,
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        self.user_id = 777001
        create_or_get_user(self.user_id, username="stars_user", db_path=self.db_path)
        self.order_id = create_order(
            user_id=self.user_id,
            product_id="sub_month",
            amount_rub=1900.0,
            provider="telegram_stars",
            db_path=self.db_path,
        )

    def tearDown(self):
        self.env_patcher.stop()
        self.tmp_dir.cleanup()

    @patch("bot.server.answer_pre_checkout_query", return_value=True)
    def test_pre_checkout_query_webhook(self, mock_answer):
        update = {
            "update_id": 90001,
            "pre_checkout_query": {
                "id": "pre_checkout_12345",
                "from": {"id": self.user_id, "first_name": "StarsTester"},
                "currency": "XTR",
                "total_amount": 1000,
                "invoice_payload": self.order_id,
            }
        }
        resp = self.client.post("/api/telegram/webhook", json=update)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("ok"))
        mock_answer.assert_called_once_with(
            bot_token=TEST_TOKEN,
            pre_checkout_query_id="pre_checkout_12345",
            ok=True,
        )

    def test_successful_payment_webhook_activates_subscription(self):
        order_before = get_order(self.db_path, self.order_id)
        self.assertEqual(order_before["status"], "pending")

        update = {
            "update_id": 90002,
            "message": {
                "message_id": 55,
                "from": {"id": self.user_id, "first_name": "StarsTester"},
                "chat": {"id": self.user_id, "type": "private"},
                "date": 1700000000,
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                    "telegram_payment_charge_id": "charge_stars_xyz",
                    "provider_payment_charge_id": "",
                }
            }
        }
        resp = self.client.post("/api/telegram/webhook", json=update)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("completed_order_id"), self.order_id)

        order_after = get_order(self.db_path, self.order_id)
        self.assertEqual(order_after["status"], "completed")

        sub = get_user_subscription(self.db_path, self.user_id)
        self.assertIsNotNone(sub)
        self.assertEqual(sub["tier"], "sub_month")
        self.assertEqual(sub["status"], "active")
        self.assertIsNotNone(sub["expires_at"])

    def test_successful_payment_idempotent(self):
        update = {
            "update_id": 90003,
            "message": {
                "message_id": 56,
                "from": {"id": self.user_id, "first_name": "StarsTester"},
                "chat": {"id": self.user_id, "type": "private"},
                "date": 1700000000,
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                    "telegram_payment_charge_id": "charge_stars_xyz",
                    "provider_payment_charge_id": "",
                }
            }
        }
        resp1 = self.client.post("/api/telegram/webhook", json=update)
        self.assertEqual(resp1.status_code, 200)

        sub1 = get_user_subscription(self.db_path, self.user_id)
        exp1 = sub1["expires_at"]

        resp2 = self.client.post("/api/telegram/webhook", json=update)
        self.assertEqual(resp2.status_code, 200)

        sub2 = get_user_subscription(self.db_path, self.user_id)
        exp2 = sub2["expires_at"]
        self.assertEqual(exp1, exp2, "Replay of same order must be strictly idempotent")

    def test_successful_payment_unknown_order_fails_safe(self):
        update = {
            "update_id": 90004,
            "message": {
                "message_id": 57,
                "from": {"id": self.user_id, "first_name": "StarsTester"},
                "chat": {"id": self.user_id, "type": "private"},
                "date": 1700000000,
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": "ord_nonexistent_999",
                    "telegram_payment_charge_id": "charge_fake",
                    "provider_payment_charge_id": "",
                }
            }
        }
        resp = self.client.post("/api/telegram/webhook", json=update)
        self.assertEqual(resp.status_code, 404)
