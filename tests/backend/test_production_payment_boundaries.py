"""
tests/backend/test_production_payment_boundaries.py
Верификация границ платежей в production / staging и защита от несанкционированного получения Premium.
"""
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.app_db import init_db, get_db_connection
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "123456789:TEST_BOT_TOKEN_FOR_PRODUCTION_TESTS"
USER_ID = 555123456


class TestProductionPaymentBoundaries(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "prod_payment_test.db"
        init_db(self.db_path)
        self.dist_dir = Path(self.tmp_dir.name) / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)
        (self.dist_dir / "index.html").write_text("<html><body>Keto Balance</body></html>", encoding="utf-8")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def _login(self, client: TestClient, user_id: int = USER_ID) -> str:
        data = {"id": user_id, "first_name": "TestUser", "username": "test_user"}
        init_data = generate_telegram_init_data(data, TEST_TOKEN)
        resp = client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp.status_code, 200, f"Session creation failed: {resp.text}")
        token = resp.json().get("session_token")
        self.assertTrue(token, "Session token is missing")
        return token

    def test_demo_confirmation_forbidden_in_production(self):
        """В app_stage='production' вызов /api/subscription/confirm-demo обязан возвращать 403 Forbidden."""
        settings = AppSettings(
            app_stage="production",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)
        token = self._login(client)

        # Создаём заказ
        p_resp = client.post(
            "/api/subscription/purchase",
            json={"product_id": "sub_month"},
            headers={"Authorization": f"Bearer {token}"},
        )
        # Если в production демо-покупка запрещена или создана в pending:
        if p_resp.status_code == 200:
            order_id = p_resp.json()["order_id"]
            # Пытаемся подтвердить через демо-эндпоинт
            c_resp = client.post(
                "/api/subscription/confirm-demo",
                json={"order_id": order_id},
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertIn(
                c_resp.status_code,
                [403, 404],
                f"confirm-demo must be forbidden in production, got {c_resp.status_code}: {c_resp.text}",
            )

        # Проверяем в БД: подписка пользователя НЕ должна стать active premium
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT tier, status FROM subscriptions WHERE user_id = ?", (USER_ID,))
            row = cur.fetchone()
            if row:
                self.assertNotEqual(row["status"], "active")

    def test_demo_confirmation_forbidden_in_staging(self):
        """В app_stage='staging' при allow_demo_auth=False демо-активация также заблокирована."""
        settings = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)
        token = self._login(client)

        p_resp = client.post(
            "/api/subscription/purchase",
            json={"product_id": "sub_month"},
            headers={"Authorization": f"Bearer {token}"},
        )
        if p_resp.status_code == 200:
            order_id = p_resp.json()["order_id"]
            c_resp = client.post(
                "/api/subscription/confirm-demo",
                json={"order_id": order_id},
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertIn(
                c_resp.status_code,
                [403, 404],
                f"confirm-demo must be forbidden in staging, got {c_resp.status_code}: {c_resp.text}",
            )

    def test_corrupt_or_missing_expires_at_denies_premium(self):
        """Поврежденная или пустая дата expires_at не должна давать статус is_premium=True."""
        settings = AppSettings(
            app_stage="production",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)
        token = self._login(client)

        # Записываем в базу повреждённую подписку
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO subscriptions (user_id, tier, status, expires_at, updated_at)
                VALUES (?, 'sub_month', 'active', 'CORRUPT_INVALID_DATE', CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    tier = excluded.tier,
                    status = excluded.status,
                    expires_at = excluded.expires_at
                """,
                (USER_ID,),
            )

        resp = client.get("/api/subscription", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["is_premium"], "Corrupt expires_at must NOT grant premium entitlement")

    def test_production_available_products_is_strictly_single_monthly_subscription(self):
        """В production доступен только один утверждённый тариф sub_month (без plateau_guide и vip_care)."""
        settings = AppSettings(
            app_stage="production",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)
        token = self._login(client)

        resp = client.get("/api/subscription", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200)
        products = resp.json().get("available_products", [])
        product_ids = [p["id"] for p in products]

        self.assertIn("sub_month", product_ids, "sub_month must be present")
        self.assertNotIn("plateau_guide", product_ids, "plateau_guide must be removed from available offerings")
        self.assertNotIn("vip_care", product_ids, "vip_care must be removed from available offerings")
        self.assertEqual(len(products), 1, "There must be strictly 1 subscription product offered in release")

    def test_historical_orders_preserved_for_removed_products(self):
        """Исторические заказы со старыми ID продуктов (plateau_guide) не удаляются и не ломают систему."""
        from bot.app_db import create_or_get_user
        create_or_get_user(USER_ID, db_path=self.db_path)
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO orders (order_id, user_id, product_id, amount_rub, provider, status)
                VALUES ('ord_hist_1', ?, 'plateau_guide', 490.0, 'demo', 'completed')
                """,
                (USER_ID,),
            )

        settings = AppSettings(
            app_stage="production",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)
        token = self._login(client)

        # GET /api/subscription works fine
        resp = client.get("/api/subscription", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200)

        # Verify historical order still exists in DB
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM orders WHERE order_id = 'ord_hist_1'")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["product_id"], "plateau_guide")


if __name__ == "__main__":
    unittest.main()
