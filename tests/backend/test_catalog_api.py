import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.server import create_app

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "pilot" / "catalog.json"

class TestCatalogApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.settings = AppSettings(
            app_stage="pilot",
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            settings=self.settings,
            catalog_provider=lambda: self.fixture
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_catalog_endpoint_returns_pilot_recipes(self):
        resp = self.client.get("/api/catalog")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["schema_version"], 1)
        self.assertTrue(data["test_only"])
        self.assertEqual(len(data["recipes"]), 5)
        self.assertEqual(data["released_ids"], ["k1", "k2", "k3", "k4", "k5"])

        returned_ids = {r["id"] for r in data["recipes"]}
        self.assertEqual(returned_ids, {"k1", "k2", "k3", "k4", "k5"})

    def test_catalog_recipe_data_structure(self):
        resp = self.client.get("/api/catalog")
        data = resp.json()
        for recipe in data["recipes"]:
            self.assertIn("id", recipe)
            self.assertIn("title", recipe)
            self.assertIn("kcal", recipe)
            self.assertIsInstance(recipe["kcal"], (int, float))
            self.assertGreater(recipe["kcal"], 0)

if __name__ == "__main__":
    unittest.main()
