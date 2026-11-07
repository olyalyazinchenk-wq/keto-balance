"""tests/backend/test_challenger_1_m1_it2_empirical.py
Challenger 1 Empirical Probes for Milestone 1, Iteration 2 Gate:
Comprehensive empirical testing of GET /api/catalog and GET /api/catalog/{recipe_id}
without query parameters across unauthenticated, normal user, owner, and spoofed sessions,
both with and without admin catalog snapshots present in SQLite.
"""
import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_db import (
    init_db,
    get_db_connection,
    create_session,
)
from bot.app_settings import AppSettings
from bot.server import create_app

OWNER_ID = 1084557944
NORMAL_USER_ID = 555666777
ATTACKER_ID = 999888777


class TestChallenger1M1It2Empirical(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / "challenger_it2_empirical.db"
        self.dist_dir = self.dir_path / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)

        (self.dist_dir / "index.html").write_text("<html><body>KetoBalance</body></html>", encoding="utf-8")

        self.keto_recipes = [
            {
                "id": f"k{i}",
                "title": f"Keto Recipe {i}",
                "mode": "keto",
                "cat": "lunch",
                "kcal": 400,
                "editorial_status": "approved",
                "ing": [["Шпинат", "100 г"], ["Яйца", "2 шт."]],
            }
            for i in range(1, 35)
        ]
        self.carnivore_recipes = [
            {
                "id": f"c{i}",
                "title": f"Carnivore Recipe {i}",
                "mode": "carnivore",
                "cat": "dinner",
                "kcal": 550,
                "editorial_status": "review",
                "ing": [["Мясо", "300 г"], ["Топлёное масло", "1 ст. л."]],
            }
            for i in range(1, 17)
        ]
        self.all_recipes = self.keto_recipes + self.carnivore_recipes

        self.cat_data = {
            "schema_version": 1,
            "catalog_id": "released-catalog-202611-v1",
            "catalog_month": "2026-11",
            "updated_date": "2026-11-07",
            "editorial_status": "owner_review",
            "test_only": False,
            "released_ids": [r["id"] for r in self.all_recipes],
            "public_released_ids": [r["id"] for r in self.keto_recipes],
            "owner_review_ids": [r["id"] for r in self.carnivore_recipes],
            "recipes": self.all_recipes,
            "nutrition_status": "unverified",
        }
        (self.dist_dir / "released-catalog.json").write_text(
            json.dumps(self.cat_data, ensure_ascii=False), encoding="utf-8"
        )

        init_db(self.db_path)

        self.owner_token = "tok_owner_it2_gate"
        self.normal_token = "tok_normal_it2_gate"
        self.attacker_token = "tok_attacker_it2_gate"

        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(NORMAL_USER_ID, self.normal_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(ATTACKER_ID, self.attacker_token, expires_in_seconds=86400, db_path=self.db_path)

        self.settings = AppSettings(
            app_stage="pilot",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            allow_anonymous_preview=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        self.app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=self.settings,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_probe_default_catalog_without_query_param_no_admin_snapshot(self):
        """
        Probe GET /api/catalog without query parameter when admin_catalog_versions is empty.
        Verifies:
        - Unauthenticated receives released-catalog-202611-v1 (0 candidates)
        - Normal user receives released-catalog-202611-v1 (0 candidates)
        - Owner receives released-catalog-202611-v1 with all candidate recipes included
        - Cache headers are present on all responses
        """
        # Explicitly empty admin_catalog_versions table in DB
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM admin_catalog_versions")

        # 1. Unauthenticated session
        res_unauth = self.client.get("/api/catalog")
        self.assertEqual(res_unauth.status_code, 200)
        self.assertEqual(res_unauth.headers.get("cache-control"), "private, no-cache")
        self.assertEqual(res_unauth.headers.get("vary"), "Authorization, Cookie, X-User-Id")
        data_unauth = res_unauth.json()
        self.assertEqual(data_unauth.get("catalog_id"), "released-catalog-202611-v1")
        unauth_cands = [cid for cid in data_unauth.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(unauth_cands), 0, f"Candidate recipes leaked to unauth: {unauth_cands}")
        unauth_recipes_cands = [r["id"] for r in data_unauth.get("recipes", []) if r.get("id", "").startswith("c")]
        self.assertEqual(len(unauth_recipes_cands), 0)

        # 2. Normal user session
        res_normal = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_normal.status_code, 200)
        self.assertEqual(res_normal.headers.get("cache-control"), "private, no-cache")
        self.assertEqual(res_normal.headers.get("vary"), "Authorization, Cookie, X-User-Id")
        data_normal = res_normal.json()
        self.assertEqual(data_normal.get("catalog_id"), "released-catalog-202611-v1")
        normal_cands = [cid for cid in data_normal.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(normal_cands), 0, f"Candidate recipes leaked to normal user: {normal_cands}")
        normal_recipes_cands = [r["id"] for r in data_normal.get("recipes", []) if r.get("id", "").startswith("c")]
        self.assertEqual(len(normal_recipes_cands), 0)

        # 3. Owner session
        res_owner = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res_owner.status_code, 200)
        self.assertEqual(res_owner.headers.get("cache-control"), "private, no-cache")
        self.assertEqual(res_owner.headers.get("vary"), "Authorization, Cookie, X-User-Id")
        data_owner = res_owner.json()
        self.assertEqual(data_owner.get("catalog_id"), "released-catalog-202611-v1")
        owner_cands = [cid for cid in data_owner.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(owner_cands), 16, "Owner must receive all 16 candidate recipes")
        self.assertTrue(all(f"c{i}" in owner_cands for i in range(1, 17)))

    def test_probe_default_catalog_without_query_param_with_admin_snapshot_in_db(self):
        """
        Probe GET /api/catalog without query parameter when an admin snapshot (admin-catalog-v1) exists in SQLite.
        Verifies:
        - Unauthenticated session receives released-catalog-202611-v1, 0 candidates
        - Normal user session receives released-catalog-202611-v1, 0 candidates
        - Attacker spoofing headers receives released-catalog-202611-v1, 0 candidates
        - Owner session receives admin-catalog-v1 with all candidate recipes
        """
        # Inject admin snapshot into SQLite
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM admin_catalog_versions")
            cur.execute(
                """
                INSERT INTO admin_catalog_versions (version, published_by, recipes_count, snapshot_json)
                VALUES (1, 1084557944, ?, ?)
                """,
                (len(self.all_recipes), json.dumps(self.all_recipes, ensure_ascii=False)),
            )

        # 1. Unauthenticated session
        res_unauth = self.client.get("/api/catalog")
        self.assertEqual(res_unauth.status_code, 200)
        data_unauth = res_unauth.json()
        self.assertEqual(data_unauth.get("catalog_id"), "released-catalog-202611-v1")
        unauth_cands = [cid for cid in data_unauth.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(unauth_cands), 0)

        # 2. Normal user session
        res_normal = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_normal.status_code, 200)
        data_normal = res_normal.json()
        self.assertEqual(data_normal.get("catalog_id"), "released-catalog-202611-v1")
        normal_cands = [cid for cid in data_normal.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(normal_cands), 0)

        # 3. Attacker session attempting header spoofing
        # Spoofed X-User-Id header without valid session
        res_spoof_x = self.client.get("/api/catalog", headers={"X-User-Id": str(OWNER_ID)})
        self.assertEqual(res_spoof_x.status_code, 200)
        data_spoof_x = res_spoof_x.json()
        self.assertEqual(data_spoof_x.get("catalog_id"), "released-catalog-202611-v1")
        self.assertEqual(len([cid for cid in data_spoof_x.get("released_ids", []) if cid.startswith("c")]), 0)

        # Spoofed query parameter ?user_id=1084557944 without valid session
        res_spoof_q = self.client.get(f"/api/catalog?user_id={OWNER_ID}")
        self.assertEqual(res_spoof_q.status_code, 200)
        data_spoof_q = res_spoof_q.json()
        self.assertEqual(data_spoof_q.get("catalog_id"), "released-catalog-202611-v1")
        self.assertEqual(len([cid for cid in data_spoof_q.get("released_ids", []) if cid.startswith("c")]), 0)

        # 4. Owner session
        res_owner = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res_owner.status_code, 200)
        data_owner = res_owner.json()
        self.assertEqual(data_owner.get("catalog_id"), "admin-catalog-v1")
        owner_cands = [cid for cid in data_owner.get("released_ids", []) if cid.startswith("c")]
        self.assertEqual(len(owner_cands), 16)

    def test_probe_default_recipe_lookup_without_query_param(self):
        """
        Probe GET /api/catalog/{recipe_id} without catalog_id across all auth sessions:
        - c1 returns 404 for unauthenticated
        - c1 returns 404 for normal user
        - c1 returns 404 for spoofed attacker
        - c1 returns 200 for owner
        - k1 returns 200 for unauthenticated, normal user, attacker, and owner
        """
        # Inject admin snapshot
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM admin_catalog_versions")
            cur.execute(
                """
                INSERT INTO admin_catalog_versions (version, published_by, recipes_count, snapshot_json)
                VALUES (1, 1084557944, ?, ?)
                """,
                (len(self.all_recipes), json.dumps(self.all_recipes, ensure_ascii=False)),
            )

        # 1. Unauthenticated
        res_c1_unauth = self.client.get("/api/catalog/c1")
        self.assertEqual(res_c1_unauth.status_code, 404)
        res_k1_unauth = self.client.get("/api/catalog/k1")
        self.assertEqual(res_k1_unauth.status_code, 200)

        # 2. Normal user
        res_c1_normal = self.client.get("/api/catalog/c1", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_c1_normal.status_code, 404)
        res_k1_normal = self.client.get("/api/catalog/k1", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_k1_normal.status_code, 200)

        # 3. Attacker spoofing header
        res_c1_spoof = self.client.get("/api/catalog/c1", headers={"X-User-Id": str(OWNER_ID)})
        self.assertEqual(res_c1_spoof.status_code, 404)

        # 4. Owner
        res_c1_owner = self.client.get("/api/catalog/c1", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res_c1_owner.status_code, 200)
        self.assertEqual(res_c1_owner.json().get("id"), "c1")
        res_k1_owner = self.client.get("/api/catalog/k1", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res_k1_owner.status_code, 200)
        self.assertEqual(res_k1_owner.json().get("id"), "k1")


if __name__ == "__main__":
    unittest.main()
