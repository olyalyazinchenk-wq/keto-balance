import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import sqlite3
import tempfile
import unittest
from pathlib import Path

from bot.app_db import (
    init_db,
    create_or_get_user,
    save_user_profile,
    get_user_profile,
    save_user_state,
    get_user_state,
    save_shopping_state,
    get_shopping_state,
    create_session,
    get_session_user,
    create_support_ticket,
    get_support_tickets,
    delete_all_user_data,
    export_all_user_data,
)

class TestAppDB(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_app.db"
        init_db(self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_wal_mode_enabled(self):
        conn = sqlite3.connect(str(self.db_path))
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode")
        mode = cur.fetchone()[0]
        conn.close()
        self.assertEqual(mode.lower(), "wal")

    def test_user_creation_and_isolation(self):
        u1 = create_or_get_user(101, username="alice", first_name="Alice", db_path=self.db_path)
        u2 = create_or_get_user(102, username="bob", first_name="Bob", db_path=self.db_path)
        self.assertEqual(u1["user_id"], 101)
        self.assertEqual(u2["user_id"], 102)

        save_user_profile(101, {"weight": 65.0, "goal": "keto"}, db_path=self.db_path)
        save_user_profile(102, {"weight": 85.0, "goal": "energy"}, db_path=self.db_path)

        p1 = get_user_profile(101, db_path=self.db_path)
        p2 = get_user_profile(102, db_path=self.db_path)
        self.assertEqual(p1["weight"], 65.0)
        self.assertEqual(p2["weight"], 85.0)

    def test_state_and_shopping_persistence(self):
        state = {
            "onboarding_completed": True,
            "selected_day": 3,
            "cooked_recipe_ids": ["k1", "k2"],
            "shopping_checked": {"item_1": True}
        }
        save_user_state(201, state, db_path=self.db_path)
        loaded = get_user_state(201, db_path=self.db_path)
        self.assertTrue(loaded["onboarding_completed"])
        self.assertEqual(loaded["selected_day"], 3)
        self.assertEqual(loaded["cooked_recipe_ids"], ["k1", "k2"])

        shopping = {
            "items": [{"id": "i1", "name": "Butter", "amount": 200, "unit": "g"}],
            "checked_map": {"i1": True}
        }
        save_shopping_state(201, shopping, db_path=self.db_path)
        loaded_shop = get_shopping_state(201, db_path=self.db_path)
        self.assertEqual(len(loaded_shop["items"]), 1)
        self.assertTrue(loaded_shop["checked_map"]["i1"])

    def test_support_ticket_creation(self):
        t_id = create_support_ticket(301, topic="order", message="Help with payment", contact="@user", db_path=self.db_path)
        self.assertGreater(t_id, 0)
        tickets = get_support_tickets(301, db_path=self.db_path)
        self.assertEqual(len(tickets), 1)
        self.assertEqual(tickets[0]["topic"], "order")
        self.assertEqual(tickets[0]["status"], "open")

    def test_cascading_delete(self):
        create_or_get_user(401, db_path=self.db_path)
        save_user_profile(401, {"weight": 70.0}, db_path=self.db_path)
        create_session(401, "token_401", db_path=self.db_path)
        create_support_ticket(401, "topic", "msg", db_path=self.db_path)

        deleted = delete_all_user_data(401, db_path=self.db_path)
        self.assertTrue(deleted)
        self.assertIsNone(get_user_profile(401, db_path=self.db_path))
        self.assertIsNone(get_session_user("token_401", db_path=self.db_path))
        self.assertEqual(len(get_support_tickets(401, db_path=self.db_path)), 0)
