import unittest
from pathlib import Path
import bot.config as config

ROOT = Path(__file__).resolve().parent.parent.parent


class TestChannelNutritionistIsolation(unittest.TestCase):
    def test_config_variables_exist_and_isolated(self):
        """Verify all required variables exist independently in bot.config."""
        self.assertTrue(hasattr(config, "CHANNEL_URL"))
        self.assertTrue(hasattr(config, "SUPPORT_CHAT"))
        self.assertTrue(hasattr(config, "NUTRITIONIST_USERNAME"))
        self.assertTrue(hasattr(config, "NUTRITIONIST_CHAT_ID"))
        self.assertTrue(hasattr(config, "ADMIN_ID"))

    def test_no_fallback_to_channel_url_when_username_empty(self):
        """When NUTRITIONIST_USERNAME is missing or empty, must return None, NEVER CHANNEL_URL."""
        for empty_val in [None, "", "   ", "@"]:
            res = config.get_nutritionist_url(empty_val)
            self.assertIsNone(res, f"Expected None for empty nutritionist username {empty_val!r}, got {res!r}")
            self.assertNotEqual(res, config.CHANNEL_URL)
            self.assertNotEqual(res, config.SUPPORT_CHAT)

    def test_get_nutritionist_url_formats_valid_usernames(self):
        """get_nutritionist_url properly formats usernames with or without @ and full URLs."""
        self.assertEqual(config.get_nutritionist_url("olga_diet"), "https://t.me/olga_diet")
        self.assertEqual(config.get_nutritionist_url("@olga_diet"), "https://t.me/olga_diet")
        self.assertEqual(config.get_nutritionist_url("https://t.me/custom_link"), "https://t.me/custom_link")

    def test_nutritionist_chat_id_validation(self):
        """get_nutritionist_chat_id returns positive integer and never channel/group IDs (negative)."""
        chat_id = config.get_nutritionist_chat_id()
        if chat_id is not None:
            self.assertIsInstance(chat_id, int)
            self.assertGreater(chat_id, 0, "Telegram channel and supergroup IDs are negative; personal chat IDs must be positive")

    def test_env_example_documents_isolated_variables(self):
        """Verify .env.example documents each variable independently and warns against fallbacks."""
        env_example = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertIn("CHANNEL_URL=", env_example)
        self.assertIn("SUPPORT_CHAT=", env_example)
        self.assertIn("NUTRITIONIST_USERNAME=", env_example)
        self.assertIn("NUTRITIONIST_CHAT_ID=", env_example)
        self.assertIn("ADMIN_ID=", env_example)
        self.assertIn("fallback", env_example.lower())


if __name__ == '__main__':
    unittest.main()
