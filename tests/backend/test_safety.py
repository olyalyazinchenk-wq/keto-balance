import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from bot.safety import (
    detect_emergency_symptoms,
    check_safety_guard,
    release_safety_hold,
    EMERGENCY_RESPONSE,
)
from bot.payments import init_purchase, complete_demo_payment
from bot.config import PAYMENT_MODE


class TestEmergencySafetyProtocol(unittest.TestCase):
    def test_detect_explicit_emergency_symptoms(self):
        """Явные экстренные симптомы должны надежно детектироваться."""
        self.assertTrue(detect_emergency_symptoms("У меня острая боль в груди"))
        self.assertTrue(detect_emergency_symptoms("Давит в груди уже полчаса"))
        self.assertTrue(detect_emergency_symptoms("Жжение в груди и тяжело"))
        self.assertTrue(detect_emergency_symptoms("Сердце болит сильно"))
        self.assertTrue(detect_emergency_symptoms("Я задыхаюсь помогите"))
        self.assertTrue(detect_emergency_symptoms("Приступ удушья"))
        self.assertTrue(detect_emergency_symptoms("Очень трудно дышать"))
        self.assertTrue(detect_emergency_symptoms("Не могу дышать нормально"))
        self.assertTrue(detect_emergency_symptoms("Острая нехватка воздуха"))
        self.assertTrue(detect_emergency_symptoms("Была потеря сознания"))
        self.assertTrue(detect_emergency_symptoms("Падаю в обморок прямо сейчас"))
        self.assertTrue(detect_emergency_symptoms("Потемнело в глазах и кружится голова"))

    def test_detect_mixed_queries_with_diet_context(self):
        """Смешанный запрос (диета + симптом) обязан активировать протокол безопасности."""
        self.assertTrue(detect_emergency_symptoms("Второй день на кето, но появилась боль в груди, что съесть?"))
        self.assertTrue(detect_emergency_symptoms("После карнивор обеда задыхаюсь и тошнит"))

    def test_safe_queries_do_not_trigger_false_positives(self):
        """Обычные запросы о питании и рецептах не должны вызывать ложных срабатываний."""
        self.assertFalse(detect_emergency_symptoms("Подскажи рецепт омлета на завтрак"))
        self.assertFalse(detect_emergency_symptoms("Сколько воды пить в день?"))
        self.assertFalse(detect_emergency_symptoms("Какая норма жиров на кето?"))
        self.assertFalse(detect_emergency_symptoms(""))

    def test_negation_context_does_not_trigger_emergency(self):
        """Явное отрицание симптома не должно вызывать ложный emergency trigger."""
        self.assertFalse(detect_emergency_symptoms("Самочувствие отличное, нет боли в груди"))
        self.assertFalse(detect_emergency_symptoms("Не задыхаюсь, пульс в норме"))

    def test_safety_guard_activates_and_persists_hold(self):
        """Safety guard активирует safety_hold и блокирует последующие запросы до явного сброса."""
        user_data = {}
        
        # Первый запрос с симптомами
        blocked, msg = check_safety_guard(user_data, "Мне плохо, давит в груди")
        self.assertTrue(blocked)
        self.assertEqual(msg, EMERGENCY_RESPONSE)
        self.assertTrue(user_data.get("safety_hold"))
        self.assertEqual(user_data.get("safety_hold_reason"), "emergency_symptoms")
        
        # Следующий обычный запрос должен быть заблокирован из-за активного hold
        blocked2, msg2 = check_safety_guard(user_data, "Дай рецепт супа")
        self.assertTrue(blocked2)
        self.assertEqual(msg2, EMERGENCY_RESPONSE)
        
        # Снятие ошибочной отметки
        release_safety_hold(user_data)
        self.assertNotIn("safety_hold", user_data)
        
        # После снятия обычный запрос проходит
        blocked3, msg3 = check_safety_guard(user_data, "Дай рецепт супа")
        self.assertFalse(blocked3)
        self.assertIsNone(msg3)


class TestPremiumInvariance(unittest.TestCase):
    def test_payment_mode_is_strictly_disabled(self):
        """Режим платежей должен быть strictly disabled в P0."""
        self.assertEqual(PAYMENT_MODE, "disabled")

    def test_init_purchase_unconditionally_raises_runtime_error(self):
        """Попытка вызова init_purchase безусловно выбрасывает RuntimeError."""
        with self.assertRaises(RuntimeError) as ctx:
            init_purchase(user_id=123, product_id="sub_month")
        self.assertIn("Payments are disabled", str(ctx.exception))

    def test_complete_demo_payment_unconditionally_raises_runtime_error(self):
        """Попытка вызова complete_demo_payment безусловно выбрасывает RuntimeError."""
        with self.assertRaises(RuntimeError) as ctx:
            complete_demo_payment(order_id="any_order")
        self.assertIn("Payments are disabled", str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
