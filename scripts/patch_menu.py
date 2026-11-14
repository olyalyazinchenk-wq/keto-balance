import sys

path = r"C:\Users\HP\Keto-balance\bot\bot.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target1 = """            if hasattr(context, "user_data") and hasattr(msg, "message_id"):
                context.user_data["last_menu_msg_id"] = msg.message_id
            return"""

replacement1 = """            # Удаляем старое меню, если нажатие было в другом сообщении
            old_menu_id = context.user_data.get("last_menu_msg_id") if hasattr(context, "user_data") and context.user_data else None
            chat_id = getattr(update.effective_chat, "id", None) if update.effective_chat else None
            if not chat_id and update.effective_user:
                chat_id = getattr(update.effective_user, "id", None)
            if old_menu_id and hasattr(msg, "message_id") and old_menu_id != msg.message_id and chat_id:
                if hasattr(context, "bot") and hasattr(context.bot, "delete_message"):
                    try:
                        await context.bot.delete_message(chat_id=chat_id, message_id=old_menu_id)
                    except Exception:
                        pass
            if hasattr(context, "user_data") and hasattr(msg, "message_id"):
                context.user_data["last_menu_msg_id"] = msg.message_id
            return"""

if target1 not in content:
    print("target1 not found")
    sys.exit(1)
content = content.replace(target1, replacement1, 1)

target2 = """    if msg.text in keyboard_texts:
        cancel_question(context)
    elif await deliver_pending_question(update, context, ADMIN_ID):"""

replacement2 = """    if msg.text in keyboard_texts:
        cancel_question(context)
        try:
            rm = await msg.reply_text("🌿", reply_markup=ReplyKeyboardRemove())
            await rm.delete()
        except Exception:
            pass
    elif await deliver_pending_question(update, context, ADMIN_ID):"""

if target2 not in content:
    print("target2 not found")
    sys.exit(1)
content = content.replace(target2, replacement2, 1)

target3 = """    elif "баланс" in text or "balance" in text:
        await msg.reply_html(
            "🌿 <b>Добро пожаловать по кодовому слову БАЛАНС!</b>\\n\\n"
            "Вам доступен экспресс-расчёт нормы воды и БЖУ, а также персональный помощник питания:",
            reply_markup=get_main_keyboard(),
        )"""

# In file it might have actual newlines:
target3_alt = """    elif "баланс" in text or "balance" in text:
        await msg.reply_html(
            "🌿 <b>Добро пожаловать по кодовому слову БАЛАНС!</b>\n\n"
            "Вам доступен экспресс-расчёт нормы воды и БЖУ, а также персональный помощник питания:",
            reply_markup=get_main_keyboard(),
        )"""

replacement3 = """    elif "баланс" in text or "balance" in text:
        cancel_question(context)
        await send_single_menu(
            update,
            context,
            text=(
                "🌿 <b>Добро пожаловать по кодовому слову БАЛАНС!</b>\\n\\n"
                "Вам доступен экспресс-расчёт нормы воды и БЖУ, а также персональный помощник питания:"
            ),
        )"""

if target3 in content:
    content = content.replace(target3, replacement3, 1)
elif target3_alt in content:
    content = content.replace(target3_alt, replacement3, 1)
else:
    print("target3 not found")
    sys.exit(1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully updated bot.py")
