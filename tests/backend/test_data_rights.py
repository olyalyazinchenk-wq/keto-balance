import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "333444555:GDPR_DATA_RIGHTS_TEST_BOT"

class TestDataRights(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "rights_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        resp_a = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 2001, "first_name": "GdprUserA"}, TEST_TOKEN)}
        )
        self.token_a = resp_a.json()["session_token"]

        resp_b = self.client.post(
            "/api/session",
            json={"init_data": generate_telegram_init_data({"id": 2002, "first_name": "GdprUserB"}, TEST_TOKEN)}
        )
        self.token_b = resp_b.json()["session_token"]

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_export_user_data(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        self.client.put("/api/user", json={"expected_revision": 0, "profile": {"weight": 77.0}, "state": None}, headers=headers_a)

        export_resp = self.client.get("/api/user/data", headers=headers_a)
        self.assertEqual(export_resp.status_code, 200)
        data = export_resp.json()
        self.assertEqual(data["user_id"], 2001)
        self.assertTrue(data["found"])
        self.assertEqual(data["profile"]["weight"], 77.0)
        self.assertIn("exported_at", data)

    def test_delete_user_data(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        self.client.put("/api/user", json={"expected_revision": 0, "profile": {"weight": 77.0}, "state": None}, headers=headers_a)

        del_resp = self.client.delete("/api/user/data", headers=headers_a)
        self.assertEqual(del_resp.status_code, 200)
        self.assertTrue(del_resp.json()["deleted"])

        # Проверка, что после удаления сессия каскадно инвалидирована (401)
        export_after = self.client.get("/api/user/data", headers=headers_a)
        self.assertEqual(export_after.status_code, 401)

    def test_cross_user_deletion_forbidden(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        del_cross = self.client.delete("/api/user/data?user_id=2002", headers=headers_a)
        self.assertEqual(del_cross.status_code, 403)

    def test_record_and_get_user_consents(self):
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        payload = {
            "consents": [
                {"consent_type": "personal_data", "version": "v1.0.0-release", "granted": True, "source": "tma_start_gate"},
                {"consent_type": "age_18_plus", "version": "v1.0.0-release", "granted": True, "source": "tma_start_gate"},
            ]
        }
        resp = self.client.post("/api/user/consents", json=payload, headers=headers_a)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])
        self.assertEqual(resp.json()["recorded"], 2)

        get_resp = self.client.get("/api/user/consents", headers=headers_a)
        self.assertEqual(get_resp.status_code, 200)
        consents = get_resp.json()["consents"]
        self.assertEqual(len(consents), 2)
        types = [c["consent_type"] for c in consents]
        self.assertIn("personal_data", types)
        self.assertIn("age_18_plus", types)

        # Check that consents appear in GDPR export
        export_resp = self.client.get("/api/user/data", headers=headers_a)
        self.assertEqual(export_resp.status_code, 200)
        exp_data = export_resp.json()
        self.assertIn("consents", exp_data)
        self.assertEqual(len(exp_data["consents"]), 2)

    def test_order_anonymization_on_user_deletion(self):
        from bot.app_db import create_order, get_order
        headers_a = {"Authorization": f"Bearer {self.token_a}"}
        order_id = create_order(
            user_id=2001,
            product_id="sub_month",
            amount_rub=1900.0,
            provider="demo",
            db_path=self.db_path,
        )

        # Delete user
        del_resp = self.client.delete("/api/user/data", headers=headers_a)
        self.assertEqual(del_resp.status_code, 200)

        # Check order still exists but is anonymized to user_id=0
        saved_order = get_order(self.db_path, order_id)
        self.assertIsNotNone(saved_order)
        self.assertEqual(saved_order["user_id"], 0)
        self.assertEqual(saved_order["product_id"], "sub_month")

    def test_educational_guides_endpoint(self):
        resp = self.client.get("/api/education/guides")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("guides", data)
        self.assertIn("count", data)
        self.assertGreaterEqual(data["count"], 8)
        first_guide = data["guides"][0]
        self.assertIn("id", first_guide)
        self.assertIn("title", first_guide)
        self.assertIn("category", first_guide)
        self.assertIn("disclaimer", first_guide)
