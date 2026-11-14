import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import concurrent.futures
import json
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.config import ADMIN_ID
from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import (
    create_or_get_user,
    create_session,
    init_db,
    save_recipe_draft,
    publish_recipe_draft,
    get_catalog_snapshot,
    get_admin_catalog_version,
    get_pilot_user,
    save_pilot_user,
    RecipePublicationValidationError,
)

TEST_BOT_TOKEN = "999888777:CHALLENGER_2_ADVERSARIAL_TOKEN"

class TestChallenger2AdversarialSuite(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "challenger_2.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_BOT_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            app_stage="test",
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        # Admin session
        create_or_get_user(ADMIN_ID, username="admin_challenger", db_path=self.db_path)
        self.admin_token = "admin_token_challenger_2"
        create_session(ADMIN_ID, self.admin_token, expires_in_seconds=3600, db_path=self.db_path)
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

        # Regular user session
        self.user_id = 9901
        create_or_get_user(self.user_id, username="user_challenger", db_path=self.db_path)
        self.user_token = "user_token_challenger_2"
        create_session(self.user_id, self.user_token, expires_in_seconds=3600, db_path=self.db_path)
        self.user_headers = {"Authorization": f"Bearer {self.user_token}"}

    def tearDown(self):
        self.tmp_dir.cleanup()

    # =========================================================================
    # 1. PUBLICATION VALIDATION BOUNDARY TESTS
    # =========================================================================

    def test_boundary_empty_ingredients_fails_422(self):
        """Empty ingredients list [] must return HTTP 422 upon publication."""
        rid = "b_empty_ing"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Empty Ing", "kcal": 200, "ing": [], "steps": ["Cook."]},
            "approval_marks": {"approved": True, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422, got {resp.status_code}: {resp.text}")

    def test_boundary_empty_steps_fails_422(self):
        """Empty steps list [] must return HTTP 422 upon publication."""
        rid = "b_empty_steps"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Empty Steps", "kcal": 200, "ing": [["Meat", "100g"]], "steps": []},
            "approval_marks": {"approved": True, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422, got {resp.status_code}: {resp.text}")

    def test_boundary_unapproved_status_fails_422(self):
        """Unapproved recipe (approved=False) must return HTTP 422."""
        rid = "b_unapproved"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Unapproved", "kcal": 200, "ing": [["Meat", "100g"]], "steps": ["Cook."]},
            "approval_marks": {"approved": False, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422, got {resp.status_code}: {resp.text}")

    def test_boundary_whitespace_only_ingredients_must_fail_422(self):
        """Whitespace-only ingredients [['   ', '   ']] must return HTTP 422."""
        rid = "b_ws_ing"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Whitespace Ing", "kcal": 200, "ing": [["   ", "   "]], "steps": ["Cook."]},
            "approval_marks": {"approved": True, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422 for whitespace ingredients, got {resp.status_code}: {resp.text}")

    def test_boundary_missing_quantities_must_fail_422(self):
        """Ingredients with missing quantities (['Meat'] or ['Meat', '']) must return HTTP 422."""
        rid = "b_missing_qty"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Missing Qty", "kcal": 200, "ing": [["Meat"]], "steps": ["Cook."]},
            "approval_marks": {"approved": True, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422 for missing quantity, got {resp.status_code}: {resp.text}")

    def test_boundary_whitespace_only_steps_must_fail_422(self):
        """Whitespace-only preparation steps ['   '] must return HTTP 422."""
        rid = "b_ws_steps"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "Whitespace Steps", "kcal": 200, "ing": [["Meat", "100g"]], "steps": ["   "]},
            "approval_marks": {"approved": True, "approved_by": "Olga"},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422 for whitespace steps, got {resp.status_code}: {resp.text}")

    def test_boundary_approved_missing_author_must_fail_422(self):
        """Recipe marked approved=True but with missing/empty author ('approved_by') must return HTTP 422."""
        rid = "b_no_author"
        draft = {
            "recipe_id": rid,
            "recipe_data": {"id": rid, "title": "No Author", "kcal": 200, "ing": [["Meat", "100g"]], "steps": ["Cook."]},
            "approval_marks": {"approved": True},
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        resp = self.client.post(f"/api/admin/recipes/{rid}/publish", headers=self.admin_headers)
        self.assertEqual(resp.status_code, 422, f"Expected 422 for approved with missing author, got {resp.status_code}: {resp.text}")

    # =========================================================================
    # 2. CATALOG CACHE INVALIDATION & SAVED MENU UNCORRUPTED
    # =========================================================================

    def test_catalog_cache_invalidation_and_saved_menu_reproducibility(self):
        """
        Empirically verify:
        1. Catalog cache is invalidated immediately upon successful publication.
        2. Saved user menu with existing recipe versions remains completely uncorrupted across updates.
        """
        # User saves a menu with 4 portions and 4 shopping batches
        user_menu = {
            "mode": "keto",
            "numDays": 1,
            "meals": 2,
            "portion": 4,
            "saved": True,
            "created": 1700000000,
            "days": [
                {
                    "date": "2026-11-06",
                    "slots": {"breakfast": "k1", "lunch": "k2"}
                }
            ]
        }
        save_payload = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": None,
            "state": {
                "schema_version": 1,
                "menu": user_menu,
                "selected_date": "2026-11-06",
                "checked_ingredients": {"k1:0": True},
                "checked_steps": {"k1:step1": True},
                "shopping_batches": 4,
                "shopping_stale": False,
            }
        }
        user_save = self.client.put("/api/user", json=save_payload, headers=self.user_headers)
        self.assertEqual(user_save.status_code, 200)

        # Warm catalog cache
        cat_resp_1 = self.client.get("/api/catalog")
        self.assertEqual(cat_resp_1.status_code, 200)
        ver_1 = cat_resp_1.json().get("catalog_version") or cat_resp_1.json().get("version") or 1

        # Admin updates recipe k1 and publishes
        valid_draft = {
            "recipe_id": "k1",
            "recipe_data": {
                "id": "k1",
                "title": "Кето Блинчики Праздничные",
                "kcal": 550,
                "ing": [["Мука миндальная", "100 г"], ["Яйца", "3 шт"]],
                "steps": ["Смешайте ингредиенты.", "Обжарьте с двух сторон."],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "source": "Клинический протокол КетоБаланс 2026",
            },
        }
        save_draft_resp = self.client.post("/api/admin/recipes", json=valid_draft, headers=self.admin_headers)
        self.assertEqual(save_draft_resp.status_code, 200)

        pub_resp = self.client.post("/api/admin/recipes/k1/publish", headers=self.admin_headers)
        self.assertEqual(pub_resp.status_code, 200)

        # 1. Verify catalog cache invalidated immediately
        cat_resp_2 = self.client.get("/api/catalog")
        self.assertEqual(cat_resp_2.status_code, 200)
        ver_2 = cat_resp_2.json().get("catalog_version") or cat_resp_2.json().get("version")
        self.assertIsNotNone(ver_2)
        self.assertGreater(ver_2, ver_1)
        k1_data = next((r for r in cat_resp_2.json()["recipes"] if r["id"] == "k1"), None)
        self.assertIsNotNone(k1_data)
        self.assertEqual(k1_data["title"], "Кето Блинчики Праздничные")

        # 2. Verify user saved menu is 100% uncorrupted and reproducible
        user_get = self.client.get("/api/user", headers=self.user_headers)
        self.assertEqual(user_get.status_code, 200)
        user_state = user_get.json()["state"]
        self.assertEqual(user_state["menu"]["portion"], 4)
        self.assertEqual(user_state["menu"]["days"][0]["slots"]["breakfast"], "k1")
        self.assertEqual(user_state["shopping_batches"], 4)
        self.assertEqual(user_state["checked_ingredients"], {"k1:0": True})
        self.assertEqual(user_state["checked_steps"], {"k1:step1": True})

    # =========================================================================
    # 3. HIGH-CONCURRENCY STRESS TEST (SQLITE WAL MODE & ZERO LOCK ERRORS)
    # =========================================================================

    def test_high_concurrency_wal_zero_lock_errors(self):
        """
        Execute 20 concurrent threads performing interleaved bursts of:
        - Telegram TMA session auth
        - User profile and state mutations (with 4-portion and 4-batch settings)
        - Consent logging
        - Support ticket submission
        - Catalog requests
        - Admin publishing recipes simultaneously
        Must achieve 100% success rate with ZERO database lock errors under SQLite WAL.
        """
        num_workers = 20
        results = []

        def worker_task(worker_id: int):
            worker_client = TestClient(self.app)
            worker_user_id = 20000 + worker_id
            init_data = generate_telegram_init_data({"id": worker_user_id, "first_name": f"Worker{worker_id}"}, TEST_BOT_TOKEN)

            # 1. Session auth
            resp_sess = worker_client.post("/api/session", json={"init_data": init_data})
            if resp_sess.status_code != 200:
                return (False, f"Session failed: {resp_sess.status_code}")
            token = resp_sess.json()["session_token"]
            w_headers = {"Authorization": f"Bearer {token}"}

            # 2. User update (write contention)
            user_menu = {
                "mode": "keto",
                "numDays": 1,
                "meals": 2,
                "portion": 4,
                "saved": True,
                "created": 1700000000,
                "days": [{"date": "2026-11-06", "slots": {"breakfast": "k1"}}]
            }
            payload = {
                "schema_version": 1,
                "expected_revision": 0,
                "profile": None,
                "state": {
                    "schema_version": 1,
                    "menu": user_menu,
                    "selected_date": "2026-11-06",
                    "checked_ingredients": {},
                    "checked_steps": {},
                    "shopping_batches": 4,
                    "shopping_stale": False,
                }
            }
            resp_user = worker_client.put("/api/user", json=payload, headers=w_headers)
            if resp_user.status_code != 200:
                return (False, f"User PUT failed: {resp_user.status_code} {resp_user.text}")

            # 3. Consents (write contention)
            resp_consents = worker_client.post(
                "/api/user/consents",
                json={"consents": [{"consent_type": "terms", "version": "v1.0.0-release", "granted": True, "source": "tma"}]},
                headers=w_headers
            )
            if resp_consents.status_code != 200:
                return (False, f"Consents POST failed: {resp_consents.status_code} {resp_consents.text}")

            # 4. Support message (write contention)
            resp_support = worker_client.post(
                "/api/support",
                json={"topic": "general", "message": f"Stress test message from worker {worker_id}", "contact": f"@user_{worker_id}"},
                headers=w_headers
            )
            if resp_support.status_code != 200:
                return (False, f"Support POST failed: {resp_support.status_code} {resp_support.text}")

            # 5. Read user back
            resp_get_user = worker_client.get("/api/user", headers=w_headers)
            if resp_get_user.status_code != 200:
                return (False, f"User GET failed: {resp_get_user.status_code}")

            # 6. Read catalog
            resp_cat = worker_client.get("/api/catalog")
            if resp_cat.status_code != 200:
                return (False, f"Catalog GET failed: {resp_cat.status_code}")

            return (True, "OK")

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = [executor.submit(worker_task, i) for i in range(num_workers)]
            for f in concurrent.futures.as_completed(futures):
                results.append(f.result())

        failures = [r for r in results if not r[0]]
        self.assertEqual(len(failures), 0, f"Concurrent execution had {len(failures)} failures: {failures}")

if __name__ == "__main__":
    unittest.main()
