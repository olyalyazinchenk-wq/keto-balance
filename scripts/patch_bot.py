# -*- coding: utf-8 -*-
"""
Патч для bot.py:
1. Исправление категории Супы (отображение реальных супов и бульонов без ошибочного отката на омлеты).
2. Раздел «Задать вопрос» направляет в личные сообщения Ольги (@Olgazinchenko1186) и позволяет слать вопросы прямо через бота на ID 1084557944, исключая переход в канал «О теле с душой».
"""
import re
from pathlib import Path

bot_path = Path(r"C:\Users\HP\Keto-balance\bot\bot.py")
content = bot_path.read_text(encoding="utf-8")

# 1. Добавление ADMIN_ID и NUTRITIONIST_USERNAME в импорт bot.config
old_import = """from bot.config import (
    BOT_TOKEN,
    WEBAPP_URL,
    PRODUCTS,
    CHANNEL_URL,
    SUPPORT_CHAT,
    PAYMENT_MODE,
)"""

new_import = """from bot.config import (
    BOT_TOKEN,
    WEBAPP_URL,
    PRODUCTS,
    CHANNEL_URL,
    SUPPORT_CHAT,
    PAYMENT_MODE,
    ADMIN_ID,
    NUTRITIONIST_USERNAME,
)"""

assert old_import in content, "old_import not found"
content = content.replace(old_import, new_import, 1)

# 2. Обновление постоянной нижней клавиатуры get_reply_keyboard
old_reply_kb = """def get_reply_keyboard() -> ReplyKeyboardMarkup:
    \"\"\"Постоянная нижняя русскоязычная клавиатура меню.\"\"\"
    keyboard = [
        [KeyboardButton("🌿 Главное меню"), KeyboardButton("🎲 Идея блюда")],
        [KeyboardButton("📖 Рецепты"), KeyboardButton("💧 Трекер воды")],
        [KeyboardButton("⚖️ Калькулятор БЖУ"), KeyboardButton("💡 Совет дня")],
        [KeyboardButton("🆘 Антисрыв"), KeyboardButton("👑 Тарифы")],
        [KeyboardButton("❓ Справка и помощь")],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)"""

new_reply_kb = """def get_reply_keyboard() -> ReplyKeyboardMarkup:
    \"\"\"Постоянная нижняя русскоязычная клавиатура меню.\"\"\"
    keyboard = [
        [KeyboardButton("🌿 Главное меню"), KeyboardButton("🎲 Идея блюда")],
        [KeyboardButton("📖 Рецепты"), KeyboardButton("💧 Трекер воды")],
        [KeyboardButton("⚖️ Калькулятор БЖУ"), KeyboardButton("💡 Совет дня")],
        [KeyboardButton("🆘 Антисрыв"), KeyboardButton("👑 Тарифы")],
        [KeyboardButton("👩⚕️ Задать вопрос"), KeyboardButton("❓ Справка")],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)"""

assert old_reply_kb in content, "old_reply_kb not found"
content = content.replace(old_reply_kb, new_reply_kb, 1)

# 3. Обновление главного меню get_main_keyboard: кнопка «Задать вопрос» вызывает ask_menu (вместо ссылки на канал)
old_main_kb = """        [
            InlineKeyboardButton("📢 Канал Ольги", url=CHANNEL_URL),
            InlineKeyboardButton("👩⚕️ Задать вопрос", url=SUPPORT_CHAT),
        ],"""

new_main_kb = """        [
            InlineKeyboardButton("📢 Канал Ольги", url=CHANNEL_URL),
            InlineKeyboardButton("👩⚕️ Задать вопрос", callback_data="ask_menu"),
        ],"""

assert old_main_kb in content, "old_main_kb not found"
content = content.replace(old_main_kb, new_main_kb, 1)

# Заменим также рецепты (37+) на Каталог рецептов в главном меню
content = content.replace('InlineKeyboardButton("📖 Рецепты (37+)", callback_data="recipes_cat")', 'InlineKeyboardButton("📖 Каталог рецептов", callback_data="recipes_cat")')

