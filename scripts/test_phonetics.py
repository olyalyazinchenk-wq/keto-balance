import asyncio
import edge_tts
from faster_whisper import WhisperModel

# Words that have stress ambiguity in Russian:
# 1. мука (мукИ vs мУки): 'без грамма муки'
# 2. белок (белкА vs бЕлка): '22 грамма белка'
# 3. творог (твОрога vs творогА): '400 грамм творога'
# 4. яйца (два яйцА vs Яйца): 'два яйца'
# 5. эритрит (эритрИт): 'эритрит'
# 6. градусов: 'при ста восьмидесяти градусах'
# 7. углеводов (углевОдов): 'всего пять грамм углеводов'

async def synthesize_variants():
    variants = {
        'muka_plain': 'Берём без грамма муки.',
        'muka_accent': 'Берём без грамма мук\u0301и.',
        'muka_cap': 'Берём без грамма мукИ.',
        'muka_alt': 'Берём без грамма муки-мукИ.',
        'belka_plain': 'В порции двадцать два грамма белка.',
        'belka_accent': 'В порции двадцать два грамма белк\u0301а.',
        'belka_cap': 'В порции двадцать два грамма белкА.',
        'tvorog_plain': 'Четыреста грамм творога.',
        'tvorog_accent1': 'Четыреста грамм тв\u0301орога.',
        'tvorog_accent2': 'Четыреста грамм творог\u0301а.',
        'eggs_plain': 'Добавляем два яйца.',
        'eggs_accent': 'Добавляем два яйц\u0301а.',
    }
    for k, text in variants.items():
        comm = edge_tts.Communicate(text, 'ru-RU-SvetlanaNeural')
        await comm.save(f'media/test_var_{k}.mp3')
    print('Synthesized all test variants.')

asyncio.run(synthesize_variants())
