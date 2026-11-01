import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import (
    init_db,
    create_or_get_user,
    get_user_subscription,
    save_user_subscription,
    get_order,
    delete_all_user_data,
)
from bot import payments

TEST_BOT_TOKEN = "111222333:TEST_SUBSCRIPTION_BOT_TOKEN"


class TestSubscriptionApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "subscription_test.db"
        self.dist_dir = Path(self.tmp_dir.name) / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)
        self.settings = AppSettings(
            telegram_bot_token=TEST_BOT_TOKEN,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
            app_stage="test",
            allow_demo_auth=True,
            owner_allowlist=None,
        )
        self.app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=self.settings,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _get_auth_headers_for_user(self, user_id: int, username: str = "test_user") -> dict:
        user_info = {"id": user_id, "first_name": "Test", "username": username}
        init_data = generate_telegram_init_data(user_info, TEST_BOT_TOKEN)
        resp = self.client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp.status_code, 200, f"Session creation failed: {resp.text}")
        token = resp.json()["session_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_unauthenticated_subscription_access_fails(self):
        resp = self.client.get("/api/subscription")
        self.assertEqual(resp.status_code, 401)
        self.assertIn("Authentication required", resp.json()["detail"])

    def test_non_premium_user_subscription(self):
        headers = self._get_auth_headers_for_user(5001, "fresh_user")
        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_premium"])
        self.assertIn(data["status"], ("none", "active"))
        self.assertIsNone(data["tier"])
        self.assertIsNone(data["expires_at"])
        self.assertEqual(data["user_id"], 5001)

        product_ids = [p["id"] for p in data["available_products"]]
        self.assertIn("sub_month", product_ids)
        self.assertIn("plateau_guide", product_ids)
        self.assertIn("vip_care", product_ids)

    def test_purchase_invalid_product(self):
        headers = self._get_auth_headers_for_user(5002, "buyer_user")
        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "non_existent_product"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Unknown product", resp.json()["detail"])

    def test_purchase_init_order_success(self):
        headers = self._get_auth_headers_for_user(5003, "order_user")
        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("order_id", data)
        self.assertEqual(data["status"], "pending")
        self.assertTrue(data["demo_mode"])

        order = get_order(self.db_path, data["order_id"])
        self.assertIsNotNone(order)
        self.assertEqual(order["user_id"], 5003)
        self.assertEqual(order["product_id"], "sub_month")
        self.assertEqual(order["status"], "pending")
        self.assertEqual(order["amount_rub"], 1900.0)

    def test_confirm_demo_order_success(self):
        headers = self._get_auth_headers_for_user(5004, "premium_user")
        # 1. Purchase
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        # 2. Confirm Demo
        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 200)
        confirm_data = confirm_resp.json()
        self.assertTrue(confirm_data["success"])
        self.assertTrue(confirm_data["is_premium"])
        self.assertEqual(confirm_data["tier"], "sub_month")
        self.assertEqual(confirm_data["status"], "active")
        self.assertIsNotNone(confirm_data["expires_at"])

        # Check nested subscription object
        sub = confirm_data["subscription"]
        self.assertTrue(sub["is_premium"])
        self.assertEqual(sub["tier"], "sub_month")
        self.assertEqual(sub["status"], "active")

        # 3. GET /api/subscription now reflects premium
        get_resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(get_resp.status_code, 200)
        get_data = get_resp.json()
        self.assertTrue(get_data["is_premium"])
        self.assertEqual(get_data["tier"], "sub_month")
        self.assertEqual(get_data["status"], "active")

        # 4. Check DB state
        db_order = get_order(self.db_path, order_id)
        self.assertEqual(db_order["status"], "completed")

    def test_confirm_order_not_found(self):
        headers = self._get_auth_headers_for_user(5005, "user_5005")
        resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": "ord_fake_999999"},
        )
        self.assertEqual(resp.status_code, 404)
        self.assertIn("Order not found", resp.json()["detail"])

    def test_cross_user_order_confirmation_blocked(self):
        user_a_headers = self._get_auth_headers_for_user(6001, "user_a")
        user_b_headers = self._get_auth_headers_for_user(6002, "user_b")

        # User A creates order
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=user_a_headers,
            json={"product_id": "sub_month"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        # User B attempts to confirm User A's order
        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=user_b_headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 403)
        self.assertIn("Cross-user order confirmation forbidden", confirm_resp.json()["detail"])

    def test_demo_user_1084557944_subscription_workflow(self):
        # 1. Start demo session for Olga (demo_user=1084557944) in free state
        demo_resp = self.client.get("/api/demo-session?demo_user=1084557944&premium=0")
        self.assertEqual(demo_resp.status_code, 200)
        token = demo_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Check subscription is non-premium
        sub_resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(sub_resp.status_code, 200)
        self.assertFalse(sub_resp.json()["is_premium"])

        # 3. Demo user purchases sub_month
        purchase_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(purchase_resp.status_code, 200)
        order_id = purchase_resp.json()["order_id"]

        # 4. Demo user confirms payment
        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 200)
        self.assertTrue(confirm_resp.json()["success"])
        self.assertTrue(confirm_resp.json()["is_premium"])

        # 5. Check subscription is now premium
        sub_after_resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(sub_after_resp.status_code, 200)
        self.assertTrue(sub_after_resp.json()["is_premium"])
        self.assertEqual(sub_after_resp.json()["tier"], "sub_month")

    def test_demo_user_1084557944_preseeded_premium(self):
        # Test pre-seeding premium state directly via ?premium=1
        demo_resp = self.client.get("/api/demo-session?demo_user=1084557944&premium=1")
        self.assertEqual(demo_resp.status_code, 200)
        token = demo_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        sub_resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(sub_resp.status_code, 200)
        self.assertTrue(sub_resp.json()["is_premium"])
        self.assertEqual(sub_resp.json()["tier"], "sub_month")

    def test_expired_subscription_handling(self):
        headers = self._get_auth_headers_for_user(7001, "expired_user")
        # Pre-seed an expired subscription directly in DB
        save_user_subscription(
            self.db_path,
            7001,
            tier="sub_month",
            status="active",
            expires_at="2020-01-01T00:00:00Z",
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_premium"])
        self.assertEqual(data["status"], "expired")

    def test_vip_care_product_purchase(self):
        headers = self._get_auth_headers_for_user(8001, "vip_user")
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "vip_care"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 200)
        self.assertTrue(confirm_resp.json()["is_premium"])
        self.assertEqual(confirm_resp.json()["tier"], "vip_care")

    def test_cascading_delete_removes_subscription_and_orders(self):
        user_id = 9001
        create_or_get_user(user_id, username="cascade_sub_user", db_path=self.db_path)
        save_user_subscription(self.db_path, user_id, tier="sub_month", status="active")
        headers = self._get_auth_headers_for_user(user_id, "cascade_sub_user")

        purchase_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month"},
        )
        order_id = purchase_resp.json()["order_id"]
        self.assertIsNotNone(get_order(self.db_path, order_id))
        self.assertIsNotNone(get_user_subscription(self.db_path, user_id))

        # Delete user
        delete_all_user_data(user_id, db_path=self.db_path)

        # Verify cascading delete cleared subscription, while order is preserved and anonymized (audit trail)
        self.assertIsNone(get_user_subscription(self.db_path, user_id))
        order_record = get_order(self.db_path, order_id)
        self.assertIsNotNone(order_record)
        self.assertEqual(order_record["user_id"], 0)

    def test_payments_module_helper_functions(self):
        self.assertTrue(payments.validate_product_id("sub_month"))
        self.assertFalse(payments.validate_product_id("fake_item"))
        self.assertEqual(payments.format_currency(1900), "1900 ₽")

        # Test init_purchase with allow_demo
        res = payments.init_purchase(
            user_id=9999,
            product_id="sub_month",
            provider="demo",
            allow_demo=True,
            db_path=self.db_path,
        )
        self.assertIn("order_id", res)
        self.assertEqual(res["status"], "pending")

        # Test complete_demo_payment with allow_demo
        completed = payments.complete_demo_payment(
            order_id=res["order_id"],
            allow_demo=True,
            db_path=self.db_path,
        )
        self.assertIsNotNone(completed)
        self.assertEqual(completed["status"], "completed")

    def test_order_completion_replay_idempotency_and_no_free_reactivation(self):
        """
        Verify that replaying a completed order is strictly idempotent:
        1. Repeated confirmation returns the exact same expires_at without time drift.
        2. Replaying after expiration does NOT re-grant premium status.
        """
        headers = self._get_auth_headers_for_user(9501, "idempotent_buyer")
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        # Confirm 1
        conf1 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(conf1.status_code, 200)
        exp1 = conf1.json()["expires_at"]
        self.assertTrue(conf1.json()["is_premium"])

        # Small delay to verify timestamp does not shift
        import time
        time.sleep(1.05)

        # Confirm 2 (Replay)
        conf2 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(conf2.status_code, 200)
        exp2 = conf2.json()["expires_at"]
        self.assertEqual(exp1, exp2, f"Replay changed expiration: {exp1} vs {exp2}")

        # Now simulate expiration in DB
        save_user_subscription(
            self.db_path,
            9501,
            tier="sub_month",
            status="expired",
            expires_at="2020-01-01T00:00:00Z",
        )

        # Confirm 3 (Replay after expiration)
        conf3 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(conf3.status_code, 200)
        self.assertFalse(conf3.json()["is_premium"], "Replay granted free premium reactivation to expired user!")
        self.assertEqual(conf3.json()["status"], "expired")

    def test_subscription_renewal_additive_extension(self):
        """
        Verify that renewing an active subscription adds duration to the remaining time
        rather than truncating it.
        """
        user_id = 9502
        headers = self._get_auth_headers_for_user(user_id, "renewal_buyer")
        now_utc = datetime.now(timezone.utc)
        initial_exp = (now_utc + timedelta(days=25)).isoformat().replace("+00:00", "Z")
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="active",
            expires_at=initial_exp,
        )

        # Purchase 30-day renewal
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        # Confirm renewal
        conf_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(conf_resp.status_code, 200)
        new_exp_str = conf_resp.json()["expires_at"]
        new_exp = datetime.fromisoformat(new_exp_str.replace("Z", "+00:00"))
        days_remaining = (new_exp - now_utc).total_seconds() / 86400.0

        # Should be ~55 days (25 initial + 30 added), not truncated to 30
        self.assertGreater(days_remaining, 54.0)
        self.assertLess(days_remaining, 56.0)

    def test_atomic_order_completion_transaction(self):
        """
        Verify that completing an order updates both the order status and subscription atomically.
        """
        from bot.app_db import create_order, complete_order, get_order, get_user_subscription
        user_id = 9503
        order_id = create_order(self.db_path, user_id=user_id, product_id="sub_month", amount_rub=1900.0)

        # Before completion
        ord_before = get_order(self.db_path, order_id)
        self.assertEqual(ord_before["status"], "pending")
        self.assertIsNone(get_user_subscription(self.db_path, user_id))

        # After atomic completion
        res = complete_order(self.db_path, order_id)
        self.assertEqual(res["status"], "completed")
        self.assertIsNotNone(res["subscription"])

        # Check DB consistency
        ord_after = get_order(self.db_path, order_id)
        sub_after = get_user_subscription(self.db_path, user_id)
        self.assertEqual(ord_after["status"], "completed")
        self.assertIsNotNone(sub_after)
        self.assertEqual(sub_after["status"], "active")
        self.assertEqual(sub_after["tier"], "sub_month")


if __name__ == "__main__":
    unittest.main()
