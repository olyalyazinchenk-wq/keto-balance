"""
Кето Баланс — Главный Telegram-бот (автоворонка, база рецептов, трекер воды, расчеты, Mini App и монетизация).
"""
import logging
import sys
import json
import random
from pathlib import Path
from typing import Dict, Any, List, Optional
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    BotCommand,
    ReplyKeyboardMarkup,
    KeyboardButton,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

from bot.config import (
    BOT_TOKEN,
    WEBAPP_URL,
    PRODUCTS,
    CHANNEL_URL,
    SUPPORT_CHAT,
    PAYMENT_MODE,
)
from bot.database import (
    get_or_create_user,
    save_calculation,
    update_user_mode,
    log_water,
    get_today_water,
    reset_today_water,
)
from bot.funnel import (
    calculate_nutrition,
    format_calc_result,
    get_welcome_text,
    get_plateau_promo_text,
    get_plateau_full_guide,
)
from bot.payments import init_purchase, complete_demo_payment

# Настройка логирования
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("KetoBalanceBot")

# Загрузка рецептов и советов из bot_data.json
DATA_PATH = Path(__file__).resolve().parent.parent / "bot_data.json"
RECIPES: List[Dict[str, Any]] = []
TIPS: List[str] = []

if DATA_PATH.exists():
    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            RECIPES = data.get("recipes", [])
            TIPS = data.get("tips", [])
        logger.info(f"Загружено {len(RECIPES)} рецептов и {len(TIPS)} советов из {DATA_PATH}")
    except Exception as e:
        logger.warning(f"Не удалось загрузить bot_data.json: {e}")

# Хранилище временного состояния расчета в памяти {user_id: {mode: 'keto', ...}}
user_states: Dict[int, Dict[str, Any]] = {}

# Категории рецептов
CATEGORY_NAMES = {
    "breakfast": "🍳 Завтраки",
    "lunch": "🥩 Обеды и ужины",
    "soup": "🍲 Супы и бульоны",
    "salad": "🥗 Салаты",
    "snack": "🧀 Перекусы",
    "carnivore": "🥩 Карнивор-рацион",
}


