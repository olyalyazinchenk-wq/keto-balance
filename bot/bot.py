"""
Кето Баланс — Главный Telegram-бот (автоворонка, база рецептов, трекер воды, расчеты, Mini App и монетизация).
"""
import logging
import sys
import os
import json
import random
import re
import traceback
from datetime import datetime
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
    ReplyKeyboardRemove,
)
from telegram.constants import ParseMode
from telegram.request import HTTPXRequest
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    PreCheckoutQueryHandler,
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
    ADMIN_ID,
    NUTRITIONIST_USERNAME,
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
from bot.private_support import begin_question, cancel_question, deliver_pending_question, reply_to_question, reject_pending_attachment
from bot.transport import configure_transport

# Настройка логирования
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("KetoBalanceBot")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Сбои бота пишем в отдельный файл: без деталей разбор инцидента невозможен
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ERROR_LOG_PATH = PROJECT_ROOT / "logs" / "bot_errors.log"
SECRET_PATTERN = re.compile(r"\d{5,}:[A-Za-z0-9_-]{30,}")

# Загрузка рецептов и советов из bot_data.json
DATA_PATH = Path(__file__).resolve().parent.parent / "bot_data.json"
RECIPES: List[Dict[str, Any]] = []
TIPS: List[str] = []

if DATA_PATH.exists() and os.environ.get('APP_STAGE') != 'test':
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
        [KeyboardButton("👩⚕️ Задать вопрос"), KeyboardButton("❓ Справка")],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_current_webapp_url() -> str:
    """Получение актуального HTTPS адреса Mini App из файла туннеля или .env."""
    if os.environ.get("APP_STAGE") in ("test", "staging") or "unittest" in sys.modules:
        return WEBAPP_URL
    fpath = Path(__file__).resolve().parent.parent / "current_tunnel_url.txt"
    if fpath.exists():
        try:
            val = fpath.read_text(encoding="utf-8").strip()
            if val.startswith("https://"):
                return val
        except Exception:
            pass
    return WEBAPP_URL

def webapp_button(text: str, url: Optional[str] = None) -> InlineKeyboardButton:
    clean_url = (url or get_current_webapp_url()).strip()
    if clean_url.startswith("https://"):
        return InlineKeyboardButton(text, web_app=WebAppInfo(url=clean_url))
    # Telegram запрещает localhost и non-https в InlineKeyboardButton URL
    return InlineKeyboardButton(text, callback_data="open_app_local")


def get_main_keyboard() -> InlineKeyboardMarkup:
    """Главное интерактивное меню бота."""
    keyboard = [
        [
            webapp_button("📱 Открыть приложение Кето Баланс")
        ],
        [
            InlineKeyboardButton("🎲 Идея блюда", callback_data="idea"),
            InlineKeyboardButton("📖 Каталог рецептов", callback_data="recipes_cat"),
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
            InlineKeyboardButton("👩⚕️ Задать вопрос", callback_data="ask_menu"),
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
    cancel_question(context)
    if context.args == ['question']:
        await ask_cmd(update, context)
        return
    user = update.effective_user
    get_or_create_user(user.id, user.username, user.first_name)
    welcome_text = get_welcome_text(user.first_name or "друг")
    
    if context.args and len(context.args) > 0:
        arg = context.args[0].lower()
        if "plateau" in arg or "plato" in arg:
            await update.message.reply_html(get_plateau_promo_text(), reply_markup=get_plateau_keyboard())
            return
            
    # Очищаем дублирующую нижнюю клавиатуру, если осталась у пользователя
    try:
        rm_msg = await update.message.reply_text("🌿", reply_markup=ReplyKeyboardRemove())
        await rm_msg.delete()
    except Exception:
        pass

    await send_single_menu(update, context, welcome_text)

async def send_single_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, text: Optional[str] = None):
    """Отправка единого главного меню без дублирования: старое меню удаляется из чата."""
    menu_text = text or (
        "🌿 <b>Главное меню Кето Баланс</b>\n\n"
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
            # Удаляем старое меню, если нажатие было в другом сообщении
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
            pass

async def menu_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /menu (единое меню без дублей)."""
    cancel_question(context)
    await send_single_menu(update, context)

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
        [InlineKeyboardButton("👩⚕️ Написать Ольге", callback_data="ask_menu")],
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

async def ask_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Описание личной связи до согласия на отправку."""
    cancel_question(context)
    text = ("Написать Ольге\n\nСледующее сообщение будет передано Ольге в личный чат только после нажатия кнопки ниже. "
            "Не отправляйте анализы и документы. Срочные обращения этот чат не заменяет.")
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("✍️ Написать вопрос", callback_data="ask_start")],
        [InlineKeyboardButton("« В главное меню", callback_data="to_main")],
    ])
    if update.message:
        await update.message.reply_text(text, reply_markup=kb)
    elif update.callback_query:
        await update.callback_query.edit_message_text(text, reply_markup=kb)

