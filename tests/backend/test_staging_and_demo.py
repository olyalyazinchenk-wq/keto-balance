import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.app_db import init_db
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "111222333:TEST_STAGING_BOT_TOKEN_FOR_ALLOWLIST"
OWNER_ID = 1084557944
NON_OWNER_ID = 999999


class TestStagingAndDemo(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "staging_test.db"
        init_db(self.db_path)
        self.dist_dir = Path(self.tmp_dir.name)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_staging_owner_allowed_and_non_owner_forbidden(self):
        settings = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)

        # 1. Owner logs in with valid Telegram init_data -> 200 OK
        owner_data = {"id": OWNER_ID, "first_name": "Ольга", "username": "olga_owner"}
        owner_init = generate_telegram_init_data(owner_data, TEST_TOKEN)
        resp = client.post("/api/session", json={"init_data": owner_init})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["user_id"], OWNER_ID)

        # 2. Non-owner logs in with valid Telegram init_data -> 403 Forbidden
        intruder_data = {"id": NON_OWNER_ID, "first_name": "Intruder", "username": "intruder"}
        intruder_init = generate_telegram_init_data(intruder_data, TEST_TOKEN)
        resp_intruder = client.post("/api/session", json={"init_data": intruder_init})
        self.assertEqual(resp_intruder.status_code, 403)
        self.assertIn("owner allowlist", resp_intruder.json()["detail"])

        # 3. Verify non-owner was NOT inserted into users DB table
        import sqlite3
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (NON_OWNER_ID,))
        row = cursor.fetchone()
        conn.close()
        self.assertIsNone(row, "Non-owner ID must NOT exist in the users table")

    def test_staging_disables_docs_and_openapi_without_affecting_other_stages(self):
        # Create dummy index.html in dist_dir to test SPA serving
        (self.dist_dir / "index.html").write_text("<!DOCTYPE html><html><body>MiniApp</body></html>", encoding="utf-8")

        # 1. Staging stage: docs, redoc, openapi.json MUST return 404
        settings_staging = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app_staging = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings_staging)
        client_staging = TestClient(app_staging)

        for path in ("/docs", "/docs/", "/redoc", "/redoc/", "/openapi.json"):
            resp = client_staging.get(path)
            self.assertEqual(resp.status_code, 404, f"Staging route {path} must return 404, got {resp.status_code}")

        # Mini App SPA serving continues to work in staging
        spa_resp = client_staging.get("/")
        self.assertEqual(spa_resp.status_code, 200)
        self.assertIn("MiniApp", spa_resp.text)

        # /api/session continues to work in staging
        owner_data = {"id": OWNER_ID, "first_name": "Ольга"}
        owner_init = generate_telegram_init_data(owner_data, TEST_TOKEN)
        session_resp = client_staging.post("/api/session", json={"init_data": owner_init})
        self.assertEqual(session_resp.status_code, 200)
        self.assertIn("session_token", session_resp.json())

        # 2. Working / non-staging environment (pilot): docs remain available
        settings_pilot = AppSettings(
            app_stage="pilot",
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app_pilot = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings_pilot)
        client_pilot = TestClient(app_pilot)

        self.assertEqual(client_pilot.get("/docs").status_code, 200)
        self.assertEqual(client_pilot.get("/openapi.json").status_code, 200)

    def test_demo_session_endpoint_active_only_when_allowed_in_test_stage(self):
        # 1. Test stage with allow_demo_auth=True
        settings_test = AppSettings(
            app_stage="test",
            telegram_bot_token="fake_test_token",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=True,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app_test = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings_test)
        client_test = TestClient(app_test)

        resp_demo = client_test.get(f"/api/demo-session?demo_user={OWNER_ID}")
        self.assertEqual(resp_demo.status_code, 200)
        data = resp_demo.json()
        self.assertEqual(data["user_id"], OWNER_ID)
        self.assertIn("session_token", data)

        # Non-owner demo request with allowlist active -> 403 Forbidden
        resp_demo_non_owner = client_test.get(f"/api/demo-session?demo_user={NON_OWNER_ID}")
        self.assertEqual(resp_demo_non_owner.status_code, 403)

        # 2. Staging stage with allow_demo_auth=False -> 404 Not Found
        settings_staging = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app_staging = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings_staging)
        client_staging = TestClient(app_staging)

        resp_staging_demo = client_staging.get(f"/api/demo-session?demo_user={OWNER_ID}")
        self.assertEqual(resp_staging_demo.status_code, 404, "demo-session must not exist in staging")

    def test_get_user_marks_shopping_stale_when_menu_contains_revoked_recipe(self):
        mock_catalog = {
            "recipes": [
                {"id": "k1", "title": "R1", "cat": "breakfast", "time": 10, "serv": 1, "mode": "keto", "ing": [["Яйцо", "1 шт."]], "steps": ["1"]}
            ],
            "released_ids": ["k1"],
            "test_only": True,
        }
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token=TEST_TOKEN,
            allow_demo_auth=True,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=settings,
            catalog_provider=lambda: mock_catalog,
        )
        client = TestClient(app)

        # Create demo session
        s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}")
        token = s_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Put user with revoked recipe 'k99' in menu (saving via bypass or raw state)
        from bot.app_db import save_pilot_user
        state_with_revoked = {
            "schema_version": 1,
            "menu": {
                "numDays": 1,
                "meals": 1,
                "portion": 1,
                "mode": "keto",
                "created": 1730390400000,
                "days": [{"date": "2026-10-31", "slots": {"breakfast": "k99"}}],
            },
            "selected_date": "2026-10-31",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 1,
            "shopping_stale": False,
        }
        save_pilot_user(OWNER_ID, {"schema_version": 1, "expected_revision": 0, "profile": None, "state": state_with_revoked}, db_path=self.db_path)

        # GET /api/user should mark shopping_stale = True because 'k99' is not in released recipes
        u_resp = client.get("/api/user", headers=headers)
        self.assertEqual(u_resp.status_code, 200)
        u_data = u_resp.json()
        self.assertTrue(u_data["state"]["shopping_stale"], "State must have shopping_stale=True when menu has revoked recipe")

    def test_staging_owner_allowlist_enforced_on_bearer_token(self):
        # Even if a non-owner session already exists in the reused database,
        # Bearer access in owner-only mode must return 403 Forbidden!
        from bot.app_db import create_session
        non_owner_token = "secret-non-owner-token-already-in-db"
        create_session(NON_OWNER_ID, non_owner_token, expires_in_seconds=3600, db_path=self.db_path)

        settings = AppSettings(
            app_stage="staging",
            telegram_bot_token=TEST_TOKEN,
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)

        headers = {"Authorization": f"Bearer {non_owner_token}"}
        # 1. /api/session with non-owner Bearer token -> 403 Forbidden
        s_resp = client.get("/api/session", headers=headers)
        self.assertEqual(s_resp.status_code, 403)
        self.assertIn("owner allowlist", s_resp.json()["detail"])

        # 2. /api/user with non-owner Bearer token -> 403 Forbidden
        u_resp = client.get("/api/user", headers=headers)
        self.assertEqual(u_resp.status_code, 403)
        self.assertIn("owner allowlist", u_resp.json()["detail"])

    def test_session_ttl_uses_session_max_lifetime_seconds(self):
        # When session_max_lifetime_seconds is set (e.g. 5 seconds),
        # session expires according to that TTL rather than 86400
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token="test_token",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=True,
            session_max_lifetime_seconds=5,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=settings)
        client = TestClient(app)

        resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}")
        self.assertEqual(resp.status_code, 200)
        token = resp.json()["session_token"]

        from bot.app_db import get_session_user
        session_info = get_session_user(token, db_path=self.db_path)
        self.assertIsNotNone(session_info)
        import time
        remaining = session_info["expires_at"] - time.time()
        self.assertLessEqual(remaining, 6.0)
        self.assertGreater(remaining, 0.0)

    def test_partial_save_marks_shopping_stale(self):
        # When shopping PUT succeeds for 1-day items, but user PUT gets 409 CAS rejection
        # (user state remains 3 days), GET /api/user must return shopping_stale: True!
        from bot.app_db import save_pilot_user
        mock_catalog = {
            "recipes": [
                {"id": "k1", "title": "R1", "cat": "breakfast", "time": 10, "serv": 1, "mode": "keto", "ing": [["Яйцо", "1 шт."]], "steps": ["1"]},
                {"id": "k2", "title": "R2", "cat": "lunch", "time": 15, "serv": 1, "mode": "keto", "ing": [["Мясо", "100 г"]], "steps": ["1"]},
            ],
            "released_ids": ["k1", "k2"],
            "test_only": True,
        }
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token="test_token",
            allow_demo_auth=True,
            owner_allowlist=frozenset([OWNER_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=settings,
            catalog_provider=lambda: mock_catalog,
        )
        client = TestClient(app)

        s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}&premium=1")
        token = s_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Save 2-day menu (recipes k1, k2)
        initial_state = {
            "schema_version": 1,
            "menu": {
                "numDays": 2,
                "meals": 1,
                "portion": 1,
                "mode": "keto",
                "created": 1730390400000,
                "days": [
                    {"date": "2026-10-31", "slots": {"breakfast": "k1"}},
                    {"date": "2026-11-01", "slots": {"breakfast": "k2"}},
                ],
            },
            "selected_date": "2026-10-31",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 1,
            "shopping_stale": False,
        }
        u_write = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 3}},
            "state": initial_state,
        })
        self.assertEqual(u_write.status_code, 200)

        # 2. Put shopping with items only for R1 (e.g. 1-day shopping list)
        shop_write = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "items": [
                {
                    "id": "shop-agg-egg",
                    "name": "Яйцо",
                    "amountLabel": "1 шт.",
                    "department": "dairy",
                    "linkedRecipeTitles": ["R1"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                }
            ],
        })
        self.assertEqual(shop_write.status_code, 200)

        # 3. GET /api/user should detect that shopping linked titles ["R1"] does not match
        # menu recipes ["R1", "R2"], and mark shopping_stale = True!
        u_check = client.get("/api/user", headers=headers)
        self.assertEqual(u_check.status_code, 200)
        self.assertTrue(u_check.json()["state"]["shopping_stale"], "Shopping must be marked stale after partial save mismatch")

    def test_launcher_main_entrypoints_execute_cleanly(self):
        import sys
        from unittest.mock import patch, MagicMock

        # Create dummy dist directory with index.html
        (self.dist_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        catalog_fixture = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "pilot" / "catalog.json"

        # 1. Preview launcher main() with synthetic argv
        from scripts import run_local_preview
        preview_argv = [
            "run_local_preview.py",
            "--host", "127.0.0.1",
            "--port", "18081",
            "--dist", str(self.dist_dir),
            "--db", str(self.db_path),
            "--catalog", str(catalog_fixture),
            "--lifetime", "10",
        ]
        with patch.object(sys, "argv", preview_argv):
            with patch("uvicorn.Server.run") as mock_run:
                mock_run.return_value = None
                run_local_preview.main()
                self.assertEqual(mock_run.call_count, 1)

        # 2. Staging launcher main() with synthetic argv
        from scripts import run_staging
        staging_argv = [
            "run_staging.py",
            "--token", TEST_TOKEN,
            "--host", "127.0.0.1",
            "--port", "18082",
            "--dist", str(self.dist_dir),
            "--db", str(self.db_path),
            "--catalog", str(catalog_fixture),
            "--lifetime", "10",
        ]
        with patch.object(sys, "argv", staging_argv):
            with patch("uvicorn.Server.run") as mock_run:
                mock_run.return_value = None
                run_staging.main()
                self.assertEqual(mock_run.call_count, 1)

    def test_preview_launcher_refuses_non_loopback_host(self):
        import sys
        from unittest.mock import patch
        from scripts import run_local_preview

        preview_argv = [
            "run_local_preview.py",
            "--host", "0.0.0.0",
            "--port", "18080",
            "--dist", str(self.dist_dir),
            "--db", str(self.db_path),
        ]
        with patch.object(sys, "argv", preview_argv):
            with self.assertRaises(SystemExit) as cm:
                run_local_preview.main()
            self.assertEqual(cm.exception.code, 1)


    def test_partial_save_marks_shopping_stale_when_items_empty(self):
        mock_catalog = {
            "recipes": [
                {"id": "k1", "title": "R1", "cat": "breakfast", "time": 10, "serv": 1, "mode": "keto", "ing": [["Яйцо", "1 шт."]], "steps": ["1"]},
            ],
            "released_ids": ["k1"],
            "test_only": True,
        }
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token="test_token",
            allow_demo_auth=True,
            owner_allowlist=frozenset([OWNER_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=settings,
            catalog_provider=lambda: mock_catalog,
        )
        client = TestClient(app)

        s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}&premium=1")
        token = s_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Save user menu with recipe k1
        initial_state = {
            "schema_version": 1,
            "menu": {
                "numDays": 1,
                "meals": 1,
                "portion": 1,
                "mode": "keto",
                "created": 1730390400000,
                "days": [{"date": "2026-10-31", "slots": {"breakfast": "k1"}}],
            },
            "selected_date": "2026-10-31",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 1,
            "shopping_stale": False,
        }
        u_write = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 1}},
            "state": initial_state,
        })
        self.assertEqual(u_write.status_code, 200)

        # PUT empty shopping list independently -> save_pilot_shopping marks user state shopping_stale
        s_write = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "items": [],
        })
        self.assertEqual(s_write.status_code, 200)

        # GET /api/user should return shopping_stale = True
        u_check = client.get("/api/user", headers=headers)
        self.assertEqual(u_check.status_code, 200)
        self.assertTrue(u_check.json()["state"]["shopping_stale"], "Shopping must be marked stale when shopping list is saved independently")

    def test_two_session_interleaving_preserves_durable_stale(self):
        """Reviewer R1 / F2 regression: durable stale cannot be erased by an unrelated cached snapshot."""
        mock_catalog = {
            "recipes": [
                {"id": "k1", "title": "R1", "cat": "breakfast", "time": 10, "serv": 1, "mode": "keto", "ing": [["Яйцо", "1 шт."]], "steps": ["1"]},
                {"id": "k2", "title": "R2", "cat": "lunch", "time": 15, "serv": 1, "mode": "keto", "ing": [["Сыр", "50 г"]], "steps": ["2"]},
            ],
            "released_ids": ["k1", "k2"],
            "test_only": True,
        }
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token="test_token",
            allow_demo_auth=True,
            owner_allowlist=frozenset([OWNER_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=settings,
            catalog_provider=lambda: mock_catalog,
        )
        client = TestClient(app)

        s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}&premium=1")
        token = s_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Initial synced state: menu on 2 days, multiplier 1, matching x1 shopping, stale=false
        menu_state = {
            "schema_version": 1,
            "menu": {
                "numDays": 2,
                "meals": 1,
                "portion": 1,
                "mode": "keto",
                "created": 1730390400000,
                "days": [
                    {"date": "2026-10-31", "slots": {"breakfast": "k1"}},
                    {"date": "2026-11-01", "slots": {"breakfast": "k2"}},
                ],
            },
            "selected_date": "2026-10-31",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 1,
            "shopping_stale": False,
        }
        u_init = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 3}},
            "state": menu_state,
        })
        self.assertEqual(u_init.status_code, 200)
        user_rev_1 = u_init.json()["revision"]

        # Initial x1 shopping
        shop_init = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "items": [
                {"id": "shop-agg-egg", "name": "Яйцо", "amountLabel": "1 шт.", "department": "dairy", "linkedRecipeTitles": ["R1"], "alreadyHave": False, "checkedInStore": False},
                {"id": "shop-agg-cheese", "name": "Сыр", "amountLabel": "50 г", "department": "dairy", "linkedRecipeTitles": ["R2"], "alreadyHave": False, "checkedInStore": False},
            ],
        })
        self.assertEqual(shop_init.status_code, 200)
        shop_rev_1 = shop_init.json()["revision"]

        # 2. Session A loads user state at user_rev_1 (or after an innocuous update, say user revision 2)
        # Session A selects day 2
        cached_state_a = dict(menu_state)
        cached_state_a["selected_date"] = "2026-11-01"
        u_a_save = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": user_rev_1,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 3}},
            "state": cached_state_a,
        })
        self.assertEqual(u_a_save.status_code, 200)
        user_rev_2 = u_a_save.json()["revision"]

        # Session A holds cached state with revision user_rev_2 and shopping_stale=False:
        snapshot_session_a = dict(cached_state_a)
        snapshot_session_a["selected_date"] = "2026-10-31" # changes day back

        # 3. Session B saves shopping x2
        shop_b_save = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": shop_rev_1,
            "items": [
                {"id": "shop-agg-egg", "name": "Яйцо", "amountLabel": "2 шт.", "department": "dairy", "linkedRecipeTitles": ["R1"], "alreadyHave": False, "checkedInStore": False},
                {"id": "shop-agg-cheese", "name": "Сыр", "amountLabel": "100 г", "department": "dairy", "linkedRecipeTitles": ["R2"], "alreadyHave": False, "checkedInStore": False},
            ],
        })
        self.assertEqual(shop_b_save.status_code, 200)

        # 4. Session B second PUT user receives 409 Conflict (e.g. due to using old revision)
        u_b_fail = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": user_rev_1, # stale revision
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 3}},
            "state": {**menu_state, "shopping_batches": 2},
        })
        self.assertEqual(u_b_fail.status_code, 409)

        # At this step, GET /api/user must return shopping_stale = True
        check_after_partial = client.get("/api/user", headers=headers).json()
        self.assertTrue(check_after_partial["state"]["shopping_stale"], "Durable stale must be set after partial save")

        # 5. Session A sends ordinary day change with its cached state (which had shopping_stale=False) and expected_revision=user_rev_2
        u_a_day_change = client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": user_rev_2,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 3}},
            "state": snapshot_session_a, # has shopping_stale=False
        })
        self.assertEqual(u_a_day_change.status_code, 200)

        # 6. GET /api/user must STILL return shopping_stale = True! Session A's cached state cannot clear durable stale.
        final_check = client.get("/api/user", headers=headers).json()
        self.assertEqual(final_check["state"]["shopping_batches"], 1)
        self.assertTrue(final_check["state"]["shopping_stale"], "Shopping must remain durably stale; Session A must not erase stale")

    def test_checkbox_only_shopping_update_does_not_mark_stale(self):
        """Reviewer F2 regression: toggling checkmarks in store must NOT mark shopping stale."""
        mock_catalog = {
            "recipes": [
                {"id": "k1", "title": "R1", "cat": "breakfast", "time": 10, "serv": 1, "mode": "keto", "ing": [["Яйцо", "1 шт."]], "steps": ["1"]},
            ],
            "released_ids": ["k1"],
            "test_only": True,
        }
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token="test_token",
            allow_demo_auth=True,
            owner_allowlist=frozenset([OWNER_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=settings,
            catalog_provider=lambda: mock_catalog,
        )
        client = TestClient(app)

        s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}&premium=1")
        token = s_resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Save user menu
        menu_state = {
            "schema_version": 1,
            "menu": {
                "numDays": 1,
                "meals": 1,
                "portion": 1,
                "mode": "keto",
                "created": 1730390400000,
                "days": [{"date": "2026-10-31", "slots": {"breakfast": "k1"}}],
            },
            "selected_date": "2026-10-31",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 1,
            "shopping_stale": False,
        }
        client.put("/api/user", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "profile": {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30, "mealsPerDay": 2, "planDays": 1}},
            "state": menu_state,
        })

        # 2. Save matching shopping list
        s_resp = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": 0,
            "items": [
                {"id": "shop-agg-egg", "name": "Яйцо", "amountLabel": "1 шт.", "department": "dairy", "linkedRecipeTitles": ["R1"], "alreadyHave": False, "checkedInStore": False},
            ],
        })
        self.assertEqual(s_resp.status_code, 200)

        # Verify not stale
        self.assertFalse(client.get("/api/user", headers=headers).json()["state"]["shopping_stale"])

        # 3. Toggle checkedInStore = True (same id, name, amountLabel)
        s_toggle = client.put("/api/shopping", headers=headers, json={
            "schema_version": 1,
            "expected_revision": s_resp.json()["revision"],
            "items": [
                {"id": "shop-agg-egg", "name": "Яйцо", "amountLabel": "1 шт.", "department": "dairy", "linkedRecipeTitles": ["R1"], "alreadyHave": False, "checkedInStore": True},
            ],
        })
        self.assertEqual(s_toggle.status_code, 200)

        # 4. Verify STILL NOT STALE!
        u_after_check = client.get("/api/user", headers=headers).json()
        self.assertFalse(u_after_check["state"]["shopping_stale"], "Toggling checkmarks must NOT mark shopping stale!")

    def test_shopping_consistency_seven_scenarios(self):
        """Reviewer R1 regression: verifies all 7 positive and negative consistency scenarios."""
        from bot.catalog import is_shopping_consistent_with_menu

        class MockService:
            def __init__(self, c_data):
                self.data = c_data
            def get_catalog_data(self):
                return self.data
            def get_released_recipes(self):
                rel = set(self.data.get("released_ids", []))
                return [r for r in self.data.get("recipes", []) if r.get("id") in rel]
            def get_recipe_by_id(self, rid):
                for r in self.data.get("recipes", []):
                    if r.get("id") == rid:
                        return r
                return None

        inputs_path = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "pilot" / "consistency-inputs.json"
        with open(inputs_path, "r", encoding="utf-8") as f:
            cases = json.load(f)

        for case in cases:
            # 1. Direct predicate check
            svc = MockService(case["catalog"])
            res = is_shopping_consistent_with_menu(
                case["state"]["menu"],
                case["state"]["shopping_batches"],
                case["items"],
                svc
            )
            self.assertEqual(
                res,
                case["expected_consistent"],
                f"Direct predicate '{case['name']}' failed: expected {case['expected_consistent']}, got {res}"
            )

            # 2. In-process FastAPI + SQLite roundtrip check
            case_db = Path(self.tmp_dir.name) / f"case_{case['name']}.db"
            init_db(case_db)
            settings = AppSettings(
                app_stage="test",
                telegram_bot_token="test_token",
                allow_demo_auth=True,
                owner_allowlist=frozenset([OWNER_ID]),
                db_path=case_db,
                dist_dir=self.dist_dir,
            )
            app = create_app(
                dist_dir=self.dist_dir,
                db_path=case_db,
                settings=settings,
                catalog_provider=lambda c=case["catalog"]: c,
            )
            client = TestClient(app)
            s_resp = client.get(f"/api/demo-session?demo_user={OWNER_ID}&premium=1")
            token = s_resp.json()["session_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Put user state
            u_res1 = client.put("/api/user", headers=headers, json={
                "schema_version": 1,
                "expected_revision": 0,
                "profile": case["profile"],
                "state": case["state"],
            })
            self.assertEqual(u_res1.status_code, 200)

            # Put shopping items
            s_res1 = client.put("/api/shopping", headers=headers, json={
                "schema_version": 1,
                "expected_revision": 0,
                "items": case["items"],
            })
            self.assertEqual(s_res1.status_code, 200)

            # Put paired user state
            u_res2 = client.put("/api/user", headers=headers, json={
                "schema_version": 1,
                "expected_revision": u_res1.json()["revision"],
                "profile": case["profile"],
                "state": case["state"],
            })
            self.assertEqual(u_res2.status_code, 200)

            # Check GET /api/user reflects expected shopping_stale
            check = client.get("/api/user", headers=headers)
            self.assertEqual(check.status_code, 200)
            actual_stale = check.json()["state"]["shopping_stale"]
            expected_stale = not case["expected_consistent"]
            self.assertEqual(
                actual_stale,
                expected_stale,
                f"HTTP roundtrip '{case['name']}' failed: expected shopping_stale={expected_stale}, got {actual_stale}"
            )

    def test_staging_launcher_attaches_demo_catalog_when_unspecified(self):
        import sys
        from unittest.mock import patch, MagicMock
        from scripts import run_staging

        (self.dist_dir / "index.html").write_text("<html></html>", encoding="utf-8")
        staging_argv = [
            "run_staging.py",
            "--token", TEST_TOKEN,
            "--host", "127.0.0.1",
            "--port", "18083",
            "--dist", str(self.dist_dir),
            "--db", str(self.db_path),
            "--lifetime", "10",
        ]
        with patch.object(sys, "argv", staging_argv):
            with patch("uvicorn.Server.run") as mock_run:
                mock_run.return_value = None
                with patch("bot.server.create_app") as mock_create_app:
                    mock_create_app.return_value = MagicMock()
                    run_staging.main()
                    self.assertEqual(mock_create_app.call_count, 1)
                    kwargs = mock_create_app.call_args.kwargs
                    # Verify catalog_provider was attached even when --catalog was not passed in argv
                    self.assertIsNotNone(kwargs.get("catalog_provider"), "Staging launcher must attach demo catalog provider for owner verification")


if __name__ == "__main__":
    unittest.main()

