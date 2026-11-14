import os
import sys
import subprocess
import json
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1080
HEIGHT = 1920

MEDIA_DIR = 'C:/Users/HP/Keto-balance/media'
BROLL_DIR = os.path.join(MEDIA_DIR, 'broll')
LOGO_PATH = os.path.join(MEDIA_DIR, 'keto_balance_gemini_logo_green.png')
MUSIC_PATH = os.path.join(MEDIA_DIR, 'bg_music.wav')

# Load fonts
FONT_BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_REG = 'C:/Windows/Fonts/segoeui.ttf'
FONT_ARIAL_BD = 'C:/Windows/Fonts/arialbd.ttf'

def create_scene_frame(broll_name, badge_text, badge_color, title_lines, subtitle_text, sub_spoken, progress_ratio=0.5):
    """
    Renders a stunning 1080x1920 card for a scene.
    """
    broll_p = os.path.join(BROLL_DIR, broll_name)
    if os.path.exists(broll_p):
        bg = Image.open(broll_p).convert('RGBA')
    else:
        bg = Image.new('RGBA', (WIDTH, HEIGHT), (20, 30, 45, 255))
        
    # Scale to cover 1080x1920 with 8% margin
    bw, bh = bg.size
    scale = max(WIDTH / bw, HEIGHT / bh) * 1.08
    bg = bg.resize((int(bw * scale), int(bh * scale)), Image.Resampling.LANCZOS)
    cx, cy = bg.width // 2, bg.height // 2
    frame = bg.crop((cx - WIDTH // 2, cy - HEIGHT // 2, cx + WIDTH // 2, cy + HEIGHT // 2))

    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Atmospheric gradients for contrast and readability
    # Top gradient
    for y in range(360):
        alpha = int(230 * (1.0 - y / 360.0))
        draw.line([(0, y), (WIDTH, y)], fill=(10, 15, 26, alpha))
    # Bottom gradient
    for y in range(HEIGHT - 700, HEIGHT):
        alpha = int(240 * ((y - (HEIGHT - 700)) / 700.0))
        draw.line([(0, y), (WIDTH, y)], fill=(10, 15, 26, alpha))

    # Soft dark scrim over middle image
    draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(15, 23, 42, 105))

    # 1. Top Header Bar
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert('RGBA')
        logo = logo.resize((86, 86), Image.Resampling.LANCZOS)
        mask = Image.new('L', (86, 86), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse((0, 0, 86, 86), fill=255)
        overlay.paste(logo, (50, 70), mask)
        # Logo border circle
        draw.ellipse([48, 68, 138, 158], outline=(16, 185, 129, 220), width=3)

    font_brand_title = ImageFont.truetype(FONT_BOLD, 38)
    font_brand_sub = ImageFont.truetype(FONT_REG, 26)
    draw.text((155, 74), 'КЕТО БАЛАНС', font=font_brand_title, fill=(255, 255, 255, 255))
    draw.text((155, 118), '@olga_nutri_med • Блог нутрициолога', font=font_brand_sub, fill=(160, 175, 200, 240))

    # Top right category pill badge
    pill_w = 360
    draw.rounded_rectangle([WIDTH - pill_w - 50, 75, WIDTH - 50, 138], radius=22, fill=(16, 185, 129, 230), outline=(255, 255, 255, 90), width=2)
    draw.text((WIDTH - pill_w - 25, 88), '🔬 МЕДИЦИНСКИЙ ГИД', font=ImageFont.truetype(FONT_BOLD, 24), fill=(255, 255, 255))

    # 2. Main Hero Card (Center)
    card_top = 480
    card_bot = 1180
    draw.rounded_rectangle([55, card_top, WIDTH - 55, card_bot], radius=34, fill=(15, 23, 42, 230), outline=(51, 65, 85, 220), width=3)

    # Scene Badge in Card
    badge_font = ImageFont.truetype(FONT_BOLD, 30)
    badge_bbox = badge_font.getbbox(badge_text)
    bw = badge_bbox[2] - badge_bbox[0] + 50
    draw.rounded_rectangle([95, card_top + 45, 95 + bw, card_top + 105], radius=16, fill=badge_color)
    draw.text((120, card_top + 56), badge_text, font=badge_font, fill=(255, 255, 255))

    # Title lines inside Hero Card
    cur_y = card_top + 135
    font_hero_l1 = ImageFont.truetype(FONT_BOLD, 54)
    font_hero_sub = ImageFont.truetype(FONT_BOLD, 36)
    font_body = ImageFont.truetype(FONT_REG, 32)

    for idx, (line_text, line_color, is_large) in enumerate(title_lines):
        f = font_hero_l1 if is_large else (font_hero_sub if idx == 0 else font_body)
        draw.text((95, cur_y), line_text, font=f, fill=line_color)
        cur_y += 72 if is_large else 52

    # 3. Large Subtitle Banner (Bottom)
    sub_top = HEIGHT - 460
    sub_bot = HEIGHT - 290
    draw.rounded_rectangle([60, sub_top, WIDTH - 60, sub_bot], radius=26, fill=(15, 23, 42, 245), outline=(250, 204, 21, 180), width=2)
    
    # Subtitle icon
    draw.text((95, sub_top + 28), '🎙️', font=ImageFont.truetype('C:/Windows/Fonts/seguiemj.ttf', 40) if os.path.exists('C:/Windows/Fonts/seguiemj.ttf') else font_hero_sub, fill=(255, 255, 255))
    
    # Wrap and print subtitle text
    font_sub_speech = ImageFont.truetype(FONT_BOLD, 38)
    sub_words = sub_spoken.split()
    lines = []
    cur_line = []
    for w in sub_words:
        cur_line.append(w)
        test_str = ' '.join(cur_line)
        if font_sub_speech.getbbox(test_str)[2] > (WIDTH - 280):
            cur_line.pop()
            lines.append(' '.join(cur_line))
            cur_line = [w]
    if cur_line:
        lines.append(' '.join(cur_line))

    sub_y = sub_top + (28 if len(lines) > 1 else 48)
    for i, line in enumerate(lines[:2]):
        c = (250, 204, 21) if i == 0 else (255, 255, 255)
        draw.text((160, sub_y), line, font=font_sub_speech, fill=c)
        sub_y += 50

    # 4. CTA Footer Banner
    cta_font = ImageFont.truetype(FONT_BOLD, 28)
    draw.text((WIDTH // 2 - 270, HEIGHT - 120), '📲 Полный гид и меню в Telegram: @olga_nutri_med', font=cta_font, fill=(203, 213, 225, 240))

    # 5. Bottom Progress Bar
    draw.rectangle([0, HEIGHT - 18, WIDTH, HEIGHT], fill=(30, 41, 59, 220))
    prog_w = int(WIDTH * progress_ratio)
    draw.rectangle([0, HEIGHT - 18, prog_w, HEIGHT], fill=(16, 185, 129, 255))

    final_img = Image.alpha_composite(frame, overlay)
    return final_img.convert('RGB')

print('Engine functions compiled.')
