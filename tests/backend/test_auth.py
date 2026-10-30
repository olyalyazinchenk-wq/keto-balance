import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import time
import unittest
from bot.auth import (
    parse_and_validate_init_data,
    generate_telegram_init_data,
    AuthError,
    InvalidSignatureError,
    TokenExpiredError,
)

TEST_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789"

class TestAuth(unittest.TestCase):
    def test_valid_init_data_passes(self):
        user = {"id": 987654321, "first_name": "Elena", "username": "elena_keto"}
        now = int(time.time())
        init_data = generate_telegram_init_data(user, TEST_BOT_TOKEN, auth_date=now)

        validated = parse_and_validate_init_data(init_data, TEST_BOT_TOKEN, current_time=now + 5)
        self.assertIn("user_data", validated)
        self.assertEqual(validated["user_data"]["id"], 987654321)
        self.assertEqual(validated["user_data"]["first_name"], "Elena")
        self.assertEqual(validated["auth_date"], now)

    def test_tampered_hash_fails(self):
        user = {"id": 111, "first_name": "Tamper"}
        init_data = generate_telegram_init_data(user, TEST_BOT_TOKEN)
        tampered = init_data.replace("hash=", "hash=deadbeef")

        with self.assertRaises(InvalidSignatureError):
            parse_and_validate_init_data(tampered, TEST_BOT_TOKEN)

    def test_missing_hash_fails(self):
        with self.assertRaises(InvalidSignatureError):
            parse_and_validate_init_data("auth_date=1600000000&query_id=123", TEST_BOT_TOKEN)

    def test_empty_string_fails(self):
        with self.assertRaises(AuthError):
            parse_and_validate_init_data("", TEST_BOT_TOKEN)
        with self.assertRaises(AuthError):
            parse_and_validate_init_data(None, TEST_BOT_TOKEN)

    def test_expired_auth_date_fails(self):
        user = {"id": 222, "first_name": "Old"}
        old_time = 1700000000
        now = old_time + 86401 # 24 часа + 1 секунда
        init_data = generate_telegram_init_data(user, TEST_BOT_TOKEN, auth_date=old_time)

        with self.assertRaises(TokenExpiredError):
            parse_and_validate_init_data(init_data, TEST_BOT_TOKEN, max_age_seconds=86400, current_time=now)

    def test_wrong_bot_token_fails(self):
        user = {"id": 333, "first_name": "WrongToken"}
        init_data = generate_telegram_init_data(user, TEST_BOT_TOKEN)
        other_token = "987654321:XYZotherTOKEN1234567890abcdef"

        with self.assertRaises(InvalidSignatureError):
            parse_and_validate_init_data(init_data, other_token)
