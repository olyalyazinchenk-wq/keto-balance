"""Render 10 short vertical hooks (3 s) for the Keto Balance channel test.

Non-LLM / low-cost baseline used before any paid video generation:
pure PIL frames piped into ffmpeg, no external API calls.

Output: media/hooks/hook_XX.mp4  (1080x1920, 30 fps, ~3 s, h264 + faststart)
"""
from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
OUT_DIR = MEDIA / "hooks"

W, H, FPS = 1080, 1920, 30
DUR = 3.0
N_FRAMES = int(FPS * DUR)

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_BLACK = "C:/Windows/Fonts/impact.ttf"

BRAND = MEDIA / "keto_balance_logo_green.png"


@dataclass
class Hook:
    ident: str
    slot: str          # style group: A = kinetic text, B = product close-up, C = before/after
    lines: tuple[str, ...]
    badge: str
    asset: str
    accent: tuple[int, int, int]


HOOKS: list[Hook] = [
    Hook("01", "A", ("ПОЧЕМУ ВЕС", "ВСТАЛ НА КЕТО"), "3 причины, а не одна", "assets/scene1_hook.jpg", (220, 38, 38)),
    Hook("02", "A", ("3 ОШИБКИ", "В ЗАВТРАКЕ"), "Проверь свою тарелку", "frame_02_hook.jpg", (245, 158, 11)),
    Hook("03", "A", ("ХОЧЕТСЯ", "СЛАДКОГО?"), "Дело не в силе воли", "assets/scene2_ing.jpg", (147, 51, 234)),
    Hook("04", "A", ("УГЛЕВОДЫ", "ЗА 5 СЕКУНД"), "Считаем без таблиц", "assets/scene3_bake.jpg", (16, 185, 129)),
    Hook("05", "A", ("ОДНА ОШИБКА", "= ПЛАТО"), "Показываю на примере", "frame_22_bake.jpg", (220, 38, 38)),
    Hook("06", "B", ("БЕЗ МУКИ.", "БЕЗ САХАРА."), "И это не овсянка", "assets/scene3_bake.jpg", (16, 185, 129)),
    Hook("07", "B", ("ЗАВТРАК", "ЗА 3 МИНУТЫ"), "Пока готовится кофе", "assets/scene2_ing.jpg", (245, 158, 11)),
    Hook("08", "B", ("СКОЛЬКО БЕЛКА", "ВАМ НУЖНО?"), "Считаем по весу", "assets/scene4_money.jpg", (59, 130, 246)),
    Hook("09", "C", ("ДО: КАША.", "ПОСЛЕ: КЕТО."), "Один и тот же калораж", "assets/scene4_money.jpg", (59, 130, 246)),
    Hook("10", "C", ("ЭТО КЕТО", "ИЛИ НЕТ?"), "Проверь себя за 3 секунды", "frame_32_kbju.jpg", (147, 51, 234)),
]


def cover(path: Path, scale: float) -> Image.Image:
    img = Image.open(path).convert("RGB")
    iw, ih = img.size
    tr = W / H
    ir = iw / ih
    if ir > tr:
        nh = int(H * scale)
        nw = int(nh * ir)
    else:
        nw = int(W * scale)
        nh = int(nw / ir)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    return img.crop((left, top, left + W, top + H))


def gradient_overlay() -> Image.Image:
    """Top and bottom darkening so white text always reads."""
    layer = Image.new("L", (1, H), 0)
    for y in range(H):
        if y < H * 0.45:
            a = int(150 * (1 - y / (H * 0.45)))
        elif y > H * 0.55:
            a = int(185 * ((y - H * 0.55) / (H * 0.45)))
        else:
            a = 0
        layer.putpixel((0, y), a)
    return layer.resize((W, H))


def build_frames(hook: Hook) -> list[Image.Image]:
    base = MEDIA / hook.asset
    font_big = ImageFont.truetype(FONT_BLACK, 118)
    font_sub = ImageFont.truetype(FONT_BOLD, 62)
    font_badge = ImageFont.truetype(FONT_BOLD, 40)
    mask = gradient_overlay()
    frames: list[Image.Image] = []

    logo = None
    if BRAND.exists():
        logo = Image.open(BRAND).convert("RGBA")
        lh = 96
        lw = int(logo.width * lh / logo.height)
        logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)

    for i in range(N_FRAMES):
        p = i / max(1, N_FRAMES - 1)
        scale = 1.0 + 0.06 * p
        frame = cover(base, scale).convert("RGBA")
        frame = Image.composite(Image.new("RGBA", (W, H), (0, 0, 0, 255)), frame, mask)

        # text entrance: 0 - 0.28 s
        t_in = min(1.0, i / (0.28 * FPS))
        alpha = int(255 * t_in)
        pop = 1.0 + 0.05 * (1 - t_in)   # slight shrink-in

        txt_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(txt_layer)

        # badge pill
        bw = d.textlength(hook.badge, font=font_badge)
        pill_w, pill_h = int(bw + 64), 84
        px, py = (W - pill_w) // 2, 470
        d.rounded_rectangle((px, py, px + pill_w, py + pill_h), radius=42,
                            fill=hook.accent + (int(0.92 * alpha),))
        d.text((px + 32, py + 17), hook.badge, font=font_badge, fill=(255, 255, 255, alpha))

        # hook lines
        y = 640
        for idx, line in enumerate(hook.lines):
            f = font_big if idx == 0 else font_sub
            bb = d.textbbox((0, 0), line, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            x = (W - tw) // 2
            shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ds = ImageDraw.Draw(shade)
            ds.text((x + 4, y + 5), line, font=f, fill=(0, 0, 0, int(0.55 * alpha)))
            shade = shade.filter(ImageFilter.GaussianBlur(6))
            txt_layer = Image.alpha_composite(txt_layer, shade)
            d = ImageDraw.Draw(txt_layer)
            d.text((x, y), line, font=f, fill=(255, 255, 255, alpha))
            y += th + 54

        if logo is not None:
            txt_layer.alpha_composite(logo, ((W - logo.width) // 2, H - 250))

        if pop > 1.0:
            nw, nh = int(W * pop), int(H * pop)
            txt_layer = txt_layer.resize((nw, nh), Image.Resampling.BILINEAR)
            off = ((nw - W) // 2, (nh - H) // 2)
            txt_layer = txt_layer.crop((off[0], off[1], off[0] + W, off[1] + H))

        frame = Image.alpha_composite(frame, txt_layer)
        frames.append(frame.convert("RGB"))
    return frames


def render(hook: Hook) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"hook_{hook.ident}.mp4"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(out_path),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    for frame in build_frames(hook):
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {hook.ident}")
    return out_path


def main() -> int:
    only = sys.argv[1:] or None
    made = []
    for hook in HOOKS:
        if only and hook.ident not in only:
            continue
        path = render(hook)
        size_kb = path.stat().st_size // 1024
        print(f"hook_{hook.ident}.mp4  {size_kb} KB  [{hook.slot}] {hook.lines[0]} {hook.lines[1]}")
        made.append(path)
    print(f"\nrendered {len(made)} hooks -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
