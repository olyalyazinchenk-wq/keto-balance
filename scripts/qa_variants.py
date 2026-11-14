"""QA sweep over rendered variants: every file is probed against the profile it claims to be.

usage: python scripts/qa_variants.py [dir]

Checks per file <slug>_<variant>_<platform>.mp4:
  - dimensions match PROFILES[platform]
  - fps = 30, video codec h264, pixel format yuv420p (streamable everywhere)
  - an audio stream exists and is aac
  - duration = scenes_in_variant x scene_duration (from the briefs, tolerance 0.15 s)
  - file size under the 50 MB Telegram bot upload ceiling
Writes media/hooks/variants/qa_report.csv and prints a summary table.
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_social import PROFILES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TG_LIMIT = 50 * 1024 * 1024


def black_spots(path: Path) -> list[float]:
    """Timestamps of fully black stretches (scene-cut flashes) found by ffmpeg blackdetect."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-vf", "blackdetect=d=0.03:pix_th=0.08", "-an", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    return [float(m.group(1)) for m in re.finditer(r"black_start:(\d+\.?\d*)", out)]


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True).stdout
    return json.loads(out or "{}")


def expected_durations() -> dict[tuple[str, str], int]:
    """(slug, variant) -> scene count, collected from every brief."""
    mapping: dict[tuple[str, str], int] = {}
    for b in (ROOT / "docs" / "briefs").glob("*.json"):
        try:
            data = json.loads(b.read_text(encoding="utf-8"))
        except Exception:
            continue
        slug = data.get("slug", b.stem)
        for var in data.get("variants", []):
            mapping[(slug, var["name"])] = var["scenes"]
    return mapping


def main() -> int:
    outdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "media/hooks/variants"
    scenes_map = expected_durations()
    rows, problems = [], 0

    for f in sorted(outdir.glob("*.mp4")):
        stem = f.stem
        platform = next((p for p in sorted(PROFILES, key=len, reverse=True) if stem.endswith("_" + p)), "")
        rest = stem[: -(len(platform) + 1)] if platform else stem
        variant = rest.rsplit("_", 1)[-1] if "_" in rest else "?"
        slug = rest[: -(len(variant) + 1)] if variant != "?" else rest
        prof = PROFILES.get(platform)
        info = probe(f)
        v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
        a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
        dur = float(info.get("format", {}).get("duration", 0) or 0)
        size = f.stat().st_size

        issues = []
        if prof and (v.get("width"), v.get("height")) != (prof.w, prof.h):
            issues.append(f"size {v.get('width')}x{v.get('height')} != {prof.w}x{prof.h}")
        if not prof:
            issues.append(f"unknown profile {platform!r}")
        if v.get("codec_name") != "h264":
            issues.append(f"codec {v.get('codec_name')}")
        if v.get("pix_fmt") != "yuv420p":
            issues.append(f"pix_fmt {v.get('pix_fmt')}")
        fps = v.get("r_frame_rate", "")
        if fps not in ("30/1",):
            issues.append(f"fps {fps}")
        if not a:
            issues.append("no audio")
        exp_scenes = scenes_map.get((slug, variant))
        if exp_scenes:
            exp = exp_scenes * 3.0
            if abs(dur - exp) > 0.2:
                issues.append(f"duration {dur:.2f} != {exp:.2f}")
        if size > TG_LIMIT:
            issues.append(f"{size / 1048576:.1f} MB over Telegram 50 MB")
        blacks = [b for b in black_spots(f) if b > 0.15]   # the opening fade-in is intentional
        if blacks:
            issues.append("black flash at " + ", ".join(f"{b:.2f}s" for b in blacks[:3]))

        if issues:
            problems += 1
        rows.append({
            "file": f.name, "slug": slug, "variant": variant, "platform": platform,
            "w": v.get("width"), "h": v.get("height"), "fps": fps,
            "duration_s": round(dur, 3), "audio": a.get("codec_name", ""),
            "size_mb": round(size / 1048576, 2), "status": "FAIL " + "; ".join(issues) if issues else "ok",
        })

    csv_path = outdir / "qa_report.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["file"], delimiter=";")
        w.writeheader()
        w.writerows(rows)

    print(f"{'file':52} {'aspect':11} {'dur':>6} {'MB':>5}  status")
    for r in rows:
        print(f"{r['file'][:52]:52} {str(r['w'])+'x'+str(r['h']):11} {r['duration_s']:>6} {r['size_mb']:>5}  {r['status'][:60]}")
    print(f"\n{len(rows)} files, {problems} with problems -> {csv_path}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