# 4. Добавление функций ask_cmd и reply_cmd
funcs_to_add = """async def ask_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    \"\"\"Раздел «Задать вопрос нутрициологу Ольге» (личные сообщения).\"\"\"
    text = (
        "👩⚕️ <b>Задать вопрос нутрициологу Ольге</b>\\n\\n"
        "Задайте любой интересующий вопрос по кето/карнивор рациону, продуктам, добавкам или анализам.\\n\\n"
        "💬 <b>Способы связи (лично с Ольгой):</b>\\n"
        f"1️⃣ <b>Прямой чат в Telegram:</b> @{NUTRITIONIST_USERNAME}\\n"
        "Нажмите кнопку ниже, чтобы перейти сразу в личные сообщения с Ольгой.\\n\\n"
        "2️⃣ <b>Отправить вопрос через бота:</b>\\n"
        "Нажмите «✍️ Написать вопрос здесь», напишите текст, и бот немедленно доставит его в личные сообщения Ольге!"
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("💬 Написать Ольге в личные сообщения", url=SUPPORT_CHAT)],
        [InlineKeyboardButton("✍️ Написать вопрос здесь (через бота)", callback_data="ask_start")],
        [InlineKeyboardButton("« В главное меню", callback_data="to_main")],
    ])
    if update.message:
        await update.message.reply_html(text, reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)

async def reply_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    \"\"\"Ответ нутрициолога пользователю через бота: /reply <user_id> <текст ответа>.\"\"\"
    if not update.effective_user or update.effective_user.id != ADMIN_ID:
        return
    if not context.args or len(context.args) < 2:
        await update.message.reply_text("Использование: /reply <user_id> <текст ответа>")
        return
    try:
        target_id = int(context.args[0])
        reply_text = " ".join(context.args[1:])
        await context.bot.send_message(
            chat_id=target_id,
            text=f"👩⚕️ <b>Ответ нутрициолога Ольги:</b>\\n\\n{reply_text}",
            parse_mode=ParseMode.HTML,
        )
        await update.message.reply_text(f"✅ Ответ успешно отправлен пользователю {target_id}!")
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка отправки: {e}")

"""

# Вставим перед tariffs_cmd
assert "async def tariffs_cmd(" in content, "tariffs_cmd not found"
content = content.replace("async def tariffs_cmd(", funcs_to_add + "async def tariffs_cmd(", 1)

# 5. Обработка callback_query для ask_menu и ask_start
ask_callbacks = """    elif data == "ask_menu":
        await ask_cmd(update, context)
        
    elif data == "ask_start":
        user_states[user_id] = user_states.get(user_id, {})
        user_states[user_id]["state"] = "awaiting_question"
        await query.edit_message_text(
            "✍️ <b>Напишите ваш вопрос для нутрициолога Ольги:</b>\\n\\n"
            "Отправьте ваш вопрос следующим сообщением в этот чат (можно описать рацион, цель или возникшие сложности).\\n\\n"
            "Я сразу передам его лично Ольге!",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("💬 Перейти сразу в ЛС к Ольге", url=SUPPORT_CHAT)],
                [InlineKeyboardButton("« Отмена", callback_data="to_main")],
            ])
        )
        return
"""

# Вставим после elif data == "tariffs":
assert 'elif data == "tariffs":' in content, "data == tariffs not found"
content = content.replace('elif data == "tariffs":', ask_callbacks + '\n    elif data == "tariffs":', 1)

# 6. Исправление логики категорий cat_ в callback_handler:
# Полноценная поддержка cat_soup, cat_salad, исключение дублирования в lunch и запрет fallback на первые 5 рецептов!
old_cat_logic = """    elif data.startswith("cat_"):
        cat_key = data.replace("cat_", "")
        cat_title = CATEGORY_NAMES.get(cat_key, "Рецепты")
        
        if cat_key == "carnivore":
            filtered = [r for r in RECIPES if r.get("mode") == "carnivore"]
        elif cat_key == "lunch":
            filtered = [r for r in RECIPES if r.get("cat") in ("lunch", "dinner", "main")]
        else:
            filtered = [r for r in RECIPES if r.get("cat") == cat_key]
            
        if not filtered:
            filtered = RECIPES[:5]
            
        rows = []
        for r in filtered[:8]:
            rows.append([InlineKeyboardButton(f"{r.get('emoji', '🍳')} {r.get('title')}", callback_data=f"rec_{r.get('id')}")])
            
        rows.append([InlineKeyboardButton("« К категориям", callback_data="recipes_cat")])
        kb = InlineKeyboardMarkup(rows)
        
        await query.edit_message_text(
            f"<b>{cat_title}</b> ({len(filtered)} блюд)\\n\\nВыберите рецепт для просмотра:",
            parse_mode="HTML",
            reply_markup=kb,
        )"""