async def reply_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await reply_to_question(update, context, ADMIN_ID)

async def cancel_on_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cancel_question(context)

async def cancel_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cancel_question(context)
    if update.message:
        await update.message.reply_text('Отправка отменена.')

async def tariffs_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /tariffs и раздела Тарифы."""
    from bot.config import PRODUCTS
    sub = PRODUCTS["sub_month"]
    text = (
        "👑 <b>Тариф подписки Кето Баланс</b>\n\n"
        f"<b>{sub['title']}</b>\n"
        f"{sub['description']}\n"
        f"💰 Стоимость: <b>{sub['price']} ₽ / мес</b>\n\n"
        "ℹ️ <i>Подписка даёт полный доступ к планированию рационов, рецептам и автоспискам покупок в Mini App.</i>"
    )
    kb = InlineKeyboardMarkup([
        [webapp_button("📱 Открыть приложение")],
        [InlineKeyboardButton("« В главное меню", callback_data="to_main")],
    ])
    if update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
    elif update.message:
        await update.message.reply_html(text, reply_markup=kb)


async def paysupport_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /paysupport: условия подписки, отмена и возврат через Telegram Stars."""
    text = (
        "💳 <b>Поддержка по оплате и подписке Кето Баланс</b>\n\n"
        "• <b>Тариф:</b> Месячная подписка на полный доступ к сервису.\n"
        "• <b>Оплата:</b> Оплата производится официально через Telegram Stars (XTR) без скрытых комиссий.\n"
        "• <b>Автопродление:</b> Только при вашем явном согласии. Вы можете отменить подписку в любой момент в Telegram: <i>Настройки → Мои подписки</i>.\n"
        "• <b>Возврат средств:</b> При технических сбоях или ошибочном списании возврат производится через команду поддержки или вызов refundStarPayment.\n\n"
        "Для решения любых вопросов по платежам обратитесь в службу поддержки через Mini App или напишите нашему нутрициологу."
    )
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("👑 Посмотреть тариф", callback_data="tariffs")],
        [InlineKeyboardButton("« В главное меню", callback_data="to_main")],
    ])
    if update.callback_query:
        await update.callback_query.edit_message_text(text, parse_mode="HTML", reply_markup=kb)
    elif update.message:
        await update.message.reply_html(text, reply_markup=kb)

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
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("« В главное меню", callback_data="to_main")]])
    await update.message.reply_html(text, reply_markup=kb)

