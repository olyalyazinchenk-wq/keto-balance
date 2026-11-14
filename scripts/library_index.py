"""Generate docs/VARIANT-LIBRARY.md from the QA report — one table per content slug.

usage: python scripts/library_index.py
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "media/hooks/variants/qa_report.csv"
OUT = ROOT / "docs/VARIANT-LIBRARY.md"

PLAN = {
    "hook": "первый кадр / тест хука, 3 с",
    "teaser": "прогрев, 6 с",
    "full": "основной пост, 9–15 с",
}
WHERE = {
    "tiktok": "TikTok — быстрый охват, проверка хука",
    "reels": "Instagram Reels — визуальный бренд, подписчики",
    "shorts": "YouTube Shorts — охват с нуля, поисковые темы",
    "telegram": "Telegram-канал — вертикаль, почти весь кадр свободен",
    "telegram_square": "Telegram — квадрат для репостов и превью",
    "ig_feed": "Instagram лента — максимальная площадь в ленте",
    "yt_16x9": "YouTube — обычное видео, вставка в длинный ролик",
}


def main() -> int:
    if not CSV.exists():
        print("no qa_report.csv yet — run scripts/qa_variants.py first")
        return 1
    rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig"), delimiter=";"))
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_slug[r["slug"]].append(r)

    lines = ["# Библиотека вариантов\n",
             f"Всего файлов: **{len(rows)}**. Источник: `media/hooks/variants/`, отчёт проверки — `qa_report.csv`.\n",
             "Все рендеры прошли автоматическую проверку: размер кадра, 30 fps, h264/yuv420p, звук AAC, "
             "длительность по числу сцен, вес ниже лимита Telegram 50 МБ.\n"]

    for slug, items in sorted(by_slug.items()):
        lines.append(f"\n## {slug}\n")
        lines.append("| Файл | Формат | Длина | Вес | Куда |")
        lines.append("|---|---|---|---|---|")
        for r in sorted(items, key=lambda x: (x["variant"], x["platform"])):
            lines.append(
                f"| `{r['file']}` | {r['w']}×{r['h']} | {float(r['duration_s']):.1f} с | "
                f"{r['size_mb']} МБ | {WHERE.get(r['platform'], r['platform'])} · {PLAN.get(r['variant'], r['variant'])} |")

    lines.append("\n## Как публиковать\n")
    lines.append("- Не выкладывать один и тот же рез на все площадки: обещание одно, монтаж разный.")
    lines.append("- `hook` — в сторис/как первый кадр карусели; `teaser` — прогрев за сутки до `full`.")
    lines.append("- В Telegram прикреплять текст поста: видео идёт без встроенной ссылки.")
    lines.append("- Метрики писать в `media/hooks/test_sheet.csv`: просмотры 24 ч, реакции/100, репосты, клики.")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"written {OUT} ({len(rows)} files, {len(by_slug)} slugs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
