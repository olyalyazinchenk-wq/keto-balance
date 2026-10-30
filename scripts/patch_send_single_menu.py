# -*- coding: utf-8 -*-
from pathlib import Path

bot_file = Path(r"C:\Users\HP\Keto-balance\bot\bot.py")
content = bot_file.read_text(encoding="utf-8")

old_func = """async def send_single_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, text: Optional[str] = None):
    \"\"\"Отправка единого главного меню без дублирования: старое меню удаляется из чата.\"\"\"
    chat_id = update.effective_chat.id if update.effective_chat else None
    if not chat_id:
        return

    # Удаляем предыдущее меню в этом чате, чтобы не возникало дублирования
    old_menu_id = context.user_data.get("last_menu_msg_id")
    if old_menu_id:
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=old_menu_id)
        except Exception:
            pass
        context.user_data["last_menu_msg_id"] = None

    menu_text = text or (
        "🌿 <b>Главное меню Кето Баланс</b>\\n\\n"
        "Выберите нужный раздел кнопками ниже:"
    )

    # Если вызов пришел из inline-кнопки (callback_query) — редактируем сообщение на месте
    if update.callback_query and update.callback_query.message:
        try:
            msg = await update.callback_query.edit_message_text(
                menu_text,
                parse_mode=ParseMode.HTML,
                reply_markup=get_main_keyboard(),
            )
            context.user_data["last_menu_msg_id"] = msg.message_id
            return
        except Exception:
            pass

    # Отправляем единое актуальное меню
    msg = await context.bot.send_message(
        chat_id=chat_id,
        text=menu_text,
        parse_mode=ParseMode.HTML,
        reply_markup=get_main_keyboard(),
    )
    context.user_data["last_menu_msg_id"] = msg.message_id

    # Удаляем сообщение-триггер пользователя (команду /menu или текст "меню"), чтобы не засорять чат
    if update.message:
        try:
            await update.message.delete()
        except Exception:
            pass"""

new_func = """async def send_single_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, text: Optional[str] = None):
    \"\"\"Отправка единого главного меню без дублирования: старое меню удаляется из чата.\"\"\"
    menu_text = text or (
        "🌿 <b>Главное меню Кето Баланс</b>\\n\\n"
        "Выберите нужный раздел кнопками ниже:"
    )

    # Если вызов пришел из inline-кнопки (callback_query) — редактируем сообщение на месте
    if update.callback_query:
        try:
            msg = await update.callback_query.edit_message_text(
                menu_text,
                parse_mode=ParseMode.HTML,
                reply_markup=get_main_keyboard(),
            )
            if hasattr(context, "user_data") and hasattr(msg, "message_id"):
                context.user_data["last_menu_msg_id"] = msg.message_id
            return
        except Exception:
            pass

    chat_id = getattr(update.effective_chat, "id", None) if update.effective_chat else None
    if not chat_id and update.effective_user:
        chat_id = getattr(update.effective_user, "id", None)
    if not chat_id:
        return

    # Удаляем предыдущее меню в этом чате, чтобы не возникало дублирования
    old_menu_id = context.user_data.get("last_menu_msg_id") if hasattr(context, "user_data") and context.user_data else None
    if old_menu_id and hasattr(context, "bot") and hasattr(context.bot, "delete_message"):
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=old_menu_id)
        except Exception:
            pass
        if hasattr(context, "user_data") and context.user_data:
            context.user_data["last_menu_msg_id"] = None

    # Отправляем единое актуальное меню
    if hasattr(context, "bot") and hasattr(context.bot, "send_message"):
        msg = await context.bot.send_message(
            chat_id=chat_id,
            text=menu_text,
            parse_mode=ParseMode.HTML,
            reply_markup=get_main_keyboard(),
        )
        if hasattr(context, "user_data") and hasattr(msg, "message_id"):
            context.user_data["last_menu_msg_id"] = msg.message_id

    # Удаляем сообщение-триггер пользователя (команду /menu или текст "меню"), чтобы не засорять чат
    if update.message and hasattr(update.message, "delete"):
        try:
            await update.message.delete()
        except Exception:
            pass"""

assert old_func in content or old_func.replace('\n', '\r\n') in content, "old_func not found"
if old_func in content:
    content = content.replace(old_func, new_func, 1)
else:
    content = content.replace(old_func.replace('\n', '\r\n'), new_func.replace('\n', '\r\n'), 1)

bot_file.write_text(content, encoding="utf-8")
print("send_single_menu patched successfully!")
