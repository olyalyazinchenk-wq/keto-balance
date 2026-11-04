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

    def test_pilot_preferences_strict_validation(self):
        from bot.pilot_models import PilotPreferencesV1
        valid = PilotPreferencesV1(
            confirmed18Plus=True,
            approach="keto",
            restrictions=["exclude_eggs", "exclude_dairy"],
            prepTimeMax=30,
            mealsPerDay=3,
            preferenceNote=""
        )
        self.assertTrue(valid.confirmed18Plus)
        self.assertEqual(valid.prepTimeMax, 30)

        # Boolean strictness (int not accepted as bool)
        with self.assertRaises(ValidationError):
            PilotPreferencesV1(confirmed18Plus=1, approach="keto", restrictions=[], prepTimeMax=30, mealsPerDay=3)

        # Invalid restriction token
        with self.assertRaises(ValidationError):
            PilotPreferencesV1(confirmed18Plus=True, approach="keto", restrictions=["unknown_allergy"], prepTimeMax=30, mealsPerDay=3)

        # prepTimeMax out of range (0..240)
        with self.assertRaises(ValidationError):
            PilotPreferencesV1(confirmed18Plus=True, approach="keto", restrictions=[], prepTimeMax=300, mealsPerDay=3)

        # Unknown field rejected
        with self.assertRaises(ValidationError):
            PilotPreferencesV1(confirmed18Plus=True, approach="keto", restrictions=[], prepTimeMax=30, mealsPerDay=3, extra_field="bad")

    def test_pilot_user_write_revision_validation(self):
        from bot.pilot_models import PilotUserWriteV1
        # revision=0 is valid
        valid_zero = PilotUserWriteV1(expected_revision=0, profile=None, state=None)
        self.assertEqual(valid_zero.expected_revision, 0)

        # negative revision rejected
        with self.assertRaises(ValidationError):
            PilotUserWriteV1(expected_revision=-1, profile=None, state=None)

        # float revision rejected
        with self.assertRaises(ValidationError):
            PilotUserWriteV1(expected_revision=1.5, profile=None, state=None)

        # boolean revision rejected
        with self.assertRaises(ValidationError):
            PilotUserWriteV1(expected_revision=True, profile=None, state=None)

    def test_pilot_state_menu_and_selected_date_validation(self):
        from bot.pilot_models import PilotStateV1, GeneratedMenuModel, DayMenuModel
        # null menu with null selected_date is valid
        valid_null = PilotStateV1(menu=None, selected_date=None)
        self.assertIsNone(valid_null.selected_date)

        # null menu with non-null selected_date is rejected
        with self.assertRaises(ValidationError):
            PilotStateV1(menu=None, selected_date="2026-10-31")

        # invalid calendar date rejected
        with self.assertRaises(ValidationError):
            DayMenuModel(date="2026-02-31") # Feb 31 does not exist

        # menu with matching selected_date is valid
        day = DayMenuModel(date="2026-10-31", slots={"m1": "k1"})
        menu = GeneratedMenuModel(mode="keto", numDays=1, meals=1, portion=1, saved=True, created=1700000000, days=[day])
        valid_state = PilotStateV1(menu=menu, selected_date="2026-10-31")
        self.assertEqual(valid_state.selected_date, "2026-10-31")

        # selected_date not in menu days is rejected
        with self.assertRaises(ValidationError):
            PilotStateV1(menu=menu, selected_date="2026-11-01")
