import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.pilot_models import PilotStateV1
from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import save_pilot_user, get_pilot_user

TEST_TOKEN = "111222333:TEST_TOKEN_FOR_BATCHES_4"

class TestShoppingBatchesRemediation(unittest.TestCase):
    def test_pilot_state_model_accepts_batches_4(self):
        """PilotStateV1 model must accept shopping_batches=4 without ValidationError."""
        state = PilotStateV1(
            schema_version=1,
            menu=None,
            selected_date=None,
            checked_ingredients={},
            checked_steps={},
            shopping_batches=4,
            shopping_stale=False,
        )
        self.assertEqual(state.shopping_batches, 4)

    def test_user_api_and_db_save_and_rehydrate_batches_4(self):
        """PUT /api/user with shopping_batches=4 and app_db save/rehydrate must preserve value 4."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "batches4_test.db"
            settings = AppSettings(
                telegram_bot_token=TEST_TOKEN,
                db_path=db_path,
                dist_dir=Path(tmp_dir),
            )
            app = create_app(dist_dir=Path(tmp_dir), db_path=db_path, settings=settings)
            client = TestClient(app)

            # Create session
            resp_session = client.post(
                "/api/session",
                json={"init_data": generate_telegram_init_data({"id": 7771, "first_name": "BatchUser"}, TEST_TOKEN)}
            )
            token = resp_session.json()["session_token"]
            headers = {"Authorization": f"Bearer {token}"}

            payload = {
                "schema_version": 1,
                "expected_revision": 0,
                "profile": None,
                "state": {
                    "schema_version": 1,
                    "menu": None,
                    "selected_date": None,
                    "checked_ingredients": {},
                    "checked_steps": {},
                    "shopping_batches": 4,
                    "shopping_stale": False,
                }
            }

            put_resp = client.put("/api/user", json=payload, headers=headers)
            self.assertEqual(put_resp.status_code, 200, f"Expected 200 but got {put_resp.status_code}: {put_resp.text}")

            get_resp = client.get("/api/user", headers=headers)
            self.assertEqual(get_resp.status_code, 200)
            data = get_resp.json()
            self.assertIsNotNone(data["state"])
            self.assertEqual(data["state"]["shopping_batches"], 4)

            # Direct app_db verification
            db_user = get_pilot_user(7771, db_path=db_path)
            self.assertIsNotNone(db_user["state"])
            self.assertEqual(db_user["state"]["shopping_batches"], 4)

if __name__ == "__main__":
    unittest.main()