new_cat_logic = """    elif data.startswith("cat_"):
        cat_key = data.replace("cat_", "")
        cat_title = CATEGORY_NAMES.get(cat_key, "Рецепты")
        
        if cat_key == "carnivore":
            filtered = [r for r in RECIPES if r.get("mode") == "carnivore"]
        elif cat_key == "soup":
            filtered = [
                r for r in RECIPES 
                if r.get("cat") == "soup" 
                or "суп" in r.get("title", "").lower() 
                or "бульон" in r.get("title", "").lower()
            ]
        elif cat_key == "salad":
            filtered = [
                r for r in RECIPES 
                if r.get("cat") == "salad" 
                or "салат" in r.get("title", "").lower()
            ]
        elif cat_key == "lunch":
            filtered = [
                r for r in RECIPES 
                if r.get("cat") in ("lunch", "dinner", "main")
                and r.get("cat") not in ("soup", "salad")
                and "суп" not in r.get("title", "").lower()
                and "бульон" not in r.get("title", "").lower()
                and "салат" not in r.get("title", "").lower()
            ]
        else:
            filtered = [r for r in RECIPES if r.get("cat") == cat_key]
            
        if not filtered:
            await query.edit_message_text(
                f"<b>{cat_title}</b>\\n\\nВ этой категории пока нет рецептов.",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("« К категориям", callback_data="recipes_cat")]])
            )
            return
            
        rows = []
        for r in filtered:
            rows.append([InlineKeyboardButton(f"{r.get('emoji', '🍳')} {r.get('title')}", callback_data=f"rec_{r.get('id')}")])
            
        rows.append([InlineKeyboardButton("« К категориям", callback_data="recipes_cat")])
        kb = InlineKeyboardMarkup(rows)
        
        await query.edit_message_text(
            f"<b>{cat_title}</b> ({len(filtered)} блюд)\\n\\nВыберите рецепт для просмотра:",
            parse_mode="HTML",
            reply_markup=kb,
        )"""

assert old_cat_logic in content, "old_cat_logic not found"
content = content.replace(old_cat_logic, new_cat_logic, 1)

# 7. Обработка входящего вопроса в text_message_handler
user_state_question_handler = """    # Проверка ожидания вопроса для нутрициолога
    if user_states.get(user_id, {}).get("state") == "awaiting_question":
        user_states[user_id]["state"] = None
        user_name = update.effective_user.full_name
        user_username = f"@{update.effective_user.username}" if update.effective_user.username else "без username"
        
        admin_text = (
            f"📩 <b>Новый вопрос от пользователя!</b>\\n\\n"
            f"👤 <b>От:</b> {user_name} ({user_username})\\n"
            f"🆔 <b>ID пользователя:</b> <code>{user_id}</code>\\n\\n"
            f"❓ <b>Вопрос:</b>\\n<i>{msg.text}</i>\\n\\n"
            f"<i>Для ответа пользователю через бота отправьте:</i>\\n"
            f"<code>/reply {user_id} Ваш ответ</code>"
        )
        try:
            await context.bot.send_message(
                chat_id=ADMIN_ID,
                text=admin_text,
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            logger.error(f"Не удалось отправить вопрос администратору {ADMIN_ID}: {e}")
            
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("💬 Открыть ЛС с Ольгой", url=SUPPORT_CHAT)],
            [InlineKeyboardButton("« В главное меню", callback_data="to_main")],
        ])
        await msg.reply_html(
            "✅ <b>Ваш вопрос успешно передан лично Ольге!</b>\\n\\n"
            "Ольга ответит вам в личные сообщения Telegram или через этого бота.\\n\\n"
            "Вы также можете перейти напрямую в диалог:",
            reply_markup=kb,
        )
        return
"""

# Вставим сразу после проверки веса
assert "    except ValueError:\n        pass" in content, "ValueError pass not found"
content = content.replace("    except ValueError:\n        pass", "    except ValueError:\n        pass\n\n" + user_state_question_handler, 1)

# 8. Добавление триггера "вопрос" в текстовые кнопки
old_triggers = """    # Обработка кнопок нижней клавиатуры и текстовых команд
    if "тариф" in text:"""

new_triggers = """    # Обработка кнопок нижней клавиатуры и текстовых команд
    if "вопрос" in text or "спросить" in text or "нутрициолог" in text or "связь" in text:
        await ask_cmd(update, context)
    elif "тариф" in text:"""

assert old_triggers in content, "old_triggers not found"
content = content.replace(old_triggers, new_triggers, 1)

# 9. Добавление команды /ask в post_init
old_commands = """        BotCommand("start", "🌿 Главное меню"),"""
new_commands = """        BotCommand("start", "🌿 Главное меню"),
        BotCommand("ask", "👩⚕️ Задать вопрос нутрициологу (в ЛС)"),"""

assert old_commands in content, "old_commands not found"
content = content.replace(old_commands, new_commands, 1)

# 10. Регистрация CommandHandler("ask", ask_cmd) и CommandHandler("reply", reply_cmd) в main()
old_handlers = """    app.add_handler(CommandHandler("tariffs", tariffs_cmd))"""
new_handlers = """    app.add_handler(CommandHandler("tariffs", tariffs_cmd))
    app.add_handler(CommandHandler("ask", ask_cmd))
    app.add_handler(CommandHandler("reply", reply_cmd))"""

assert old_handlers in content, "old_handlers not found"
content = content.replace(old_handlers, new_handlers, 1)

# Запись изменений
bot_path.write_text(content, encoding="utf-8")
print("bot.py successfully patched!")
