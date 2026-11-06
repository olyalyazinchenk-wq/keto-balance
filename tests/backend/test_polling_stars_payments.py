import asyncio
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from bot.app_settings import AppSettings, set_settings
from bot.app_db import (
    create_or_get_user,
    create_order,
    get_order,
    get_user_subscription,
)
from bot.bot import (
    pre_checkout_handler,
    successful_payment_handler,
    paysupport_cmd,
    callback_handler,
)


class TestPollingStarsPayments(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "stars_polling_test.db"
        self.settings = AppSettings(
            app_stage="test",
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
        )
        set_settings(self.settings)

        self.user_id = 888123
        create_or_get_user(self.user_id, username="stars_buyer", db_path=self.db_path)
        self.order_id = create_order(
            user_id=self.user_id,
            product_id="sub_month",
            amount_rub=1900.0,
            provider="telegram_stars",
            db_path=self.db_path,
        )

    def tearDown(self):
        set_settings(None)
        self.tmp_dir.cleanup()

    # --- PRE_CHECKOUT_QUERY POLLING TESTS ---

    async def test_pre_checkout_valid_order_approves(self):
        update = MagicMock()
        query = MagicMock()
        query.id = "pcq_valid_999"
        query.invoice_payload = self.order_id
        query.currency = "XTR"
        query.total_amount = 1000
        query.from_user = MagicMock()
        query.from_user.id = self.user_id
        query.answer = AsyncMock()
        update.pre_checkout_query = query

        await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)
        query.answer.assert_awaited_once_with(ok=True)

    async def test_pre_checkout_unknown_order_rejects(self):
        update = MagicMock()
        query = MagicMock()
        query.id = "pcq_invalid_111"
        query.invoice_payload = "ord_unknown_0000"
        query.currency = "XTR"
        query.total_amount = 1000
        query.from_user = MagicMock()
        query.from_user.id = self.user_id
        query.answer = AsyncMock()
        update.pre_checkout_query = query

        await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)

        query.answer.assert_awaited_once()
        args, kwargs = query.answer.call_args
        self.assertFalse(kwargs.get("ok"))
        self.assertIn("Заказ не найден", kwargs.get("error_message", ""))

    async def test_pre_checkout_amount_or_currency_mismatch_rejects(self):
        update = MagicMock()
        query = MagicMock()
        query.id = "pcq_mismatch_222"
        query.invoice_payload = self.order_id
        query.currency = "RUB"  # Wrong currency: must be XTR
        query.total_amount = 1000
        query.from_user = MagicMock()
        query.from_user.id = self.user_id
        query.answer = AsyncMock()
        update.pre_checkout_query = query

        await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)

        query.answer.assert_awaited_once()
        args, kwargs = query.answer.call_args
        self.assertFalse(kwargs.get("ok"))
        self.assertIn("Неверная сумма или валюта", kwargs.get("error_message", ""))

    async def test_pre_checkout_user_mismatch_rejects(self):
        update = MagicMock()
        query = MagicMock()
        query.id = "pcq_user_mismatch_333"
        query.invoice_payload = self.order_id
        query.currency = "XTR"
        query.total_amount = 1000
        query.from_user = MagicMock()
        query.from_user.id = 999999  # Attacker trying to fulfill someone else's order
        query.answer = AsyncMock()
        update.pre_checkout_query = query

        await pre_checkout_handler(update, MagicMock(), db_path=self.db_path)

        query.answer.assert_awaited_once()
        args, kwargs = query.answer.call_args
        self.assertFalse(kwargs.get("ok"))
        self.assertIn("Несовпадение пользователя", kwargs.get("error_message", ""))

    # --- SUCCESSFUL_PAYMENT POLLING TESTS ---

    async def test_successful_payment_polling_activates_subscription(self):
        # Verify order is pending before payment
        order_before = get_order(self.db_path, self.order_id)
        self.assertEqual(order_before["status"], "pending")

        update = MagicMock()
        msg = MagicMock()
        succ = MagicMock()
        succ.invoice_payload = self.order_id
        succ.currency = "XTR"
        succ.total_amount = 1000
        msg.successful_payment = succ
        msg.from_user = MagicMock()
        msg.from_user.id = self.user_id
        msg.reply_html = AsyncMock()
        update.message = msg

        await successful_payment_handler(update, MagicMock(), db_path=self.db_path)

        # Verify order completed
        order_after = get_order(self.db_path, self.order_id)
        self.assertEqual(order_after["status"], "completed")

        # Verify subscription activated in DB
        sub = get_user_subscription(self.db_path, self.user_id)
        self.assertIsNotNone(sub)
        self.assertEqual(sub["tier"], "sub_month")
        self.assertEqual(sub["status"], "active")
        self.assertIsNotNone(sub["expires_at"])

        # Verify user received confirmation message with webapp button
        msg.reply_html.assert_awaited_once()
        call_text = msg.reply_html.call_args[0][0]
        self.assertIn("Оплата успешно получена", call_text)
        self.assertIn("Подписка активна до", call_text)

    async def test_successful_payment_idempotency_on_replay(self):
        update = MagicMock()
        msg = MagicMock()
        succ = MagicMock()
        succ.invoice_payload = self.order_id
        succ.currency = "XTR"
        succ.total_amount = 1000
        msg.successful_payment = succ
        msg.from_user = MagicMock()
        msg.from_user.id = self.user_id
        msg.reply_html = AsyncMock()
        update.message = msg

        # First payment
        await successful_payment_handler(update, MagicMock(), db_path=self.db_path)
        sub1 = get_user_subscription(self.db_path, self.user_id)
        exp1 = sub1["expires_at"]

        # Replayed payment
        await successful_payment_handler(update, MagicMock(), db_path=self.db_path)
        sub2 = get_user_subscription(self.db_path, self.user_id)
        exp2 = sub2["expires_at"]

        # Expiration date must remain strictly identical
        self.assertEqual(exp1, exp2, "Repeated payment must be strictly idempotent")

    # --- /PAYSUPPORT COMMAND TESTS ---

    async def test_paysupport_command_provides_clear_terms(self):
        update = MagicMock()
        msg = MagicMock()
        msg.reply_html = AsyncMock()
        update.message = msg
        update.callback_query = None

        await paysupport_cmd(update, MagicMock())

        msg.reply_html.assert_awaited_once()
        text = msg.reply_html.call_args[0][0]
        self.assertIn("Поддержка по оплате и подписке", text)
        self.assertIn("Telegram Stars", text)
        self.assertIn("Настройки → Мои подписки", text)
        self.assertIn("refundStarPayment", text)

    async def test_callback_paysupport_invokes_cmd(self):
        update = MagicMock()
        query = MagicMock()
        query.data = "paysupport_cb"
        query.from_user = MagicMock()
        query.from_user.id = self.user_id
        query.answer = AsyncMock()
        query.edit_message_text = AsyncMock()
        update.callback_query = query
        update.message = None

        await callback_handler(update, MagicMock())

        query.answer.assert_awaited_once()
        query.edit_message_text.assert_awaited_once()
        call_text = query.edit_message_text.call_args[0][0]
        self.assertIn("Поддержка по оплате и подписке", call_text)


if __name__ == "__main__":
    unittest.main()
