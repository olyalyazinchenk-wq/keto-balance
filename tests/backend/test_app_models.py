import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from pydantic import ValidationError
from bot.app_models import (
    InitSessionPayload,
    SessionResponse,
    UserProfileModel,
    UserStateModel,
    ShoppingItem,
    ShoppingUpdatePayload,
    SupportTicketPayload,
    SupportTicketResponse,
    SafetyCheckPayload,
    SafetyCheckResponse,
)

class TestAppModels(unittest.TestCase):
    def test_init_session_validation(self):
        payload = InitSessionPayload(init_data="query_id=1&hash=abc")
        self.assertEqual(payload.init_data, "query_id=1&hash=abc")
        with self.assertRaises(ValidationError):
            InitSessionPayload()

    def test_user_profile_limits(self):
        valid = UserProfileModel(weight=75.5, height=178.0, age=30, gender="female", goal="weight_loss")
        self.assertEqual(valid.weight, 75.5)

        with self.assertRaises(ValidationError):
            UserProfileModel(weight=10.0) # below 20 kg
        with self.assertRaises(ValidationError):
            UserProfileModel(height=300.0) # above 260 cm
        with self.assertRaises(ValidationError):
            UserProfileModel(gender="invalid_gender")

    def test_support_ticket_length_and_whitespace(self):
        valid = SupportTicketPayload(message="Need assistance with meal plan", topic="nutrition")
        self.assertEqual(valid.topic, "nutrition")

        with self.assertRaises(ValidationError):
            SupportTicketPayload(message="   ") # whitespace only
        with self.assertRaises(ValidationError):
            SupportTicketPayload(message="hi") # too short (<3)
        with self.assertRaises(ValidationError):
            SupportTicketPayload(message="x" * 2001) # too long

    def test_shopping_payload(self):
        item = ShoppingItem(id="i1", name="Avocado", amount=2.0, unit="pcs", checked=False)
        self.assertEqual(item.amount, 2.0)
        payload = ShoppingUpdatePayload(items=[item], checked_map={"i1": False})
        self.assertEqual(len(payload.items), 1)

    def test_safety_check_response(self):
        resp = SafetyCheckResponse(
            safe=False,
            blocked=True,
            reason="Keto contraindicated for Type 1 Diabetes",
            contraindications_detected=["type_1_diabetes"]
        )
        self.assertFalse(resp.safe)
        self.assertTrue(resp.blocked)
