import os
import sys
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 1080
HEIGHT = 1920
FPS = 30
TOTAL_FRAMES = 1039  # 34.63s * 30
FONT_PATH = 'C:/Windows/Fonts/arialbd.ttf'
FONT_REG_PATH = 'C:/Windows/Fonts/arial.ttf'

def load_font(size, bold=True):
    try:
        return ImageFont.truetype(FONT_PATH if bold else FONT_REG_PATH, size)
    except Exception:
        return ImageFont.load_default()

font_xl = load_font(68, True)
font_large = load_font(52, True)
font_med = load_font(40, True)
font_regular = load_font(34, False)
font_small = load_font(28, True)
font_pill = load_font(26, True)

# Load scenes
raw_scenes = [
    Image.open('media/assets/scene1_hook.jpg').convert('RGB'),
    Image.open('media/assets/scene2_ing.jpg').convert('RGB'),
    Image.open('media/assets/scene3_bake.jpg').convert('RGB'),
    Image.open('media/assets/scene4_money.jpg').convert('RGB'),
    Image.open('media/assets/scene1_hook.jpg').convert('RGB'),
]

def draw_rounded_rect(draw, bbox, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

def get_cropped_scene(img, frame_in_scene, scene_total_frames, zoom_range=(1.0, 1.08)):
    progress = frame_in_scene / max(scene_total_frames, 1)
    zoom = zoom_range[0] + (zoom_range[1] - zoom_range[0]) * progress
    
    # Crop to 9:16 target aspect ratio
    w, h = img.size
    target_ratio = WIDTH / HEIGHT
    img_ratio = w / h
    
    if img_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        crop_box = (left, 0, left + new_w, h)
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        crop_box = (0, top, w, top + new_h)
        
    cropped = img.crop(crop_box)
    
    # Apply zoom
    cw, ch = cropped.size
    zw, zh = int(cw / zoom), int(ch / zoom)
    zx = (cw - zw) // 2
    zy = (ch - zh) // 2
    zoomed = cropped.crop((zx, zy, zx + zw, zy + zh))
    return zoomed.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)

# Pre-generate top & bottom cinematic gradient mask ONCE
gradient = Image.new('L', (1, HEIGHT))
g_data = []
for y in range(HEIGHT):
    if y < 350:
        alpha = int(180 * (1 - y / 350))
    elif y > 1150:
        alpha = int(220 * ((y - 1150) / (HEIGHT - 1150)))
    else:
        alpha = 30
    g_data.append(alpha)
gradient.putdata(g_data)
grad_overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
grad_overlay.putalpha(gradient.resize((WIDTH, HEIGHT)))

