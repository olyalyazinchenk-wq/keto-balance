"""tests/backend/test_challenger_1_m1_adversarial.py
Adversarial Challenger 1 Probes for Milestone 1:
- Static catalog c1..c16 isolation against non-owner sessions (direct and versioned)
- Probe admin-catalog-v* access restrictions
- Probe unknown catalog version handling (404 without silent fallback)
- Probe Cache-Control and Vary isolation headers
- Probe static catalog direct access defenses
- Forensic scan of dist/assets/*.js for zero leakage of candidate recipes
- Empirical proof of vulnerability when DB has admin catalog snapshots
"""
import glob
import json
import os
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
from bot.catalog import (
    CatalogService,
    is_shopping_consistent_with_menu,
)
from bot.server import create_app

OWNER_ID = 1084557944
NORMAL_USER_ID = 555666777
ATTACKER_USER_ID = 999888777

CARNIVORE_CANDIDATE_TITLES = [
    "Стейк на сковороде с топлёным маслом",
    "Говяжьи котлеты без хлеба и лука",
    "Запечённая курица целиком",
    "Куриные сердечки на сковороде",
    "Говяжья печень со сметаной",
    "Лосось на пару с топлёным маслом",
    "Говядина долгого тушения «рваное мясо»",
    "Яичница на сале",
    "Запечённая скумбрия (карнивор-версия)",
    "Куриные бёдра на противне",
    "Говяжий фарш с яйцом и маслом",
    "Костный бульон длительного томления",
    "Рыбные котлеты из консервов",
    "Запечённые говяжьи сердечки",
    "Утиные ножки конфи в собственном жиру",
    "Мясная нарезка и яйца вкрутую (перекус)",
]

