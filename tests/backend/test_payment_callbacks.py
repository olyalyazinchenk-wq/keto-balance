import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

import bot.bot as bbot

class TestPaymentCallbacks(unittest.TestCase):
    def test_plateau_keyboard_has_no_buy_button(self):
        kb = bbot.get_plateau_keyboard()
        for row in kb.inline_keyboard:
            for btn in row:
                if btn.callback_data:
                    self.assertFalse(btn.callback_data.startswith("buy_"), f"Found buy button: {btn.callback_data}")

    def test_tariffs_keyboard_has_no_buy_buttons(self):
        update = MagicMock()
        query = MagicMock()
        query.data = "tariffs"
        query.from_user.id = 111
        query.answer = AsyncMock()
        query.edit_message_text = AsyncMock()
        update.callback_query = query
        
        asyncio.run(bbot.callback_handler(update, MagicMock()))
        
        query.edit_message_text.assert_called_once()
        call_markup = query.edit_message_text.call_args[1].get("reply_markup") or query.edit_message_text.call_args[0][2]
        for row in call_markup.inline_keyboard:
            for btn in row:
                if btn.callback_data:
                    self.assertFalse(btn.callback_data.startswith("buy_"), f"Found buy button in tariffs: {btn.callback_data}")

    def test_buy_callback_returns_disabled_notice(self):
        update = MagicMock()
        query = MagicMock()
        query.data = "buy_plateau_guide"
        query.from_user.id = 111
        query.answer = AsyncMock()
        query.edit_message_text = AsyncMock()
        update.callback_query = query
        
        with patch("bot.bot.init_purchase", side_effect=AssertionError("Forbidden call to init_purchase")) as mock_init:
            asyncio.run(bbot.callback_handler(update, MagicMock()))
            mock_init.assert_not_called()
            
        query.edit_message_text.assert_called_once()
        call_text = query.edit_message_text.call_args[0][0]
        self.assertIn("Покупки временно недоступны", call_text)

    def test_confirm_demo_callback_returns_disabled_notice(self):
        update = MagicMock()
        query = MagicMock()
        query.data = "confirm_demo_order_999"
        query.from_user.id = 111
        query.answer = AsyncMock()
        query.edit_message_text = AsyncMock()
        update.callback_query = query
        
        with patch("bot.bot.complete_demo_payment", side_effect=AssertionError("Forbidden call to complete_demo_payment")) as mock_demo:
            asyncio.run(bbot.callback_handler(update, MagicMock()))
            mock_demo.assert_not_called()
            
        query.edit_message_text.assert_called_once()
        call_text = query.edit_message_text.call_args[0][0]
        self.assertIn("Покупки временно недоступны", call_text)

if __name__ == '__main__':
    unittest.main()