# --- ОБРАБОТЧИК CALLBACK КНОПОК ---

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик всех нажатий inline-кнопок."""
    query = update.callback_query
    if not query or not query.data or not query.from_user:
        return
    await query.answer()
    data = query.data
    if data != "ask_start":
        cancel_question(context)
    user_id = query.from_user.id
    
    if data == "open_app_local":
        await query.answer(
            f"📱 Веб-приложение запущено локально ({WEBAPP_URL}).\nДля открытия прямо в Telegram требуется публичный HTTPS адрес (ngrok/Vercel/etc).",
            show_alert=True
        )
        return

    elif data == "paysupport_cb":
        await paysupport_cmd(update, context)
        return
        
    elif data == "to_main":
        cancel_question(context)
        await send_single_menu(update, context)
        
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
                f"<b>{cat_title}</b>\n\nВ этой категории пока нет рецептов.",
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
            [InlineKeyboardButton("👩⚕️ Написать Ольге", callback_data="ask_menu")],
            [InlineKeyboardButton("« В меню", callback_data="to_main")],
        ])
        await query.edit_message_text(get_sos_text(), parse_mode="HTML", reply_markup=kb)
        
    elif data == "plateau_info":
        await query.edit_message_text(
            get_plateau_promo_text(),
            parse_mode="HTML",
            reply_markup=get_plateau_keyboard(),
        )
        
    elif data == "ask_menu":
        await ask_cmd(update, context)
        
    elif data == "ask_start":
        if not begin_question(update, context):
            await query.edit_message_text("Вопрос можно отправить только в личном чате с ботом.")
            return
        await query.edit_message_text(
            "Следующее текстовое сообщение будет передано Ольге в личный чат. Не отправляй анализы и документы. Для отмены нажми «Отмена» или отправь /cancel.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("« Отмена", callback_data="to_main")]])
        )
        return

    elif data == "tariffs":
        await tariffs_cmd(update, context)
        
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
        
    keyboard_texts = {button.text for row in get_reply_keyboard().keyboard for button in row}
    if msg.text in keyboard_texts:
        cancel_question(context)
        try:
            rm = await msg.reply_text("🌿", reply_markup=ReplyKeyboardRemove())
            await rm.delete()
        except Exception:
            pass
    elif await deliver_pending_question(update, context, ADMIN_ID):
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


        
    # Обработка кнопок нижней клавиатуры и текстовых команд
    if "вопрос" in text or "спросить" in text or "нутрициолог" in text or "связь" in text:
        await ask_cmd(update, context)
    elif "тариф" in text:
        await tariffs_cmd(update, context)
    elif "иде" in text or "блюд" in text:
        await idea_cmd(update, context)
    elif "рецепт" in text or "каталог" in text:
        await recipes_cmd(update, context)
    elif "вод" in text or "трекер" in text or "гидрат" in text:
        await water_cmd(update, context)
    elif "кальк" in text or "бжу" in text or "расчет" in text or "норма" in text:
        await calc_cmd(update, context)
    elif "совет" in text:
        await tip_cmd(update, context)
    elif "срыв" in text or "тяг" in text or "sos" in text or "антисрыв" in text:
        await sos_cmd(update, context)
    elif "плато" in text or "вес стоит" in text:
        await msg.reply_html(get_plateau_promo_text(), reply_markup=get_plateau_keyboard())
    elif "меню" in text or "старт" in text or "главное" in text:
        await menu_cmd(update, context)
    elif "помощ" in text or "справк" in text or "help" in text:
        await help_cmd(update, context)
    elif "баланс" in text or "balance" in text:
        cancel_question(context)
        await send_single_menu(
            update,
            context,
            text=(
                "🌿 <b>Добро пожаловать по кодовому слову БАЛАНС!</b>\n\n"
                "Вам доступен экспресс-расчёт нормы воды и БЖУ, а также персональный помощник питания:"
            ),
        )
    else:
        kb = InlineKeyboardMarkup([[InlineKeyboardButton("« Открыть главное меню", callback_data="to_main")]])
        await msg.reply_html(
            "🌿 <b>Кето Баланс</b>\n\nИспользуйте интерактивное меню выше для навигации:",
            reply_markup=kb,
        )

async def post_init(application: Application):
    """Установка списка команд в меню Telegram бота."""
    commands = [
        BotCommand("start", "🌿 Главное меню"),
        BotCommand("ask", "👩⚕️ Задать вопрос нутрициологу (в ЛС)"),
        BotCommand("idea", "🎲 Идея блюда на сегодня"),
        BotCommand("recipes", "📖 Каталог рецептов (37+)"),
        BotCommand("water", "💧 Трекер воды"),
        BotCommand("calc", "⚖️ Калькулятор воды и БЖУ"),
        BotCommand("tip", "💡 Совет нутрициолога"),
        BotCommand("sos", "🆘 Протокол при тяге и срыве"),
        BotCommand("tariffs", "👑 Тарифы и продукты"),
        BotCommand("paysupport", "💳 Поддержка по оплате и подписке"),
        BotCommand("menu", "🌿 Меню бота"),
        BotCommand("help", "❓ Справка по боту"),
    ]
    try:
        await application.bot.set_my_commands(commands)
        logger.info("Команды бота успешно зарегистрированы в Telegram!")
    except Exception:
        logger.warning("Не удалось зарегистрировать команды Telegram")

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Логирует сбой локально (без секретов), пользователю показывает нейтральный текст."""
    err = context.error
    update_id = getattr(update, "update_id", "?")
    kind = type(update).__name__ if update is not None else "None"
    detail = f"{type(err).__name__}: {err}" if err is not None else "unknown"
    detail = SECRET_PATTERN.sub("[REDACTED]", detail)
    err_type = type(err).__name__ if err is not None else "unknown"
    logger.error("Ошибка обработки обновления %s (update_id=%s): %s", kind, update_id, err_type)
    try:
        ERROR_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with ERROR_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(f"\n[{datetime.now().isoformat(timespec='seconds')}] {kind} update_id={update_id} {detail}\n")
            if err is not None:
                tb_text = "".join(traceback.format_exception(type(err), err, err.__traceback__))
                fh.write(SECRET_PATTERN.sub("[REDACTED]", tb_text))
    except Exception:  # логирование не должно ломать бота
        pass
    if update is not None and getattr(update, "effective_chat", None) is not None:
        try:
            await context.bot.send_message(
                chat_id=update.effective_chat.id,
                text="Что-то пошло не так. Попробуйте ещё раз или напишите /menu.",
                parse_mode=None,
            )
        except Exception:
            pass


