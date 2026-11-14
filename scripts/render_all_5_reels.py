import os
import sys
import subprocess
import json
import time

sys.path.append('C:/Users/HP/Keto-balance/scripts')
from reels_engine import create_scene_frame, MEDIA_DIR, MUSIC_PATH

OUTPUT_DIR = os.path.join(MEDIA_DIR, 'reels_output')
os.makedirs(OUTPUT_DIR, exist_ok=True)
CARDS_CACHE_DIR = os.path.join(MEDIA_DIR, 'reels_cards')
os.makedirs(CARDS_CACHE_DIR, exist_ok=True)

# Complete specification of 5 Reels
REELS_DATA = [
    {
        "id": 1,
        "filename": "reels_1_why_sweeteners.mp4",
        "voice": os.path.join(MEDIA_DIR, "voice_reels_1.mp3"),
        "total_dur": 24.38,
        "scenes": [
            {
                "dur": 3.6,
                "broll": "coffee_1.jpg",
                "badge_text": "⚡ ХУК ВЫПУСКА №1",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("ХОТИТЕ МЕНЬШЕ САХАРА,", (255, 255, 255), True),
                    ("НО НЕ ГОТОВЫ БЕЗ СЛАДКОГО?", (250, 204, 21), True),
                    ("Разбираемся честно с точки зрения медицины", (203, 213, 225), False)
                ],
                "sub": "Хотите меньше сахара, но не готовы отказаться от сладкого?"
            },
            {
                "dur": 3.5,
                "broll": "sugar_spoon.jpg",
                "badge_text": "🎯 ГЛАВНАЯ ЦЕЛЬ",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("ДЛЯ ЧЕГО ОНИ СОЗДАНЫ?", (250, 204, 21), True),
                    ("• Снижение добавленного сахара", (255, 255, 255), False),
                    ("• Профилактика резких скачков глюкозы", (226, 232, 240), False),
                    ("• Плавный уход от сахарной зависимости", (203, 213, 225), False)
                ],
                "sub": "Сахарозаменители созданы, чтобы снизить количество сахара"
            },
            {
                "dur": 3.8,
                "broll": "nutrition_plate.jpg",
                "badge_text": "📊 КОНТРОЛЬ КБЖУ",
                "badge_color": (59, 130, 246, 240),
                "title_lines": [
                    ("КОНТРОЛЬ УГЛЕВОДОВ", (255, 255, 255), True),
                    ("• Облегчают соблюдение рациона", (250, 204, 21), False),
                    ("• Сохраняют привычный десертный ритуал", (226, 232, 240), False),
                    ("• Устраняют срывы на сладкое", (203, 213, 225), False)
                ],
                "sub": "и облегчить контроль углеводов в повседневном рационе."
            },
            {
                "dur": 4.5,
                "broll": "wellness_lifestyle.jpg",
                "badge_text": "⚠️ ГЛАВНЫЙ МИФ",
                "badge_color": (234, 88, 12, 240),
                "title_lines": [
                    ("ОНИ НЕ СЖИГАЮТ ЖИР!", (239, 68, 68), True),
                    ("• Заменители не влияют на термогенез", (255, 255, 255), False),
                    ("• Жировые запасы уходят только", (226, 232, 240), False),
                    ("при системном дефиците калорий", (250, 204, 21), False)
                ],
                "sub": "Но помните главное: сами по себе они не сжигают жир"
            },
            {
                "dur": 4.5,
                "broll": "cheesecake.jpg",
                "badge_text": "⚖️ ПРОФИЦИТ ЭНЕРГИИ",
                "badge_color": (168, 85, 247, 240),
                "title_lines": [
                    ("ПРОФИЦИТ БЛОКИРУЕТ ПОХУДЕНИЕ", (250, 204, 21), True),
                    ("• Если в рационе избыток калорий", (255, 255, 255), False),
                    ("• Заменители сахара вес не снизят", (226, 232, 240), False),
                    ("• Важна общая плотность питания", (203, 213, 225), False)
                ],
                "sub": "и не гарантируют похудение при общем профиците калорий."
            },
            {
                "dur": 4.48,
                "broll": "spices_kitchen.jpg",
                "badge_text": "💡 ВЫВОД ЭКСПЕРТА",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("ИНСТРУМЕНТ, А НЕ ТАБЛЕТКА!", (16, 185, 129), True),
                    ("Используйте осознанно и с умом.", (255, 255, 255), False),
                    ("Подробный разбор и меню — в профиле!", (250, 204, 21), False)
                ],
                "sub": "Сахарозаменитель — это лишь инструмент, а не волшебная таблетка!"
            }
        ]
    },
    {
        "id": 2,
        "filename": "reels_2_types_comparison.mp4",
        "voice": os.path.join(MEDIA_DIR, "voice_reels_2.mp3"),
        "total_dur": 30.79,
        "scenes": [
            {
                "dur": 4.0,
                "broll": "measuring_spoons.jpg",
                "badge_text": "🔍 СРАВНИТЕЛЬНЫЙ АНАЛИЗ",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("СТЕВИЯ, ЭРИТРИТ, СУКРАЛОЗА:", (255, 255, 255), True),
                    ("В ЧЁМ ИХ РАЗНИЦА?", (250, 204, 21), True),
                    ("Они абсолютно разные по свойствам!", (203, 213, 225), False)
                ],
                "sub": "Стевия, эритрит, сукралоза — в чём же разница? Они разные!"
            },
            {
                "dur": 4.5,
                "broll": "green_herbs.jpg",
                "badge_text": "🌿 СТЕВИОЛГЛИКОЗИДЫ",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("СТЕВИЯ (ГЛИКОЗИДЫ)", (16, 185, 129), True),
                    ("• Сладость: в 200-300 раз выше сахара", (255, 255, 255), False),
                    ("• Калорийность: 0 ккал • ГИ = 0", (250, 204, 21), False),
                    ("• Натуральный экстракт из листьев", (203, 213, 225), False)
                ],
                "sub": "Стевиолгликозиды — натуральные, в 200 раз слаще и ноль калорий."
            },
            {
                "dur": 5.0,
                "broll": "sugar_cubes.jpg",
                "badge_text": "🧪 САХАРНЫЕ СПИРТЫ (ПОЛИОЛЫ)",
                "badge_color": (59, 130, 246, 240),
                "title_lines": [
                    ("ЭРИТРИТ (ДЫННЫЙ САХАР)", (59, 130, 246), True),
                    ("• Сладость: 70% от сахара", (255, 255, 255), False),
                    ("• 0.2 ккал/г • ГИ = 0", (250, 204, 21), False),
                    ("• Не растит уровень глюкозы и инсулина", (226, 232, 240), False)
                ],
                "sub": "Эритрит и ксилит — сахарные спирты: эритрит не растит глюкозу"
            },
            {
                "dur": 4.5,
                "broll": "mint_leaves.jpg",
                "badge_text": "⚖️ ОСОБЕННОСТИ КСИЛИТА",
                "badge_color": (234, 88, 12, 240),
                "title_lines": [
                    ("КСИЛИТ (БЕРЁЗОВЫЙ)", (250, 204, 21), True),
                    ("• Сладость: 100% как сахар", (255, 255, 255), False),
                    ("• Защищает зубы от кариеса", (226, 232, 240), False),
                    ("• Требует меры: может слабить кишечник", (239, 68, 68), False)
                ],
                "sub": "а ксилит требует меры из-за влияния на ЖКТ."
            },
            {
                "dur": 4.5,
                "broll": "baking_flour.jpg",
                "badge_text": "🔥 СУКРАЛОЗА ДЛЯ ВЫПЕЧКИ",
                "badge_color": (168, 85, 247, 240),
                "title_lines": [
                    ("СУКРАЛОЗА (ТЕРМОСТОЙКАЯ)", (168, 85, 247), True),
                    ("• В 600 раз слаще обычного сахара", (255, 255, 255), False),
                    ("• 0 ккал • Стабильна при выпечке", (250, 204, 21), False),
                    ("• Не разрушается при нагреве в духовке", (226, 232, 240), False)
                ],
                "sub": "Сукралоза — термостабильна и полностью без калорий."
            },
            {
                "dur": 4.2,
                "broll": "dessert_berries.jpg",
                "badge_text": "🍯 РЕДКИЙ САХАР",
                "badge_color": (236, 72, 153, 240),
                "title_lines": [
                    ("АЛЛЮЛОЗА (D-ПСИКОЗА)", (236, 72, 153), True),
                    ("• Редкий моносахарид с мягким вкусом", (255, 255, 255), False),
                    ("• 70% сладости сахара • 0.2-0.4 ккал/г", (250, 204, 21), False),
                    ("• Карамелизуется и даёт корочку!", (226, 232, 240), False)
                ],
                "sub": "Аллюлоза — редкий мягкий сахар с карамелизацией."
            },
            {
                "dur": 4.09,
                "broll": "coffee_2.jpg",
                "badge_text": "💡 ВЫВОД НУТРИЦИОЛОГА",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("ВЫБИРАЙТЕ ПОД СВОИ ЦЕЛИ!", (16, 185, 129), True),
                    ("Стевия — в чай, эритрит — в десерты,", (255, 255, 255), False),
                    ("сукралоза — в выпечку. Эффекты разные!", (250, 204, 21), False)
                ],
                "sub": "Выбирайте под свои цели: эффекты у них абсолютно разные!"
            }
        ]
    },
    {
        "id": 3,
        "filename": "reels_3_dosages_formula.mp4",
        "voice": os.path.join(MEDIA_DIR, "voice_reels_3.mp3"),
        "total_dur": 33.62,
        "scenes": [
            {
                "dur": 4.5,
                "broll": "measuring_spoons.jpg",
                "badge_text": "🥄 ХУК ВЫПУСКА №3",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("1 ЧАЙНАЯ ЛОЖКА ЗАМЕНИТЕЛЯ", (255, 255, 255), True),
                    ("ЭТО СКОЛЬКО САХАРА?", (250, 204, 21), True),
                    ("Универсального ответа нет!", (203, 213, 225), False)
                ],
                "sub": "Одна чайная ложка заменителя — это сколько сахара? Универсальной дозы нет!"
            },
            {
                "dur": 4.2,
                "broll": "spices_kitchen.jpg",
                "badge_text": "📦 ФОРМУЛА ПРОИЗВОДИТЕЛЯ",
                "badge_color": (59, 130, 246, 240),
                "title_lines": [
                    ("СМОТРИТЕ НА УПАКОВКУ!", (59, 130, 246), True),
                    ("• Концентрация зависит от бренда", (255, 255, 255), False),
                    ("• Пропорции меняются от 1:1 до 1:10", (250, 204, 21), False),
                    ("• Чистое вещество слаще в сотни раз", (203, 213, 225), False)
                ],
                "sub": "Всё зависит от формулы конкретного производителя."
            },
            {
                "dur": 5.0,
                "broll": "green_herbs.jpg",
                "badge_text": "🌿 ЧИСТАЯ СТЕВИЯ",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("ЧИСТЫЙ ЭКСТРАКТ СТЕВИИ", (16, 185, 129), True),
                    ("• В 250-300 раз слаще сахара!", (250, 204, 21), False),
                    ("• Дозируется кончиком ножа или каплями", (255, 255, 255), False),
                    ("• Чайная ложка сделает блюдо горьким", (239, 68, 68), False)
                ],
                "sub": "Чистая стевия слаще сахара в 300 раз: её добавляют микродозами."
            },
            {
                "dur": 5.0,
                "broll": "sugar_spoon.jpg",
                "badge_text": "⚖️ ПРОПОРЦИИ СМЕСЕЙ",
                "badge_color": (168, 85, 247, 240),
                "title_lines": [
                    ("СМЕСИ 1:1 И 1:5", (168, 85, 247), True),
                    ("• 1:1 = совпадает по объёму с сахаром", (255, 255, 255), False),
                    ("• 1:2 = в два раза слаще сахара", (226, 232, 240), False),
                    ("• 1:5 = в пять раз слаще (концентрат)", (250, 204, 21), False)
                ],
                "sub": "В смесях пропорция бывает один к одному или один к пяти."
            },
            {
                "dur": 5.5,
                "broll": "cheesecake.jpg",
                "badge_text": "📊 ПРИМЕР: 100 Г САХАРА",
                "badge_color": (234, 88, 12, 240),
                "title_lines": [
                    ("ЗАМЕНЯЕМ 100 Г САХАРА", (250, 204, 21), True),
                    ("Вариант 1 (Смесь 1:1):", (255, 255, 255), False),
                    ("➡️ Берём ровно 100 г смеси", (16, 185, 129), True),
                    ("Идеально для привычной выпечки", (203, 213, 225), False)
                ],
                "sub": "Например: 100 г сахара заменяют 100 г смеси один к одному,"
            },
            {
                "dur": 4.5,
                "broll": "baking_flour.jpg",
                "badge_text": "🔥 КОНЦЕНТРАТ 1 К 5",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("ЗАМЕНЯЕМ 100 Г САХАРА", (250, 204, 21), True),
                    ("Вариант 2 (Смесь 1:5):", (255, 255, 255), False),
                    ("➡️ Берём ВСЕГО 20 ГРАММОВ!", (239, 68, 68), True),
                    ("Экономия места и объёма", (203, 213, 225), False)
                ],
                "sub": "либо всего 20 граммами смеси один к пяти!"
            },
            {
                "dur": 4.92,
                "broll": "wellness_lifestyle.jpg",
                "badge_text": "⚠️ ПРАВИЛО БЕЗОПАСНОСТИ",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("ЧИТАЙТЕ МАРКИРОВКУ!", (16, 185, 129), True),
                    ("Не путайте сладость смеси", (255, 255, 255), False),
                    ("с суточной безопасной нормой (ДСП)!", (250, 204, 21), False)
                ],
                "sub": "Всегда смотрите маркировку и не путайте сладость с суточной нормой."
            }
        ]
    },
    {
        "id": 4,
        "filename": "reels_4_who_needs_sweeteners.mp4",
        "voice": os.path.join(MEDIA_DIR, "voice_reels_4.mp3"),
        "total_dur": 31.54,
        "scenes": [
            {
                "dur": 4.5,
                "broll": "wellness_lifestyle.jpg",
                "badge_text": "🎯 КОМУ ЭТО ПОЛЕЗНО?",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("КОМУ САХАРОЗАМЕНИТЕЛИ", (255, 255, 255), True),
                    ("РЕАЛЬНО ПОМОГУТ?", (250, 204, 21), True),
                    ("Разбор медицинских показаний", (203, 213, 225), False)
                ],
                "sub": "Кому сахарозаменители действительно могут быть полезны?"
            },
            {
                "dur": 5.5,
                "broll": "coffee_1.jpg",
                "badge_text": "📉 СНИЖЕНИЕ САХАРА",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("1. СОКРАЩЕНИЕ САХАРА", (16, 185, 129), True),
                    ("• Снижение общей гликемической нагрузки", (255, 255, 255), False),
                    ("• Меньше перепадов энергии в течение дня", (226, 232, 240), False),
                    ("• Защита сосудов и кожи от гликации", (250, 204, 21), False)
                ],
                "sub": "Во-первых, тем, кто осознанно сокращает добавленный сахар и углеводы."
            },
            {
                "dur": 6.5,
                "broll": "nutrition_plate.jpg",
                "badge_text": "🩺 ДИАБЕТ И ИНСУЛИН",
                "badge_color": (59, 130, 246, 240),
                "title_lines": [
                    ("2. ИНСУЛИНОРЕЗИСТЕНТНОСТЬ И СД", (59, 130, 246), True),
                    ("• Позволяет контролировать гликемию", (255, 255, 255), False),
                    ("• Без опасных постпрандиальных пиков", (226, 232, 240), False),
                    ("• Строго по согласованию с врачом!", (239, 68, 68), False)
                ],
                "sub": "Во-вторых, людям с диабетом — по согласованию с лечащим врачом."
            },
            {
                "dur": 5.5,
                "broll": "cheesecake.jpg",
                "badge_text": "🥑 КЕТО И LCHF РАЦИОН",
                "badge_color": (168, 85, 247, 240),
                "title_lines": [
                    ("3. КЕТО И НИЗКОУГЛЕВОДКА", (168, 85, 247), True),
                    ("• Позволяет готовить десерты без углеводов", (255, 255, 255), False),
                    ("• Не выбивает организм из кетоза", (250, 204, 21), False),
                    ("• Поддерживает комфортную адаптацию", (203, 213, 225), False)
                ],
                "sub": "И, конечно, тем, кто придерживается кето или низкоуглеводного рациона."
            },
            {
                "dur": 4.5,
                "broll": "spices_kitchen.jpg",
                "badge_text": "⚠️ ВАЖНЫЙ НЮАНС",
                "badge_color": (234, 88, 12, 240),
                "title_lines": [
                    ("ПОДХОДЯТ ДАЛЕКО НЕ ВСЕМ!", (234, 88, 12), True),
                    ("• У каждого своя чувствительность", (255, 255, 255), False),
                    ("• Возможны индивидуальные реакции", (226, 232, 240), False),
                    ("• Не делайте заменители основой меню", (250, 204, 21), False)
                ],
                "sub": "Но важный нюанс: сахарозаменители подходят далеко не всем."
            },
            {
                "dur": 5.04,
                "broll": "green_herbs.jpg",
                "badge_text": "💡 ПРАВИЛО ВЫБОРА",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("СЛУШАЙТЕ СВОЙ ОРГАНИЗМ!", (16, 185, 129), True),
                    ("Обращайте внимание на ЖКТ", (255, 255, 255), False),
                    ("и проверяйте полный состав продукта!", (250, 204, 21), False)
                ],
                "sub": "Обращайте внимание на ЖКТ и полный состав продукта!"
            }
        ]
    },
    {
        "id": 5,
        "filename": "reels_5_five_mistakes.mp4",
        "voice": os.path.join(MEDIA_DIR, "voice_reels_5.mp3"),
        "total_dur": 33.94,
        "scenes": [
            {
                "dur": 4.0,
                "broll": "sugar_cubes.jpg",
                "badge_text": "⚠️ ТОП-5 ОШИБОК",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("КУПИЛИ ПОДСЛАСТИТЕЛЬ?", (255, 255, 255), True),
                    ("ПРОВЕРЬТЕ ЭТИ 5 МОМЕНТОВ!", (250, 204, 21), True),
                    ("Ловушки производителей и маркетологов", (203, 213, 225), False)
                ],
                "sub": "Купили сахарозаменитель? Проверьте эти пять моментов!"
            },
            {
                "dur": 5.5,
                "broll": "measuring_spoons.jpg",
                "badge_text": "❌ ОШИБКА №1",
                "badge_color": (239, 68, 68, 240),
                "title_lines": [
                    ("1. НЕ ЧИТАТЬ ПОЛНЫЙ СОСТАВ", (239, 68, 68), True),
                    ("• Скрытые мальтодекстрин и декстроза", (255, 255, 255), False),
                    ("• Их гликемический индекс выше сахара!", (250, 204, 21), False),
                    ("• Вызывают мощный скачок инсулина", (226, 232, 240), False)
                ],
                "sub": "1. Не читать состав: там могут скрываться мальтодекстрин и декстроза."
            },
            {
                "dur": 5.0,
                "broll": "sugar_spoon.jpg",
                "badge_text": "❌ ОШИБКА №2",
                "badge_color": (234, 88, 12, 240),
                "title_lines": [
                    ("2. ПУТАТЬ ВЕЩЕСТВО И СМЕСЬ", (234, 88, 12), True),
                    ("• На упаковке крупно: СТЕВИЯ", (255, 255, 255), False),
                    ("• А в составе: 99% наполнителя", (250, 204, 21), False),
                    ("• Всегда смотрите процентное соотношение", (203, 213, 225), False)
                ],
                "sub": "2. Путать чистое вещество и смесь со скрытыми наполнителями."
            },
            {
                "dur": 4.5,
                "broll": "dessert_berries.jpg",
                "badge_text": "❌ ОШИБКА №3",
                "badge_color": (168, 85, 247, 240),
                "title_lines": [
                    ("3. СЫПАТЬ БЕЗ ОГРАНИЧЕНИЙ", (168, 85, 247), True),
                    ("• Безопасность не означает безлимит", (255, 255, 255), False),
                    ("• Существуют допустимые суточные дозы", (250, 204, 21), False),
                    ("• Мера и умеренность нужны во всём", (226, 232, 240), False)
                ],
                "sub": "3. Сыпать без ограничений: мера нужна абсолютно во всём."
            },
            {
                "dur": 5.5,
                "broll": "mint_leaves.jpg",
                "badge_text": "❌ ОШИБКА №4",
                "badge_color": (236, 72, 153, 240),
                "title_lines": [
                    ("4. ИГНОРИРОВАТЬ РЕАКЦИЮ ЖКТ", (236, 72, 153), True),
                    ("• Сахарные спирты (сорбит, мальтит, ксилит)", (255, 255, 255), False),
                    ("• При переборе вызывают вздутие и слабят", (250, 204, 21), False),
                    ("• Вводите постепенно малыми порциями", (226, 232, 240), False)
                ],
                "sub": "4. Игнорировать реакцию кишечника на сахарные спирты (полиолы)."
            },
            {
                "dur": 5.0,
                "broll": "cheesecake.jpg",
                "badge_text": "❌ ОШИБКА №5",
                "badge_color": (59, 130, 246, 240),
                "title_lines": [
                    ("5. «БЕЗ САХАРА» НЕ РАВНО ДИЕТА", (59, 130, 246), True),
                    ("• В десерте может быть куча муки и жира", (255, 255, 255), False),
                    ("• Калорийность может превышать 500 ккал!", (239, 68, 68), False),
                    ("• Проверяйте общее КБЖУ порции", (250, 204, 21), False)
                ],
                "sub": "5. Думать, что продукт без сахара автоматически низкокалорийный."
            },
            {
                "dur": 4.44,
                "broll": "wellness_lifestyle.jpg",
                "badge_text": "💡 ГЛАВНОЕ ПРАВИЛО",
                "badge_color": (16, 185, 129, 240),
                "title_lines": [
                    ("СМОТРИТЕ НА СОСТАВ!", (16, 185, 129), True),
                    ("Не верьте только надписи на этикетке.", (255, 255, 255), False),
                    ("Будьте осознанными и здоровыми!", (250, 204, 21), False)
                ],
                "sub": "Смотрите не только на надпись без сахара, но и на состав!"
            }
        ]
    }
]

