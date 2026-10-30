"""Render 10 kinetic-typography hooks (3 s, 1080x1920) — the honest, zero-cost baseline.

Why no food photos: the existing `media/` frames show syrup, banana, crepes with cream,
a chocolate cake and chickpea tacos. Pasting "КЕТО" claims on those frames contradicts
the numerics the project shows (4.8 g carbs) and breaks the honesty invariants in AGENTS.md.
Until real keto b-roll exists, the baseline set is pure code animation.

Output: media/hooks/code/hook_XX.mp4
"""
from __future__ import annotations

import math
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "media" / "hooks" / "code"

W, H, FPS = 1080, 1920, 30
DUR = 3.0
N_FRAMES = int(FPS * DUR)

FONT_BLACK = "C:/Windows/Fonts/impact.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"

BG_TOP = (9, 26, 24)        # deep teal
BG_BOTTOM = (3, 10, 12)
ACCENT = (52, 211, 153)     # emerald
WARN = (248, 113, 113)


@dataclass
class Hook:
    ident: str
    group: str                  # A = боль/ошибка, B = продукт/выгода, C = интерактив/проверка
    beats: tuple[str, ...]      # text beats revealed one after another
    kicker: str                 # small line above
    cta: str
    accent: tuple[int, int, int]


HOOKS: list[Hook] = [
    Hook("01", "A", ("ВЕС ВСТАЛ?", "ДЕЛО НЕ В КАЛОРИЯХ"), "кето · разбор", "смотри разбор в канале", WARN),
    Hook("02", "A", ("3 ОШИБКИ", "В ЗАВТРАКЕ"), "проверь свою тарелку", "полный чек-лист в канале", ACCENT),
    Hook("03", "A", ("ТЯНЕТ НА СЛАДКОЕ", "ЭТО НЕ СИЛА ВОЛИ"), "кето · привычки", "смотри, что менять", WARN),
    Hook("04", "A", ("УГЛЕВОДЫ", "ЗА 5 СЕКУНД"), "без таблиц и калькулятора", "метод в закрепе канала", ACCENT),
    Hook("05", "A", ("ОДНА ОШИБКА", "И ПЛАТО"), "показываю на примере", "разбор в канале", WARN),
    Hook("06", "B", ("ЗАВТРАК", "БЕЗ МУКИ", "БЕЗ САХАРА"), "и без готовки на час", "рецепт в канале", ACCENT),
    Hook("07", "B", ("БЕЛОК", "ЭТО НЕ ПРО ВКУС", "ЭТО ПРО СЫТОСТЬ"), "сколько нужно именно вам", "расчёт в канале", ACCENT),
    Hook("08", "B", ("СЧИТАТЬ БЖУ", "ЛЕГЧЕ, ЧЕМ КАЖЕТСЯ"), "3 шага, 1 минута", "пошагово в канале", ACCENT),
    Hook("09", "C", ("ЭТО КЕТО", "ИЛИ НЕТ?"), "проверь себя за 3 секунды", "ответы в канале", (96, 165, 250)),
    Hook("10", "C", ("КАША", "ИЛИ КЕТО-ТАРЕЛКА?"), "угадай с первого раза", "проверка в канале", (96, 165, 250)),
]


def bg_frame(i: int) -> Image.Image:
    """Vertical gradient plus two slow drifting bokeh blobs — cheap but not static."""
    p = i / max(1, N_FRAMES - 1)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        k = y / H
        d.line(
            [(0, y), (W, y)],
            fill=(
                int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * k),
                int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * k),
                int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * k),
            ),
        )
    blobs = Image.new("RGB", (W, H), (0, 0, 0))
    bd = ImageDraw.Draw(blobs)
    cx = int(W * (0.3 + 0.15 * math.sin(p * math.pi * 1.2)))
    cy = int(H * (0.28 + 0.05 * p))
    bd.ellipse((cx - 380, cy - 380, cx + 380, cy + 380), fill=(16, 96, 74))
    cx2 = int(W * (0.72 - 0.1 * p))
    cy2 = int(H * (0.72 + 0.04 * math.cos(p * math.pi)))
    bd.ellipse((cx2 - 300, cy2 - 300, cx2 + 300, cy2 + 300), fill=(10, 52, 60))
    blobs = blobs.filter(ImageFilter.GaussianBlur(160))
    return Image.blend(img, blobs, 0.55)


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def render_frames(hook: Hook) -> list[Image.Image]:
    f_kick = ImageFont.truetype(FONT_BOLD, 44)
    f_cta = ImageFont.truetype(FONT_REG, 38)
    fonts = [ImageFont.truetype(FONT_BLACK, sz) for sz in (150, 130, 110)]
    frames = []

    # beat timings inside 3 s
    start = [0.05, 0.62, 1.15][: len(hook.beats)]
    for i in range(N_FRAMES):
        t = i / FPS
        frame = bg_frame(i).convert("RGBA")
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)

        # kicker
        a = int(255 * ease((t - 0.0) / 0.25))
        d.text((90, 300), hook.kicker.upper(), font=f_kick, fill=hook.accent + (a,))
        d.rectangle((90, 372, 90 + 120 * ease((t - 0.05) / 0.35), 380), fill=hook.accent + (a,))

        # beats — stacked lines, each revealed with slide-up + fade
        y = 520
        for idx, text in enumerate(hook.beats):
            prog = ease((t - start[idx]) / 0.34)
            if prog <= 0:
                y += 170
                continue
            f = fonts[min(idx, 2)]
            bb = d.textbbox((0, 0), text, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            while tw > W - 140 and f.size > 60:      # shrink until it fits
                f = ImageFont.truetype(FONT_BLACK, f.size - 6)
                bb = d.textbbox((0, 0), text, font=f)
                tw, th = bb[2] - bb[0], bb[3] - bb[1]
            x = 90
            dy = int((1 - prog) * 46)
            col = (255, 255, 255) if idx < len(hook.beats) - 1 else hook.accent
            d.text((x, y + dy), text, font=f, fill=col + (int(255 * prog),))
            y += th + 62

        # bottom cta bar
        a = int(255 * ease((t - 1.9) / 0.5))
        if a > 0:
            bar_y = H - 300
            d.rounded_rectangle((90, bar_y, W - 90, bar_y + 96), radius=48,
                                fill=(255, 255, 255, int(0.10 * a)))
            cta_w = d.textlength(hook.cta, font=f_cta)
            d.text(((W - cta_w) / 2, bar_y + 26), hook.cta, font=f_cta, fill=(235, 255, 250, a))

        # brand mark
        a = int(200 * ease((t - 0.1) / 0.4))
        brand = "КЕТО БАЛАНС"
        f_brand = ImageFont.truetype(FONT_BOLD, 36)
        bw = d.textlength(brand, font=f_brand)
        d.text(((W - bw) / 2, H - 150), brand, font=f_brand, fill=(200, 240, 228, a))

        frame = Image.alpha_composite(frame, layer)
        frames.append(frame.convert("RGB"))
    return frames


def render(hook: Hook) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"hook_{hook.ident}.mp4"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert p.stdin is not None
    for f in render_frames(hook):
        p.stdin.write(f.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg failed on {hook.ident}")
    return out


def main() -> int:
    only = set(sys.argv[1:]) or None
    made = 0
    for hook in HOOKS:
        if only and hook.ident not in only:
            continue
        path = render(hook)
        print(f"{path.name}  {path.stat().st_size // 1024} KB  [{hook.group}] {' / '.join(hook.beats)}")
        made += 1
    print(f"\nrendered {made} -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
