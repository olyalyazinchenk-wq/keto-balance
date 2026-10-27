import os
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1080
HEIGHT = 1920
FPS = 25
DURATION = 34.6
TOTAL_FRAMES = int(FPS * DURATION)

FINAL_VIDEO = 'C:/Users/HP/Keto-balance/media/keto_syrniki_reels.mp4'
AUDIO_VOICE = 'C:/Users/HP/AppData/Local/hermes/cache/audio/tts_20261027_023801_513882.mp3'
AUDIO_BG = 'C:/Users/HP/Keto-balance/media/bg_music.wav'

FONT_PATH_BOLD = 'C:/Windows/Fonts/arialbd.ttf'
FONT_PATH_REG = 'C:/Windows/Fonts/arial.ttf'

try:
    font_hero = ImageFont.truetype(FONT_PATH_BOLD, 74)
    font_sub = ImageFont.truetype(FONT_PATH_BOLD, 54)
    font_badge = ImageFont.truetype(FONT_PATH_BOLD, 44)
    font_caption = ImageFont.truetype(FONT_PATH_BOLD, 46)
    font_small = ImageFont.truetype(FONT_PATH_REG, 36)
except Exception as e:
    print(f'Font fallback: {e}')
    font_hero = font_sub = font_badge = font_caption = font_small = ImageFont.load_default()

SCENES = [
    {
        'id': 1,
        'start': 0.0,
        'end': 5.5,
        'img_path': 'C:/Users/HP/Keto-balance/media/assets/scene1_hook.jpg',
        'hero_title': 'СЫРНИКИ НА КЕТО',
        'badge': '🔥 БЕЗ МУКИ И САХАРА',
        'badge_color': (220, 38, 38),
        'caption': 'Тают во рту, а талия тает сама!'
    },
    {
        'id': 2,
        'start': 5.5,
        'end': 16.0,
        'img_path': 'C:/Users/HP/Keto-balance/media/assets/scene2_ing.jpg',
        'hero_title': 'ИДЕАЛЬНЫЙ СОСТАВ',
        'badge': '🥑 100% КЕТО ИНГРЕДИЕНТЫ',
        'badge_color': (16, 185, 129),
        'caption': '400г творога + 2 яйца + 3 ст.л. муки'
    },
    {
        'id': 3,
        'start': 16.0,
        'end': 24.5,
        'img_path': 'C:/Users/HP/Keto-balance/media/assets/scene3_bake.jpg',
        'hero_title': 'ВЫПЕКАНИЕ 180°C',
        'badge': '⏱ 25 МИНУТ В ДУХОВКЕ',
        'badge_color': (245, 158, 11),
        'caption': 'Аппетитная нежная корочка и аромат'
    },
    {
        'id': 4,
        'start': 24.5,
        'end': 34.6,
        'img_path': 'C:/Users/HP/Keto-balance/media/assets/scene4_money.jpg',
        'hero_title': 'ГОТОВО К ПОДАЧЕ',
        'badge': '⚡ 22г БЕЛКА • 5г УГЛЕВОДОВ',
        'badge_color': (59, 130, 246),
        'caption': 'План питания в боте @keto_balance_userbot'
    }
]

def load_and_cover(path, target_w=WIDTH, target_h=HEIGHT):
    img = Image.open(path).convert('RGB')
    iw, ih = img.size
    target_ratio = target_w / target_h
    img_ratio = iw / ih
    if img_ratio > target_ratio:
        new_h = int(target_h * 1.15)
        new_w = int(new_h * img_ratio)
    else:
        new_w = int(target_w * 1.15)
        new_h = int(new_w / img_ratio)
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)

preloaded_imgs = {s['id']: load_and_cover(s['img_path']) for s in SCENES}

ffmpeg_cmd = [
    'ffmpeg', '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', f'{WIDTH}x{HEIGHT}',
    '-pix_fmt', 'rgb24',
    '-r', str(FPS),
    '-i', '-',
    '-i', AUDIO_VOICE,
    '-i', AUDIO_BG,
    '-filter_complex',
    '[1:a]volume=1.2[v_voice];[2:a]volume=0.22[v_bg];[v_voice][v_bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    FINAL_VIDEO
]

print('Launching FFmpeg pipe...')
proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

print(f'Piping {TOTAL_FRAMES} frames...')

