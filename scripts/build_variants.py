"""Build the whole format matrix from one brief.

A brief lists scenes (clip + on-screen text + time window) and the variants to cut
(hook / teaser / full). For every (platform x variant) pair the script renders each scene
with the platform's safe-zone layout, then concatenates them into one file.

usage: python scripts/build_variants.py docs/briefs/keto-2026-10.json
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from render_social import PROFILES, render

ROOT = Path(__file__).resolve().parents[1]


def concat(parts: list[Path], out: Path) -> Path:
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "list.txt"
        lst.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in parts), encoding="utf-8")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
               "-f", "concat", "-safe", "0", "-i", str(lst),
               "-c", "copy", "-movflags", "+faststart", str(out)]
        subprocess.run(cmd, check=True)
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    if not args:
        print("usage: python scripts/build_variants.py [--force] <brief.json>")
        return 1
    brief_path = Path(args[0])
    brief = json.loads(brief_path.read_text(encoding="utf-8"))
    outdir = ROOT / brief.get("out", "media/hooks/variants")
    outdir.mkdir(parents=True, exist_ok=True)

    scenes = brief["scenes"]
    platforms = brief["platforms"]
    variants = brief["variants"]
    kicker = brief.get("kicker", "кето")
    cta = brief.get("cta", "разбор в канале")
    slug = brief.get("slug", brief_path.stem)

    made = []
    for platform in platforms:
        prof = PROFILES[platform]
        with tempfile.TemporaryDirectory() as td:
            seg_cache: dict[int, Path] = {}
            for var in variants:
                out = outdir / f"{slug}_{var['name']}_{platform}.mp4"
                if not force and out.exists() and out.stat().st_size > 0:
                    made.append((var["name"], platform, out, out.stat().st_size // 1024))
                    continue
                n = min(var["scenes"], len(scenes))
                parts = []
                for i in range(n):
                    if i not in seg_cache:
                        sc = scenes[i]
                        seg = Path(td) / f"seg{i}.mp4"
                        render(ROOT / sc["clip"], seg, prof,
                               min(sc.get("dur", 3.0), prof.max_dur), sc.get("t", 1.0),
                               sc.get("l1", ""), sc.get("l2", ""),
                               sc.get("kicker", kicker), cta, fade_in=(i == 0))
                        seg_cache[i] = seg
                    parts.append(seg_cache[i])
                if len(parts) == 1:
                    shutil.copy2(parts[0], out)
                else:
                    concat(parts, out)
                made.append((var["name"], platform, out, out.stat().st_size // 1024))

    for name, platform, out, kb in made:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-show_entries", "stream=width,height", "-of", "csv=p=0", str(out)],
                               capture_output=True, text=True).stdout.split()
        dims = next((x for x in probe if "x" in x and "," in x), "")
        dur = next((x for x in probe if x.count(".") == 1), "")
        print(f"{name:7} {platform:16} {dims:12} {dur:>7}s  {kb:5} KB  {out.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