class TestMilestone1ChallengerProbes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / "challenger_m1.db"
        self.dist_dir = self.dir_path / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)

        (self.dist_dir / "index.html").write_text("<html><body>KetoBalance</body></html>", encoding="utf-8")

        # Create 34 keto recipes and 16 carnivore candidate recipes
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
                "title": CARNIVORE_CANDIDATE_TITLES[i - 1],
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

        self.owner_token = "tok_owner_challenger_m1"
        self.normal_token = "tok_normal_challenger_m1"
        self.attacker_token = "tok_attacker_challenger_m1"
        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(NORMAL_USER_ID, self.normal_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(ATTACKER_USER_ID, self.attacker_token, expires_in_seconds=86400, db_path=self.db_path)

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

    # PROBE 1: Static catalog: candidate isolation across all 16 recipes
    def test_probe_1_static_catalog_all_16_candidates_inaccessible_to_non_owners(self):
        """In released catalog, verify every candidate recipe c1..c16 is inaccessible to normal/unauthenticated users."""
        # Using a catalog service pointing to static dist
        static_service = CatalogService(dist_dir=self.dist_dir, db_path=None)

        for i in range(1, 17):
            recipe_id = f"c{i}"
            # 1a. Direct recipe lookup for non-owner returns None
            rec_normal = static_service.get_recipe_by_id(recipe_id, is_owner=False)
            self.assertIsNone(rec_normal, f"Candidate {recipe_id} must not be accessible to non-owner")

            # 1b. Direct recipe lookup for owner returns recipe
            rec_owner = static_service.get_recipe_by_id(recipe_id, is_owner=True)
            self.assertIsNotNone(rec_owner, f"Candidate {recipe_id} must be accessible to owner")
            self.assertEqual(rec_owner["id"], recipe_id)

            # 1c. Versioned recipe lookup for non-owner returns None
            rec_ver_normal = static_service.get_recipe_by_id(
                recipe_id, catalog_id="released-catalog-202611-v1", is_owner=False
            )
            self.assertIsNone(rec_ver_normal, f"Candidate {recipe_id} via catalog_id must return None for non-owner")

            # 1d. Versioned recipe lookup for owner returns recipe
            rec_ver_owner = static_service.get_recipe_by_id(
                recipe_id, catalog_id="released-catalog-202611-v1", is_owner=True
            )
            self.assertIsNotNone(rec_ver_owner, f"Candidate {recipe_id} via catalog_id must return recipe for owner")

    # PROBE 2: Probe admin-catalog-v* access restrictions
    def test_probe_2_admin_catalog_access_restrictions(self):
        """Requesting admin-catalog-v* must return 403 Forbidden for non-owners and 200 for owners."""
        # Set up an admin snapshot
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

        # Non-owner requesting admin-catalog-v1 -> 403 Forbidden
        res_admin_normal = self.client.get(
            "/api/catalog?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_admin_normal.status_code, 403)
        self.assertIn("owner", res_admin_normal.json().get("detail", "").lower())

        # Unauthenticated requesting admin-catalog-v1 -> 403 Forbidden
        res_admin_unauth = self.client.get("/api/catalog?catalog_id=admin-catalog-v1")
        self.assertEqual(res_admin_unauth.status_code, 403)

        # Recipe lookup with admin-catalog-v1 by non-owner -> 403 Forbidden
        res_rec_normal = self.client.get(
            "/api/catalog/c1?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_rec_normal.status_code, 403)

        # Owner requesting admin-catalog-v1 -> 200 OK
        res_admin_owner = self.client.get(
            "/api/catalog?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_admin_owner.status_code, 200)

        # Owner requesting c1 with admin-catalog-v1 -> 200 OK
        res_rec_owner = self.client.get(
            "/api/catalog/c1?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_rec_owner.status_code, 200)

    # PROBE 3: Unknown catalog version handling (NEVER fallback)
    def test_probe_3_unknown_catalog_version_never_falls_back(self):
        """Unknown catalog version MUST return 404, never silently falling back to active catalog."""
        unknown_versions = [
            "does-not-exist",
            "released-catalog-202501-v1",
            "v99999",
            "../etc/passwd",
            "../../dist/released-catalog",
            "null",
            "undefined",
        ]

        for ver in unknown_versions:
            # For normal user -> 404
            res_cat_normal = self.client.get(
                f"/api/catalog?catalog_id={ver}",
                headers={"Authorization": f"Bearer {self.normal_token}"},
            )
            self.assertEqual(
                res_cat_normal.status_code, 404,
                f"Unknown version '{ver}' must return 404 for normal user, got {res_cat_normal.status_code}"
            )

            # For owner session -> 404
            res_cat_owner = self.client.get(
                f"/api/catalog?catalog_id={ver}",
                headers={"Authorization": f"Bearer {self.owner_token}"},
            )
            self.assertEqual(
                res_cat_owner.status_code, 404,
                f"Unknown version '{ver}' must return 404 for owner, got {res_cat_owner.status_code}"
            )

            # Recipe lookup with unknown catalog version -> 404
            res_rec_owner = self.client.get(
                f"/api/catalog/k1?catalog_id={ver}",
                headers={"Authorization": f"Bearer {self.owner_token}"},
            )
            self.assertEqual(
                res_rec_owner.status_code, 404,
                f"Recipe with unknown catalog version '{ver}' must return 404, got {res_rec_owner.status_code}"
            )

    # PROBE 4: Cache-Control and Vary headers on all catalog endpoints
    def test_probe_4_cache_control_and_vary_headers(self):
        """Check dynamic isolation headers on catalog endpoints across auth states."""
        endpoints = [
            ("/api/catalog", {}),
            ("/api/catalog", {"Authorization": f"Bearer {self.normal_token}"}),
            ("/api/catalog", {"Authorization": f"Bearer {self.owner_token}"}),
            ("/api/catalog/k1", {}),
            ("/api/catalog/k1", {"Authorization": f"Bearer {self.normal_token}"}),
            ("/api/catalog/k1", {"Authorization": f"Bearer {self.owner_token}"}),
            ("/api/recipes/k1", {}),
            ("/api/recipes/k1", {"Authorization": f"Bearer {self.normal_token}"}),
            ("/api/recipes/k1", {"Authorization": f"Bearer {self.owner_token}"}),
        ]

        for url, headers in endpoints:
            res = self.client.get(url, headers=headers)
            self.assertEqual(
                res.status_code, 200,
                f"Endpoint {url} with headers {headers} failed with {res.status_code}"
            )
            cache_control = res.headers.get("cache-control")
            vary = res.headers.get("vary")

            self.assertEqual(
                cache_control, "private, no-cache",
                f"{url} missing 'Cache-Control: private, no-cache', got: '{cache_control}'"
            )
            self.assertEqual(
                vary, "Authorization, Cookie, X-User-Id",
                f"{url} missing 'Vary: Authorization, Cookie, X-User-Id', got: '{vary}'"
            )

    # PROBE 5: Direct static access block for catalog JSON files
    def test_probe_5_static_catalog_json_blocked(self):
        """Direct static HTTP access to released-catalog.json must be blocked."""
        static_attempts = [
            "/released-catalog.json",
            "/released-catalog-202611-v1.json",
            "/catalog.json",
            "/assets/../released-catalog.json",
            "/%2e%2e/dist/released-catalog.json",
        ]
        for path_attempt in static_attempts:
            res = self.client.get(path_attempt)
            self.assertIn(
                res.status_code, [401, 403, 404],
                f"Static attempt '{path_attempt}' returned {res.status_code}, expected 401/403/404"
            )
            if res.status_code == 401:
                self.assertIn("Owner session required", res.json().get("detail", ""))

    # PROBE 6: Production bundle zero-leakage check on real build artifacts
    def test_probe_6_real_dist_bundle_zero_leakage(self):
        """Verify that actual dist/assets/*.js in Keto-balance has 0 candidate recipe titles or IDs."""
        real_dist_assets = Path("C:/Users/HP/Keto-balance/dist/assets")
        self.assertTrue(real_dist_assets.is_dir(), f"Dist assets dir not found at {real_dist_assets}")

        js_files = list(real_dist_assets.glob("*.js"))
        self.assertGreater(len(js_files), 0, "No JS files found in dist/assets")

        for js_file in js_files:
            content = js_file.read_text(encoding="utf-8")

            # Check all 16 candidate recipe titles
            for idx, title in enumerate(CARNIVORE_CANDIDATE_TITLES, start=1):
                self.assertNotIn(
                    title, content,
                    f"LEAK DETECTED in {js_file.name}: Candidate c{idx} title '{title}' found in production bundle!"
                )

            # Check recipe definition patterns for c1..c16
            for idx in range(1, 17):
                patterns = [
                    f'"id":"c{idx}"',
                    f"'id':'c{idx}'",
                    f'id:"c{idx}"',
                    f'id:\'c{idx}\'',
                ]
                for p in patterns:
                    self.assertNotIn(
                        p, content,
                        f"LEAK DETECTED in {js_file.name}: Recipe definition pattern '{p}' found in production bundle!"
                    )

            # Distinct ingredient phrases that only exist in carnivore drafts
            unique_draft_phrases = [
                "Томите кости на слабом огне 4–12 часов",
                "Разберите на волокна, храните в бульоне",
                "Томите в жире при 130°C 2 часа",
                "Утиные ножки конфи",
            ]
            for phrase in unique_draft_phrases:
                self.assertNotIn(
                    phrase, content,
                    f"LEAK DETECTED in {js_file.name}: Draft unique step/phrase '{phrase}' found in bundle!"
                )

    # PROBE 7 (ADVERSARIAL DEFECT PROBE): DB Admin Catalog Snapshot Leakage Bug
    def test_probe_7_defect_db_admin_catalog_leakage_to_normal_user(self):
        """
        Adversarial proof: When DB contains an admin_catalog_version snapshot,
        CatalogService.get_catalog_data() returns admin-catalog-v1 without public_released_ids filtering,
        leaking all 16 candidate recipes c1..c16 to normal users via GET /api/catalog and GET /api/catalog/c1.
        """
        # Populate admin_catalog_versions in DB
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

        # Invalidate catalog service cache
        # Create fresh client connected to this DB
        db_app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=self.settings)
        db_client = TestClient(db_app)

        # 1. Normal user calling GET /api/catalog without catalog_id
        res_cat = db_client.get("/api/catalog", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_cat.status_code, 200)
        returned_cat = res_cat.json()

        # Defect 1: Catalog ID is 'admin-catalog-v1', not 'released-catalog-202611-v1'
        actual_catalog_id = returned_cat.get("catalog_id")
        # Defect 2: All 16 candidates are returned in released_ids
        leaked_candidates = [cid for cid in returned_cat.get("released_ids", []) if cid.startswith("c")]

        # 2. Normal user calling GET /api/catalog/c1 without catalog_id
        res_c1 = db_client.get("/api/catalog/c1", headers={"Authorization": f"Bearer {self.normal_token}"})

        # EMPIRICAL ASSERTION DOCUMENTING THE DEFECT:
        # If the bug exists:
        # - actual_catalog_id == 'admin-catalog-v1'
        # - leaked_candidates has all 16 candidates
        # - res_c1.status_code == 200 (should be 404!)
        print(f"\n[EMPIRICAL DEFECT EVIDENCE]")
        print(f"When admin version is in DB:")
        print(f"  Returned catalog_id: '{actual_catalog_id}'")
        print(f"  Leaked carnivore candidate count: {len(leaked_candidates)}")
        print(f"  GET /api/catalog/c1 status: {res_c1.status_code}")

        # Assert zero leakage to normal user when admin catalog exists in DB:
        self.assertEqual(res_c1.status_code, 404, f"Candidate c1 must return 404 for normal user, got {res_c1.status_code}")
        self.assertEqual(len(leaked_candidates), 0, f"Candidate recipes leaked to normal user: {leaked_candidates}")
        self.assertEqual(actual_catalog_id, "released-catalog-202611-v1", f"Expected released catalog ID, got '{actual_catalog_id}'")
        self.assertNotIn("c1", returned_cat.get("released_ids", []), "Normal user received candidate ID c1 in released_ids")

if __name__ == "__main__":
    unittest.main()
