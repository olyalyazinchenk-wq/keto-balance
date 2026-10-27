from telegram.error import BadRequest, Forbidden, NetworkError, TelegramError

PENDING = 'pending_private_question'
KNOWN = 'private_support_senders'


def is_private(update):
    return bool(update.effective_chat and update.effective_chat.type == 'private')


def cancel_question(context):
    context.user_data.pop(PENDING, None)


def begin_question(update, context):
    if not is_private(update):
        return False
    context.user_data[PENDING] = True
    return True


async def deliver_pending_question(update, context, owner_id):
    msg, user = update.message, update.effective_user
    if not is_private(update) or not msg or not user or not context.user_data.get(PENDING):
        return False
    text = (msg.text or '').strip()
    if not text or len(text) > 1500:
        await msg.reply_text('Нужен текст вопроса от 1 до 1500 символов. Он пока не отправлен.', parse_mode=None)
        return True
    result, attempted = 'failed', False
    try:
        if type(owner_id) is not int or owner_id <= 0:
            raise ValueError('Private owner is not configured')
        owner = await context.bot.get_chat(owner_id)
        if owner.type != 'private' or owner.id != owner_id:
            raise ValueError('Private owner is not verified')
        known = context.bot_data.setdefault(KNOWN, set())
        if len(known) >= 1000 and user.id not in known:
            raise ValueError('Preview support capacity exceeded')
        attempted = True
        await context.bot.send_message(chat_id=owner_id, text=f'Личный вопрос от пользователя {user.id}:\n\n{text}\n\nОтвет через бота: /reply {user.id} текст ответа', parse_mode=None)
        known.add(user.id)
        result = 'delivered'
    except (BadRequest, Forbidden, ValueError):
        result = 'failed'
    except NetworkError:
        result = 'unknown' if attempted else 'failed'
    except TelegramError:
        result = 'failed'
    if result == 'delivered':
        cancel_question(context)
        answer = 'Вопрос отправлен в личный чат Ольги. Прочтение пока не подтверждено.'
    elif result == 'unknown':
        answer = 'Не удалось подтвердить доставку. Вопрос мог дойти; повтор может создать дубликат. Автоматического повтора не будет.'
    else:
        answer = 'Не удалось отправить вопрос. Доставка не подтверждена. Можно повторить позже или отменить.'
    await msg.reply_text(answer, parse_mode=None)
    return True


async def reply_to_question(update, context, owner_id):
    user, msg = update.effective_user, update.message
    if not is_private(update) or not user or not msg or user.id != owner_id:
        return
    args = context.args or []
    try:
        target, text = int(args[0]), ' '.join(args[1:]).strip()
    except (IndexError, ValueError):
        target, text = 0, ''
    if target <= 0 or target not in context.bot_data.get(KNOWN, set()) or not text or len(text) > 1500:
        await msg.reply_text('Нужен известный отправитель и текст: /reply ID ответ. После перезапуска preview-связь нужно восстановить новым вопросом.', parse_mode=None)
        return
    try:
        await context.bot.send_message(chat_id=target, text='Ответ Ольги:\n\n' + text, parse_mode=None)
    except (BadRequest, Forbidden):
        await msg.reply_text('Ответ не отправлен.', parse_mode=None)
    except NetworkError:
        await msg.reply_text('Доставка ответа не подтверждена. Не повторяйте вслепую.', parse_mode=None)
    except TelegramError:
        await msg.reply_text('Ответ не отправлен.', parse_mode=None)
    else:
        await msg.reply_text('Ответ отправлен. Прочтение не подтверждено.', parse_mode=None)


async def reject_pending_attachment(update, context):
    if is_private(update) and update.message and context.user_data.get(PENDING):
        await update.message.reply_text('В этом режиме принимается только текст. Файл Ольге не отправлен. Напиши текст или отмени вопрос.', parse_mode=None)
