"""
Keto Balance — Конфигурация бота и платёжных шлюзов.
"""
import os
from pathlib import Path

# Базовые директории
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# Загрузка переменных из .env при наличии
if ENV_PATH.exists():
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

# Режим работы оплат: 'demo' (тестовый симулятор без реальных списаний) или 'live'
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "demo")

# Контакты и каналы
NUTRITIONIST_USERNAME = os.getenv("NUTRITIONIST_USERNAME", "olga_nutri_med")
CHANNEL_URL = os.getenv("CHANNEL_URL", "https://t.me/olga_nutri_med")
SUPPORT_CHAT = os.getenv("SUPPORT_CHAT", "https://t.me/olga_nutri_med")

# Продуктовая линейка и тарифы (в рублях)
PRODUCTS = {
    "plateau_guide": {
        "id": "plateau_guide",
        "title": "⚡ Протокол «Выход из плато» + 15 экспресс-рецептов",
        "description": "Пошаговое руководство по преодолению весового плато на кето/карнивор, водный протокол (2+ л) и белковая матрица.",
        "price": 490,
        "badge": "Хит продаж 🔥",
    },
    "sub_month": {
        "id": "sub_month",
        "title": "👑 Подписка Keto Balance Premium (1 месяц)",
        "description": "Полный доступ к приложению Mini App: все 37+ рецептов, конструктор блюд из холодильника, автосписки покупок и дневник.",
        "price": 1900,
        "badge": "Основной продукт 📱",
    },
    "vip_care": {
        "id": "vip_care",
        "title": "💎 VIP-сопровождение нутрициолога Ольги (1 месяц)",
        "description": "Индивидуальный разбор анализов, персонализированное меню под ваш образ жизни, ежедневная поддержка в чате и видеозвонки.",
        "price": 15000,
        "badge": "Максимальный результат 🌟",
    },
}
