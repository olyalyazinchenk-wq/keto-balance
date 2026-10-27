import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1080
HEIGHT = 1920
FINAL_VIDEO = 'C:/Users/HP/Keto-balance/media/keto_syrniki_reels.mp4'
AUDIO_VOICE = 'C:/Users/HP/AppData/Local/hermes/cache/audio/tts_20261027_023801_513882.mp3'
AUDIO_BG = 'C:/Users/HP/Keto-balance/media/bg_music.wav'

FONT_PATH_BOLD = 'C:/Windows/Fonts/arialbd.ttf'
FONT_PATH_REG = 'C:/Windows/Fonts/arial.ttf'

try:
    font_hero = ImageFont.truetype(FONT_PATH_BOLD, 74)
    font_sub = ImageFont.truetype(FONT_PATH_BOLD, 54)
    font_badge = ImageFont.truetype(FONT_PATH_BOLD, 46)
    font_caption = ImageFont.truetype(FONT_PATH_BOLD, 48)
    font_small = ImageFont.truetype(FONT_PATH_REG, 38)
except Exception as e:
    print(f'Font fallback: {e}')
    font_hero = font_sub = font_badge = font_caption = font_small = ImageFont.load_default()

SCENES = [
    {
        'id': 1,
        'dur': 5.5,
        'img': 'C:/Users/HP/Keto-balance/media/assets/scene1_hook.jpg',
        'hero': 'СЫРНИКИ НА КЕТО',
        'badge': '🔥 БЕЗ МУКИ И САХАРА',
        'badge_color': (220, 38, 38),
        'caption': 'Тают во рту, а талия тает сама!'
    },
    {
        'id': 2,
        'dur': 10.5,
        'img': 'C:/Users/HP/Keto-balance/media/assets/scene2_ing.jpg',
        'hero': 'ИДЕАЛЬНЫЙ СОСТАВ',
        'badge': '🥑 100% КЕТО ИНГРЕДИЕНТЫ',
        'badge_color': (16, 185, 129),
        'caption': '400г творога + 2 яйца + 3 ст.л. муки'
    },
    {
        'id': 3,
        'dur': 8.5,
        'img': 'C:/Users/HP/Keto-balance/media/assets/scene3_bake.jpg',
        'hero': 'ВЫПЕКАНИЕ 180°C',
        'badge': '⏱ 25 МИНУТ В ДУХОВКЕ',
        'badge_color': (245, 158, 11),
        'caption': 'Аппетитная нежная корочка и аромат'
    },
    {
        'id': 4,
        'dur': 10.1,
        'img': 'C:/Users/HP/Keto-balance/media/assets/scene4_money.jpg',
        'hero': 'ГОТОВО К ПОДАЧЕ',
        'badge': '⚡ 22г БЕЛКА • 5г УГЛЕВОДОВ',
        'badge_color': (59, 130, 246),
        'caption': 'План питания в боте @keto_balance_userbot'
    }
]

os.makedirs('C:/Users/HP/Keto-balance/media/cards', exist_ok=True)

for s in SCENES:
    raw = Image.open(s['img']).convert('RGB')
    iw, ih = raw.size
    target_ratio = WIDTH / HEIGHT
    img_ratio = iw / ih
    if img_ratio > target_ratio:
        new_h = HEIGHT
        new_w = int(new_h * img_ratio)
    else:
        new_w = WIDTH
        new_h = int(new_w / img_ratio)
    resized = raw.resize((new_w, new_h), Image.Resampling.LANCZOS)
    cx, cy = new_w // 2, new_h // 2
    card = resized.crop((cx - WIDTH // 2, cy - HEIGHT // 2, cx + WIDTH // 2, cy + HEIGHT // 2))
    
    draw = ImageDraw.Draw(card, 'RGBA')
    # Top banner
    draw.rectangle([0, 0, WIDTH, 260], fill=(0, 0, 0, 160))
    brand_text = 'КЕТО БАЛАНС | ВИРУСНЫЕ РЕЦЕПТЫ'
    bbox_brand = draw.textbbox((0, 0), brand_text, font=font_small)
    draw.text(((WIDTH - (bbox_brand[2] - bbox_brand[0])) // 2, 60), brand_text, font=font_small, fill=(240, 240, 240, 240))
    
    cat_text = '🌿 КАРНИВОР / КЕТО ЗАВТРАК'
    bbox_cat = draw.textbbox((0, 0), cat_text, font=font_small)
    cat_w = bbox_cat[2] - bbox_cat[0]
    pill_x1 = (WIDTH - cat_w) // 2 - 25
    pill_y1 = 125
    draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + cat_w + 50, pill_y1 + 55], radius=24, fill=(34, 197, 94, 220))
    draw.text(((WIDTH - cat_w) // 2, pill_y1 + 8), cat_text, font=font_small, fill=(255, 255, 255, 255))
    
    # Bottom dark overlay
    draw.rectangle([0, HEIGHT - 600, WIDTH, HEIGHT], fill=(0, 0, 0, 190))
    
    # Badge
    badge_text = s['badge']
    bbox_b = draw.textbbox((0, 0), badge_text, font=font_badge)
    bw_val = bbox_b[2] - bbox_b[0]
    bh_val = bbox_b[3] - bbox_b[1]
    bx1 = (WIDTH - bw_val) // 2 - 30
    by1 = HEIGHT - 520
    r, g, b = s['badge_color']
    draw.rounded_rectangle([bx1, by1, bx1 + bw_val + 60, by1 + bh_val + 25], radius=20, fill=(r, g, b, 240))
    draw.text(((WIDTH - bw_val) // 2, by1 + 10), badge_text, font=font_badge, fill=(255, 255, 255, 255))
    
    # Title with shadow
    title_text = s['hero']
    bbox_title = draw.textbbox((0, 0), title_text, font=font_hero)
    tw = bbox_title[2] - bbox_title[0]
    tx = (WIDTH - tw) // 2
    ty = HEIGHT - 420
    draw.text((tx + 3, ty + 3), title_text, font=font_hero, fill=(0, 0, 0, 255))
    draw.text((tx, ty), title_text, font=font_hero, fill=(255, 255, 255, 255))
    
    # Kinetic Subtitle Caption
    caption_text = s['caption']
    bbox_cap = draw.textbbox((0, 0), caption_text, font=font_caption)
    cw = bbox_cap[2] - bbox_cap[0]
    cx = (WIDTH - cw) // 2
    cy = HEIGHT - 310
    draw.rounded_rectangle([cx - 25, cy - 8, cx + cw + 25, cy + (bbox_cap[3] - bbox_cap[1]) + 16], radius=16, fill=(15, 23, 42, 220))
    draw.text((cx, cy), caption_text, font=font_caption, fill=(250, 204, 21, 255))
    
    # CTA bottom label
    cta_text = '📲 Телеграм-бот: @keto_balance_userbot | Меню и расчет'
    bbox_cta = draw.textbbox((0, 0), cta_text, font=font_small)
    draw.text(((WIDTH - (bbox_cta[2] - bbox_cta[0])) // 2, HEIGHT - 110), cta_text, font=font_small, fill=(203, 213, 225, 240))
    
    card_path = f"C:/Users/HP/Keto-balance/media/cards/card_{s['id']}.jpg"
    card.save(card_path, 'JPEG', quality=95)
    print('Saved:', card_path)

print('All 4 cards rendered.')