for f in range(TOTAL_FRAMES):
    t = f / FPS
    curr_scene = SCENES[-1]
    for sc in SCENES:
        if sc['start'] <= t < sc['end']:
            curr_scene = sc
            break
            
    scene_dur = curr_scene['end'] - curr_scene['start']
    scene_progress = (t - curr_scene['start']) / scene_dur
    
    base_img = preloaded_imgs[curr_scene['id']]
    bw, bh = base_img.size
    zoom = 1.0 + 0.08 * np.sin(np.pi * scene_progress * 0.5)
    
    crop_w = int(WIDTH / zoom)
    crop_h = int(HEIGHT / zoom)
    cx = bw // 2
    cy = bh // 2
    left = max(0, cx - crop_w // 2)
    top = max(0, cy - crop_h // 2)
    right = min(bw, left + crop_w)
    bottom = min(bh, top + crop_h)
    
    frame = base_img.crop((left, top, right, bottom)).resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)
    draw = ImageDraw.Draw(frame, 'RGBA')
    
    # Top header bar
    draw.rectangle([0, 0, WIDTH, 260], fill=(0, 0, 0, 160))
    brand_text = 'КЕТО БАЛАНС | ВИРУСНЫЕ РЕЦЕПТЫ'
    bbox_brand = draw.textbbox((0, 0), brand_text, font=font_small)
    draw.text(((WIDTH - (bbox_brand[2] - bbox_brand[0])) // 2, 60), brand_text, font=font_small, fill=(240, 240, 240, 240))
    
    # Category pill
    cat_text = '🌿 КАРНИВОР / КЕТО ЗАВТРАК'
    bbox_cat = draw.textbbox((0, 0), cat_text, font=font_small)
    cat_w = bbox_cat[2] - bbox_cat[0]
    pill_x1 = (WIDTH - cat_w) // 2 - 25
    pill_y1 = 125
    draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + cat_w + 50, pill_y1 + 55], radius=24, fill=(34, 197, 94, 220))
    draw.text(((WIDTH - cat_w) // 2, pill_y1 + 8), cat_text, font=font_small, fill=(255, 255, 255, 255))
    
    # Bottom gradient overlay
    draw.rectangle([0, HEIGHT - 600, WIDTH, HEIGHT], fill=(0, 0, 0, 190))
    
    # Hero Badge
    badge_text = curr_scene['badge']
    bbox_b = draw.textbbox((0, 0), badge_text, font=font_badge)
    bw_val = bbox_b[2] - bbox_b[0]
    bh_val = bbox_b[3] - bbox_b[1]
    bx1 = (WIDTH - bw_val) // 2 - 30
    by1 = HEIGHT - 520
    r, g, b = curr_scene['badge_color']
    draw.rounded_rectangle([bx1, by1, bx1 + bw_val + 60, by1 + bh_val + 25], radius=20, fill=(r, g, b, 240))
    draw.text(((WIDTH - bw_val) // 2, by1 + 10), badge_text, font=font_badge, fill=(255, 255, 255, 255))
    
    # Hero Title with shadow
    title_text = curr_scene['hero_title']
    bbox_title = draw.textbbox((0, 0), title_text, font=font_hero)
    tw = bbox_title[2] - bbox_title[0]
    tx = (WIDTH - tw) // 2
    ty = HEIGHT - 420
    draw.text((tx + 3, ty + 3), title_text, font=font_hero, fill=(0, 0, 0, 255))
    draw.text((tx, ty), title_text, font=font_hero, fill=(255, 255, 255, 255))
    
    # Kinetic Subtitle Caption
    caption_text = curr_scene['caption']
    bbox_cap = draw.textbbox((0, 0), caption_text, font=font_caption)
    cw = bbox_cap[2] - bbox_cap[0]
    cx = (WIDTH - cw) // 2
    cy = HEIGHT - 310
    draw.rounded_rectangle([cx - 25, cy - 8, cx + cw + 25, cy + (bbox_cap[3] - bbox_cap[1]) + 16], radius=16, fill=(15, 23, 42, 220))
    draw.text((cx, cy), caption_text, font=font_caption, fill=(250, 204, 21, 255))
    
    # Progress bar at bottom
    progress_w = int(WIDTH * (t / DURATION))
    draw.rectangle([0, HEIGHT - 18, WIDTH, HEIGHT], fill=(40, 40, 40, 200))
    draw.rectangle([0, HEIGHT - 18, progress_w, HEIGHT], fill=(34, 197, 94, 255))
    
    # CTA bottom label
    cta_text = '📲 Телеграм-бот: @keto_balance_userbot | Меню и расчет'
    bbox_cta = draw.textbbox((0, 0), cta_text, font=font_small)
    draw.text(((WIDTH - (bbox_cta[2] - bbox_cta[0])) // 2, HEIGHT - 110), cta_text, font=font_small, fill=(203, 213, 225, 240))
    
    # Write raw bytes directly to FFmpeg stdin
    proc.stdin.write(frame.tobytes())
    
    if f % 150 == 0:
        print(f'Piped frame {f}/{TOTAL_FRAMES} ({t:.1f}s)')

proc.stdin.close()
proc.wait()
print('Video rendering complete!')
