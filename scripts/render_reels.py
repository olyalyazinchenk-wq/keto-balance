import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
import subprocess

# 1. Configuration for 9:16 vertical video
WIDTH = 1080
HEIGHT = 1920
FPS = 25
DURATION = 34.6
TOTAL_FRAMES = int(FPS * DURATION)

OUTPUT_RAW = 'media/raw_video.mp4'
FINAL_VIDEO = 'media/keto_syrniki_reels.mp4'
AUDIO_VOICE = 'C:/Users/HP/AppData/Local/hermes/cache/audio/tts_20261027_023801_513882.mp3'
AUDIO_BG = 'media/bg_music.wav'

# Load fonts
FONT_PATH_BOLD = 'C:/Windows/Fonts/arialbd.ttf'
FONT_PATH_REG = 'C:/Windows/Fonts/arial.ttf'

try:
    font_hero = ImageFont.truetype(FONT_PATH_BOLD, 76)
    font_sub = ImageFont.truetype(FONT_PATH_BOLD, 54)
    font_badge = ImageFont.truetype(FONT_PATH_BOLD, 46)
    font_caption = ImageFont.truetype(FONT_PATH_BOLD, 50)
    font_small = ImageFont.truetype(FONT_PATH_REG, 38)
except Exception as e:
    print(f'Font load fallback: {e}')
    font_hero = font_sub = font_badge = font_caption = font_small = ImageFont.load_default()

# Scene definitions (timings in seconds)
SCENES = [
    {
        'id': 1,
        'start': 0.0,
        'end': 5.5,
        'img_path': 'media/assets/scene1_hook.jpg',
        'hero_title': 'СЫРНИКИ НА КЕТО',
        'badge': '🔥 БЕЗ МУКИ И САХАРА',
        'badge_color': (220, 38, 38), # Red
        'caption': 'Тают во рту, а талия тает сама!'
    },
    {
        'id': 2,
        'start': 5.5,
        'end': 16.0,
        'img_path': 'media/assets/scene2_ing.jpg',
        'hero_title': 'ИДЕАЛЬНЫЙ СОСТАВ',
        'badge': '🥑 100% КЕТО ИНГРЕДИЕНТЫ',
        'badge_color': (16, 185, 129), # Emerald
        'caption': '400г творога + 2 яйца + 3 ст.л. кокосовой муки'
    },
    {
        'id': 3,
        'start': 16.0,
        'end': 24.5,
        'img_path': 'media/assets/scene3_bake.jpg',
        'hero_title': 'ВЫПЕКАНИЕ 180°C',
        'badge': '⏱ 25 МИНУТ В ДУХОВКЕ',
        'badge_color': (245, 158, 11), # Amber
        'caption': 'Аппетитная нежная корочка и чистый аромат'
    },
    {
        'id': 4,
        'start': 24.5,
        'end': 34.6,
        'img_path': 'media/assets/scene4_money.jpg',
        'hero_title': 'ГОТОВО К ПОДАЧЕ',
        'badge': '⚡ 22г БЕЛКА • ВСЕГО 5г УГЛЕВОДОВ',
        'badge_color': (59, 130, 246), # Royal Blue
        'caption': 'Забирай готовый план в боте Кето Баланс!'
    }
]

# Preload and resize images to fill 1080x1920 (crop cover)
def load_and_cover(path, target_w=WIDTH, target_h=HEIGHT):
    img = Image.open(path).convert('RGB')
    iw, ih = img.size
    target_ratio = target_w / target_h
    img_ratio = iw / ih
    
    if img_ratio > target_ratio:
        # Image is wider: fit height
        new_h = int(target_h * 1.15) # 15% extra for zoom effect
        new_w = int(new_h * img_ratio)
    else:
        # Image is taller: fit width
        new_w = int(target_w * 1.15)
        new_h = int(new_w / img_ratio)
    
    img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    return img_resized

preloaded_imgs = {s['id']: load_and_cover(s['img_path']) for s in SCENES}

# Video writer setup
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter(OUTPUT_RAW, fourcc, FPS, (WIDTH, HEIGHT))

print(f'Starting rendering of {TOTAL_FRAMES} frames...')

