"""Private support cards backed by SQLite, shared with the Mini App."""
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import BadRequest, Forbidden, NetworkError, TelegramError

from bot.app_db import create_support_ticket, StaleRevisionError, get_db_connection
from bot import support_queue as queue

PENDING = 'pending_private_question'
KNOWN = 'private_support_senders'  # compatibility only; never authority
EDIT = 'support_edit_draft'


def _db(context):
    return context.bot_data.get('support_db_path')


def is_private(update):
    return bool(update.effective_chat and update.effective_chat.type == 'private')


def cancel_question(context):
    context.user_data.pop(PENDING, None)
    context.user_data.pop(EDIT, None)


def begin_question(update, context):
    if not is_private(update):
        return False
    context.user_data[PENDING] = True
    return True


def _text_chunks(text, units=3000):
    chunk, size = '', 0
    for char in text:
        width = len(char.encode('utf-16-le')) // 2
        if size + width > units:
            yield chunk
            chunk, size = '', 0
        chunk += char
        size += width
    if chunk:
        yield chunk


def card(ticket):
    r = ticket['review']
    state = {'prepared': 'черновик', 'approved': 'согласован, ожидает отправки', 'sending': 'отправляется',
             'sent': 'отправлен', 'error': 'не отправлен', 'unknown': 'доставка неизвестна; повтор заблокирован'}[r['delivery_status']]
    # Keep the exact reply visible. Telegram counts UTF-16 units, including emoji.
    draft_units = len(r['draft_text'].encode('utf-16-le')) // 2
    question_budget = max(200, min(2000, 3500 - draft_units))
    question = next(_text_chunks(ticket['message'], question_budget), '')
    shortened = question != ticket['message']
    text = (f"Обращение №{ticket['id']} · {state}\nПолучатель: {ticket['user_id']}\n"
            f"Вопрос:\n{question}" + ('\n[Вопрос сокращён — нажмите «Полный вопрос».]' if shortened else '') + '\n\n'
            + ('Самочувствие: личный разбор Ольгой, без автоматического медицинского ответа.\n\n' if r['scope'] == 'personal' else '')
            + f"Точный ответ (версия {r['draft_version']}):\n{r['draft_text'] or 'Ещё не подготовлен'}\n\n"
            + 'Материалы: ' + (', '.join(str(x) for x in r['sources']) or 'не использованы; ответ вручную')
            + ('\n' + '\n'.join(r['uncertainties']) if r['uncertainties'] else ''))
    buttons = []
    if shortened:
        buttons.append([InlineKeyboardButton('Полный вопрос', callback_data=f"sup:question:{ticket['id']}:{r['draft_version']}:{ticket['user_id']}")])
    if ticket['status'] == 'open' and r['delivery_status'] in ('prepared', 'error'):
        suffix = f"{ticket['id']}:{r['draft_version']}:{ticket['user_id']}"
        if not r['draft_text'] and r['scope'] != 'personal':
            buttons.append([InlineKeyboardButton('Подготовить черновик', callback_data='sup:make:' + suffix)])
        buttons.append([InlineKeyboardButton('Изменить', callback_data='sup:edit:' + suffix)])
        if r['draft_text']:
            buttons.append([InlineKeyboardButton('Отправить этот ответ', callback_data='sup:send:' + suffix)])
        buttons.append([InlineKeyboardButton('Отклонить', callback_data='sup:reject:' + suffix)])
    return text, InlineKeyboardMarkup(buttons)


