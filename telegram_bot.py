# telegram_bot.py — бот-компаньон Keto Balance (aiogram 3.x)
# pip install aiogram
# Запуск: BOT_TOKEN=... python telegram_bot.py
import os, logging, datetime
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

logging.basicConfig(level=logging.INFO)
API = "http://localhost:5173"  # адрес приложения

HELP = ("🥑 *Keto Balance — бот-компаньон*\n\n"
        "Чем помогу:\n"
        "• /idea — идея блюда на сегодня\n"
        "• /shop — ваш список покупок\n"
        "• /menu — меню на сегодня\n"
        "• /diary — напоминание о дневнике самочувствия\n"
        "• /help — это сообщение\n\n"
        "Полное приложение: " + API)

IDEAS = [("🍳 Сливочная яичница с беконом и шпинатом", "#/recipe/k1"),
         ("🍲 Куриный суп с брокколи и сливками", "#/recipe/k6"),
         ("🥩 Говядина, тушённая с капустой", "#/recipe/k14"),
         ("🍗 Курица в сливочно-чесночном соусе", "#/recipe/k12"),
         ("🥗 Салат с тунцом и огурцом", "#/recipe/k8")]

async def start(m: Message):
    kb = InlineKeyboardBuilder()
    kb.button(text="Открыть приложение", url=API)
    kb.button(text="Идея на ужин", callback_data="idea")
    kb.adjust(1)
    await m.answer(HELP, reply_markup=kb.as_markup(), parse_mode="Markdown")

async def idea(m: Message | CallbackQuery):
    import random
    t, link = random.choice(IDEAS)
    kb = InlineKeyboardBuilder(); kb.button(text="Открыть рецепт", url=f"{API}/{link}")
    target = m.message if isinstance(m, CallbackQuery) else m
    await target.answer(f"Сегодня предлагаю: {t}\nБыстро, сытно и без сложных продуктов.", reply_markup=kb.as_markup())

async def shop(m: Message):
    await m.answer("🛒 Список покупок собирается из меню в приложении.\n" + API + "/#/shopping")

async def menu(m: Message):
    await m.answer("📅 Ваше меню на сегодня — в приложении:\n" + API + "/#/menu")

async def diary(m: Message):
    today = datetime.date.today().strftime("%d.%m")
    await m.answer(f"📔 Не забудьте отметить самочувствие за {today}: энергия, сон, голод, настроение. Займёт 30 секунд.\n" + API + "/#/diary")

async def help_cmd(m: Message): await m.answer(HELP, parse_mode="Markdown")

def main():
    token = os.getenv("BOT_TOKEN")
    if not token: raise SystemExit("Задайте BOT_TOKEN")
    dp = Dispatcher()
    dp.message.register(start, CommandStart())
    dp.message.register(help_cmd, Command("help"))
    dp.message.register(idea, Command("idea"))
    dp.message.register(shop, Command("shop"))
    dp.message.register(menu, Command("menu"))
    dp.message.register(diary, Command("diary"))
    dp.callback_query.register(idea, F.data == "idea")
    dp.polling.start(Bot(token))

if __name__ == "__main__":
    main()