for f in range(TOTAL_FRAMES):
    t = f / FPS
    
    # Determine current scene
    curr_scene = SCENES[-1]
    for sc in SCENES:
        if sc['start'] <= t < sc['end']:
            curr_scene = sc
            break
            
    scene_dur = curr_scene['end'] - curr_scene['start']
    scene_progress = (t - curr_scene['start']) / scene_dur
    
    # 1. Subtle smooth zoom / Ken Burns effect (1.00 -> 1.10)
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
    
    frame_crop = base_img.crop((left, top, right, bottom)).resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)
    
    # 2. Draw cinematic overlays on top (Vignette & Gradient)
    draw = ImageDraw.Draw(frame_crop, 'RGBA')
    
    # Top dark gradient for branding bar
    draw.rectangle([0, 0, WIDTH, 280], fill=(0, 0, 0, 160))
    
    # Bottom dark gradient for subtitles and CTA
    draw.rectangle([0, HEIGHT - 620, WIDTH, HEIGHT], fill=(0, 0, 0, 190))
    
    # Brand header
    brand_text = 'КЕТО БАЛАНС | РЕЦЕПТЫ'
    bbox_brand = draw.textbbox((0, 0), brand_text, font=font_small)
    draw.text(((WIDTH - (bbox_brand[2] - bbox_brand[0])) // 2, 70), brand_text, font=font_small, fill=(240, 240, 240, 240))
    
    # Category pill
    cat_text = '🌿 КАРНИВОР / КЕТО ЗАВТРАК'
    bbox_cat = draw.textbbox((0, 0), cat_text, font=font_small)
    cat_w = bbox_cat[2] - bbox_cat[0]
    pill_x1 = (WIDTH - cat_w) // 2 - 25
    pill_y1 = 135
    pill_x2 = pill_x1 + cat_w + 50
    pill_y2 = pill_y1 + 55
    draw.rounded_rectangle([pill_x1, pill_y1, pill_x2, pill_y2], radius=24, fill=(34, 197, 94, 210))
    draw.text(((WIDTH - cat_w) // 2, pill_y1 + 8), cat_text, font=font_small, fill=(255, 255, 255, 255))
    
    # Animated hero badge (floating pulse effect)
    badge_scale = 1.0 + 0.03 * np.sin(t * 5.0)
    badge_text = curr_scene['badge']
    bbox_b = draw.textbbox((0, 0), badge_text, font=font_badge)
    bw_val = bbox_b[2] - bbox_b[0]
    bh_val = bbox_b[3] - bbox_b[1]
    
    bx1 = (WIDTH - bw_val) // 2 - 35
    by1 = HEIGHT - 540
    bx2 = bx1 + bw_val + 70
    by2 = by1 + bh_val + 30
    
    r, g, b = curr_scene['badge_color']
    draw.rounded_rectangle([bx1, by1, bx2, by2], radius=22, fill=(r, g, b, 235))
    draw.text(((WIDTH - bw_val) // 2, by1 + 12), badge_text, font=font_badge, fill=(255, 255, 255, 255))
    
    # Title text with shadow
    title_text = curr_scene['hero_title']
    bbox_title = draw.textbbox((0, 0), title_text, font=font_hero)
    tw = bbox_title[2] - bbox_title[0]
    tx = (WIDTH - tw) // 2
    ty = HEIGHT - 430
    # Shadow
    draw.text((tx + 3, ty + 3), title_text, font=font_hero, fill=(0, 0, 0, 255))
    draw.text((tx, ty), title_text, font=font_hero, fill=(255, 255, 255, 255))
    
    # Subtitle / spoken phrase caption (High contrast yellow/white)
    caption_text = curr_scene['caption']
    bbox_cap = draw.textbbox((0, 0), caption_text, font=font_caption)
    cw = bbox_cap[2] - bbox_cap[0]
    cx = (WIDTH - cw) // 2
    cy = HEIGHT - 310
    
    # Background box for caption for maximum readability
    draw.rounded_rectangle([cx - 25, cy - 8, cx + cw + 25, cy + (bbox_cap[3] - bbox_cap[1]) + 16], radius=16, fill=(15, 23, 42, 210))
    draw.text((cx, cy), caption_text, font=font_caption, fill=(250, 204, 21, 255)) # Yellow neon
    
    # Lower bar: Progress line and Telegram CTA
    progress_w = int(WIDTH * (t / DURATION))
    draw.rectangle([0, HEIGHT - 18, WIDTH, HEIGHT], fill=(50, 50, 50, 180))
    draw.rectangle([0, HEIGHT - 18, progress_w, HEIGHT], fill=(34, 197, 94, 255))
    
    # CTA bottom banner
    cta_text = '📲 Телеграм-бот: @keto_balance_userbot | Меню и расчет'
    bbox_cta = draw.textbbox((0, 0), cta_text, font=font_small)
    draw.text(((WIDTH - (bbox_cta[2] - bbox_cta[0])) // 2, HEIGHT - 110), cta_text, font=font_small, fill=(203, 213, 225, 240))
    
    # Convert PIL Image back to OpenCV BGR frame
    frame_np = np.array(frame_crop)
    frame_bgr = cv2.cvtColor(frame_np, cv2.COLOR_RGB2BGR)
    out.write(frame_bgr)
    
    if f % 150 == 0:
        print(f'Rendered frame {f}/{TOTAL_FRAMES} ({t:.1f}s / {DURATION:.1f}s)')

out.release()
print('Raw video rendering finished!')

# 3. Mux video with voiceover and background music via FFmpeg
# Ducking: Voice at 0dB, background music lowered to -18dB, mixed together
ffmpeg_cmd = [
    'ffmpeg', '-y',
    '-i', OUTPUT_RAW,
    '-i', AUDIO_VOICE,
    '-i', AUDIO_BG,
    '-filter_complex',
    '[1:a]volume=1.2[v_voice];[2:a]volume=0.25[v_bg];[v_voice][v_bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    FINAL_VIDEO
]

print('Running FFmpeg muxing...')
res = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
if res.returncode == 0:
    print('Final video created successfully at:', os.path.abspath(FINAL_VIDEO))
else:
    print('FFmpeg error:', res.stderr)
