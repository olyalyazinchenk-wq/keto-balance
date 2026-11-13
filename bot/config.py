"""
Keto Balance — Конфигурация бота и платёжных шлюзов.
"""
import os
from pathlib import Path

# Базовые директории
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# Загрузка переменных из .env при наличии (если разрешено)
if os.getenv("KETO_LOAD_DOTENV", "1") == "1" and ENV_PATH.exists():
    try:
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    clean_v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k.strip(), clean_v)
    except Exception as e:
        print(f"[WARN] Не удалось прочитать .env: {e}")

# Токен Telegram Бота (получается у @BotFather)
BOT_TOKEN = os.getenv("KETO_BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN", ""))

# URL веб-приложения Mini App (локальный или публичный HTTPS)
# Для работы внутри Telegram WebApp нужен HTTPS (ngrok, Cloudflare Tunnel, Vercel, Render или локальный хостинг)
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:5173")

# Токен провайдера оплат Telegram Payments (ЮKassa / Сбербанк / etc через @BotFather)
PAYMENT_PROVIDER_TOKEN = os.getenv("PAYMENT_PROVIDER_TOKEN", "")

# Режим работы оплат: 'disabled' (покупки отключены в P0)
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "disabled")
if PAYMENT_MODE != "disabled":
    PAYMENT_MODE = "disabled"

# ========================================================
# Контакты, каналы и поддержка (строго изолированные параметры)
# Категорически запрещён автоматический fallback личных обращений
# на канал или группу технической поддержки/комьюнити.
# ========================================================

# 1. Системный ID администратора бота
ADMIN_ID = int(os.getenv("ADMIN_ID", "1084557944"))

# 2. Публичный Telegram-канал (новости, рецепты, база знаний)
# Личные вопросы сюда НЕ направляются.
CHANNEL_URL = os.getenv("CHANNEL_URL", "https://t.me/olga_nutri_med")

# 3. Чат технической поддержки или комьюнити
# Для общих вопросов и общения (не для личных консультаций нутрициолога).
SUPPORT_CHAT = os.getenv("SUPPORT_CHAT", "")

# 4. Личный контакт нутрициолога (Ольга) для персональных вопросов
# Обязательный параметр: username личного аккаунта Telegram без символа @.
# Если не задан, fallback на CHANNEL_URL или SUPPORT_CHAT категорически ЗАПРЕЩЁН.
NUTRITIONIST_USERNAME = os.getenv("NUTRITIONIST_USERNAME", "Olgazinchenko1186")

# Числовой Telegram chat ID нутрициолога для доставки личных сообщений ботом
_raw_nutri_chat_id = os.getenv("NUTRITIONIST_CHAT_ID", os.getenv("ADMIN_ID", "1084557944"))
try:
    NUTRITIONIST_CHAT_ID = int(_raw_nutri_chat_id) if _raw_nutri_chat_id else None
except (ValueError, TypeError):
    NUTRITIONIST_CHAT_ID = None


_UNSET = object()


def get_nutritionist_url(username: object = _UNSET) -> str | None:
    """
    Возвращает прямую ссылку на личный диалог с нутрициологом (https://t.me/<username>).
    При отсутствии NUTRITIONIST_USERNAME возвращает None.
    Автоматический fallback на CHANNEL_URL или SUPPORT_CHAT строго запрещён.
    """
    target = NUTRITIONIST_USERNAME if username is _UNSET else username
    if not target or not str(target).strip():
        return None
    clean = str(target).strip().lstrip("@")
    if not clean:
        return None
    if clean.startswith("https://") or clean.startswith("http://"):
        return clean
    return f"https://t.me/{clean}"


def get_nutritionist_chat_id() -> int | None:
    """
    Возвращает числовой ID чата нутрициолога для доставки личных сообщений через бота.
    Допустимы только положительные ID (личные диалоги пользователей).
    Fallback на каналы/группы (отрицательные ID) запрещён.
    """
    if NUTRITIONIST_CHAT_ID is not None and NUTRITIONIST_CHAT_ID > 0:
        return NUTRITIONIST_CHAT_ID
    if ADMIN_ID and ADMIN_ID > 0:
        return ADMIN_ID
    return None


# Продуктовая линейка для продажи (в релизе — строго один утверждённый тариф sub_month)
PRODUCTS = {
    "sub_month": {
        "id": "sub_month",
        "title": "👑 Подписка Кето Баланс Premium (1 месяц)",
        "description": "Рацион на календарный месяц, допущенные рецепты, замены, покупки и восемь учебных материалов. Дневник готовится отдельно.",
        "price": 990,
        "badge": "Основной тариф 📱",
    },
}

# Исторические продукты (для совместимости с ранее созданными заказами, но недоступные для новой покупки)
HISTORICAL_PRODUCTS = {
    "plateau_guide": {
        "id": "plateau_guide",
        "title": "⚡ Протокол «Выход из плато»",
        "description": "Пошаговое руководство по преодолению весового плато.",
        "price": 490,
        "badge": "Архивный гайд",
    },
    "vip_care": {
        "id": "vip_care",
        "title": "💎 VIP-сопровождение",
        "description": "Индивидуальное ведение.",
        "price": 15000,
        "badge": "Архивный тариф",
    },
}
ALL_PRODUCTS = {**HISTORICAL_PRODUCTS, **PRODUCTS}