# --- TELEGRAM STARS POLLING EVENT HANDLERS ---

async def pre_checkout_handler(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    db_path: Optional[Path | str] = None,
):
    """Обработка pre_checkout_query напрямую в polling-процессе."""
    query = update.pre_checkout_query
    if not query:
        return
    order_id = query.invoice_payload
    if not order_id:
        await query.answer(ok=False, error_message="Отсутствует идентификатор заказа")
        return

    from bot.app_settings import get_settings
    actual_db = Path(db_path) if db_path is not None else get_settings().db_path

    from bot.app_db import get_order
    order = get_order(db_path=actual_db, order_id=order_id)
    if not order:
        await query.answer(ok=False, error_message="Заказ не найден")
        return

    from bot.server import PRODUCT_STARS
    expected_stars = PRODUCT_STARS.get(order.get("product_id"), 1000)
    if query.currency != "XTR" or query.total_amount != expected_stars:
        await query.answer(ok=False, error_message="Неверная сумма или валюта")
        return

    user_id = query.from_user.id if query.from_user else None
    if not user_id or user_id != order.get("user_id"):
        await query.answer(ok=False, error_message="Несовпадение пользователя заказа")
        return

    await query.answer(ok=True)
    logger.info("Pre-checkout query %s approved for order %s", query.id, order_id)


