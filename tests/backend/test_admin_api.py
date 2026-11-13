import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.config import ADMIN_ID
from bot.app_settings import AppSettings
from bot.server import create_app
from bot.app_db import (
    create_or_get_user,
    create_session,
    get_admin_recipes,
    get_catalog_snapshot,
    get_admin_catalog_version,
)

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "pilot" / "catalog.json"


class TestAdminApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "admin_test.db"
        self.settings = AppSettings(
            app_stage="test",
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            owner_allowlist=frozenset({1084557944, 999001}),
        )
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            settings=self.settings,
        )
        self.client = TestClient(self.app)

        # Setup Admin User (ADMIN_ID = 1084557944)
        self.admin_user_id = ADMIN_ID
        create_or_get_user(self.admin_user_id, username="admin_olga", db_path=self.db_path)
        self.admin_token = "admin_secret_token_session_123"
        create_session(self.admin_user_id, self.admin_token, expires_in_seconds=3600, db_path=self.db_path)

        # Setup Regular User (555666 - not in allowlist, not ADMIN_ID)
        self.reg_user_id = 555666
        create_or_get_user(self.reg_user_id, username="regular_user", db_path=self.db_path)
        self.reg_token = "regular_user_token_session_456"
        create_session(self.reg_user_id, self.reg_token, expires_in_seconds=3600, db_path=self.db_path)

        # Setup Allowlisted Owner (999001 - in owner_allowlist)
        self.owner_user_id = 999001
        create_or_get_user(self.owner_user_id, username="co_owner", db_path=self.db_path)
        self.owner_token = "owner_token_session_789"
        create_session(self.owner_user_id, self.owner_token, expires_in_seconds=3600, db_path=self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    # --- ROLE & AUTHENTICATION ENFORCEMENT ---

    def test_admin_endpoints_require_authentication(self):
        # Missing auth header -> 401
        resp1 = self.client.get("/api/admin/recipes")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.post("/api/admin/recipes", json={"recipe_id": "k1", "title": "Test"})
        self.assertEqual(resp2.status_code, 401)

        resp3 = self.client.post("/api/admin/recipes/k1/publish")
        self.assertEqual(resp3.status_code, 401)

        resp4 = self.client.get("/api/admin/status")
        self.assertEqual(resp4.status_code, 401)

    def test_admin_endpoints_reject_invalid_tokens(self):
        headers = {"Authorization": "Bearer invalid_nonexistent_token"}
        resp = self.client.get("/api/admin/recipes", headers=headers)
        self.assertEqual(resp.status_code, 401)

    def test_regular_user_forbidden_from_admin_api(self):
        headers = {"Authorization": f"Bearer {self.reg_token}"}

        resp1 = self.client.get("/api/admin/recipes", headers=headers)
        self.assertEqual(resp1.status_code, 403)
        self.assertIn("admin access required", resp1.json().get("detail", "").lower())

        resp2 = self.client.post("/api/admin/recipes", json={"recipe_id": "k1", "title": "Hack"}, headers=headers)
        self.assertEqual(resp2.status_code, 403)

        resp3 = self.client.post("/api/admin/recipes/k1/publish", headers=headers)
        self.assertEqual(resp3.status_code, 403)

        resp4 = self.client.get("/api/admin/status", headers=headers)
        self.assertEqual(resp4.status_code, 403)

    def test_admin_id_and_owner_allowlist_have_access(self):
        # ADMIN_ID has access
        headers_admin = {"Authorization": f"Bearer {self.admin_token}"}
        resp_admin = self.client.get("/api/admin/status", headers=headers_admin)
        self.assertEqual(resp_admin.status_code, 200)
        self.assertEqual(resp_admin.json().get("status"), "ok")

        # owner_allowlist user has access
        headers_owner = {"Authorization": f"Bearer {self.owner_token}"}
        resp_owner = self.client.get("/api/admin/status", headers=headers_owner)
        self.assertEqual(resp_owner.status_code, 200)
        self.assertEqual(resp_owner.json().get("status"), "ok")

    # --- RECIPE DRAFTS, VERSIONING & MENU REPRODUCIBILITY ---

    def test_admin_list_recipes(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = self.client.get("/api/admin/recipes", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("catalog_version", data)
        self.assertIn("recipes", data)
        self.assertGreaterEqual(len(data["recipes"]), 5)
        # Check recipe structure
        k1 = next((r for r in data["recipes"] if r["recipe_id"] == "k1"), None)
        self.assertIsNotNone(k1)
        self.assertEqual(k1["version"], 1)
        self.assertEqual(k1["status"], "published")
        self.assertFalse(k1["has_draft"])
        self.assertIsNotNone(k1["published"])
        self.assertIn("approved", k1["approval_marks"])

    def test_save_recipe_draft_preserves_published_version(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        # 1. Inspect original published recipe k1
        initial_resp = self.client.get("/api/admin/recipes", headers=headers)
        k1_initial = next(r for r in initial_resp.json()["recipes"] if r["recipe_id"] == "k1")
        initial_title = k1_initial["published"]["title"]
        initial_kcal = k1_initial["published"]["kcal"]

        # 2. Save draft with modified title and kcal
        draft_payload = {
            "recipe_id": "k1",
            "recipe_data": {
                "id": "k1",
                "title": "Сливочная яичница с беконом (версия шефа)",
                "kcal": 599,
                "p": 28,
                "f": 48,
                "nc": 3,
                "mode": "keto",
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "sources": ["Клинический протокол 2026 v2"],
                "notes": "Черновик обновленной рецептуры",
            },
        }
        draft_resp = self.client.post("/api/admin/recipes", json=draft_payload, headers=headers)
        self.assertEqual(draft_resp.status_code, 200)
        draft_result = draft_resp.json()
        self.assertTrue(draft_result["has_draft"])
        self.assertEqual(draft_result["draft"]["kcal"], 599)

        # 3. CRITICAL: Published version must remain UNMODIFIED while draft exists
        list_resp = self.client.get("/api/admin/recipes", headers=headers)
        k1_after_draft = next(r for r in list_resp.json()["recipes"] if r["recipe_id"] == "k1")
        self.assertTrue(k1_after_draft["has_draft"])
        self.assertEqual(k1_after_draft["version"], 1)  # Version not incremented yet
        self.assertEqual(k1_after_draft["published"]["title"], initial_title)
        self.assertEqual(k1_after_draft["published"]["kcal"], initial_kcal)
        self.assertEqual(k1_after_draft["draft"]["title"], "Сливочная яичница с беконом (версия шефа)")

    def test_publish_draft_increments_catalog_version_and_preserves_snapshots(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}

        initial_cat_ver = get_admin_catalog_version(self.db_path)

        # 1. Save draft for k2
        draft_payload = {
            "recipe_id": "k2",
            "recipe_data": {
                "id": "k2",
                "title": "Омлет с сыром и прованскими травами",
                "kcal": 450,
                "mode": "keto",
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "source": "Французская кето-кухня",
            },
        }
        self.client.post("/api/admin/recipes", json=draft_payload, headers=headers)

        # 2. Publish draft
        pub_resp = self.client.post("/api/admin/recipes/k2/publish", headers=headers)
        self.assertEqual(pub_resp.status_code, 200)
        pub_data = pub_resp.json()
        self.assertEqual(pub_data["status"], "published")
        self.assertEqual(pub_data["recipe_id"], "k2")
        self.assertEqual(pub_data["recipe_version"], 2)  # Recipe version bumped to 2
        new_cat_ver = pub_data["catalog_version"]
        self.assertEqual(new_cat_ver, initial_cat_ver + 1)

        # 3. Verify in recipe list
        list_resp = self.client.get("/api/admin/recipes", headers=headers)
        k2_after = next(r for r in list_resp.json()["recipes"] if r["recipe_id"] == "k2")
        self.assertEqual(k2_after["version"], 2)
        self.assertFalse(k2_after["has_draft"])
        self.assertEqual(k2_after["published"]["title"], "Омлет с сыром и прованскими травами")

        # 4. CRITICAL: Reproducibility verification
        # Saved menus created under catalog version 1 can still reproduce original k2
        snapshot_v1 = get_catalog_snapshot(initial_cat_ver, self.db_path)
        self.assertIsNotNone(snapshot_v1)
        k2_v1 = next((r for r in snapshot_v1 if r["id"] == "k2"), None)
        self.assertIsNotNone(k2_v1)
        self.assertEqual(k2_v1["title"], "Омлет с сыром и зеленью")  # Original title preserved

        # New snapshot for catalog version 2 has updated k2
        snapshot_v2 = get_catalog_snapshot(new_cat_ver, self.db_path)
        self.assertIsNotNone(snapshot_v2)
        k2_v2 = next((r for r in snapshot_v2 if r["id"] == "k2"), None)
        self.assertIsNotNone(k2_v2)
        self.assertEqual(k2_v2["title"], "Омлет с сыром и прованскими травами")

    def test_publish_fails_without_pending_draft(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        # k3 has no pending draft
        resp = self.client.post("/api/admin/recipes/k3/publish", headers=headers)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no draft to publish", resp.json().get("detail", "").lower())

    def test_publish_nonexistent_recipe_returns_404(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = self.client.post("/api/admin/recipes/nonexistent_xyz/publish", headers=headers)
        self.assertEqual(resp.status_code, 404)

    def test_create_and_publish_brand_new_recipe(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        new_recipe_id = "k55_steak"
        payload = {
            "recipe_id": new_recipe_id,
            "recipe_data": {
                "id": new_recipe_id,
                "title": "Стейк рибай со сливочным маслом",
                "serv": 1, "time": 20,
                "kcal": 680,
                "mode": "carnivore",
                "ing": [["Стейк говяжий", "300 г"], ["Масло сливочное", "20 г"]],
                "steps": ["Обжарьте стейк до готовности.", "Подавайте с маслом."],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "source": "Карнивор протокол",
            },
        }
        create_resp = self.client.post("/api/admin/recipes", json=payload, headers=headers)
        self.assertEqual(create_resp.status_code, 200)
        self.assertEqual(create_resp.json()["status"], "draft")
        self.assertIsNone(create_resp.json()["published"])

        # Publish the new recipe
        pub_resp = self.client.post(f"/api/admin/recipes/{new_recipe_id}/publish", headers=headers)
        self.assertEqual(pub_resp.status_code, 200)
        self.assertEqual(pub_resp.json()["recipe_version"], 1)

        # Verify it now appears as published
        list_resp = self.client.get("/api/admin/recipes", headers=headers)
        new_rec = next(r for r in list_resp.json()["recipes"] if r["recipe_id"] == new_recipe_id)
        self.assertEqual(new_rec["status"], "published")
        self.assertEqual(new_rec["published"]["title"], "Стейк рибай со сливочным маслом")

    def test_admin_status_endpoint(self):
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = self.client.get("/api/admin/status", headers=headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("catalog_version", data)
        self.assertIn("total_recipes", data)
        self.assertIn("published_recipes", data)
        self.assertIn("draft_recipes", data)
        self.assertIn("active_users", data)
        self.assertEqual(data["admin_id"], ADMIN_ID)
        self.assertEqual(data["app_stage"], "test")


if __name__ == "__main__":
    unittest.main()