def get_reply_keyboard() -> ReplyKeyboardMarkup:
    """Постоянная нижняя русскоязычная клавиатура меню."""
    keyboard = [
        [KeyboardButton("🌿 Главное меню"), KeyboardButton("🎲 Идея блюда")],
        [KeyboardButton("📖 Рецепты"), KeyboardButton("💧 Трекер воды")],
        [KeyboardButton("⚖️ Калькулятор БЖУ"), KeyboardButton("💡 Совет дня")],
        [KeyboardButton("🆘 Антисрыв"), KeyboardButton("👑 Тарифы")],
        [KeyboardButton("❓ Справка и помощь")],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def webapp_button(text: str, url: str = WEBAPP_URL) -> InlineKeyboardButton:
    clean_url = (url or "").strip()
    if clean_url.startswith("https://"):
        return InlineKeyboardButton(text, web_app=WebAppInfo(url=clean_url))
    return InlineKeyboardButton(text, url=clean_url if clean_url else "http://localhost:3000")


def get_main_keyboard() -> InlineKeyboardMarkup:
    """Главное интерактивное меню бота."""
    keyboard = [
        [
            webapp_button("📱 Открыть приложение Кето Баланс")
        ],
        [
            InlineKeyboardButton("🎲 Идея блюда", callback_data="idea"),
            InlineKeyboardButton("📖 Рецепты (37+)", callback_data="recipes_cat"),
        ],
        [
            InlineKeyboardButton("💧 Трекер воды", callback_data="water_tracker"),
            InlineKeyboardButton("⚖️ Расчёт нормы БЖУ", callback_data="calc_mode"),
        ],
        [
            InlineKeyboardButton("⚡ Протокол «Плато»", callback_data="plateau_info"),
            InlineKeyboardButton("🆘 Антисрыв", callback_data="sos_info"),
        ],
        [
            InlineKeyboardButton("💡 Совет дня", callback_data="tip_random"),
            InlineKeyboardButton("👑 Тарифы", callback_data="tariffs"),
        ],
        [
            InlineKeyboardButton("📢 Канал Ольги", url=CHANNEL_URL),
            InlineKeyboardButton("👩⚕️ Задать вопрос", url=SUPPORT_CHAT),
        ],
    ]
    return InlineKeyboardMarkup(keyboard)

def format_recipe_card(r: Dict[str, Any]) -> str:
    """Форматирование полного рецепта для Telegram."""
    mode_label = "🥑 Кето" if r.get("mode") == "keto" else "🥩 Карнивор"
    ing_list = "\n".join([f"• {name}: <b>{qty}</b>" for name, qty in r.get("ing", [])])
    steps_list = "\n".join([f"<b>{i+1}.</b> {step}" for i, step in enumerate(r.get("steps", []))])
    
    return (
        f"{r.get('emoji', '🍳')} <b>{r.get('title')}</b>\n\n"
        f"Формат: <b>{mode_label}</b> | Время: <b>{r.get('time', 15)} мин</b> | Порций: <b>{r.get('serv', 1)}</b>\n"
        f"Сложность: <b>{r.get('diff', 'легко')}</b>\n\n"
        f"📊 <b>КБЖУ на порцию:</b>\n"
        f"🔥 Калории: <b>{r.get('kcal', 0)} ккал</b>\n"
        f"🥩 Белки: <b>{r.get('p', 0)} г</b> | 🧈 Жиры: <b>{r.get('f', 0)} г</b> | 🥬 Чистые углеводы: <b>{r.get('nc', 0)} г</b>\n\n"
        f"🛒 <b>Ингредиенты:</b>\n{ing_list}\n\n"
        f"👨🍳 <b>Приготовление:</b>\n{steps_list}"
    )

def get_water_view(user_id: int) -> tuple[str, InlineKeyboardMarkup]:
    """Генерация экрана трекера воды с прогресс-баром."""
    current_ml = get_today_water(user_id)
    target_ml = 2000
    percent = min(100, round((current_ml / target_ml) * 100))
    
    filled = round(percent / 10)
    bar = "█" * filled + "░" * (10 - filled)
    
    text = (
        f"💧 <b>Трекер гидратации на сегодня</b>\n\n"
        f"Выпито: <b>{current_ml} / {target_ml} мл</b> ({percent}%)\n"
        f"<code>[{bar}]</code>\n\n"
        f"💡 <b>Совет нутрициолога Ольги:</b>\n"
        f"На кето и карниворе почки быстрее выводят воду и электролиты. "
        f"Пейте воду равномерно, добавляя в утренний стакан щепотку соли."
    )
    
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("+250 мл (стакан)", callback_data="water_add_250"),
            InlineKeyboardButton("+500 мл (бутылка)", callback_data="water_add_500"),
        ],
        [
            InlineKeyboardButton("🔄 Сбросить", callback_data="water_reset"),
            InlineKeyboardButton("« В меню", callback_data="to_main"),
        ],
    ])
    return text, kb

def get_sos_text() -> str:
    return (
        "🆘 <b>Протокол «Антисрыв» — Скорая помощь при тяге к еде</b>\n\n"
        "Если прямо сейчас накрыло желание съесть сладкое или запретное:\n\n"
        "1️⃣ <b>Шаг 1: Теплая вода с солью</b>\n"
        "Выпейте большой стакан теплой воды с щепоткой натуральной соли. "
        "В 80% случаев острая тяга к сладкому на кето — это замаскированный сигнал нехватки натрия!\n\n"
        "2️⃣ <b>Шаг 2: Правильный сытный жир</b>\n"
        "Съешьте кусочек (10-15 г) качественного сливочного масла, ломтик сыра или ложку маскарпоне. "
        "Жир мгновенно подает сигнал насыщения в гипоталамус без всплеска инсулина.\n\n"
        "3️⃣ <b>Шаг 3: Правило 15 минут</b>\n"
        "Переключите внимание: выйдите на свежий воздух или сделайте 10 глубоких вдохов. Организм перестроится.\n\n"
        "4️⃣ <b>Если срыв всё же случился:</b>\n"
        "Никакого чувства вины и никаких голодовок на следующий день! "
        "Просто возвращайтесь к плановому приёму кето-пищи."
    )

