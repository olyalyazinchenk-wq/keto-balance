"""
Adversarial and Edge Case Stress Test Suite for Milestone 1 Backend Monetization.

Tests challenging:
1. Expired vs Active Subscriptions (edge dates, malformed dates, auto-transitions, lifetime).
2. Confirming non-existent orders (empty, malformed, non-existent UUIDs, giant payloads).
3. Confirming already-completed orders (idempotence, replay attacks, renewal loops).
4. Purchasing non-existent products (whitelisting, empty, max length, invalid types).
5. SQL Injection & Malformed payloads (order_id injection, provider injection, union/drop table attacks).
6. Cross-user isolation and authorization tampering.
7. Demo user 1084557944 edge cases and invalid parameters.
"""

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
    complete_order,
)
from bot.config import PRODUCTS

TEST_BOT_TOKEN = "111222333:TEST_ADVERSARIAL_BOT_TOKEN"


class TestSubscriptionAdversarial(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "adversarial_test.db"
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

    def _get_auth_headers_for_user(self, user_id: int, username: str = "adv_user") -> dict:
        user_info = {"id": user_id, "first_name": "AdvUser", "username": username}
        init_data = generate_telegram_init_data(user_info, TEST_BOT_TOKEN)
        resp = self.client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp.status_code, 200, f"Session creation failed: {resp.text}")
        token = resp.json()["session_token"]
        return {"Authorization": f"Bearer {token}"}

    # =========================================================================
    # 1. EXPIRED VS ACTIVE SUBSCRIPTIONS
    # =========================================================================

    def test_expired_subscription_marked_expired_and_not_premium(self):
        """Subscriptions with past expires_at must return is_premium=False and transition DB to expired."""
        user_id = 10001
        headers = self._get_auth_headers_for_user(user_id)
        # Pre-seed active status but expired date in DB
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="active",
            expires_at="2021-05-01T00:00:00Z",
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_premium"])
        self.assertEqual(data["status"], "expired")
        self.assertEqual(data["tier"], "sub_month")

        # Verify DB was dynamically transitioned to expired
        db_sub = get_user_subscription(self.db_path, user_id)
        self.assertEqual(db_sub["status"], "expired")

    def test_active_subscription_future_date_remains_active(self):
        """Subscriptions with future expires_at must remain active with is_premium=True."""
        user_id = 10002
        headers = self._get_auth_headers_for_user(user_id)
        future_dt = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat().replace("+00:00", "Z")
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="active",
            expires_at=future_dt,
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["is_premium"])
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["tier"], "sub_month")

    def test_lifetime_subscription_without_expires_at(self):
        """Perpetual/lifetime subscriptions with expires_at=None should remain is_premium=True."""
        user_id = 10003
        headers = self._get_auth_headers_for_user(user_id)
        save_user_subscription(
            self.db_path,
            user_id,
            tier="plateau_guide",
            status="active",
            expires_at=None,
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["is_premium"])
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["tier"], "plateau_guide")
        self.assertIsNone(data["expires_at"])

    def test_cancelled_subscription_not_premium_even_if_future_expires(self):
        """Cancelled subscription should never be is_premium=True."""
        user_id = 10004
        headers = self._get_auth_headers_for_user(user_id)
        future_dt = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat().replace("+00:00", "Z")
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="cancelled",
            expires_at=future_dt,
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_premium"])
        self.assertEqual(data["status"], "cancelled")

    def test_malformed_expires_at_date_does_not_crash(self):
        """Corrupted expires_at string in DB must not trigger 500 Internal Server Error."""
        user_id = 10005
        headers = self._get_auth_headers_for_user(user_id)
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="active",
            expires_at="CORRUPTED_NON_ISO_TIMESTAMP_VAL",
        )

        resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("is_premium", data)
        self.assertIn("status", data)

    # =========================================================================
    # 2. CONFIRMING NON-EXISTENT ORDERS
    # =========================================================================

    def test_confirm_non_existent_order_id_returns_404(self):
        """Confirming an order that does not exist in the DB must return 404, never 500."""
        user_id = 20001
        headers = self._get_auth_headers_for_user(user_id)
        resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": "ord_20001_99999999_nonexistent"},
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["detail"], "Order not found")

    def test_confirm_empty_order_id_returns_422(self):
        """Confirming an empty string order_id must be rejected with 422 Unprocessable Entity."""
        user_id = 20002
        headers = self._get_auth_headers_for_user(user_id)
        resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": ""},
        )
        self.assertEqual(resp.status_code, 422)

    def test_confirm_missing_or_null_order_id_returns_422(self):
        """Confirming with missing or null order_id must return 422."""
        user_id = 20003
        headers = self._get_auth_headers_for_user(user_id)
        resp1 = self.client.post("/api/subscription/confirm-demo", headers=headers, json={})
        self.assertEqual(resp1.status_code, 422)

        resp2 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": None},
        )
        self.assertEqual(resp2.status_code, 422)

    def test_confirm_excessively_long_order_id_returns_422(self):
        """Order ID exceeding max_length=100 must be rejected with 422."""
        user_id = 20004
        headers = self._get_auth_headers_for_user(user_id)
        giant_id = "ord_" + "x" * 150
        resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": giant_id},
        )
        self.assertEqual(resp.status_code, 422)

    # =========================================================================
    # 3. CONFIRMING ALREADY-COMPLETED ORDERS (IDEMPOTENCE & STATE REPLAY)
    # =========================================================================

    def test_confirm_completed_order_idempotence(self):
        """Confirming an already completed order should not crash (no 500) and preserve order completion."""
        user_id = 30001
        headers = self._get_auth_headers_for_user(user_id)

        # 1. Create order
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        # 2. First confirmation
        first_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(first_resp.status_code, 200)
        first_data = first_resp.json()
        self.assertTrue(first_data["success"])
        self.assertTrue(first_data["is_premium"])
        expiry_1 = first_data["expires_at"]

        # 3. Second immediate confirmation of same order (idempotent call)
        second_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(second_resp.status_code, 200)
        second_data = second_resp.json()
        self.assertTrue(second_data["success"])
        self.assertTrue(second_data["is_premium"])

        # Check order status in DB remains completed
        order_db = get_order(self.db_path, order_id)
        self.assertEqual(order_db["status"], "completed")

    def test_replay_completed_order_behavior(self):
        """
        Verify system behavior when replaying a completed order after subscription expiration.
        Checks whether the backend crashes, errors, or updates the subscription.
        """
        user_id = 30002
        headers = self._get_auth_headers_for_user(user_id)

        # 1. Purchase and complete
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month"},
        )
        order_id = init_resp.json()["order_id"]
        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 200)

        # 2. Simulate expiration in DB
        save_user_subscription(
            self.db_path,
            user_id,
            tier="sub_month",
            status="expired",
            expires_at="2022-01-01T00:00:00Z",
        )

        # 3. Call confirm-demo again with the completed order
        replay_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        # Should execute safely without 500 error
        self.assertIn(replay_resp.status_code, (200, 400, 409))
        self.assertNotEqual(replay_resp.status_code, 500)

    # =========================================================================
    # 4. PURCHASING NON-EXISTENT PRODUCTS
    # =========================================================================

    def test_purchase_non_existent_product_returns_400(self):
        """Purchasing an unknown product must be rejected with 400 Bad Request."""
        user_id = 40001
        headers = self._get_auth_headers_for_user(user_id)
        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "super_secret_vip_platinum_tier"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Unknown product", resp.json()["detail"])

    def test_purchase_empty_product_id_returns_422(self):
        """Empty product_id must return 422 Unprocessable Entity."""
        user_id = 40002
        headers = self._get_auth_headers_for_user(user_id)
        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": ""},
        )
        self.assertEqual(resp.status_code, 422)

    def test_purchase_oversized_product_id_returns_422(self):
        """Product ID exceeding 50 characters must return 422."""
        user_id = 40003
        headers = self._get_auth_headers_for_user(user_id)
        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month_" + "x" * 60},
        )
        self.assertEqual(resp.status_code, 422)

    def test_purchase_null_or_missing_product_id_returns_422(self):
        """Null or missing product_id in purchase payload must return 422."""
        user_id = 40004
        headers = self._get_auth_headers_for_user(user_id)
        resp1 = self.client.post("/api/subscription/purchase", headers=headers, json={})
        self.assertEqual(resp1.status_code, 422)

        resp2 = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": None},
        )
        self.assertEqual(resp2.status_code, 422)

    # =========================================================================
    # 5. SQL INJECTION & MALFORMED PAYLOAD ATTEMPTS
    # =========================================================================

    def test_sql_injection_in_confirm_order_id(self):
        """SQL injection attacks in order_id must be treated as non-existent orders (404), not execute SQL."""
        user_id = 50001
        headers = self._get_auth_headers_for_user(user_id)

        sqli_payloads = [
            "' OR '1'='1",
            "ord_'; DROP TABLE subscriptions; --",
            "ord_' UNION SELECT * FROM users --",
            "\" OR \"\"=\"",
            "admin'--",
            "1' AND 1=(SELECT COUNT(*) FROM orders)--",
        ]

        for payload in sqli_payloads:
            resp = self.client.post(
                "/api/subscription/confirm-demo",
                headers=headers,
                json={"order_id": payload},
            )
            # Parameterized query searches for exact string -> returns 404
            self.assertEqual(
                resp.status_code,
                404,
                f"Payload '{payload}' did not return 404: got {resp.status_code} ({resp.text})",
            )

        # Verify tables still exist and are healthy
        sub = get_user_subscription(self.db_path, user_id)
        self.assertIsNone(sub)  # No crash, returns None safely

    def test_sql_injection_in_purchase_product_id(self):
        """SQL injection strings in product_id must be rejected safely by product catalog validation (400)."""
        user_id = 50002
        headers = self._get_auth_headers_for_user(user_id)

        sqli_payloads = [
            "sub_month' OR '1'='1",
            "'; DROP TABLE orders; --",
            "sub_month' UNION SELECT",
        ]

        for payload in sqli_payloads:
            resp = self.client.post(
                "/api/subscription/purchase",
                headers=headers,
                json={"product_id": payload},
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Unknown product", resp.json()["detail"])

    def test_sql_injection_in_purchase_provider(self):
        """SQL injection in provider string must be safely parameterized into orders table."""
        user_id = 50003
        headers = self._get_auth_headers_for_user(user_id)
        provider_sqli = "demo'; DROP TABLE users; --"

        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": provider_sqli},
        )
        self.assertEqual(resp.status_code, 200)
        order_id = resp.json()["order_id"]

        # Check DB record stored provider as literal string without dropping users table
        order = get_order(self.db_path, order_id)
        self.assertIsNotNone(order)
        self.assertEqual(order["provider"], provider_sqli)

    def test_malformed_json_and_body_types(self):
        """Non-dictionary JSON bodies or malformed payloads must return 422 or 400, never 500."""
        user_id = 50004
        headers = self._get_auth_headers_for_user(user_id)

        # Array instead of object
        resp1 = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json=["sub_month"],
        )
        self.assertEqual(resp1.status_code, 422)

        # Raw string instead of object
        resp2 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json="raw_order_id_string",
        )
        self.assertEqual(resp2.status_code, 422)

    # =========================================================================
    # 6. CROSS-USER ISOLATION & AUTHENTICATION GUARDRAILS
    # =========================================================================

    def test_unauthenticated_endpoints_return_401(self):
        """Endpoints without Bearer auth header must return 401."""
        endpoints = [
            ("GET", "/api/subscription", None),
            ("POST", "/api/subscription/purchase", {"product_id": "sub_month"}),
            ("POST", "/api/subscription/confirm-demo", {"order_id": "ord_test"}),
        ]
        for method, path, payload in endpoints:
            if method == "GET":
                resp = self.client.get(path)
            else:
                resp = self.client.post(path, json=payload)
            self.assertEqual(
                resp.status_code,
                401,
                f"{method} {path} without auth did not return 401: got {resp.status_code}",
            )

    def test_cross_user_order_confirmation_blocked(self):
        """User B cannot confirm an order created by User A."""
        user_a = 60001
        user_b = 60002
        headers_a = self._get_auth_headers_for_user(user_a)
        headers_b = self._get_auth_headers_for_user(user_b)

        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers_a,
            json={"product_id": "sub_month"},
        )
        order_id = init_resp.json()["order_id"]

        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers_b,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 403)
        self.assertIn("Cross-user order confirmation forbidden", confirm_resp.json()["detail"])

    def test_spoofed_user_id_headers_blocked(self):
        """User passing mismatched X-User-Id or user_id query param must be rejected with 403."""
        real_user = 60003
        spoofed_user = 60004
        headers = self._get_auth_headers_for_user(real_user)

        # Mismatched X-User-Id header
        spoofed_headers = dict(headers)
        spoofed_headers["X-User-Id"] = str(spoofed_user)
        resp1 = self.client.get("/api/subscription", headers=spoofed_headers)
        self.assertEqual(resp1.status_code, 403)

        # Mismatched query parameter
        resp2 = self.client.get(f"/api/subscription?user_id={spoofed_user}", headers=headers)
        self.assertEqual(resp2.status_code, 403)

    # =========================================================================
    # 7. DEMO USER 1084557944 FLOW & EDGE CASES
    # =========================================================================

    def test_demo_user_1084557944_transitions(self):
        """Verify demo user 1084557944 can start free, transition to premium, and toggle with ?premium=1/0."""
        # Start free
        resp_free = self.client.get("/api/demo-session?demo_user=1084557944&premium=0")
        self.assertEqual(resp_free.status_code, 200)
        token_free = resp_free.json()["session_token"]
        headers_free = {"Authorization": f"Bearer {token_free}"}

        sub_free = self.client.get("/api/subscription", headers=headers_free).json()
        self.assertFalse(sub_free["is_premium"])

        # Preseed premium
        resp_prem = self.client.get("/api/demo-session?demo_user=1084557944&premium=1")
        self.assertEqual(resp_prem.status_code, 200)
        token_prem = resp_prem.json()["session_token"]
        headers_prem = {"Authorization": f"Bearer {token_prem}"}

        sub_prem = self.client.get("/api/subscription", headers=headers_prem).json()
        self.assertTrue(sub_prem["is_premium"])
        self.assertEqual(sub_prem["tier"], "sub_month")

    def test_demo_user_invalid_premium_flag_fallbacks_safely(self):
        """Non-boolean premium flag in demo-session (?premium=invalid) is rejected with 422, never 500."""
        resp = self.client.get("/api/demo-session?demo_user=1084557944&premium=invalid_value")
        self.assertEqual(resp.status_code, 422)
        self.assertIn("detail", resp.json())

    # =========================================================================
    # 8. CONCURRENCY, UNICODE, LARGE PAYLOADS & STRESS HARNESS
    # =========================================================================

    def test_concurrent_order_confirmation_no_race_crashes(self):
        """Multiple concurrent confirmations of the same order must not cause 500 or SQLite database lock errors."""
        import concurrent.futures

        user_id = 70001
        headers = self._get_auth_headers_for_user(user_id)

        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        def confirm_worker():
            return self.client.post(
                "/api/subscription/confirm-demo",
                headers=headers,
                json={"order_id": order_id},
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(confirm_worker) for _ in range(5)]
            results = [f.result() for f in futures]

        for r in results:
            self.assertEqual(r.status_code, 200)
            self.assertNotEqual(r.status_code, 500)

        # Verify DB is in a consistent state
        order = get_order(self.db_path, order_id)
        self.assertEqual(order["status"], "completed")
        sub = get_user_subscription(self.db_path, user_id)
        self.assertEqual(sub["status"], "active")

    def test_order_id_generation_unique_under_rapid_creation(self):
        """Rapid order creation must generate unique order_ids without primary key collision."""
        user_id = 70002
        headers = self._get_auth_headers_for_user(user_id)
        order_ids = set()

        for _ in range(15):
            resp = self.client.post(
                "/api/subscription/purchase",
                headers=headers,
                json={"product_id": "plateau_guide"},
            )
            self.assertEqual(resp.status_code, 200)
            oid = resp.json()["order_id"]
            self.assertNotIn(oid, order_ids, "Duplicate order_id generated!")
            order_ids.add(oid)

        self.assertEqual(len(order_ids), 15)

    def test_unicode_and_emojis_in_provider(self):
        """Unicode characters and emojis in provider string must be safely stored without crashes."""
        user_id = 70003
        headers = self._get_auth_headers_for_user(user_id)
        provider_str = "⭐_t_stars_🔥_кето_подписка_100%"

        resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "vip_care", "provider": provider_str},
        )
        self.assertEqual(resp.status_code, 200)
        order_id = resp.json()["order_id"]

        order = get_order(self.db_path, order_id)
        self.assertEqual(order["provider"], provider_str)

    def test_malformed_auth_header_variations(self):
        """Various malformed Authorization headers must cleanly return 401, never 500."""
        malformed_headers = [
            "Bearer ",
            "Bearer      ",
            "Bearer \x00\x00",
            "Bearer " + "a" * 1000,
            "Basic dXNlcjpwYXNz",
            "Token abcdef12345",
            "Bearer invalid.token.signature",
            "bearer lowercase",
        ]
        for hdr in malformed_headers:
            resp = self.client.get("/api/subscription", headers={"Authorization": hdr})
            self.assertEqual(
                resp.status_code,
                401,
                f"Header '{hdr}' did not return 401: got {resp.status_code}",
            )

    def test_64bit_large_user_id(self):
        """Large 64-bit Telegram user IDs (e.g. 5000000000) must work correctly across tables."""
        large_uid = 5000000000
        headers = self._get_auth_headers_for_user(large_uid, "large_user")

        sub_resp = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(sub_resp.status_code, 200)
        self.assertEqual(sub_resp.json()["user_id"], large_uid)

        purchase_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month"},
        )
        self.assertEqual(purchase_resp.status_code, 200)
        order_id = purchase_resp.json()["order_id"]
        self.assertIn(str(large_uid), order_id)

        confirm_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        self.assertEqual(confirm_resp.status_code, 200)
        self.assertTrue(confirm_resp.json()["is_premium"])


if __name__ == "__main__":
    unittest.main()
