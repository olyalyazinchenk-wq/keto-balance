import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
from pathlib import Path
import unittest
from fastapi.testclient import TestClient
from bot import payments
from bot.app_settings import AppSettings
from bot.app_db import init_db, create_or_get_user
from bot.server import create_app

class TestPaymentsDisabled(unittest.TestCase):
    def test_init_purchase_raises_runtime_error(self):
        with self.assertRaises(RuntimeError) as ctx:
            payments.init_purchase(12345, "sub_month")
        self.assertIn("Payments are disabled", str(ctx.exception))

    def test_complete_demo_payment_raises_runtime_error(self):
        with self.assertRaises(RuntimeError) as ctx:
            payments.complete_demo_payment("order_123")
        self.assertIn("Payments are disabled", str(ctx.exception))

    def test_no_database_import_in_payments_module(self):
        """payments.py should not import create_order or mark_order_paid from database."""
        self.assertFalse(hasattr(payments, "create_order"))
        self.assertFalse(hasattr(payments, "mark_order_paid"))

    def test_api_subscription_reports_payments_disabled_and_rejects_purchase(self):
        """API endpoints must report payments_enabled: False and reject real purchase."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "test.db"
            init_db(db_path)
            token = "TEST_BOT_TOKEN_12345"

            settings = AppSettings(
                app_stage="production",
                telegram_bot_token=token,
            )
            app = create_app(
                dist_dir=Path(tmp_dir),
                db_path=db_path,
                settings=settings,
            )
            client = TestClient(app)

            from bot.auth import generate_telegram_init_data
            init_data = generate_telegram_init_data({"id": 987654321, "first_name": "Test"}, token)
            sess_resp = client.post("/api/session", json={"init_data": init_data})
            self.assertEqual(sess_resp.status_code, 200)
            sess_token = sess_resp.json()["session_token"]
            auth_headers = {"Authorization": f"Bearer {sess_token}"}

            # 1. GET /api/subscription
            resp = client.get("/api/subscription", headers=auth_headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("payments_enabled", data)
            self.assertFalse(data["payments_enabled"], "Payments must be reported as disabled")

            # 2. POST /api/subscription/purchase with real purchase attempt
            purch_resp = client.post(
                "/api/subscription/purchase",
                headers=auth_headers,
                json={"product_id": "sub_month", "provider": "stars"}
            )
            self.assertEqual(purch_resp.status_code, 503, "Must return 503 Service Unavailable when payments are disabled")
            self.assertIn("Payments are disabled", purch_resp.json().get("detail", ""))

if __name__ == '__main__':
    unittest.main()
