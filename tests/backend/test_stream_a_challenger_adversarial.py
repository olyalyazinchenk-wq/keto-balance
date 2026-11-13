"""Adversarial stress-testing suite for Stream A (Admin Auth & Telegram Stars Polling).

Empirical verification by Challenger P2.
"""
import asyncio
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from bot.config import ADMIN_ID
from bot.app_settings import AppSettings, set_settings
from bot.server import create_app
from bot.app_db import (
    create_or_get_user,
    create_session,
    create_order,
    get_order,
    get_user_subscription,
    get_admin_catalog_version,
)
from bot.bot import (
    pre_checkout_handler,
    successful_payment_handler,
    paysupport_cmd,
    callback_handler,
)


class TestStreamAAdversarialAdminAuth(unittest.TestCase):
    """Adversarial stress-testing of Closed Admin Authentication."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "adv_admin_test.db"
        self.settings = AppSettings(
            app_stage="test",
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            owner_allowlist=frozenset({ADMIN_ID, 999111}),
        )
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            settings=self.settings,
        )
        self.client = TestClient(self.app)

        # 1. Admin user
        self.admin_uid = ADMIN_ID  # 1084557944
        create_or_get_user(self.admin_uid, username="admin_olga", db_path=self.db_path)
        self.admin_token = "valid_admin_token_xyz_123"
        create_session(self.admin_uid, self.admin_token, expires_in_seconds=3600, db_path=self.db_path)

        # 2. Regular non-admin user
        self.regular_uid = 777888
        create_or_get_user(self.regular_uid, username="ordinary_user", db_path=self.db_path)
        self.regular_token = "valid_regular_user_token_abc_456"
        create_session(self.regular_uid, self.regular_token, expires_in_seconds=3600, db_path=self.db_path)

        # 3. Expired admin session
        self.expired_admin_token = "expired_admin_token_000"
        create_session(self.admin_uid, self.expired_admin_token, expires_in_seconds=-10, db_path=self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_unauthenticated_requests_strictly_401(self):
        """All /api/admin/* endpoints must return HTTP 401 when unauthenticated."""
        endpoints = [
            ("GET", "/api/admin/recipes", None),
            ("POST", "/api/admin/recipes", {"recipe_id": "test_r", "title": "Test"}),
            ("POST", "/api/admin/recipes/k1/publish", None),
            ("GET", "/api/admin/status", None),
        ]
        for method, path, body in endpoints:
            with self.subTest(method=method, path=path):
                # 1. Completely missing header
                resp = self.client.request(method, path, json=body)
                self.assertEqual(resp.status_code, 401, f"{path} did not return 401 on missing auth")

                # 2. Empty string header
                resp_empty = self.client.request(method, path, json=body, headers={"Authorization": ""})
                self.assertEqual(resp_empty.status_code, 401)

                # 3. Header without Bearer prefix
                resp_nobearer = self.client.request(method, path, json=body, headers={"Authorization": "Token 12345"})
                self.assertEqual(resp_nobearer.status_code, 401)

                # 4. Bearer prefix with empty token
                resp_emptybearer = self.client.request(method, path, json=body, headers={"Authorization": "Bearer "})
                self.assertEqual(resp_emptybearer.status_code, 401)

                # 5. Non-existent token
                resp_fake = self.client.request(method, path, json=body, headers={"Authorization": "Bearer fake_token_999"})
                self.assertEqual(resp_fake.status_code, 401)

                # 6. Expired admin token
                resp_expired = self.client.request(method, path, json=body, headers={"Authorization": f"Bearer {self.expired_admin_token}"})
                self.assertEqual(resp_expired.status_code, 401)

    def test_non_admin_user_session_strictly_403(self):
        """A validly authenticated non-admin user must strictly receive HTTP 403 Forbidden."""
        endpoints = [
            ("GET", "/api/admin/recipes", None),
            ("POST", "/api/admin/recipes", {"recipe_id": "malicious_rec", "title": "Hacked"}),
            ("POST", "/api/admin/recipes/k1/publish", None),
            ("GET", "/api/admin/status", None),
        ]
        headers = {"Authorization": f"Bearer {self.regular_token}"}
        for method, path, body in endpoints:
            with self.subTest(method=method, path=path):
                resp = self.client.request(method, path, json=body, headers=headers)
                self.assertEqual(resp.status_code, 403, f"{path} did not return 403 for non-admin session")
                self.assertIn("admin access required", resp.json().get("detail", "").lower())

    def test_spoofing_via_headers_or_query_parameters_fails(self):
        """Attacker trying to bypass auth by injecting X-User-Id or user_id query params."""
        malicious_headers = {
            "Authorization": f"Bearer {self.regular_token}",
            "X-User-Id": str(ADMIN_ID),
        }
        # 1. Non-admin token with Admin X-User-Id header -> STILL 403
        resp = self.client.get(f"/api/admin/status?user_id={ADMIN_ID}", headers=malicious_headers)
        self.assertEqual(resp.status_code, 403, "X-User-Id spoofing must NOT bypass admin auth")

        # 2. Missing token with Admin X-User-Id header -> STILL 401
        resp_no_token = self.client.get(f"/api/admin/recipes?user_id={ADMIN_ID}", headers={"X-User-Id": str(ADMIN_ID)})
        self.assertEqual(resp_no_token.status_code, 401, "Missing token with X-User-Id must return 401")

    def test_admin_session_succeeds_with_200(self):
        """Admin session (ADMIN_ID = 1084557944) must succeed with 200 on all endpoints."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # Status
        resp_status = self.client.get("/api/admin/status", headers=headers)
        self.assertEqual(resp_status.status_code, 200)
        self.assertEqual(resp_status.json().get("status"), "ok")
        self.assertEqual(resp_status.json().get("admin_id"), ADMIN_ID)

        # Recipes list
        resp_list = self.client.get("/api/admin/recipes", headers=headers)
        self.assertEqual(resp_list.status_code, 200)
        self.assertIn("recipes", resp_list.json())

        # Save draft
        draft_body = {
            "recipe_id": "test_adv_1",
            "recipe_data": {
                "id": "test_adv_1",
                "title": "Adversarial Test Recipe",
                "serv": 2, "time": 20,
                "kcal": 500,
                "mode": "keto",
                "ing": [["Говядина", "250 г"], ["Сливочное масло", "25 г"]],
                "steps": ["Нарежьте мясо.", "Обжарьте на сливочном масле."],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Olga",
                "sources": ["Adversarial test"],
            },
        }
        resp_draft = self.client.post("/api/admin/recipes", json=draft_body, headers=headers)
        self.assertEqual(resp_draft.status_code, 200)
        self.assertEqual(resp_draft.json().get("status"), "draft")

        # Publish draft
        resp_pub = self.client.post("/api/admin/recipes/test_adv_1/publish", headers=headers)
        self.assertEqual(resp_pub.status_code, 200)
        self.assertEqual(resp_pub.json().get("status"), "published")

    def test_admin_payload_validation_and_error_handling(self):
        """Admin endpoints must gracefully reject invalid payloads (400) and nonexistent recipes (404)."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # 1. Missing recipe_id
        resp1 = self.client.post("/api/admin/recipes", json={"title": "No ID"}, headers=headers)
        self.assertEqual(resp1.status_code, 400)
        self.assertIn("recipe_id is required", resp1.json().get("detail", ""))

        # 2. Publish non-existent recipe -> 404
        resp2 = self.client.post("/api/admin/recipes/ghost_recipe_xyz/publish", headers=headers)
        self.assertEqual(resp2.status_code, 404)

        # 3. Publish recipe without draft -> 400
        # k1 is initially published without pending draft
        resp3 = self.client.post("/api/admin/recipes/k1/publish", headers=headers)
        self.assertEqual(resp3.status_code, 400)
        self.assertIn("no draft to publish", resp3.json().get("detail", "").lower())

    def test_historical_menu_reproducibility_across_multiple_revisions(self):
        """Historical catalog versions must remain completely reproducible across multiple publications."""
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        from bot.app_db import get_catalog_snapshot

        initial_v = get_admin_catalog_version(self.db_path)
        snap_v1 = get_catalog_snapshot(initial_v, self.db_path)
        self.assertIsNotNone(snap_v1)
        original_k1 = next(r for r in snap_v1 if r["id"] == "k1")

        # Revision 1
        self.client.post(
            "/api/admin/recipes",
            json={
                "recipe_id": "k1",
                "recipe_data": {"id": "k1", "title": "Revision 1", "kcal": 601},
                "approval_marks": {"approved": True, "approved_by": "Olga", "source": "Audit Revision 1"},
            },
            headers=headers,
        )
        self.client.post("/api/admin/recipes/k1/publish", headers=headers)
        v2 = get_admin_catalog_version(self.db_path)
        self.assertEqual(v2, initial_v + 1)

        # Revision 2
        self.client.post(
            "/api/admin/recipes",
            json={
                "recipe_id": "k1",
                "recipe_data": {"id": "k1", "title": "Revision 2", "kcal": 602},
                "approval_marks": {"approved": True, "approved_by": "Olga", "source": "Audit Revision 2"},
            },
            headers=headers,
        )
        self.client.post("/api/admin/recipes/k1/publish", headers=headers)
        v3 = get_admin_catalog_version(self.db_path)
        self.assertEqual(v3, initial_v + 2)

        # Invariant check: snapshot for v1 MUST still contain the original title
        snap_v1_check = get_catalog_snapshot(initial_v, self.db_path)
        k1_v1 = next(r for r in snap_v1_check if r["id"] == "k1")
        self.assertEqual(k1_v1["title"], original_k1["title"])

        # Snapshot for v2 MUST contain Revision 1
        snap_v2 = get_catalog_snapshot(v2, self.db_path)
        k1_v2 = next(r for r in snap_v2 if r["id"] == "k1")
        self.assertEqual(k1_v2["title"], "Revision 1")

        # Snapshot for v3 MUST contain Revision 2
        snap_v3 = get_catalog_snapshot(v3, self.db_path)
        k1_v3 = next(r for r in snap_v3 if r["id"] == "k1")
        self.assertEqual(k1_v3["title"], "Revision 2")


class TestStreamAAdversarialStarsPayments(unittest.IsolatedAsyncioTestCase):
    """Adversarial stress-testing of Polling Telegram Stars payments."""

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "adv_stars_test.db"
        self.settings = AppSettings(
            app_stage="test",
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
        )
        set_settings(self.settings)

        self.user_id = 998877
        create_or_get_user(self.user_id, username="adv_buyer", db_path=self.db_path)
        self.order_id = create_order(
            user_id=self.user_id,
            product_id="sub_month",
            amount_rub=1900.0,
            provider="telegram_stars",
            db_path=self.db_path,
        )

    def tearDown(self):
        set_settings(None)
        self.tmp_dir.cleanup()

    # --- PRE_CHECKOUT_QUERY ADVERSARIAL REJECTIONS ---

    async def test_pre_checkout_rejection_matrix(self):
        """Stress-test pre_checkout_query rejections across all invalid combinations."""
        test_cases = [
            ("unknown_order", "ord_ghost_99999", "XTR", 1000, self.user_id, "Заказ не найден"),
            ("empty_order", "", "XTR", 1000, self.user_id, "Отсутствует идентификатор заказа"),
            ("none_order", None, "XTR", 1000, self.user_id, "Отсутствует идентификатор заказа"),
            ("wrong_currency_rub", self.order_id, "RUB", 1000, self.user_id, "Неверная сумма или валюта"),
            ("wrong_currency_usd", self.order_id, "USD", 1000, self.user_id, "Неверная сумма или валюта"),
            ("wrong_currency_lowercase", self.order_id, "xtr", 1000, self.user_id, "Неверная сумма или валюта"),
            ("wrong_amount_underpaid", self.order_id, "XTR", 999, self.user_id, "Неверная сумма или валюта"),
            ("wrong_amount_overpaid", self.order_id, "XTR", 1001, self.user_id, "Неверная сумма или валюта"),
            ("wrong_amount_zero", self.order_id, "XTR", 0, self.user_id, "Неверная сумма или валюта"),
            ("wrong_amount_negative", self.order_id, "XTR", -1000, self.user_id, "Неверная сумма или валюта"),
            ("user_mismatch", self.order_id, "XTR", 1000, 112233, "Несовпадение пользователя заказа"),
            ("none_user", self.order_id, "XTR", 1000, None, "Несовпадение пользователя заказа"),
        ]

        for name, order_id, currency, amount, user_id, expected_err_sub in test_cases:
            with self.subTest(case=name):
                update = MagicMock()
                query = MagicMock()
                query.id = f"pcq_{name}"
                query.invoice_payload = order_id
                query.currency = currency
                query.total_amount = amount
                if user_id is not None:
                    query.from_user = MagicMock()
                    query.from_user.id = user_id
                else:
                    query.from_user = None
                query.answer = AsyncMock()
                update.pre_checkout_query = query

                await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)

                query.answer.assert_awaited_once()
                args, kwargs = query.answer.call_args
                self.assertFalse(kwargs.get("ok"), f"Case {name} unexpectedly approved!")
                self.assertIn(
                    expected_err_sub.lower(),
                    kwargs.get("error_message", "").lower(),
                    f"Case {name} error message did not match expected substring"
                )

    async def test_pre_checkout_valid_approval(self):
        """Pre-checkout with valid order, matching user, XTR, 1000 Stars must approve ok=True."""
        update = MagicMock()
        query = MagicMock()
        query.id = "pcq_valid_case"
        query.invoice_payload = self.order_id
        query.currency = "XTR"
        query.total_amount = 1000
        query.from_user = MagicMock()
        query.from_user.id = self.user_id
        query.answer = AsyncMock()
        update.pre_checkout_query = query

        await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)
        query.answer.assert_awaited_once_with(ok=True)

    # --- SUCCESSFUL_PAYMENT IDEMPOTENCY & REPLAY ATTACK ---

    async def test_successful_payment_replay_idempotency_stress(self):
        """Stress-test replay attack: sending successful_payment 5 times in a row.

        The expiration date MUST NOT extend by more than the single month,
        and order status must remain 'completed'.
        """
        update = MagicMock()
        msg = MagicMock()
        succ = MagicMock()
        succ.invoice_payload = self.order_id
        succ.currency = "XTR"
        succ.total_amount = 1000
        msg.successful_payment = succ
        msg.from_user = MagicMock()
        msg.from_user.id = self.user_id
        msg.reply_html = AsyncMock()
        update.message = msg

        # Initial delivery of successful payment
        await successful_payment_handler(update, MagicMock(), db_path=self.db_path)

        order_after_1 = get_order(self.db_path, self.order_id)
        self.assertEqual(order_after_1["status"], "completed")

        sub_1 = get_user_subscription(self.db_path, self.user_id)
        self.assertIsNotNone(sub_1)
        initial_expires_at = sub_1["expires_at"]

        # Replay 4 more times
        for replay_idx in range(2, 6):
            await successful_payment_handler(update, MagicMock(), db_path=self.db_path)
            sub_replay = get_user_subscription(self.db_path, self.user_id)
            self.assertEqual(
                sub_replay["expires_at"],
                initial_expires_at,
                f"Replay #{replay_idx} illegally extended expiration date from {initial_expires_at} to {sub_replay['expires_at']}!"
            )

        # Confirm user received replies on all calls without crash
        self.assertEqual(msg.reply_html.await_count, 5)

    async def test_successful_payment_rejects_tampered_payload(self):
        """Successful payment must ignore or safely fail when amount, currency, or user is tampered."""
        # 1. Attacker tries to complete order with wrong currency
        update_wrong_curr = MagicMock()
        msg = MagicMock()
        succ = MagicMock()
        succ.invoice_payload = self.order_id
        succ.currency = "USD"
        succ.total_amount = 1000
        msg.successful_payment = succ
        msg.from_user = MagicMock()
        msg.from_user.id = self.user_id
        update_wrong_curr.message = msg

        await successful_payment_handler(update_wrong_curr, MagicMock(), db_path=self.db_path)
        # Order must STILL be pending
        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending", "Order must not be completed with wrong currency")

        # 2. Attacker tries to complete order with wrong amount
        succ.currency = "XTR"
        succ.total_amount = 10  # underpaid
        await successful_payment_handler(update_wrong_curr, MagicMock(), db_path=self.db_path)
        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending", "Order must not be completed with underpaid amount")

        # 3. Attacker tries to fulfill someone else's order
        succ.total_amount = 1000
        msg.from_user.id = 123456  # wrong user
        await successful_payment_handler(update_wrong_curr, MagicMock(), db_path=self.db_path)
        order = get_order(self.db_path, self.order_id)
        self.assertEqual(order["status"], "pending", "Order must not be completed by wrong user")

    async def test_successful_payment_unknown_order_fails_safely(self):
        """When an unknown order is received in successful_payment, bot replies with support advice and does not crash."""
        update = MagicMock()
        msg = MagicMock()
        succ = MagicMock()
        succ.invoice_payload = "ord_ghost_unknown_9999"
        succ.currency = "XTR"
        succ.total_amount = 1000
        msg.successful_payment = succ
        msg.from_user = MagicMock()
        msg.from_user.id = self.user_id
        msg.reply_html = AsyncMock()
        update.message = msg

        await successful_payment_handler(update, MagicMock(), db_path=self.db_path)

        msg.reply_html.assert_awaited_once()
        text = msg.reply_html.call_args[0][0]
        self.assertIn("Заказ не найден в базе данных", text)
        self.assertIn("/paysupport", text)

        # Confirm user subscription was NOT created
        sub = get_user_subscription(self.db_path, self.user_id)
        self.assertIsNone(sub)

    # --- /PAYSUPPORT CLEAR SUPPORT INSTRUCTIONS ---

    async def test_paysupport_provides_clear_instructions(self):
        """Verify /paysupport command and callback provide transparent terms & refund info."""
        # 1. Command
        update_cmd = MagicMock()
        msg_cmd = MagicMock()
        msg_cmd.reply_html = AsyncMock()
        update_cmd.message = msg_cmd
        update_cmd.callback_query = None

        await paysupport_cmd(update_cmd, MagicMock())
        msg_cmd.reply_html.assert_awaited_once()
        text_cmd = msg_cmd.reply_html.call_args[0][0]

        self.assertIn("Поддержка по оплате и подписке", text_cmd)
        self.assertIn("Telegram Stars", text_cmd)
        self.assertIn("без автоматического продления", text_cmd)
        self.assertIn("/ask", text_cmd)

        # 2. Callback paysupport_cb
        update_cb = MagicMock()
        query_cb = MagicMock()
        query_cb.data = "paysupport_cb"
        query_cb.from_user = MagicMock()
        query_cb.from_user.id = self.user_id
        query_cb.answer = AsyncMock()
        query_cb.edit_message_text = AsyncMock()
        update_cb.callback_query = query_cb
        update_cb.message = None

        await callback_handler(update_cb, MagicMock())
        query_cb.answer.assert_awaited_once()
        query_cb.edit_message_text.assert_awaited_once()
        text_cb = query_cb.edit_message_text.call_args[0][0]

        self.assertIn("Поддержка по оплате и подписке", text_cb)
        self.assertIn("Telegram Stars", text_cb)


if __name__ == "__main__":
    unittest.main()
