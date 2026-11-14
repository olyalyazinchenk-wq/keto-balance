"""
tests/test_subscription_concurrency.py — Concurrency, Lock Resilience & Integrity Stress Harness for Milestone 1.
"""
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import concurrent.futures
import sqlite3
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any

from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import (
    init_db,
    get_db_connection,
    get_user_subscription,
    get_order,
)

TEST_BOT_TOKEN = "111222333:TEST_SUBSCRIPTION_CONCURRENCY_BOT_TOKEN"


class TestSubscriptionConcurrency(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "concurrency_test.db"
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

    def test_concurrent_order_creation_same_user(self):
        """
        Scenario 1.1: 20 concurrent threads creating purchase orders for the same user.
        Must all succeed and generate distinct order IDs without collisions or DB locks.
        """
        user_id = 11001
        headers = self._get_auth_headers_for_user(user_id, "concurrent_buyer")
        num_threads = 20
        barrier = threading.Barrier(num_threads)
        results = []
        errors = []

        def worker():
            try:
                barrier.wait(timeout=5.0)
                resp = self.client.post(
                    "/api/subscription/purchase",
                    headers=headers,
                    json={"product_id": "sub_month", "provider": "demo"},
                )
                results.append((resp.status_code, resp.json()))
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)

        self.assertEqual(len(errors), 0, f"Thread errors: {errors}")
        self.assertEqual(len(results), num_threads)

        status_codes = [r[0] for r in results]
        self.assertTrue(all(code == 200 for code in status_codes), f"Non-200 status codes: {status_codes}")

        order_ids = [r[1]["order_id"] for r in results]
        self.assertEqual(len(set(order_ids)), num_threads, "Collision detected in generated order IDs!")

        # Verify DB records
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM orders WHERE user_id = ?", (user_id,))
            count = cur.fetchone()[0]
            self.assertEqual(count, num_threads, f"Expected {num_threads} orders in DB, found {count}")

    def test_concurrent_confirmation_same_order(self):
        """
        Scenario 1.2: 10 concurrent threads simultaneously confirming the SAME order.
        Tests race condition resilience, locks, and ensuring user subscription is valid.
        """
        user_id = 11002
        headers = self._get_auth_headers_for_user(user_id, "race_confirmer")
        init_resp = self.client.post(
            "/api/subscription/purchase",
            headers=headers,
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(init_resp.status_code, 200)
        order_id = init_resp.json()["order_id"]

        num_threads = 10
        barrier = threading.Barrier(num_threads)
        results = []
        errors = []

        def worker():
            try:
                barrier.wait(timeout=5.0)
                resp = self.client.post(
                    "/api/subscription/confirm-demo",
                    headers=headers,
                    json={"order_id": order_id},
                )
                results.append((resp.status_code, resp.json()))
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=worker) for _ in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)

        self.assertEqual(len(errors), 0, f"Thread errors: {errors}")
        self.assertEqual(len(results), num_threads)

        # None should be 500
        for code, data in results:
            self.assertIn(code, (200, 400, 409), f"Unexpected status {code}: {data}")

        # Check final subscription state
        sub = get_user_subscription(self.db_path, user_id)
        self.assertIsNotNone(sub)
        self.assertEqual(sub["tier"], "sub_month")
        self.assertEqual(sub["status"], "active")

        # Verify orders table has only 1 row for this order, marked completed
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT status FROM orders WHERE order_id = ?", (order_id,))
            rows = cur.fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["status"], "completed")

    def test_order_double_confirmation_replay(self):
        """
        Scenario 1.3: Empirical test of repeating confirmation on an already-completed order.
        Observes behavior: does it re-extend expiration or behave idempotently?
        """
        user_id = 11003
        headers = self._get_auth_headers_for_user(user_id, "replay_tester")
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

        # Wait a small delay to observe expiration timestamp difference
        time.sleep(1.1)

        # Confirm 2 (Replay)
        conf2 = self.client.post(
            "/api/subscription/confirm-demo",
            headers=headers,
            json={"order_id": order_id},
        )
        # Note: whether it returns 200 or 400/409, capture empirical behavior
        if conf2.status_code == 200:
            exp2 = conf2.json()["expires_at"]
            # Record whether expiration timestamp shifted
            print(f"[OBSERVATION] Replaying confirmed order returned 200: exp1={exp1}, exp2={exp2}")

    def test_concurrent_purchase_and_confirmation_different_tiers(self):
        """
        Scenario 1.4: User creates two orders for different products simultaneously,
        and confirms both concurrently.
        """
        user_id = 11004
        headers = self._get_auth_headers_for_user(user_id, "multi_tier_user")

        resp1 = self.client.post("/api/subscription/purchase", headers=headers, json={"product_id": "sub_month"})
        resp2 = self.client.post("/api/subscription/purchase", headers=headers, json={"product_id": "vip_care"})
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(resp2.status_code, 200)
        order1 = resp1.json()["order_id"]
        order2 = resp2.json()["order_id"]

        barrier = threading.Barrier(2)
        results = []

        def confirm_worker(oid):
            barrier.wait(timeout=5.0)
            r = self.client.post("/api/subscription/confirm-demo", headers=headers, json={"order_id": oid})
            results.append((oid, r.status_code, r.json()))

        t1 = threading.Thread(target=confirm_worker, args=(order1,))
        t2 = threading.Thread(target=confirm_worker, args=(order2,))
        t1.start()
        t2.start()
        t1.join(timeout=10.0)
        t2.join(timeout=10.0)

        self.assertEqual(len(results), 2)
        for _, status, data in results:
            self.assertEqual(status, 200, f"Failed confirmation: {data}")

        # Final subscription must be active and valid
        sub = get_user_subscription(self.db_path, user_id)
        self.assertIsNotNone(sub)
        self.assertEqual(sub["status"], "active")
        self.assertIn(sub["tier"], ("sub_month", "vip_care"))

    def test_sqlite_wal_burst_concurrency(self):
        """
        Scenario 2: High-concurrency mixed burst across 30 threads (150 requests total).
        Tests SQLite WAL lock resilience, no unhandled 'database is locked', and DB integrity.
        """
        num_users = 10
        user_headers = {}
        for uid in range(12001, 12001 + num_users):
            user_headers[uid] = self._get_auth_headers_for_user(uid, f"wal_user_{uid}")

        num_threads = 30
        requests_per_thread = 5
        barrier = threading.Barrier(num_threads)
        errors = []
        status_counts = {}
        lock = threading.Lock()

        def burst_worker(tid):
            uid = 12001 + (tid % num_users)
            headers = user_headers[uid]
            try:
                barrier.wait(timeout=5.0)
            except Exception:
                pass

            for i in range(requests_per_thread):
                op = (tid + i) % 3
                try:
                    if op == 0:
                        # Read
                        r = self.client.get("/api/subscription", headers=headers)
                    elif op == 1:
                        # Write purchase
                        r = self.client.post(
                            "/api/subscription/purchase",
                            headers=headers,
                            json={"product_id": "sub_month", "provider": "demo"},
                        )
                    else:
                        # Write demo session
                        r = self.client.get(f"/api/demo-session?demo_user={uid}&premium=1")

                    with lock:
                        status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
                        if r.status_code >= 500:
                            errors.append((r.status_code, r.text))
                except Exception as e:
                    with lock:
                        errors.append(("EXCEPTION", str(e)))

        threads = [threading.Thread(target=burst_worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20.0)

        total_requests = num_threads * requests_per_thread
        self.assertEqual(len(errors), 0, f"Observed errors during WAL burst: {errors}")
        self.assertEqual(sum(status_counts.values()), total_requests)
        self.assertEqual(status_counts.get(200, 0), total_requests, f"Non-200 responses: {status_counts}")

        # Check SQLite WAL mode and integrity
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode")
            j_mode = cur.fetchone()[0]
            self.assertEqual(j_mode.lower(), "wal")

            cur.execute("PRAGMA integrity_check")
            integrity = cur.fetchall()
            self.assertEqual(len(integrity), 1)
            self.assertEqual(integrity[0][0], "ok")

    def test_multi_session_consistency_read_after_write(self):
        """
        Scenario 3: Multi-session consistency.
        User 1084557944 has 4 simultaneous sessions.
        Session 1 purchases & activates premium.
        Sessions 2, 3, 4 immediately query /api/subscription and must see is_premium=True instantly.
        """
        demo_user_id = 1084557944
        # Create 4 distinct sessions for the same user
        sessions = []
        for i in range(4):
            user_info = {"id": demo_user_id, "first_name": "Olga", "username": "demo_olga"}
            init_data = generate_telegram_init_data(user_info, TEST_BOT_TOKEN)
            resp = self.client.post("/api/session", json={"init_data": init_data})
            self.assertEqual(resp.status_code, 200)
            token = resp.json()["session_token"]
            sessions.append({"Authorization": f"Bearer {token}"})

        # All 4 sessions check subscription: must initially be free
        for s in sessions:
            r = self.client.get("/api/subscription", headers=s)
            self.assertEqual(r.status_code, 200)
            self.assertFalse(r.json()["is_premium"])

        # Session 0 initiates and confirms purchase
        p_resp = self.client.post(
            "/api/subscription/purchase",
            headers=sessions[0],
            json={"product_id": "sub_month", "provider": "demo"},
        )
        self.assertEqual(p_resp.status_code, 200)
        order_id = p_resp.json()["order_id"]

        c_resp = self.client.post(
            "/api/subscription/confirm-demo",
            headers=sessions[0],
            json={"order_id": order_id},
        )
        self.assertEqual(c_resp.status_code, 200)
        self.assertTrue(c_resp.json()["is_premium"])

        # Immediately, sessions 1, 2, 3 query /api/subscription concurrently
        barrier = threading.Barrier(3)
        read_results = []

        def session_reader(s_headers):
            barrier.wait(timeout=5.0)
            r = self.client.get("/api/subscription", headers=s_headers)
            read_results.append((r.status_code, r.json()))

        threads = [threading.Thread(target=session_reader, args=(sessions[i],)) for i in range(1, 4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10.0)

        self.assertEqual(len(read_results), 3)
        for code, data in read_results:
            self.assertEqual(code, 200)
            self.assertTrue(data["is_premium"], f"Session failed to see updated premium: {data}")
            self.assertEqual(data["tier"], "sub_month")
            self.assertEqual(data["status"], "active")
            self.assertIsNotNone(data["expires_at"])

    def test_cross_user_concurrency_isolation(self):
        """
        Scenario 4: 10 distinct users simultaneously purchasing and confirming subscriptions in parallel.
        Verify no cross-user pollution or state leakage.
        """
        users = []
        for i in range(10):
            uid = 13000 + i
            tier = "sub_month" if i % 2 == 0 else "vip_care"
            headers = self._get_auth_headers_for_user(uid, f"isolated_user_{uid}")
            users.append((uid, tier, headers))

        barrier = threading.Barrier(10)
        errors = []

        def user_flow(uid, target_tier, headers):
            try:
                barrier.wait(timeout=5.0)
                # Purchase
                p = self.client.post(
                    "/api/subscription/purchase",
                    headers=headers,
                    json={"product_id": target_tier, "provider": "demo"},
                )
                if p.status_code != 200:
                    errors.append((uid, "purchase", p.status_code, p.text))
                    return
                oid = p.json()["order_id"]

                # Confirm
                c = self.client.post(
                    "/api/subscription/confirm-demo",
                    headers=headers,
                    json={"order_id": oid},
                )
                if c.status_code != 200:
                    errors.append((uid, "confirm", c.status_code, c.text))
                    return

                # Read
                g = self.client.get("/api/subscription", headers=headers)
                data = g.json()
                if not data["is_premium"] or data["tier"] != target_tier or data["user_id"] != uid:
                    errors.append((uid, "verify", data))
            except Exception as ex:
                errors.append((uid, "exception", str(ex)))

        threads = [threading.Thread(target=user_flow, args=u) for u in users]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15.0)

        self.assertEqual(len(errors), 0, f"Cross-user concurrency errors: {errors}")


if __name__ == "__main__":
    unittest.main()