def render_frame(frame_num):
    
    # 1. Top Badges (Constant)
    # Top progress bar
    progress_x = int(WIDTH * (frame_num / TOTAL_FRAMES))
    draw.rectangle([0, 0, progress_x, 10], fill=(255, 180, 0, 255))
    
    # Brand pill
    draw_rounded_rect(draw, [50, 45, 340, 105], radius=25, fill=(0, 0, 0, 180), outline=(255, 255, 255, 60), width=2)
    draw.text((75, 58), '🥑 КЕТО БАЛАНС', font=font_pill, fill=(255, 255, 255, 240))
    
    # Category pill
    draw_rounded_rect(draw, [WIDTH - 320, 45, WIDTH - 50, 105], radius=25, fill=(220, 53, 69, 210), outline=(255, 255, 255, 60), width=2)
    draw.text((WIDTH - 295, 58), '🔥 ХИТ РЕЦЕПТ', font=font_pill, fill=(255, 255, 255, 255))
    
    # Dynamic content per scene
    if scene_idx == 0:
        # THE HOOK
        # Pulsing scale effect
        pulse = 1.0 + 0.02 * np.sin(f_rel * 0.3)
        
        # Glass card
        card_y = 1240
        draw_rounded_rect(draw, [60, card_y, WIDTH - 60, card_y + 440], radius=35, fill=(15, 20, 25, 220), outline=(255, 200, 50, 160), width=3)
        
        # Yellow Hook text
        draw.text((100, card_y + 40), 'СЫРНИКИ БЕЗ МУКИ', font=font_xl, fill=(255, 225, 0, 255))
        draw.text((100, card_y + 125), 'И БЕЗ САХАРА!', font=font_xl, fill=(255, 255, 255, 255))
        
        # Accent badge
        draw_rounded_rect(draw, [100, card_y + 230, WIDTH - 100, card_y + 310], radius=20, fill=(30, 40, 50, 230), outline=(255, 255, 255, 40))
        draw.text((130, card_y + 248), '✨ Тают во рту • Минус на весах', font=font_med, fill=(100, 255, 180, 255))
        
        draw.text((100, card_y + 340), '⏱ Готовим за 25 минут в духовке', font=font_regular, fill=(200, 215, 230, 240))
        
    elif scene_idx == 1:
        # INGREDIENTS
        card_y = 1100
        draw_rounded_rect(draw, [60, card_y, WIDTH - 60, card_y + 600], radius=35, fill=(15, 20, 25, 230), outline=(80, 180, 255, 140), width=3)
        
        draw.text((100, card_y + 35), '📋 ИНГРЕДИЕНТЫ (3 МИНУТЫ):', font=font_large, fill=(255, 210, 50, 255))
        
        items = [
            ('🥞 Творог 5%', '400 г'),
            ('🥚 Яйца отборные', '2 шт'),
            ('🥥 Кокосовая мука', '3 ст. л.'),
            ('✨ Эритрит (сахзам)', '2 ст. л. по вкусу'),
        ]
        
        for idx, (title, amount) in enumerate(items):
            # Staggered pop-in animation
            stagger = idx * 25
            if f_rel > stagger:
                iy = card_y + 120 + idx * 105
                draw_rounded_rect(draw, [90, iy, WIDTH - 90, iy + 85], radius=20, fill=(30, 38, 48, 240), outline=(255, 255, 255, 30))
                draw.text((120, iy + 22), title, font=font_med, fill=(255, 255, 255, 255))
                draw.text((WIDTH - 380, iy + 22), amount, font=font_med, fill=(80, 220, 140, 255))
                
    elif scene_idx == 2:
        # BAKING PROCESS
        card_y = 1160
        draw_rounded_rect(draw, [60, card_y, WIDTH - 60, card_y + 540], radius=35, fill=(15, 20, 25, 230), outline=(255, 140, 50, 160), width=3)
        
        draw.text((100, card_y + 35), '👩‍🍳 ПРОСТОЙ СПОСОБ:', font=font_large, fill=(255, 160, 50, 255))
        
        steps = [
            '1. Смешай творог, яйца и муку вилкой',
            '2. Сформируй 6 пышных сырников',
            '3. Выпекай 25 минут при 180°C',
        ]
        for idx, st in enumerate(steps):
            sy = card_y + 120 + idx * 95
            draw.text((100, sy), st, font=font_med, fill=(255, 255, 255, 240))
            
        draw_rounded_rect(draw, [90, card_y + 420, WIDTH - 90, card_y + 500], radius=20, fill=(220, 53, 69, 210))
        draw.text((140, card_y + 440), '🔥 БЕЗ ЖАРКИ В МАСЛЕ • В ДУХОВКЕ', font=font_med, fill=(255, 255, 255, 255))
        
    elif scene_idx == 3:
        # MONEY SHOT & KBJU
        card_y = 1120
        draw_rounded_rect(draw, [60, card_y, WIDTH - 60, card_y + 600], radius=35, fill=(15, 20, 25, 235), outline=(50, 230, 150, 180), width=3)
        
        draw.text((100, card_y + 35), '✨ ИДЕАЛЬНОЕ КЕТО-КБЖУ:', font=font_large, fill=(255, 225, 50, 255))
        
        # 4 Macro chips
        chips = [
            ('🔥 КАЛОРИИ', '380 ккал', (255, 100, 50)),
            ('🥩 БЕЛКИ', '22 г', (50, 210, 120)),
            ('🥑 ЖИРЫ', '26 г', (255, 200, 50)),
            ('⚡ УГЛЕВОДЫ', '5 г', (60, 180, 255)),
        ]
        
        # 2x2 grid
        for i, (lbl, val, col) in enumerate(chips):
            gx = 90 if (i % 2 == 0) else WIDTH // 2 + 20
            gy = card_y + 125 + (i // 2) * 150
            draw_rounded_rect(draw, [gx, gy, gx + 420, gy + 125], radius=22, fill=(25, 32, 42, 240), outline=(*col, 100), width=2)
            draw.text((gx + 30, gy + 18), lbl, font=font_small, fill=(*col, 255))
            draw.text((gx + 30, gy + 58), val, font=font_large, fill=(255, 255, 255, 255))
            
        draw_rounded_rect(draw, [90, card_y + 460, WIDTH - 90, card_y + 545], radius=20, fill=(35, 160, 90, 220))
        draw.text((130, card_y + 482), '✅ ЧИСТЫЕ УГЛЕВОДЫ: ВСЕГО 5Г!', font=font_med, fill=(255, 255, 255, 255))
        
    else:
        # CTA
        card_y = 1100
        draw_rounded_rect(draw, [60, card_y, WIDTH - 60, card_y + 620], radius=35, fill=(15, 20, 25, 240), outline=(255, 200, 50, 220), width=4)
        
        draw.text((100, card_y + 40), '📌 СОХРАНИ РЕЦЕПТ!', font=font_xl, fill=(255, 225, 0, 255))
        draw.text((100, card_y + 130), 'Готовое меню и 37 рецептов ждут тебя:', font=font_regular, fill=(220, 230, 240, 240))
        
        # Big Telegram Bot Button
        draw_rounded_rect(draw, [90, card_y + 200, WIDTH - 90, card_y + 360], radius=30, fill=(0, 136, 204, 255), outline=(255, 255, 255, 80), width=2)
        draw.text((140, card_y + 230), '📱 БОТ КЕТО БАЛАНС', font=font_large, fill=(255, 255, 255, 255))
        draw.text((140, card_y + 295), '@keto_balance_userbot', font=font_med, fill=(210, 240, 255, 255))
        
        draw_rounded_rect(draw, [90, card_y + 400, WIDTH - 90, card_y + 560], radius=25, fill=(30, 38, 48, 230))
        draw.text((120, card_y + 430), '• Персональный расчет калорий', font=font_med, fill=(255, 255, 255, 230))
        draw.text((120, card_y + 485), '• Умный трекер воды и рецепты', font=font_med, fill=(255, 255, 255, 230))
        
    # Composite with base image
    final_img = Image.alpha_composite(base_img.convert('RGBA'), grad_overlay)
    final_img = Image.alpha_composite(final_img, overlay)
    return final_img.convert('RGB')

def main():
    output_video = 'media/keto_syrniki_viral_reel.mp4'
    audio_file = 'media/reel_audio.mp3'
    
    # FFmpeg command writing from stdin
    cmd = [
        'ffmpeg', '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{WIDTH}x{HEIGHT}',
        '-pix_fmt', 'rgb24',
        '-r', str(FPS),
        '-i', '-',  # input from pipe
        '-i', audio_file,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        output_video
    ]
    
    print(f'Starting video render: {TOTAL_FRAMES} frames...')
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    
    try:
        for f in range(TOTAL_FRAMES):
            frame = render_frame(f)
            proc.stdin.write(frame.tobytes())
            if f % 100 == 0:
                print(f'Rendered frame {f}/{TOTAL_FRAMES} ({(f/TOTAL_FRAMES)*100:.1f}%)')
        proc.stdin.close()
        proc.wait()
    except Exception as e:
        proc.kill()
        raise e
        
    if proc.returncode == 0:
        print(f'SUCCESS! Video rendered: {output_video}')
    else:
        print(f'ERROR: FFmpeg returned code {proc.returncode}')

if __name__ == '__main__':
    main()
