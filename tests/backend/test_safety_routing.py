import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from bot.safety import (
    evaluate_contraindications,
    detect_emergency_symptoms,
    check_safety_guard,
    STRICT_CONTRAINDICATIONS,
)

class TestSafetyRouting(unittest.TestCase):
    def test_contraindication_blocks_high_risk(self):
        high_risk_cases = [
            ["type_1_diabetes"],
            ["pregnancy"],
            ["breastfeeding"],
            ["kidney_disease"],
            ["liver_failure"],
            ["pancreatitis"],
            ["eating_disorder"],
        ]
        for condition_list in high_risk_cases:
            safe, blocked, reason, detected = evaluate_contraindications(condition_list)
            self.assertFalse(safe, f"Condition {condition_list} should not be safe")
            self.assertTrue(blocked, f"Condition {condition_list} should be blocked")
            self.assertIsNotNone(reason)
            self.assertEqual(len(detected), 1)

    def test_safe_profiles_pass(self):
        safe_cases = [
            [],
            ["sedentary_lifestyle"],
            ["sweet_tooth"],
            ["office_work"],
        ]
        for condition_list in safe_cases:
            safe, blocked, reason, detected = evaluate_contraindications(condition_list)
            self.assertTrue(safe)
            self.assertFalse(blocked)
            self.assertIsNone(reason)
            self.assertEqual(len(detected), 0)

    def test_emergency_symptoms_trigger_hold(self):
        user_state = {}
        is_hold, msg = check_safety_guard(user_state, "у меня сильная боль в груди и задыхаюсь")
        self.assertTrue(is_hold)
        self.assertTrue(user_state.get("safety_hold"))
        self.assertIn("112", msg)

    def test_negated_symptoms_do_not_trigger_hold(self):
        user_state = {}
        is_hold, msg = check_safety_guard(user_state, "нет боли в груди, все в порядке")
        self.assertFalse(is_hold)
        self.assertFalse(user_state.get("safety_hold", False))
