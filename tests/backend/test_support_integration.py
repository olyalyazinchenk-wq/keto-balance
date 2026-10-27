import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from bot import bot as app
from bot.private_support import PENDING, KNOWN


class TestSupportIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_numeric_question_precedes_calculation(self):
        msg = NS(text='70', reply_text=AsyncMock(), reply_html=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=101))
        bot = NS(get_chat=AsyncMock(return_value=NS(type='private', id=777)), send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={PENDING: True}, bot_data={})
        with patch.object(app, 'ADMIN_ID', 777), patch.object(app, 'calculate_nutrition', side_effect=AssertionError('calculation forbidden')), patch.object(app, 'save_calculation', side_effect=AssertionError('DB write forbidden')):
            await app.text_message_handler(update, ctx)
        self.assertIn('70', bot.send_message.call_args.kwargs['text'])
        self.assertEqual(bot.send_message.call_args.kwargs['chat_id'], 777)

    async def test_cancel_callback_clears_real_flow(self):
        query = NS(data='to_main', from_user=NS(id=101), answer=AsyncMock(), edit_message_text=AsyncMock())
        update = NS(message=None, callback_query=query, effective_chat=NS(type='private'), effective_user=NS(id=101))
        ctx = NS(user_data={PENDING: True}, bot_data={}, args=[])
        await app.callback_handler(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_start_question_has_no_implicit_consent_or_db_write(self):
        msg = NS(text='/start question', reply_text=AsyncMock(), reply_html=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=101))
        ctx = NS(user_data={}, bot_data={}, args=['question'])
        with patch.object(app, 'ask_cmd', new_callable=AsyncMock) as ask, patch.object(app, 'get_or_create_user', side_effect=AssertionError('DB write forbidden')):
            await app.start_cmd(update, ctx)
        ask.assert_awaited_once_with(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_real_reply_rejects_unrelated_target(self):
        msg = NS(reply_text=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=777))
        bot = NS(send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={}, bot_data={KNOWN: {101}}, args=['999', 'text'])
        with patch.object(app, 'ADMIN_ID', 777):
            await app.reply_cmd(update, ctx)
        bot.send_message.assert_not_awaited()

    async def test_other_callback_cancels_pending(self):
        query = NS(data='recipes_cat', from_user=NS(id=101), answer=AsyncMock(), edit_message_text=AsyncMock())
        update = NS(message=None, callback_query=query, effective_chat=NS(type='private'), effective_user=NS(id=101))
        ctx = NS(user_data={PENDING: True}, bot_data={})
        await app.callback_handler(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_command_prehandler_cancels_pending(self):
        ctx = NS(user_data={PENDING: True})
        await app.cancel_on_command(NS(), ctx)
        self.assertNotIn(PENDING, ctx.user_data)

    async def test_keyboard_navigation_cancels_instead_of_sending(self):
        msg = NS(text='📖 Рецепты', reply_text=AsyncMock(), reply_html=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=101))
        bot = NS(send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={PENDING: True}, bot_data={})
        with patch.object(app, 'recipes_cmd', new_callable=AsyncMock) as recipes:
            await app.text_message_handler(update, ctx)
        recipes.assert_awaited_once_with(update, ctx)
        self.assertNotIn(PENDING, ctx.user_data)
        bot.send_message.assert_not_awaited()