async def successful_payment_handler(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    db_path: Optional[Path | str] = None,
):
    """Обработка успешной оплаты Telegram Stars напрямую в polling-процессе."""
    msg = update.message
    if not msg or not msg.successful_payment:
        return

    succ = msg.successful_payment
    order_id = succ.invoice_payload
    if not order_id:
        logger.warning("Successful payment missing invoice_payload")
        return

    from bot.app_settings import get_settings
    actual_db = Path(db_path) if db_path is not None else get_settings().db_path

    from bot.app_db import get_order, complete_order, get_user_subscription
    from bot.server import PRODUCT_STARS

    order = get_order(db_path=actual_db, order_id=order_id)
    if not order:
        logger.error("Order %s not found for successful payment", order_id)
        await msg.reply_html(
            "⚠️ <b>Заказ не найден в базе данных</b>\n"
            "Пожалуйста, свяжитесь со службой поддержки через команду /paysupport."
        )
        return

    if succ.currency != "XTR":
        logger.error("Invalid currency %s for order %s", succ.currency, order_id)
        return

    expected_stars = PRODUCT_STARS.get(order.get("product_id"), 1000)
    if succ.total_amount != expected_stars:
        logger.error("Amount mismatch: got %s, expected %s", succ.total_amount, expected_stars)
        return

    sender_id = msg.from_user.id if msg.from_user else None
    if not sender_id or sender_id != order.get("user_id"):
        logger.error("User mismatch: got %s, expected %s", sender_id, order.get("user_id"))
        return

    if order.get("status") == "completed":
        sub = get_user_subscription(db_path=actual_db, user_id=order["user_id"])
        logger.info("Order %s was already completed, idempotent handling", order_id)
    else:
        completed = complete_order(db_path=actual_db, order_id=order_id)
        sub = completed.get("subscription")
        logger.info("Order %s completed and subscription activated for user %s", order_id, sender_id)

    expires_str = ""
    if sub and sub.get("expires_at"):
        expires_str = f"\nПодписка активна до: {sub['expires_at']}"

    kb = InlineKeyboardMarkup([
        [webapp_button("📱 Открыть Кето Баланс")],
        [InlineKeyboardButton("💳 Условия и возврат", callback_data="paysupport_cb")],
    ])
    await msg.reply_html(
        "🎉 <b>Оплата успешно получена!</b>\n\n"
        "Благодарим за поддержку проекта «Кето Баланс»! "
        f"Ваш доступ к Premium-функциям успешно активирован.{expires_str}\n\n"
        "Вы можете сразу открыть приложение и продолжить работу со своим меню.",
        reply_markup=kb,
    )


def main():
    if not BOT_TOKEN:
        print("[ERROR] Токен Telegram-бота не задан. Укажите KETO_BOT_TOKEN в .env файле.", file=sys.stderr)
        sys.exit(1)
        
    from bot.database import init_db
    init_db()

    proxy = os.getenv("KETO_BOT_PROXY") or None
    app = configure_transport(ApplicationBuilder().token(BOT_TOKEN), proxy).post_init(post_init).build()
    
    app.add_handler(MessageHandler(filters.COMMAND, cancel_on_command), group=-1)
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("menu", menu_cmd))
    app.add_handler(CommandHandler("tariffs", tariffs_cmd))
    app.add_handler(CommandHandler("paysupport", paysupport_cmd))
    app.add_handler(CommandHandler("ask", ask_cmd))
    app.add_handler(CommandHandler("reply", reply_cmd))
    app.add_handler(CommandHandler("cancel", cancel_cmd))
    app.add_handler(CommandHandler("idea", idea_cmd))
    app.add_handler(CommandHandler("recipes", recipes_cmd))
    app.add_handler(CommandHandler("water", water_cmd))
    app.add_handler(CommandHandler("calc", calc_cmd))
    app.add_handler(CommandHandler("tip", tip_cmd))
    app.add_handler(CommandHandler("sos", sos_cmd))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(PreCheckoutQueryHandler(pre_checkout_handler))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_message_handler))
    app.add_handler(MessageHandler(filters.ChatType.PRIVATE & filters.ATTACHMENT, reject_pending_attachment))
    
    print(f"[INFO] Кето Баланс Bot запущен. WebApp: {WEBAPP_URL}")
    app.add_error_handler(error_handler)
    app.run_polling()

if __name__ == "__main__":
    main()
