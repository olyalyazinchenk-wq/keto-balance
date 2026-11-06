import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.catalog import CatalogService, is_shopping_consistent_with_menu
from bot.app_settings import AppSettings
from bot.app_db import init_db
from bot.server import create_app


class MockCatalogService:
    def __init__(self, recipes):
        self.recipes = recipes
        self.released_ids = [r["id"] for r in recipes]

    def get_catalog_data(self):
        return {"recipes": self.recipes, "released_ids": self.released_ids, "test_only": True}

    def get_released_recipes(self):
        return self.recipes

    def get_recipe_by_id(self, rid):
        for r in self.recipes:
            if r.get("id") == rid:
                return r
        return None


class TestShoppingConsistencyServings(unittest.TestCase):
    def setUp(self):
        self.recipes = [
            {
                "id": "k1",
                "title": "Сливочная яичница с беконом и шпинатом",
                "mode": "keto",
                "cat": "breakfast",
                "serv": 2,
                "time": 12,
                "ing": [["Бекон", "80 г"], ["Яйца", "4 шт"]],
            },
            {
                "id": "k14",
                "title": "Говядина с капустой",
                "mode": "keto",
                "cat": "dinner",
                "serv": 4,
                "time": 60,
                "ing": [["Говядина", "600 г"], ["Капуста", "600 г"]],
            },
        ]
        self.catalog_service = MockCatalogService(self.recipes)

    def test_direct_predicate_2_serving_recipe_portion_scaling(self):
        """2-serving recipe: 1 batch=40g, 2 batches=80g, 4 batches=160g."""
        menu = {
            "mode": "keto",
            "numDays": 1,
            "meals": 1,
            "days": [{"date": "2026-11-06", "slots": {"breakfast": "k1"}}],
        }

        # 1 portion: 80 / 2 * 1 = 40g bacon, 4 / 2 * 1 = 2 eggs
        items_1 = [
            {"id": "s1", "name": "Бекон", "amountLabel": "40 г", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
            {"id": "s2", "name": "Яйца", "amountLabel": "2 шт.", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 1, items_1, self.catalog_service))

        # 2 portions: 80 / 2 * 2 = 80g bacon, 4 / 2 * 2 = 4 eggs
        items_2 = [
            {"id": "s1", "name": "Бекон", "amountLabel": "80 г", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
            {"id": "s2", "name": "Яйца", "amountLabel": "4 шт.", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 2, items_2, self.catalog_service))

        # 4 portions: 80 / 2 * 4 = 160g bacon, 4 / 2 * 4 = 8 eggs
        items_4 = [
            {"id": "s1", "name": "Бекон", "amountLabel": "160 г", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
            {"id": "s2", "name": "Яйца", "amountLabel": "8 шт.", "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 4, items_4, self.catalog_service))

    def test_direct_predicate_4_serving_recipe_portion_scaling(self):
        """4-serving recipe: 1 batch=150g, 2 batches=300g, 4 batches=600g."""
        menu = {
            "mode": "keto",
            "numDays": 1,
            "meals": 1,
            "days": [{"date": "2026-11-06", "slots": {"dinner": "k14"}}],
        }

        # 1 portion: 600 / 4 * 1 = 150g
        items_1 = [
            {"id": "s1", "name": "Говядина", "amountLabel": "150 г", "linkedRecipeTitles": ["Говядина с капустой"]},
            {"id": "s2", "name": "Капуста", "amountLabel": "150 г", "linkedRecipeTitles": ["Говядина с капустой"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 1, items_1, self.catalog_service))

        # 2 portions: 600 / 4 * 2 = 300g
        items_2 = [
            {"id": "s1", "name": "Говядина", "amountLabel": "300 г", "linkedRecipeTitles": ["Говядина с капустой"]},
            {"id": "s2", "name": "Капуста", "amountLabel": "300 г", "linkedRecipeTitles": ["Говядина с капустой"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 2, items_2, self.catalog_service))

        # 4 portions: 600 / 4 * 4 = 600g
        items_4 = [
            {"id": "s1", "name": "Говядина", "amountLabel": "600 г", "linkedRecipeTitles": ["Говядина с капустой"]},
            {"id": "s2", "name": "Капуста", "amountLabel": "600 г", "linkedRecipeTitles": ["Говядина с капустой"]},
        ]
        self.assertTrue(is_shopping_consistent_with_menu(menu, 4, items_4, self.catalog_service))

    def test_fastapi_roundtrip_multi_serving_saves_without_stale(self):
        """Integration test: Saving scaled shopping for multi-serving recipe keeps shopping_stale=False."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "test_shopping.db"
            init_db(db_path)

            settings = AppSettings(
                app_stage="test",
                telegram_bot_token="test_token_shopping",
                allow_demo_auth=True,
                owner_allowlist=frozenset([99999]),
                db_path=db_path,
                dist_dir=Path(tmp_dir),
            )
            app = create_app(
                dist_dir=Path(tmp_dir),
                db_path=db_path,
                settings=settings,
                catalog_provider=lambda: self.catalog_service.get_catalog_data(),
            )
            client = TestClient(app)

            auth = client.get("/api/demo-session?demo_user=99999").json()
            headers = {"Authorization": f"Bearer {auth['session_token']}"}

            # Put scaled shopping items (1 portion of 2-serving recipe: 40g bacon, 2 eggs)
            shop_items = [
                {
                    "id": "shop-agg-becon",
                    "name": "Бекон",
                    "amountLabel": "40 г",
                    "department": "Мясо, птица и рыба",
                    "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                },
                {
                    "id": "shop-agg-eggs",
                    "name": "Яйца",
                    "amountLabel": "2 шт.",
                    "department": "Яйца и молочное",
                    "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                },
            ]
            s_resp = client.put(
                "/api/shopping",
                json={"schema_version": 1, "expected_revision": 0, "items": shop_items},
                headers=headers,
            )
            self.assertEqual(s_resp.status_code, 200)

            # Put user state with menu containing k1 and shopping_batches=1
            menu = {
                "mode": "keto",
                "numDays": 1,
                "meals": 1,
                "created": 1730000000000,
                "days": [{"date": "2026-11-06", "slots": {"breakfast": "k1"}}],
            }
            u_resp = client.put(
                "/api/user",
                json={
                    "schema_version": 1,
                    "expected_revision": 0,
                    "profile": {
                        "settings": {
                            "confirmed18Plus": True,
                            "approach": "keto",
                            "restrictions": [],
                            "prepTimeMax": 30,
                            "mealsPerDay": 3,
                            "planDays": 1,
                        }
                    },
                    "state": {
                        "schema_version": 1,
                        "menu": menu,
                        "shopping_batches": 1,
                        "shopping_stale": False,
                    },
                },
                headers=headers,
            )
            self.assertEqual(u_resp.status_code, 200)

            user_data = client.get("/api/user", headers=headers).json()
            self.assertIn("state", user_data)
            self.assertFalse(
                user_data["state"]["shopping_stale"],
                "Multi-serving recipe shopping list MUST NOT be marked shopping_stale=True after saving!",
            )

    def test_negative_wrong_quantity_marks_shopping_stale(self):
        """Negative test: Saving shopping list with wrong quantity marks shopping_stale=True."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "test_neg.db"
            init_db(db_path)

            settings = AppSettings(
                app_stage="test",
                telegram_bot_token="test_token_shopping",
                allow_demo_auth=True,
                owner_allowlist=frozenset([99999]),
                db_path=db_path,
                dist_dir=Path(tmp_dir),
            )
            app = create_app(
                dist_dir=Path(tmp_dir),
                db_path=db_path,
                settings=settings,
                catalog_provider=lambda: self.catalog_service.get_catalog_data(),
            )
            client = TestClient(app)

            auth = client.get("/api/demo-session?demo_user=99999").json()
            headers = {"Authorization": f"Bearer {auth['session_token']}"}

            # Put shopping with wrong quantity: 999g instead of 40g
            shop_items = [
                {
                    "id": "shop-agg-becon",
                    "name": "Бекон",
                    "amountLabel": "999 г",
                    "department": "Мясо, птица и рыба",
                    "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                },
                {
                    "id": "shop-agg-eggs",
                    "name": "Яйца",
                    "amountLabel": "2 шт.",
                    "department": "Яйца и молочное",
                    "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                },
            ]
            s_resp = client.put(
                "/api/shopping",
                json={"schema_version": 1, "expected_revision": 0, "items": shop_items},
                headers=headers,
            )
            self.assertEqual(s_resp.status_code, 200)

            menu = {
                "mode": "keto",
                "numDays": 1,
                "meals": 1,
                "created": 1730000000000,
                "days": [{"date": "2026-11-06", "slots": {"breakfast": "k1"}}],
            }
            u_resp = client.put(
                "/api/user",
                json={
                    "schema_version": 1,
                    "expected_revision": 0,
                    "profile": {
                        "settings": {
                            "confirmed18Plus": True,
                            "approach": "keto",
                            "restrictions": [],
                            "prepTimeMax": 30,
                            "mealsPerDay": 3,
                            "planDays": 1,
                        }
                    },
                    "state": {
                        "schema_version": 1,
                        "menu": menu,
                        "shopping_batches": 1,
                        "shopping_stale": False,
                    },
                },
                headers=headers,
            )
            self.assertEqual(u_resp.status_code, 200)

            user_data = client.get("/api/user", headers=headers).json()
            self.assertTrue(
                user_data["state"]["shopping_stale"],
                "Shopping list with incorrect quantity MUST be marked shopping_stale=True!",
            )

    def test_negative_missing_ingredient_marks_shopping_stale(self):
        """Negative test: Saving shopping list missing an ingredient marks shopping_stale=True."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "test_missing.db"
            init_db(db_path)

            settings = AppSettings(
                app_stage="test",
                telegram_bot_token="test_token_shopping",
                allow_demo_auth=True,
                owner_allowlist=frozenset([99999]),
                db_path=db_path,
                dist_dir=Path(tmp_dir),
            )
            app = create_app(
                dist_dir=Path(tmp_dir),
                db_path=db_path,
                settings=settings,
                catalog_provider=lambda: self.catalog_service.get_catalog_data(),
            )
            client = TestClient(app)

            auth = client.get("/api/demo-session?demo_user=99999").json()
            headers = {"Authorization": f"Bearer {auth['session_token']}"}

            # Put shopping with missing eggs (only bacon)
            shop_items = [
                {
                    "id": "shop-agg-becon",
                    "name": "Бекон",
                    "amountLabel": "40 г",
                    "department": "Мясо, птица и рыба",
                    "linkedRecipeTitles": ["Сливочная яичница с беконом и шпинатом"],
                    "alreadyHave": False,
                    "checkedInStore": False,
                },
            ]
            s_resp = client.put(
                "/api/shopping",
                json={"schema_version": 1, "expected_revision": 0, "items": shop_items},
                headers=headers,
            )
            self.assertEqual(s_resp.status_code, 200)

            menu = {
                "mode": "keto",
                "numDays": 1,
                "meals": 1,
                "created": 1730000000000,
                "days": [{"date": "2026-11-06", "slots": {"breakfast": "k1"}}],
            }
            u_resp = client.put(
                "/api/user",
                json={
                    "schema_version": 1,
                    "expected_revision": 0,
                    "profile": {
                        "settings": {
                            "confirmed18Plus": True,
                            "approach": "keto",
                            "restrictions": [],
                            "prepTimeMax": 30,
                            "mealsPerDay": 3,
                            "planDays": 1,
                        }
                    },
                    "state": {
                        "schema_version": 1,
                        "menu": menu,
                        "shopping_batches": 1,
                        "shopping_stale": False,
                    },
                },
                headers=headers,
            )
            self.assertEqual(u_resp.status_code, 200)

            user_data = client.get("/api/user", headers=headers).json()
            self.assertTrue(
                user_data["state"]["shopping_stale"],
                "Shopping list missing ingredients MUST be marked shopping_stale=True!",
            )


if __name__ == "__main__":
    unittest.main()

