import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from pathlib import Path
from bot.app_settings import AppSettings, PILOT_RECIPE_IDS, get_settings, set_settings

class TestAppSettings(unittest.TestCase):
    def tearDown(self):
        set_settings(None)

    def test_default_settings_invariants(self):
        settings = AppSettings()
        self.assertEqual(len(settings.released_recipe_ids), 15)
        self.assertEqual(settings.released_recipe_ids, PILOT_RECIPE_IDS)
        self.assertEqual(settings.auth_max_age_seconds, 86400)
        self.assertGreaterEqual(settings.max_support_message_length, 500)
        self.assertTrue(settings.is_pilot)

    def test_pilot_recipe_ids_integrity(self):
        expected = {f"k{i}" for i in range(1, 16)}
        self.assertEqual(PILOT_RECIPE_IDS, expected)
        for rid in PILOT_RECIPE_IDS:
            self.assertTrue(rid.startswith("k"))

    def test_settings_singleton_and_override(self):
        s1 = get_settings()
        s2 = get_settings()
        self.assertIs(s1, s2)

        custom = AppSettings(app_stage="test_custom", auth_max_age_seconds=120)
        set_settings(custom)
        self.assertEqual(get_settings().auth_max_age_seconds, 120)
        self.assertEqual(get_settings().app_stage, "test_custom")
