"""Multi-platform social renderer for Keto Balance hooks.

One input clip + text -> the exact file each platform expects (size, aspect, safe zones,
loudness). Platforms differ in aspect, duration ceiling and where their UI covers the frame,
so text is laid out inside a per-profile safe area instead of a fixed 9:16 template.

usage:
  python scripts/render_social.py --clip media/flow/salmon_plate_01.mp4 \
      --profiles tiktok,reels,shorts,telegram_square,ig_feed \
      --dur 3 --t 1.0 --l1 "СНАЧАЛА БЕЛОК" --l2 "ПОТОМ ВСЁ ОСТАЛЬНОЕ" \
      --kicker "кето · тарелка" --cta "разбор в канале" --out media/hooks

Add --list to print the profile table and exit.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_BLACK = "C:/Windows/Fonts/impact.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"
ACCENT = (52, 211, 153)


@dataclass(frozen=True)
class Profile:
    name: str
    w: int
    h: int
    max_dur: float
    fill: str            # "blur" = 16:9 inside blurred canvas, "crop" = center-crop to aspect
    safe_top: float      # fraction of height covered by platform UI at the top
    safe_bottom: float   # fraction covered at the bottom (caption buttons, CTA bar)
    note: str


PROFILES: dict[str, Profile] = {
    "tiktok": Profile("tiktok", 1080, 1920, 60, "blur", 0.10, 0.20,
                      "TikTok: правый столбец кнопок + подпись снизу"),
    "reels": Profile("reels", 1080, 1920, 90, "blur", 0.12, 0.24,
                     "Instagram Reels: крупная нижняя плашка"),
    "shorts": Profile("shorts", 1080, 1920, 180, "blur", 0.08, 0.18,
                      "YouTube Shorts: заголовок сверху, кнопки снизу"),
    "telegram": Profile("telegram", 1080, 1920, 600, "blur", 0.06, 0.12,
                        "Telegram-канал, вертикаль: почти весь кадр свободен"),
    "telegram_square": Profile("telegram_square", 1080, 1080, 600, "crop", 0.06, 0.10,
                               "Telegram-канал, квадрат: превью в лентах и репостах"),
    "ig_feed": Profile("ig_feed", 1080, 1350, 600, "crop", 0.08, 0.12,
                       "Instagram лента 4:5: максимальная площадь в ленте"),
    "yt_16x9": Profile("yt_16x9", 1920, 1080, 600, "crop", 0.05, 0.10,
                       "YouTube обычный: превью-нарезка, вставка в длинное видео"),
}


def overlay(profile: Profile, line1: str, line2: str, kicker: str, cta: str) -> tuple[Image.Image, int, int]:
    """Render the typography PNG for a profile; returns (image, safe_top_px, safe_bottom_px)."""
    W, H = profile.w, profile.h
    top = int(H * profile.safe_top)
    bottom = int(H * profile.safe_bottom)

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if profile.fill == "crop":      # bright footage: add a bottom scrim for the CTA/brand row
        scrim_h = int(H * 0.26)
        for i in range(scrim_h):
            a = int(150 * (i / scrim_h) ** 1.4)
            d.line([(0, H - scrim_h + i), (W, H - scrim_h + i)], fill=(6, 12, 10, a))

    scale = min(W, H) / 1080          # height-aware: 16:9 gets smaller type than 9:16
    f_kick = ImageFont.truetype(FONT_BOLD, int(42 * scale))
    f_cta = ImageFont.truetype(FONT_REG, int(36 * scale))
    f_brand = ImageFont.truetype(FONT_BOLD, int(32 * scale))

    kick_y = top + int(30 * scale)
    d.text((int(70 * scale), kick_y), kicker.upper(), font=f_kick, fill=ACCENT)
    d.rectangle((int(70 * scale), kick_y + int(58 * scale), int(70 * scale) + int(110 * scale),
                 kick_y + int(64 * scale)), fill=ACCENT)

    # bottom-up layout, kept above the platform's own bottom UI (safe_bottom)
    brand_h = int(46 * scale)
    brand_y = H - max(bottom, int(18 * scale)) - brand_h
    cta_h = int(70 * scale)
    cta_y = brand_y - cta_h - int(14 * scale)
    text_bottom = cta_y - int(46 * scale)

    line1_f = ImageFont.truetype(FONT_BLACK, int(120 * scale))
    line2_f = ImageFont.truetype(FONT_BLACK, int(98 * scale))
    gap = int(34 * scale)

    rows = []
    for f, txt, col in ((line1_f, line1, (255, 255, 255, 255)), (line2_f, line2, ACCENT + (255,))):
        bb = d.textbbox((0, 0), txt, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        while tw > W - int(120 * scale) and f.size > 44:
            f = ImageFont.truetype(FONT_BLACK, f.size - 5)
            bb = d.textbbox((0, 0), txt, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
        rows.append((f, txt, col, tw, th))

    total_h = sum(r[4] for r in rows) + gap * (len(rows) - 1)
    y = max(top + int(120 * scale), text_bottom - total_h)

    for f, txt, col, tw, th in rows:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(sh).text(((W - tw) // 2 + 4, y + 6), txt, font=f, fill=(0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(7)))
        d = ImageDraw.Draw(img)
        d.text(((W - tw) // 2, y), txt, font=f, fill=col)
        y += th + gap

    cw = d.textlength(cta, font=f_cta)
    d.rounded_rectangle((int(70 * scale), cta_y, W - int(70 * scale), cta_y + cta_h),
                        radius=int(35 * scale), fill=(255, 255, 255, 30))
    d.text(((W - cw) / 2, cta_y + int(16 * scale)), cta, font=f_cta, fill=(235, 255, 250))

    bw = d.textlength("КЕТО БАЛАНС", font=f_brand)
    d.text(((W - bw) / 2, brand_y), "КЕТО БАЛАНС", font=f_brand, fill=(200, 240, 228, 230))
    return img, top, bottom


def render(clip: Path, out: Path, prof: Profile, dur: float, t0: float,
           l1: str, l2: str, kicker: str, cta: str, fade_in: bool = True) -> Path:
    ov, top, bottom = overlay(prof, l1, l2, kicker, cta)
    W, H = prof.w, prof.h
    with tempfile.TemporaryDirectory() as td:
        png = Path(td) / "ov.png"
        ov.save(png)
        if prof.fill == "crop":
            fade = "fade=t=in:st=0:d=0.12," if fade_in else ""
            fc = (f"[0:v]trim=start={t0}:duration={dur},setpts=PTS-STARTPTS,"
                  f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[bg];"
                  f"[bg][1:v]overlay=0:0,{fade}null[v]")
        else:
            band = int(H * 0.46)
            y = max(top + 110, int(H * 0.26))
            fade = "fade=t=in:st=0:d=0.12," if fade_in else ""
            fc = (f"[0:v]trim=start={t0}:duration={dur},setpts=PTS-STARTPTS,split=2[a][b];"
                  f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=26,eq=brightness=-0.14[bg];"
                  f"[b]scale={W}:{band}[fg];"
                  f"[bg][fg]overlay=0:{y}[base];"
                  f"[base][1:v]overlay=0:0,{fade}null[v]")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
               "-i", str(clip), "-loop", "1", "-i", str(png),
               "-filter_complex", fc, "-map", "[v]", "-map", "0:a?",
               "-t", f"{dur}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
               "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
               "-c:a", "aac", "-b:a", "128k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
               str(out)]
        subprocess.run(cmd, check=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip")
    ap.add_argument("--profiles", default="tiktok")
    ap.add_argument("--dur", type=float, default=3.0)
    ap.add_argument("--t", type=float, default=1.0)
    ap.add_argument("--l1", default="СНАЧАЛА БЕЛОК")
    ap.add_argument("--l2", default="ПОТОМ ВСЁ ОСТАЛЬНОЕ")
    ap.add_argument("--kicker", default="кето · тарелка")
    ap.add_argument("--cta", default="разбор в канале")
    ap.add_argument("--out", default="media/hooks")
    ap.add_argument("--tag", default="")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for p in PROFILES.values():
            print(json.dumps(asdict(p), ensure_ascii=False))
        return 0

    clip = Path(args.clip)
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    made = []
    for name in [x.strip() for x in args.profiles.split(",") if x.strip()]:
        prof = PROFILES[name]
        dur = min(args.dur, prof.max_dur)
        tag = f"_{args.tag}" if args.tag else ""
        out = outdir / f"{name}{tag}.mp4"
        render(clip, out, prof, dur, args.t, args.l1, args.l2, args.kicker, args.cta)
        made.append((name, out, prof.w, prof.h, dur, out.stat().st_size // 1024))
    for name, out, w, h, dur, kb in made:
        print(f"{name:16} {w}x{h}  {dur:.2f}s  {kb} KB  -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
