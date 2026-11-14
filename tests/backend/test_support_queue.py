import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from telegram.error import Forbidden, TimedOut
from fastapi.testclient import TestClient

from bot.app_db import (create_support_ticket, create_session, get_db_connection,
                        export_all_user_data, delete_all_user_data, StaleRevisionError, init_db)
from bot import support_queue as q
from bot.private_support import process_support_once, support_callback, card
from bot.app_settings import AppSettings
from bot.server import create_app

OWNER = 1084557944


class TestSupportQueue(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'support.db'
        self.ticket_id = create_support_ticket(101, 'recipes', 'Как заменить блюдо?', db_path=self.db)

    def tearDown(self):
        self.temp.cleanup()

    def draft(self, version=0, text='Точный ответ'):
        return q.save_draft(self.ticket_id, version, 101, OWNER, OWNER, text, self.db)

    def approve(self, version=1):
        return q.approve_reply(self.ticket_id, version, 101, OWNER, OWNER, self.db)

    def bot(self, error=None):
        return NS(get_chat=AsyncMock(return_value=NS(type='private', id=OWNER)),
                  send_message=AsyncMock(return_value=NS(message_id=50), side_effect=error))

    def mark_notified(self):
        with get_db_connection(self.db) as conn:
            conn.execute('UPDATE support_reviews SET owner_notified = 1')

    def test_wrong_owner_wrong_recipient_and_stale_edit_fail_closed(self):
        with self.assertRaises(PermissionError):
            q.save_draft(self.ticket_id, 0, 101, 102, OWNER, 'x', self.db)
        with self.assertRaises(StaleRevisionError):
            q.save_draft(self.ticket_id, 0, 102, OWNER, OWNER, 'x', self.db)
        self.draft()
        self.draft(1, 'Новый текст')
        with self.assertRaises(StaleRevisionError):
            self.approve(1)
        self.assertEqual(q.get_ticket(self.ticket_id, self.db)['review']['draft_text'], 'Новый текст')

    def test_duplicate_approval_and_edit_after_queue_fail_closed(self):
        self.draft(); self.approve()
        with self.assertRaises(StaleRevisionError): self.approve()
        with self.assertRaises(StaleRevisionError): self.draft(1, 'Другой текст')
        self.assertEqual(q.claim_reply(self.db)['review']['draft_text'], 'Точный ответ')
        self.assertIsNone(q.claim_reply(self.db))

    async def test_send_once_exact_recipient_and_persistent_draft(self):
        self.draft(); self.approve(); self.mark_notified()
        init_db(self.db, force=True)  # restart + idempotent additive migration
        bot = self.bot()
        await process_support_once(bot, OWNER, self.db)
        await process_support_once(bot, OWNER, self.db)
        bot.send_message.assert_awaited_once_with(chat_id=101, text='Ответ Ольги:\n\nТочный ответ', parse_mode=None)
        self.assertEqual(q.get_ticket(self.ticket_id, self.db)['status'], 'answered')

    async def test_network_unknown_never_auto_retried(self):
        self.draft(); self.approve(); self.mark_notified()
        bot = self.bot(TimedOut('synthetic'))
        await process_support_once(bot, OWNER, self.db)
        await process_support_once(bot, OWNER, self.db)
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(q.get_ticket(self.ticket_id, self.db)['review']['delivery_status'], 'unknown')
        with self.assertRaises(StaleRevisionError): self.approve()
        with self.assertRaises(StaleRevisionError): self.draft(1, 'retry')

    async def test_blocked_customer_is_error_without_auto_retry(self):
        self.draft(); self.approve(); self.mark_notified()
        bot = self.bot(Forbidden('synthetic'))
        await process_support_once(bot, OWNER, self.db)
        await process_support_once(bot, OWNER, self.db)
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(q.get_ticket(self.ticket_id, self.db)['review']['delivery_status'], 'error')

    def test_crash_after_claim_is_unknown_after_restart(self):
        self.draft(); self.approve(); q.claim_reply(self.db)
        self.assertEqual(q.recover_interrupted_replies(self.db), 1)
        self.assertIsNone(q.claim_reply(self.db))

    def test_export_delete_cascades_and_retention(self):
        self.draft()
        self.assertEqual(export_all_user_data(101, self.db)['tickets'][0]['review']['draft_text'], 'Точный ответ')
        q.reject_ticket(self.ticket_id, 1, 101, OWNER, OWNER, self.db)
        with get_db_connection(self.db) as conn:
            conn.execute("UPDATE support_reviews SET closed_at = datetime('now', '-31 days')")
        self.assertEqual(q.purge_closed_text(self.db), 1)
        t = q.get_ticket(self.ticket_id, self.db)
        self.assertNotIn('Как заменить', t['message'])
        self.assertEqual(t['review']['draft_text'], '')
        delete_all_user_data(101, self.db)
        with get_db_connection(self.db) as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM support_reviews').fetchone()[0], 0)

    def test_symptoms_no_generated_answer_and_no_external_model(self):
        tid = create_support_ticket(102, 'general', 'Болит живот', db_path=self.db, scope=q.support_scope('Болит живот'))
        self.assertEqual(q.get_ticket(tid, self.db)['review']['scope'], 'personal')
        with self.assertRaises(ValueError): q.save_draft(tid, 0, 102, OWNER, OWNER, db_path=self.db)
        q.save_draft(tid, 0, 102, OWNER, OWNER, 'Пожалуйста, свяжитесь со мной лично.', self.db)

    def test_telegram_source_deduplicates_replayed_update(self):
        one = create_support_ticket(102, 'general', 'Вопрос', db_path=self.db, source='telegram', source_key='telegram:102:1')
        two = create_support_ticket(102, 'general', 'Вопрос', db_path=self.db, source='telegram', source_key='telegram:102:1')
        self.assertEqual(one, two)

    async def test_foreign_callback_cannot_send(self):
        self.draft()
        query = NS(data=f'sup:send:{self.ticket_id}:1:101', from_user=NS(id=103), answer=AsyncMock())
        update = NS(callback_query=query, effective_chat=NS(type='private'))
        context = NS(bot_data={'support_db_path': self.db})
        self.assertTrue(await support_callback(update, context, OWNER))
        self.assertEqual(q.get_ticket(self.ticket_id, self.db)['review']['delivery_status'], 'prepared')

    def test_card_has_exact_text_and_version_bound_buttons(self):
        self.draft()
        text, keyboard = card(q.get_ticket(self.ticket_id, self.db))
        self.assertIn('Точный ответ', text)
        self.assertTrue(any(b.callback_data == f'sup:send:{self.ticket_id}:1:101' for row in keyboard.inline_keyboard for b in row))

    def test_long_emoji_card_keeps_exact_reply_and_offers_full_question(self):
        tid = create_support_ticket(101, 'app', '🥑' * 2000, db_path=self.db)
        q.save_draft(tid, 0, 101, OWNER, OWNER, '🌿' * 1500, self.db)
        text, keyboard = card(q.get_ticket(tid, self.db))
        self.assertLessEqual(len(text.encode('utf-16-le')) // 2, 4096)
        self.assertIn('🌿' * 1500, text)
        self.assertTrue(any(b.text == 'Полный вопрос' for row in keyboard.inline_keyboard for b in row))

    def test_additive_migration_preserves_existing_and_old_reader_can_rollback(self):
        from bot.app_db import _migrate_support_queue
        import hashlib
        self.draft()
        with get_db_connection(self.db) as conn:
            before = [tuple(r) for r in conn.execute('SELECT * FROM support_tickets')]
            _migrate_support_queue(conn)
            _migrate_support_queue(conn)
            self.assertEqual(before,[tuple(r) for r in conn.execute('SELECT * FROM support_tickets')])
            self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            # Rollback is the previous application reading its original columns;
            # leave the additive table intact to preserve any new reply history.
            self.assertEqual(conn.execute('SELECT id,user_id,topic,message,contact,status,created_at FROM support_tickets').fetchone()['user_id'],101)
            self.assertEqual(conn.execute('SELECT draft_text FROM support_reviews WHERE ticket_id=?',(self.ticket_id,)).fetchone()[0],'Точный ответ')


class TestSupportReviewApi(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'api.db'
        settings = AppSettings(app_stage='test', access_mode='public', db_path=self.db, dist_dir=Path(self.temp.name))
        self.client = TestClient(create_app(settings=settings, db_path=self.db, dist_dir=Path(self.temp.name)))
        create_session(101, 'user', db_path=self.db)
        create_session(OWNER, 'owner', db_path=self.db)
        self.user = {'Authorization': 'Bearer user'}
        self.owner = {'Authorization': 'Bearer owner'}

    def tearDown(self): self.temp.cleanup()

    def test_shared_api_ticket_and_owner_review(self):
        result = self.client.post('/api/support', json={'message': 'Как собрать покупки?', 'topic':'app'}, headers=self.user)
        self.assertEqual(result.status_code, 200)
        tid = result.json()['ticket_id']
        self.assertEqual(self.client.get('/api/admin/support', headers=self.user).status_code, 403)
        self.assertEqual(self.client.get('/api/admin/support').status_code, 401)
        tickets = self.client.get('/api/admin/support', headers=self.owner).json()['tickets']
        self.assertEqual(tickets[0]['id'], tid)
        action = {'expected_version':0,'recipient_id':101,'text':'Откройте Покупки.'}
        self.assertEqual(self.client.post(f'/api/admin/support/{tid}/draft',json=action,headers=self.owner).status_code,200)
        send = {'expected_version':1,'recipient_id':101}
        self.assertEqual(self.client.post(f'/api/admin/support/{tid}/send',json={**send,'recipient_id':102},headers=self.owner).status_code,409)
        self.assertEqual(self.client.post(f'/api/admin/support/{tid}/send',json=send,headers=self.owner).json()['review']['delivery_status'],'approved')
        self.assertEqual(self.client.post(f'/api/admin/support/{tid}/send',json=send,headers=self.owner).status_code,409)