def render_reel(reel):
    r_id = reel["id"]
    fname = reel["filename"]
    voice_p = reel["voice"]
    out_mp4 = os.path.join(OUTPUT_DIR, fname)
    total_dur = reel["total_dur"]
    scenes = reel["scenes"]

    print(f"\n======================================================")
    print(f"🎬 RENDERING REELS #{r_id}: {fname} (target dur: {total_dur:.2f}s)")
    print(f"======================================================")

    # Step 1: Render all scene card images
    concat_lines = []
    total_scenes = len(scenes)
    
    for idx, sc in enumerate(scenes):
        card_fname = f"card_r{r_id}_s{idx+1}.jpg"
        card_path = os.path.join(CARDS_CACHE_DIR, card_fname)
        
        prog = (idx + 1) / total_scenes
        img = create_scene_frame(
            broll_name=sc["broll"],
            badge_text=sc["badge_text"],
            badge_color=sc["badge_color"],
            title_lines=sc["title_lines"],
            subtitle_text="",
            sub_spoken=sc["sub"],
            progress_ratio=prog
        )
        img.save(card_path, quality=95)
        
        # Add to concat lines (use forward slashes)
        c_path_escaped = card_path.replace('\\', '/')
        concat_lines.append(f"file '{c_path_escaped}'\n")
        concat_lines.append(f"duration {sc['dur']:.2f}\n")

    # Last file entry required by concat demuxer
    last_c_path = os.path.join(CARDS_CACHE_DIR, f"card_r{r_id}_s{total_scenes}.jpg").replace('\\', '/')
    concat_lines.append(f"file '{last_c_path}'\n")

    concat_txt_path = os.path.join(CARDS_CACHE_DIR, f"concat_r{r_id}.txt")
    with open(concat_txt_path, 'w', encoding='utf-8') as f:
        f.writelines(concat_lines)

    # Step 2: Mix Voice + Background Music
    mixed_audio_p = os.path.join(CARDS_CACHE_DIR, f"mixed_audio_r{r_id}.aac")
    mix_cmd = [
        'ffmpeg', '-y',
        '-i', voice_p,
        '-i', MUSIC_PATH,
        '-filter_complex', '[0:a]volume=1.25[v0];[1:a]volume=0.18[v1];[v0][v1]amix=inputs=2:duration=first:dropout_transition=2[aout]',
        '-map', '[aout]',
        '-c:a', 'aac',
        '-b:a', '192k',
        mixed_audio_p
    ]
    subprocess.run(mix_cmd, check=True, capture_output=True)

    # Step 3: Fast and crisp video encode
    t0 = time.time()
    render_cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0', '-i', concat_txt_path,
        '-i', mixed_audio_p,
        '-vf', 'fps=30,format=yuv420p',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'copy',
        '-shortest',
        out_mp4
    ]
    res = subprocess.run(render_cmd, capture_output=True, text=True)
    t1 = time.time()
    
    if res.returncode != 0:
        print(f"❌ FFmpeg Error for Reels {r_id}:", res.stderr[:400])
        return False
    
    # Step 4: Verify with ffprobe
    probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', out_mp4]
    pr = subprocess.run(probe_cmd, capture_output=True, text=True)
    pdata = json.loads(pr.stdout)
    dur = float(pdata.get('format', {}).get('duration', 0))
    size_mb = int(pdata.get('format', {}).get('size', 0)) / (1024 * 1024)
    streams = pdata.get('streams', [])
    vstream = [s for s in streams if s.get('width')][0] if any(s.get('width') for s in streams) else {'width': 1080, 'height': 1920}
    
    print(f"✅ Reels #{r_id} READY: {fname}")
    print(f"   Path: {out_mp4}")
    print(f"   Resolution: {vstream['width']}x{vstream['height']} (9:16 vertical)")
    print(f"   Duration: {dur:.2f}s (target: 20-35s)")
    print(f"   File size: {size_mb:.2f} MB")
    print(f"   Encoding time: {t1-t0:.2f}s")
    return True

def main():
    start_total = time.time()
    successes = 0
    for reel in REELS_DATA:
        if render_reel(reel):
            successes += 1
    elapsed = time.time() - start_total
    print(f"\n🎉 ALL REELS FINISHED! {successes}/{len(REELS_DATA)} successful in {elapsed:.1f}s")

if __name__ == '__main__':
    main()