def get_plateau_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [webapp_button("📱 Открыть приложение")],
        [InlineKeyboardButton("« Назад в меню", callback_data="to_main")],
    ])

# --- КОМАНДЫ БОТА ---

async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start."""
    if not update.message or not update.effective_user:
        return
    user = update.effective_user
    get_or_create_user(user.id, user.username, user.first_name)
    welcome_text = get_welcome_text(user.first_name or "друг")
    
    if context.args and len(context.args) > 0:
        arg = context.args[0].lower()
        if "plateau" in arg or "plato" in arg:
            await update.message.reply_html(get_plateau_promo_text(), reply_markup=get_plateau_keyboard())
            return
            
    await update.message.reply_html(welcome_text, reply_markup=get_main_keyboard())

async def menu_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /menu."""
    if not update.message:
        return
    await update.message.reply_html(
        "🌿 <b>Главное меню Кето Баланс</b>\n\nВыберите нужный раздел или откройте Web App:",
        reply_markup=get_main_keyboard(),
    )

async def idea_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /idea."""
    if not update.message:
        return
    if not RECIPES:
        await update.message.reply_html("🍳 Рецепты скоро появятся! Загляните в меню: /menu")
        return
    r = random.choice(RECIPES)
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎲 Другая идея", callback_data="idea")],
        [webapp_button("📱 Открыть в приложении")],
        [InlineKeyboardButton("« В меню", callback_data="to_main")],
    ])
    await update.message.reply_html(format_recipe_card(r), reply_markup=kb)

async def recipes_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /recipes."""
    if not update.message:
        return
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🍳 Завтраки", callback_data="cat_breakfast"), InlineKeyboardButton("🥩 Обеды и ужины", callback_data="cat_lunch")],
        [InlineKeyboardButton("🍲 Супы", callback_data="cat_soup"), InlineKeyboardButton("🥗 Салаты", callback_data="cat_salad")],
        [InlineKeyboardButton("🧀 Перекусы", callback_data="cat_snack"), InlineKeyboardButton("🥩 Карнивор", callback_data="cat_carnivore")],
        [InlineKeyboardButton("🎲 Случайное блюдо", callback_data="idea")],
        [webapp_button("📱 Все 37+ рецептов в Web App")],
        [InlineKeyboardButton("« В меню", callback_data="to_main")],
    ])
    await update.message.reply_html(
        "📖 <b>Каталог проверенных рецептов Кето Баланс</b>\n\nВыберите категорию блюд или запустите случайный подбор:",
        reply_markup=kb,
    )

async def water_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /water."""
    if not update.message or not update.effective_user:
        return
    text, kb = get_water_view(update.effective_user.id)
    await update.message.reply_html(text, reply_markup=kb)

async def tip_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /tip."""
    if not update.message:
        return
    tip = random.choice(TIPS) if TIPS else "Пейте достаточное количество воды с щепоткой морской соли для поддержания электролитов."
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("💡 Ещё совет", callback_data="tip_random")],
        [InlineKeyboardButton("« В меню", callback_data="to_main")],
    ])
    await update.message.reply_html(f"💡 <b>Совет нутрициолога Ольги:</b>\n\n{tip}", reply_markup=kb)

