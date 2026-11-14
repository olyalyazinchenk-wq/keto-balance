"""Compose a 3-second vertical hook from a Flow (Veo) clip + kinetic typography overlay.

usage: python scripts/compose_flow_hook.py <clip.mp4> <out.mp4> <t_start> "<line1>" "<line2>" "<kicker>" "<cta>"

The source clip is 16:9, so it goes into a blurred 9:16 canvas (no destructive crop),
then a PIL-rendered PNG overlay adds the Russian hook text, accent rule and brand.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FG_H = 608                     # 1080 x 608 keeps the 16:9 source undistorted
FG_Y = 470                     # where the live frame sits in the canvas
DUR = 3.0

FONT_BLACK = "C:/Windows/Fonts/impact.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"
ACCENT = (52, 211, 153)


def make_overlay(path: Path, line1: str, line2: str, kicker: str, cta: str) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    f_kick = ImageFont.truetype(FONT_BOLD, 42)
    f_cta = ImageFont.truetype(FONT_REG, 36)
    f_brand = ImageFont.truetype(FONT_BOLD, 34)

    # top scrim so the kicker reads over the blurred backdrop
    top = Image.new("RGBA", (W, 300), (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for y in range(300):
        td.line([(0, y), (W, y)], fill=(4, 14, 12, int(190 * (1 - y / 300))))
    img.alpha_composite(top, (0, 0))

    d.text((90, 250), kicker.upper(), font=f_kick, fill=ACCENT)
    d.rectangle((90, 316, 210, 322), fill=ACCENT)

    y = 1160
    for idx, text in enumerate((line1, line2)):
        f = ImageFont.truetype(FONT_BLACK, 132 if idx == 0 else 108)
        bb = d.textbbox((0, 0), text, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        while tw > W - 150 and f.size > 60:
            f = ImageFont.truetype(FONT_BLACK, f.size - 6)
            bb = d.textbbox((0, 0), text, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
        # soft shadow
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        sd.text(((W - tw) // 2 + 4, y + 6), text, font=f, fill=(0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(7)))
        d = ImageDraw.Draw(img)
        col = (255, 255, 255, 255) if idx == 0 else ACCENT + (255,)
        d.text(((W - tw) // 2, y), text, font=f, fill=col)
        y += th + 56

    bar_y = H - 300
    d.rounded_rectangle((90, bar_y, W - 90, bar_y + 92), radius=46, fill=(255, 255, 255, 26))
    cw = d.textlength(cta, font=f_cta)
    d.text(((W - cw) / 2, bar_y + 25), cta, font=f_cta, fill=(235, 255, 250))

    bw = d.textlength("КЕТО БАЛАНС", font=f_brand)
    d.text(((W - bw) / 2, H - 150), "КЕТО БАЛАНС", font=f_brand, fill=(200, 240, 228))

    img.save(path)


def build(clip: Path, out: Path, t_start: float, lines: tuple[str, str], kicker: str, cta: str) -> None:
    with tempfile.TemporaryDirectory() as td:
        ov = Path(td) / "overlay.png"
        make_overlay(ov, lines[0], lines[1], kicker, cta)

        fc = (
            f"[0:v]trim=start={t_start}:duration={DUR},setpts=PTS-STARTPTS,split=2[bg][fg];"
            f"[bg]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=26,"
            f"eq=brightness=-0.12[bgb];"
            f"[fg]scale={W}:{FG_H}[fgs];"
            f"[bgb][fgs]overlay=0:{FG_Y}[base];"
            f"[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.18,fade=t=out:st={DUR - 0.25}:d=0.25[v]"
        )
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(clip), "-loop", "1", "-i", str(ov),
            "-filter_complex", fc, "-map", "[v]", "-map", "0:a?",
            "-t", str(DUR), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k", "-af", "afade=t=out:st=%s:d=0.3" % (DUR - 0.3),
            str(out),
        ]
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    clip = Path(sys.argv[1])
    out = Path(sys.argv[2])
    t_start = float(sys.argv[3])
    line1, line2, kicker, cta = sys.argv[4:8]
    build(clip, out, t_start, (line1, line2), kicker, cta)
    print("written:", out, out.stat().st_size // 1024, "KB")