async def notify_owner(bot, ticket, owner_id, db_path=None):
    """A notification may be unknown, but the ticket is always retained."""
    with get_db_connection(db_path) as conn:
        claimed = conn.execute('UPDATE support_reviews SET owner_notified = 2 WHERE ticket_id = ? AND owner_notified = 0', (ticket['id'],))
        if claimed.rowcount != 1:
            row = conn.execute('SELECT owner_notified FROM support_reviews WHERE ticket_id = ?', (ticket['id'],)).fetchone()
            return 'delivered' if row and row['owner_notified'] == 1 else 'unknown'
    attempted, result = False, 'failed'
    try:
        if type(owner_id) is not int or owner_id <= 0:
            raise ValueError('Owner not configured')
        owner = await bot.get_chat(owner_id)
        if owner.type != 'private' or owner.id != owner_id:
            raise ValueError('Private owner not verified')
        text, keyboard = card(ticket)
        attempted = True
        await bot.send_message(chat_id=owner_id, text=text, reply_markup=keyboard, parse_mode=None)
        result = 'delivered'
    except (BadRequest, Forbidden, ValueError):
        pass
    except NetworkError:
        result = 'unknown' if attempted else 'failed'
    except TelegramError:
        pass
    with get_db_connection(db_path) as conn:
        conn.execute('UPDATE support_reviews SET owner_notified = ? WHERE ticket_id = ?', (1 if result == 'delivered' else -1, ticket['id']))
    return result


async def deliver_pending_question(update, context, owner_id):
    msg, user = update.message, update.effective_user
    if not is_private(update) or not msg or not user or not context.user_data.get(PENDING):
        return False
    text = (msg.text or '').strip()
    if not text or len(text) > 1500:
        await msg.reply_text('Нужен текст вопроса от 1 до 1500 символов. Он пока не отправлен.', parse_mode=None)
        return True
    message_id = getattr(msg, 'message_id', None)
    source_key = f'telegram:{user.id}:{message_id}' if isinstance(message_id, int) else None
    ticket_id = create_support_ticket(user.id, 'general', text, db_path=_db(context), source='telegram',
                                      source_key=source_key, scope=queue.support_scope(text))
    ticket = queue.get_ticket(ticket_id, _db(context))
    result = ('delivered' if ticket['review']['owner_notified'] == 1 else 'unknown')
    if ticket['review']['owner_notified'] == 0:
        result = await notify_owner(context.bot, ticket, owner_id, _db(context))
    cancel_question(context)
    if result == 'delivered':
        answer = f'Вопрос №{ticket_id} сохранён и отправлен в личный чат Ольги. Прочтение пока не подтверждено.'
    elif result == 'unknown':
        answer = f'Вопрос №{ticket_id} сохранён. Уведомление могло дойти; автоматического повтора не будет. Ольга увидит вопрос в очереди.'
    else:
        answer = f'Вопрос №{ticket_id} сохранён. Не удалось отправить уведомление; Ольга увидит вопрос в очереди. Повторять вопрос не нужно.'
    await msg.reply_text(answer, parse_mode=None)
    return True


async def show_support_queue(update, context, owner_id):
    if not is_private(update) or not update.effective_user or update.effective_user.id != owner_id:
        return
    tickets = queue.list_tickets(_db(context), limit=10)
    if not tickets:
        await update.message.reply_text('Открытых обращений нет.', parse_mode=None)
    for ticket in tickets:
        text, keyboard = card(ticket)
        await update.message.reply_text(text, reply_markup=keyboard, parse_mode=None)


async def support_callback(update, context, owner_id):
    q = update.callback_query
    if not q or not q.data or not q.data.startswith('sup:'):
        return False
    if not is_private(update) or q.from_user.id != owner_id:
        await q.answer('Доступ только Ольге', show_alert=True)
        return True
    try:
        _, action, ticket_id, version, recipient = q.data.split(':')
        ticket_id, version, recipient = int(ticket_id), int(version), int(recipient)
        kwargs = dict(ticket_id=ticket_id, expected_version=version, recipient_id=recipient,
                      actor_id=q.from_user.id, owner_id=owner_id, db_path=_db(context))
        if action == 'question':
            ticket = queue.get_ticket(ticket_id, _db(context))
            if ticket['user_id'] != recipient:
                raise ValueError('Получатель изменился')
            await q.answer()
            for chunk in _text_chunks(ticket['message']):
                await q.message.reply_text(chunk, parse_mode=None)
            return True
        if action == 'edit':
            ticket = queue.get_ticket(ticket_id, _db(context))
            queue._editable(ticket, version, recipient)
            context.user_data[EDIT] = (ticket_id, version, recipient)
            await q.answer()
            await q.message.reply_text('Напишите новый точный текст ответа (до 1500 символов). Он сохранится как черновик; отправка — отдельной кнопкой.', parse_mode=None)
            return True
        if action == 'make':
            ticket = queue.save_draft(**kwargs)
        elif action == 'send':
            ticket = queue.approve_reply(**kwargs)
        elif action == 'reject':
            ticket = queue.reject_ticket(**kwargs)
        else:
            raise ValueError('Неизвестное действие')
        await q.answer()
        text, keyboard = card(ticket)
        await q.edit_message_text(text, reply_markup=keyboard, parse_mode=None)
    except (ValueError, queue.SupportNotFoundError, StaleRevisionError):
        await q.answer('Карточка изменилась или действие недоступно. Откройте /support.', show_alert=True)
    return True