async def sos_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /sos."""
    if not update.message:
        return
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("⚡ Протокол «Плато»", callback_data="plateau_info")],
        [InlineKeyboardButton("👩⚕️ Написать нутрициологу", url=SUPPORT_CHAT)],
        [InlineKeyboardButton("« В меню", callback_data="to_main")],
    ])
    await update.message.reply_html(get_sos_text(), reply_markup=kb)

async def calc_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /calc."""
    text = (
        "🎯 <b>Шаг 1 из 2: Выберите формат питания</b>\n\n"
        "🥑 <b>Кето</b> — рацион с сытными жирами, белком и зеленью/овощами (до 20–25г чистых углев.).\n"
        "🥩 <b>Карнивор</b> — строго мясной протокол (мясо, рыба, яйца, сливочное масло, 0 углев.)."
    )
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🥑 Кето", callback_data="set_mode_keto"),
            InlineKeyboardButton("🥩 Карнивор", callback_data="set_mode_carnivore"),
        ],
        [InlineKeyboardButton("« В меню", callback_data="to_main")],
    ])
    if update.message:
        await update.message.reply_html(text, reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /help."""
    if not update.message:
        return
    text = (
        "🥑 <b>Команды бота Кето Баланс</b>\n\n"
        "• /start — Главное меню и приветствие\n"
        "• /idea — Случайная идея рецепта на сегодня\n"
        "• /recipes — Каталог рецептов по категориям\n"
        "• /water — Трекер выпитой воды за день\n"
        "• /calc — Расчет нормы воды и БЖУ под ваш вес\n"
        "• /tip — Полезный совет от нутрициолога\n"
        "• /sos — Помощь при тяге к сладкому и срыве\n"
        "• /menu — Быстрое меню\n\n"
        f"📱 Веб-приложение доступно по ссылке или кнопке: {WEBAPP_URL}"
    )
    await update.message.reply_html(text, reply_markup=get_main_keyboard())

# --- ОБРАБОТЧИК CALLBACK КНОПОК ---

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик всех нажатий inline-кнопок."""
    query = update.callback_query
    if not query or not query.data or not query.from_user:
        return
    await query.answer()
    data = query.data
    user_id = query.from_user.id
    
    if data == "to_main":
        await query.edit_message_text(
            "🌿 <b>Главное меню Кето Баланс</b>\n\nВыберите нужный раздел или запустите Web App:",
            parse_mode="HTML",
            reply_markup=get_main_keyboard(),
        )
        
    elif data == "idea":
        if not RECIPES:
            await query.edit_message_text("🍳 Рецепты загружаются...", reply_markup=get_main_keyboard())
            return
        r = random.choice(RECIPES)
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🎲 Другая идея", callback_data="idea")],
            [InlineKeyboardButton("📖 Каталог всех блюд", callback_data="recipes_cat")],
            [webapp_button("📱 Открыть в Web App")],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(format_recipe_card(r), parse_mode="HTML", reply_markup=kb)
        
    elif data == "recipes_cat":
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🍳 Завтраки", callback_data="cat_breakfast"), InlineKeyboardButton("🥩 Обеды и ужины", callback_data="cat_lunch")],
            [InlineKeyboardButton("🍲 Супы", callback_data="cat_soup"), InlineKeyboardButton("🥗 Салаты", callback_data="cat_salad")],
            [InlineKeyboardButton("🧀 Перекусы", callback_data="cat_snack"), InlineKeyboardButton("🥩 Карнивор", callback_data="cat_carnivore")],
            [InlineKeyboardButton("🎲 Случайная идея", callback_data="idea")],
            [InlineKeyboardButton("« Назад", callback_data="to_main")],
        ])
        await query.edit_message_text(
            "📖 <b>Категории рецептов Кето Баланс</b>\n\nВыберите интересующий раздел:",
            parse_mode="HTML",
            reply_markup=kb,
        )
        
    elif data.startswith("cat_"):
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
            f"<b>{cat_title}</b> ({len(filtered)} блюд)\n\nВыберите рецепт для просмотра:",
            parse_mode="HTML",
            reply_markup=kb,
        )
        
    elif data.startswith("rec_"):
        rec_id = data.replace("rec_", "")
        found = next((r for r in RECIPES if str(r.get("id")) == rec_id), None)
        if not found:
            await query.edit_message_text("Рецепт не найден.", reply_markup=get_main_keyboard())
            return
            
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📖 К категориям", callback_data="recipes_cat")],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(format_recipe_card(found), parse_mode="HTML", reply_markup=kb)
        
    elif data == "water_tracker":
        text, kb = get_water_view(user_id)
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data == "water_add_250":
        log_water(user_id, 250)
        text, kb = get_water_view(user_id)
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data == "water_add_500":
        log_water(user_id, 500)
        text, kb = get_water_view(user_id)
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data == "water_reset":
        reset_today_water(user_id)
        text, kb = get_water_view(user_id)
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data == "tip_random":
        tip = random.choice(TIPS) if TIPS else "Пейте воду и употребляйте достаточное количество полезных жиров."
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("💡 Ещё совет", callback_data="tip_random")],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(f"💡 <b>Совет нутрициолога Ольги:</b>\n\n{tip}", parse_mode="HTML", reply_markup=kb)
        
    elif data == "sos_info":
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("⚡ Протокол «Плато»", callback_data="plateau_info")],
            [InlineKeyboardButton("👩⚕️ Написать нутрициологу", url=SUPPORT_CHAT)],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(get_sos_text(), parse_mode="HTML", reply_markup=kb)
        
    elif data == "plateau_info":
        await query.edit_message_text(
            get_plateau_promo_text(),
            parse_mode="HTML",
            reply_markup=get_plateau_keyboard(),
        )
        
    elif data == "tariffs":
        text = (
            "👑 <b>Тарифы и продукты Кето Баланс</b>\n\n"
            f"1️⃣ <b>{PRODUCTS['plateau_guide']['title']}</b>\n"
            f"{PRODUCTS['plateau_guide']['description']}\n"
            f"💰 Стоимость: <b>{PRODUCTS['plateau_guide']['price']} ₽</b>\n\n"
            f"2️⃣ <b>{PRODUCTS['sub_month']['title']}</b>\n"
            f"{PRODUCTS['sub_month']['description']}\n"
            f"💰 Стоимость: <b>{PRODUCTS['sub_month']['price']} ₽ / мес</b>\n\n"
            f"3️⃣ <b>{PRODUCTS['vip_care']['title']}</b>\n"
            f"{PRODUCTS['vip_care']['description']}\n"
            f"💰 Стоимость: <b>{PRODUCTS['vip_care']['price']} ₽ / мес</b>\n\n"
            "ℹ️ <i>Покупки временно недоступны. Оформление новых заказов приостановлено.</i>"
        )
        kb = InlineKeyboardMarkup([
            [webapp_button("📱 Открыть приложение")],
            [InlineKeyboardButton("« Назад в меню", callback_data="to_main")],
        ])
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data.startswith("buy_") or data.startswith("confirm_demo_"):
        await query.edit_message_text(
            "⚠️ <b>Покупки временно недоступны</b>\n\n"
            "В рамках технического обновления оформление заказов и прием платежей отключены. "
            "Деньги не списываются, новые заказы не создаются.\n\n"
            "Все доступные разделы и расчеты продолжают работать в штатном режиме.",
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("« В главное меню", callback_data="to_main")]])
        )
            
    # Пошаговый калькулятор
    elif data == "calc_mode":
        await calc_cmd(update, context)
        
    elif data.startswith("set_mode_"):
        mode = data.replace("set_mode_", "")
        user_states[user_id] = {"mode": mode}
        update_user_mode(user_id, mode)
        
        text = (
            f"⚖️ <b>Шаг 2 из 2: Укажите ваш примерный вес</b>\n\n"
            f"Выберите из вариантов или напишите точную цифру сообщением в чат (например: <code>68</code>):"
        )
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("55 кг", callback_data="set_wt_55"),
                InlineKeyboardButton("65 кг", callback_data="set_wt_65"),
                InlineKeyboardButton("75 кг", callback_data="set_wt_75"),
            ],
            [
                InlineKeyboardButton("85 кг", callback_data="set_wt_85"),
                InlineKeyboardButton("95 кг", callback_data="set_wt_95"),
                InlineKeyboardButton("105 кг", callback_data="set_wt_105"),
            ],
            [InlineKeyboardButton("« Назад", callback_data="calc_mode")],
        ])
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
        
    elif data.startswith("set_wt_"):
        wt = float(data.replace("set_wt_", ""))
        mode = user_states.get(user_id, {}).get("mode", "keto")
        calc = calculate_nutrition(wt, mode)
        save_calculation(user_id, wt, mode, calc["water"], calc["kcal"], calc["protein"], calc["fat"], calc["carbs"])
        
        res_text = format_calc_result(calc)
        kb = InlineKeyboardMarkup([
            [webapp_button("📱 Открыть меню под этот расчёт")],
            [InlineKeyboardButton("⚡ Если вес стоит — Протокол «Плато»", callback_data="plateau_info")],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(res_text, parse_mode="HTML", reply_markup=kb)

# --- ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ ---

async def text_message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик текстовых сообщений и триггерных слов (БАЛАНС, ПЛАТО и т.д.)."""
    msg = update.message
    if not msg or not msg.text:
        return
        
    text = msg.text.strip().lower()
    user_id = update.effective_user.id
    
    # Проверка, вводит ли пользователь вес числом
    try:
        num = float(text.replace(",", "."))
        if 35 <= num <= 250:
            mode = user_states.get(user_id, {}).get("mode", "keto")
            calc = calculate_nutrition(num, mode)
            save_calculation(user_id, num, mode, calc["water"], calc["kcal"], calc["protein"], calc["fat"], calc["carbs"])
            res_text = format_calc_result(calc)
            kb = InlineKeyboardMarkup([
                [webapp_button("📱 Открыть меню под этот расчёт")],
                [InlineKeyboardButton("⚡ Протокол «Выход из плато»", callback_data="plateau_info")],
                [InlineKeyboardButton("« В меню", callback_data="to_main")],
            ])
            await msg.reply_html(res_text, reply_markup=kb)
            return
    except ValueError:
        pass
        
    # Триггерные слова из Reels / рекламы
    if "баланс" in text or "balance" in text:
        await msg.reply_html(
            "🌿 <b>Добро пожаловать по кодовому слову БАЛАНС!</b>\n\n"
            "Вам доступен экспресс-расчёт нормы воды и БЖУ, а также персональный помощник питания:",
            reply_markup=get_main_keyboard(),
        )
    elif "плато" in text or "вес стоит" in text:
        await msg.reply_html(get_plateau_promo_text(), reply_markup=get_plateau_keyboard())
    elif "рецепт" in text or "меню" in text:
        await recipes_cmd(update, context)
    elif "вода" in text:
        await water_cmd(update, context)
    elif "совет" in text:
        await tip_cmd(update, context)
    elif "срыв" in text or "тяга" in text or "sos" in text:
        await sos_cmd(update, context)
    else:
        await msg.reply_html(
            "Я вас поняла! Воспользуйтесь кнопками ниже или откройте приложение Кето Баланс прямо сейчас:",
            reply_markup=get_main_keyboard(),
        )

async def post_init(application: Application):
    """Установка списка команд в меню Telegram бота."""
    commands = [
        BotCommand("start", "🌿 Главное меню"),
        BotCommand("idea", "🎲 Идея блюда на сегодня"),
        BotCommand("recipes", "📖 Каталог рецептов (37+)"),
        BotCommand("water", "💧 Трекер воды"),
        BotCommand("calc", "⚖️ Калькулятор воды и БЖУ"),
        BotCommand("tip", "💡 Совет нутрициолога"),
        BotCommand("sos", "🆘 Протокол при тяге и срыве"),
        BotCommand("menu", "🌿 Меню бота"),
        BotCommand("help", "❓ Справка по боту"),
    ]
    try:
        await application.bot.set_my_commands(commands)
        logger.info("Команды бота успешно зарегистрированы в Telegram!")
    except Exception as e:
        logger.warning(f"Не удалось зарегистрировать команды: {e}")

def main():
    if not BOT_TOKEN:
        print("[ERROR] Токен Telegram-бота не задан. Укажите KETO_BOT_TOKEN в .env файле.", file=sys.stderr)
        sys.exit(1)
        
    from bot.database import init_db
    init_db()

    app = ApplicationBuilder().token(BOT_TOKEN).post_init(post_init).build()
    
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("menu", menu_cmd))
    app.add_handler(CommandHandler("idea", idea_cmd))
    app.add_handler(CommandHandler("recipes", recipes_cmd))
    app.add_handler(CommandHandler("water", water_cmd))
    app.add_handler(CommandHandler("calc", calc_cmd))
    app.add_handler(CommandHandler("tip", tip_cmd))
    app.add_handler(CommandHandler("sos", sos_cmd))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_message_handler))
    
    print(f"[INFO] Кето Баланс Bot запущен. WebApp: {WEBAPP_URL}")
    app.run_polling()

if __name__ == "__main__":
    main()
