import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path

from bot.app_settings import BASE_DIR, get_settings
from bot.app_db import init_db, get_admin_recipes

class TestRecipeApprovalRemediation(unittest.TestCase):
    def test_seeded_recipes_do_not_have_auto_approval_or_clinical_source(self):
        """
        Seeded test recipes in admin_recipes must NOT automatically receive Olga's
        approval ('approved': True, 'approved_by': 'Ольга') or fake clinical sources.
        """
        with tempfile.TemporaryDirectory() as tmp_dir:
            test_db = Path(tmp_dir) / "isolated_seed_test.db"
            init_db(test_db, force=True)

            recipes = get_admin_recipes(db_path=test_db)
            self.assertGreaterEqual(len(recipes), 1, "Expected seeded recipes")

            for r in recipes:
                marks = r.get("approval_marks") or {}
                self.assertFalse(
                    marks.get("approved") is True,
                    f"Recipe {r['recipe_id']} has automatic approval: {marks}"
                )
                self.assertNotEqual(
                    marks.get("approved_by"),
                    "Ольга",
                    f"Recipe {r['recipe_id']} has automatic approval_by 'Ольга': {marks}"
                )
                self.assertNotEqual(
                    marks.get("source"),
                    "Клинический протокол КетоБаланс",
                    f"Recipe {r['recipe_id']} has automatic clinical source: {marks}"
                )

    def test_test_db_cleanup_strictly_isolated_from_production(self):
        """
        Test operations must run on temporary databases and must not touch or create
        the default production database path.
        """
        prod_db = get_settings().db_path
        prod_exists_before = prod_db.is_file()
        prod_mtime_before = prod_db.stat().st_mtime if prod_exists_before else None

        with tempfile.TemporaryDirectory() as tmp_dir:
            test_db = Path(tmp_dir) / "isolated_cleanup_test.db"
            init_db(test_db, force=True)
            self.assertTrue(test_db.is_file())

        # Temporary DB is cleaned up with tmp_dir
        self.assertFalse(test_db.is_file())

        # Production DB must be completely untouched
        if prod_exists_before:
            self.assertEqual(prod_db.stat().st_mtime, prod_mtime_before)
        else:
            self.assertFalse(prod_db.is_file(), "Production DB was created during test execution!")

if __name__ == "__main__":
    unittest.main()
