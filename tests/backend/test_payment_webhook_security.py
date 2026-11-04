import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import logging
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.server import create_app, create_star_invoice_link, answer_pre_checkout_query
from bot.app_db import create_or_get_user, create_order, get_order, get_user_subscription

TEST_SECRET = "telegram_secret_token_sec_12345"
TEST_BOT_TOKEN = "123456789:AAGenuineFormatTokenForLiveUsageXYZ12345"


class TestPaymentWebhookSecurity(unittest.TestCase):
    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {
            "PAYMENT_MODE": "enabled",
            "PAYMENTS_ENABLED": "1",
            "APP_STAGE": "test",
        })
        self.env_patcher.start()

        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "webhook_sec_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_BOT_TOKEN,
            telegram_webhook_secret_token=TEST_SECRET,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            app_stage="test",
            allow_demo_auth=True,
            allow_demo_payments=True,
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        self.user_id = 998877
        create_or_get_user(self.user_id, username="victim_user", db_path=self.db_path)
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

    def test_forged_webhook_without_secret_token_is_rejected(self):
        """Request without X-Telegram-Bot-Api-Secret-Token must be rejected immediately."""
        update = {
            "update_id": 1001,
            "message": {
                "message_id": 1,
                "from": {"id": self.user_id},
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                }
            }
        }
        # Test on /api/telegram/webhook
        resp = self.client.post("/api/telegram/webhook", json=update)
        self.assertIn(resp.status_code, (401, 403))

        # Test on /api/payments/webhook
        resp2 = self.client.post("/api/payments/webhook", json=update)
        self.assertIn(resp2.status_code, (401, 403))

        # Verify order was not modified
        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending")
        self.assertIsNone(get_user_subscription(self.db_path, self.user_id))

    def test_forged_webhook_with_invalid_secret_token_is_rejected(self):
        """Request with incorrect secret token must be rejected."""
        update = {
            "update_id": 1002,
            "message": {
                "message_id": 2,
                "from": {"id": self.user_id},
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                }
            }
        }
        headers = {"X-Telegram-Bot-Api-Secret-Token": "invalid_forged_secret"}
        resp = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertIn(resp.status_code, (401, 403))

        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending")

    def test_amount_mismatch_rejected(self):
        """Amount that does not match expected stars for product must be rejected."""
        update = {
            "update_id": 1003,
            "message": {
                "message_id": 3,
                "from": {"id": self.user_id},
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1,  # Attacker paying 1 star instead of 1000
                    "invoice_payload": self.order_id,
                }
            }
        }
        headers = {"X-Telegram-Bot-Api-Secret-Token": TEST_SECRET}
        resp = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("amount", resp.text.lower())

        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending")

    def test_currency_mismatch_rejected(self):
        """Currency other than XTR (Stars) must be rejected."""
        update = {
            "update_id": 1004,
            "message": {
                "message_id": 4,
                "from": {"id": self.user_id},
                "successful_payment": {
                    "currency": "RUB",  # Invalid currency for Telegram Stars
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                }
            }
        }
        headers = {"X-Telegram-Bot-Api-Secret-Token": TEST_SECRET}
        resp = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("currency", resp.text.lower())

        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending")

    def test_user_mismatch_rejected(self):
        """Payment from a user different from the order owner must be rejected."""
        attacker_id = 112233
        update = {
            "update_id": 1005,
            "message": {
                "message_id": 5,
                "from": {"id": attacker_id},  # Mismatched user!
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                }
            }
        }
        headers = {"X-Telegram-Bot-Api-Secret-Token": TEST_SECRET}
        resp = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertIn(resp.status_code, (401, 403))

        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending")

    def test_idempotent_order_completion_does_not_extend_expiry(self):
        """Replaying successful_payment for an already completed order does not extend expiration."""
        headers = {"X-Telegram-Bot-Api-Secret-Token": TEST_SECRET}
        update = {
            "update_id": 1006,
            "message": {
                "message_id": 6,
                "from": {"id": self.user_id},
                "successful_payment": {
                    "currency": "XTR",
                    "total_amount": 1000,
                    "invoice_payload": self.order_id,
                }
            }
        }
        # First completion
        resp1 = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertEqual(resp1.status_code, 200)

        sub1 = get_user_subscription(self.db_path, self.user_id)
        self.assertIsNotNone(sub1)
        initial_expiry = sub1["expires_at"]

        # Duplicate/Replay webhook call
        resp2 = self.client.post("/api/telegram/webhook", json=update, headers=headers)
        self.assertEqual(resp2.status_code, 200)

        sub2 = get_user_subscription(self.db_path, self.user_id)
        second_expiry = sub2["expires_at"]

        self.assertEqual(initial_expiry, second_expiry, "Subscription expiry must remain unchanged on duplicate payment webhook")

    def test_hard_disable_real_payments_in_staging_and_home_pilot(self):
        """In staging and home-pilot modes, invoice creation returns mock URLs and prevents live API calls."""
        for stage in ("staging", "home-pilot", "test"):
            link = create_star_invoice_link(
                bot_token=TEST_BOT_TOKEN,
                title="Test Subscription",
                description="Test Description",
                payload="ord_test_stage_1",
                stars_amount=1000,
                app_stage=stage,
            )
            self.assertIsNotNone(link)
            self.assertTrue(link.startswith("https://t.me/$stars_invoice_mock_"))

            with patch.dict(os.environ, {"APP_STAGE": stage}):
                pcq_res = answer_pre_checkout_query(
                    bot_token=TEST_BOT_TOKEN,
                    pre_checkout_query_id="pcq_test",
                    ok=True,
                )
                self.assertTrue(pcq_res)

    def test_secrets_and_tokens_not_leaked_in_logs_or_errors(self):
        """Logs and error details must not contain bot token or internal secret."""
        # 1. Error response on auth validate with bad token
        resp = self.client.post("/api/auth/validate", json={"init_data": "invalid_format_init_data"})
        self.assertNotIn(TEST_BOT_TOKEN, resp.text)
        self.assertNotIn(TEST_SECRET, resp.text)

        # 2. Test logger warning does not leak token
        with self.assertLogs("KetoServer", level="WARNING") as cm:
            with patch("httpx.post", side_effect=Exception(f"Network error to https://api.telegram.org/bot{TEST_BOT_TOKEN}/test")):
                create_star_invoice_link(
                    bot_token=TEST_BOT_TOKEN,
                    title="Test",
                    description="Test",
                    payload="ord_1",
                    app_stage="production",
                )
        log_output = "\n".join(cm.output)
        self.assertNotIn(TEST_BOT_TOKEN, log_output, "Bot token must NEVER appear in server logs")
        self.assertNotIn(TEST_SECRET, log_output, "Secret token must NEVER appear in server logs")


if __name__ == "__main__":
    unittest.main()
