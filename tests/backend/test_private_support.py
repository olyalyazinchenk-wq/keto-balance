import tempfile
from pathlib import Path
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from telegram.error import Forbidden, TimedOut
from bot.private_support import PENDING, KNOWN, begin_question, cancel_question, deliver_pending_question, reply_to_question, reject_pending_attachment


class TestPrivateSupport(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'private-support.db'
        self.db_patch = patch('bot.private_support._db', return_value=self.db)
        self.db_patch.start()

    def tearDown(self):
        self.db_patch.stop()
        self.temp.cleanup()

    def fixture(self, text='Мой Вопрос <b>&', sender=101):
        msg = NS(text=text, reply_text=AsyncMock())
        update = NS(message=msg, effective_chat=NS(type='private'), effective_user=NS(id=sender))
        bot = NS(get_chat=AsyncMock(return_value=NS(type='private', id=777)), send_message=AsyncMock())
        ctx = NS(bot=bot, user_data={PENDING: True}, bot_data={}, args=[])
        return update, ctx

    async def test_success_only_to_private_owner_plain_text(self):
        u, c = self.fixture()
        self.assertTrue(await deliver_pending_question(u, c, 777))
        data = c.bot.send_message.call_args.kwargs
        self.assertEqual(data['chat_id'], 777)
        self.assertIsNone(data['parse_mode'])
        self.assertIn('Мой Вопрос <b>&', data['text'])
        self.assertNotIn(PENDING, c.user_data)
        self.assertIn('отправлен в личный чат', u.message.reply_text.call_args.args[0])

    async def test_channel_and_forbidden_fail_closed(self):
        for channel in (True, False):
            u, c = self.fixture()
            if channel:
                c.bot.get_chat.return_value = NS(type='channel', id=777)
            else:
                c.bot.send_message.side_effect = Forbidden('synthetic')
            await deliver_pending_question(u, c, 777)
            self.assertNotIn(PENDING, c.user_data)
            self.assertNotIn(101, c.bot_data.get(KNOWN, set()))
            self.assertIn('Не удалось отправить', u.message.reply_text.call_args.args[0])
            if channel:
                c.bot.send_message.assert_not_awaited()

    async def test_timeout_distinguishes_before_and_after_send(self):
        for before in (True, False):
            u, c = self.fixture()
            (c.bot.get_chat if before else c.bot.send_message).side_effect = TimedOut('synthetic')
            await deliver_pending_question(u, c, 777)
            self.assertIn('Не удалось отправить' if before else 'могло дойти', u.message.reply_text.call_args.args[0])
            self.assertEqual(c.bot.send_message.await_count, 0 if before else 1)

    async def test_cancel_group_length_and_attachment(self):
        u, c = self.fixture()
        cancel_question(c)
        self.assertFalse(await deliver_pending_question(u, c, 777))
        u.effective_chat.type = 'group'
        self.assertFalse(begin_question(u, c))
        u.effective_chat.type = 'private'
        self.assertTrue(begin_question(u, c))
        u.message.text = 'x' * 1501
        await deliver_pending_question(u, c, 777)
        await reject_pending_attachment(u, c)
        c.bot.send_message.assert_not_awaited()
        self.assertTrue(c.user_data[PENDING])
        cancel_question(c)
        u.message.reply_text.reset_mock()
        await reject_pending_attachment(u, c)
        u.message.reply_text.assert_not_awaited()

    async def test_reply_authorization_and_plain_text(self):
        u, c = self.fixture(sender=101)
        c.args = ['202', 'hello']
        await reply_to_question(u, c, 777)
        u.effective_user.id = 777
        await reply_to_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
        from bot.app_db import create_support_ticket
        create_support_ticket(101, 'general', 'Вопрос', db_path=self.db)
        c.args = ['101', '<b>Ответ</b>']
        await reply_to_question(u, c, 777)
        c.bot.send_message.assert_not_awaited()
        self.assertIn('<b>Ответ</b>', u.message.reply_text.call_args.args[0])
        self.assertIn('Отправить этот ответ', str(u.message.reply_text.call_args.kwargs['reply_markup']))
