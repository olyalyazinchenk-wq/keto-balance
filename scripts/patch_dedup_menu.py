# -*- coding: utf-8 -*-
from pathlib import Path

bot_file = Path(r"C:\Users\HP\Keto-balance\bot\bot.py")
content = bot_file.read_text(encoding="utf-8")

# 1. Добавляем ReplyKeyboardRemove в импорт
old_import = """from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    BotCommand,
    ReplyKeyboardMarkup,
    KeyboardButton,
)"""

new_import = """from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    BotCommand,
    ReplyKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardRemove,
)"""

assert old_import in content or old_import.replace('\n', '\r\n') in content, "old_import not found"
if old_import in content:
    content = content.replace(old_import, new_import, 1)
else:
    content = content.replace(old_import.replace('\n', '\r\n'), new_import.replace('\n', '\r\n'), 1)

# 2. Добавляем функцию send_single_menu и обновляем start_cmd и menu_cmd
old_menu_section = """    await update.message.reply_html("🌿 Загружаю меню...", reply_markup=get_reply_keyboard())
    await update.message.reply_html(welcome_text, reply_markup=get_main_keyboard())

async def menu_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    \"\"\"Обработчик команды /menu.\"\"\"
    cancel_question(context)
    if not update.message:
        return
    await update.message.reply_html(
        "🌿 <b>Главное меню Кето Баланс</b>\\n\\nВыберите нужный раздел кнопками ниже:",
        reply_markup=get_main_keyboard(),
    )"""

new_menu_section = """    # Очищаем дублирующую нижнюю клавиатуру, если осталась у пользователя
    try:
        rm_msg = await update.message.reply_text("🌿", reply_markup=ReplyKeyboardRemove())
        await rm_msg.delete()
    except Exception:
        pass

    await send_single_menu(update, context, welcome_text)

async def send_single_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, text: Optional[str] = None):
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
            pass

async def menu_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    \"\"\"Обработчик команды /menu (единое меню без дублей).\"\"\"
    cancel_question(context)
    await send_single_menu(update, context)"""

assert old_menu_section in content or old_menu_section.replace('\n', '\r\n') in content, "old_menu_section not found"
if old_menu_section in content:
    content = content.replace(old_menu_section, new_menu_section, 1)
else:
    content = content.replace(old_menu_section.replace('\n', '\r\n'), new_menu_section.replace('\n', '\r\n'), 1)

# 3. Обновляем callback to_main, чтобы он использовал send_single_menu
old_to_main = """    elif data == "to_main":
        cancel_question(context)
        await query.edit_message_text(
            "🌿 <b>Главное меню Кето Баланс</b>\\n\\nВыберите нужный раздел или запустите Web App:",
            parse_mode="HTML",
            reply_markup=get_main_keyboard(),
        )"""

new_to_main = """    elif data == "to_main":
        cancel_question(context)
        await send_single_menu(update, context)"""

assert old_to_main in content or old_to_main.replace('\n', '\r\n') in content, "old_to_main not found"
if old_to_main in content:
    content = content.replace(old_to_main, new_to_main, 1)
else:
    content = content.replace(old_to_main.replace('\n', '\r\n'), new_to_main.replace('\n', '\r\n'), 1)

# 4. В help_cmd не дублируем всю клавиатуру главного меню
old_help = """    await update.message.reply_html(text, reply_markup=get_main_keyboard())"""
new_help = """    kb = InlineKeyboardMarkup([[InlineKeyboardButton("« В главное меню", callback_data="to_main")]])
    await update.message.reply_html(text, reply_markup=kb)"""

assert old_help in content or old_help.replace('\n', '\r\n') in content, "old_help not found"
if old_help in content:
    content = content.replace(old_help, new_help, 1)
else:
    content = content.replace(old_help.replace('\n', '\r\n'), new_help.replace('\n', '\r\n'), 1)

# 5. В text_message_handler fallback else не дублируем главное меню
old_else = """    else:
        await msg.reply_html(
            "🌿 <b>Кето Баланс</b>\\n\\nВыберите нужный раздел кнопками ниже:",
            reply_markup=get_main_keyboard(),
        )"""

new_else = """    else:
        kb = InlineKeyboardMarkup([[InlineKeyboardButton("« Открыть главное меню", callback_data="to_main")]])
        await msg.reply_html(
            "🌿 <b>Кето Баланс</b>\\n\\nИспользуйте интерактивное меню выше для навигации:",
            reply_markup=kb,
        )"""

assert old_else in content or old_else.replace('\n', '\r\n') in content, "old_else not found"
if old_else in content:
    content = content.replace(old_else, new_else, 1)
else:
    content = content.replace(old_else.replace('\n', '\r\n'), new_else.replace('\n', '\r\n'), 1)

bot_file.write_text(content, encoding="utf-8")
print("bot.py deduplication patch applied successfully!")