async def handle_draft_text(update, context, owner_id):
    if not is_private(update) or not update.effective_user or update.effective_user.id != owner_id or EDIT not in context.user_data:
        return False
    ticket_id, version, recipient = context.user_data[EDIT]
    try:
        ticket = queue.save_draft(ticket_id, version, recipient, owner_id, owner_id, update.message.text, _db(context))
    except (ValueError, queue.SupportNotFoundError, StaleRevisionError) as exc:
        await update.message.reply_text(str(exc), parse_mode=None)
        return True
    context.user_data.pop(EDIT, None)
    text, keyboard = card(ticket)
    await update.message.reply_text(text, reply_markup=keyboard, parse_mode=None)
    return True


async def reply_to_question(update, context, owner_id):
    if not is_private(update) or not update.effective_user or not update.message or update.effective_user.id != owner_id:
        return
    try:
        target, text = int(context.args[0]), ' '.join(context.args[1:]).strip()
        ticket = next(t for t in queue.list_tickets(_db(context)) if t['user_id'] == target
                      and t['review']['delivery_status'] in ('prepared', 'error'))
        ticket = queue.save_draft(ticket['id'], ticket['review']['draft_version'], target, owner_id, owner_id, text, _db(context))
    except (IndexError, ValueError, StopIteration, StaleRevisionError):
        await update.message.reply_text('Нужен отправитель открытого обращения и текст: /reply ID ответ. Ответ сначала сохраняется в черновик.', parse_mode=None)
        return
    response, keyboard = card(ticket)
    await update.message.reply_text(response, reply_markup=keyboard, parse_mode=None)


async def process_support_once(bot, owner_id, db_path=None):
    """One polling owner, bounded work; do not log question text."""
    # Do not starve old tickets behind the newest 100 in the owner's display.
    queue.init_db(db_path)
    with get_db_connection(db_path) as conn:
        pending = [r['ticket_id'] for r in conn.execute('SELECT ticket_id FROM support_reviews WHERE owner_notified = 0 ORDER BY ticket_id LIMIT 5')]
    for ticket_id in pending:
        await notify_owner(bot, queue.get_ticket(ticket_id, db_path), owner_id, db_path)
    ticket = queue.claim_reply(db_path)
    if not ticket:
        return False
    r = ticket['review']
    status, message_id = 'unknown', None
    try:
        if r['approved_by'] != owner_id:
            status = 'error'
        else:
            sent = await bot.send_message(chat_id=r['recipient_id'], text='Ответ Ольги:\n\n' + r['draft_text'], parse_mode=None)
            message_id = getattr(sent, 'message_id', None)
            if not isinstance(message_id, int):
                message_id = None
            status = 'sent'
    except (BadRequest, Forbidden):
        status = 'error'
    except (NetworkError, TelegramError):
        status = 'unknown'
    finally:
        queue.finish_reply(ticket['id'], r['draft_version'], status, db_path, message_id)
    return True


async def reject_pending_attachment(update, context):
    if is_private(update) and update.message and (context.user_data.get(PENDING) or context.user_data.get(EDIT)):
        await update.message.reply_text('В этом режиме принимается только текст. Файл Ольге не отправлен. Напиши текст или отмени вопрос.', parse_mode=None)
