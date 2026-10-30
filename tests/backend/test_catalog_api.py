import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings, PILOT_RECIPE_IDS
from bot.server import create_app

class TestCatalogApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.settings = AppSettings(
            app_stage="pilot",
            released_recipe_ids=PILOT_RECIPE_IDS,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), settings=self.settings)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_catalog_endpoint_returns_pilot_recipes(self):
        resp = self.client.get("/api/catalog")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("recipes", data)
        self.assertEqual(data["total"], 15)
        self.assertEqual(len(data["recipes"]), 15)
        self.assertEqual(data["stage"], "pilot")

        returned_ids = {r["id"] for r in data["recipes"]}
        self.assertEqual(returned_ids, PILOT_RECIPE_IDS)

    def test_catalog_recipe_data_structure(self):
        resp = self.client.get("/api/catalog")
        data = resp.json()
        for recipe in data["recipes"]:
            self.assertIn("id", recipe)
            self.assertIn("title", recipe)
            self.assertIn("kcal", recipe)
            self.assertIsInstance(recipe["kcal"], (int, float))
            self.assertGreater(recipe["kcal"], 0)
