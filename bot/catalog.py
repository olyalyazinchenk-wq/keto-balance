"""
bot/catalog.py — Канонический доступ к каталогу рецептов с фильтрацией по RELEASED_RECIPE_IDS (K2-Pilot).
"""
import json
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional

from bot.app_settings import PILOT_RECIPE_IDS

BASE_DIR = Path(__file__).resolve().parent.parent
BOT_DATA_PATH = BASE_DIR / "bot_data.json"

_cached_recipes: Optional[List[Dict[str, Any]]] = None

def load_all_recipes() -> List[Dict[str, Any]]:
    global _cached_recipes
    if _cached_recipes is not None:
        return _cached_recipes

    if not BOT_DATA_PATH.is_file():
        return []

    try:
        data = json.loads(BOT_DATA_PATH.read_text(encoding="utf-8"))
        _cached_recipes = data.get("recipes", [])
        return _cached_recipes
    except Exception:
        return []

def get_released_catalog(released_ids: Optional[FrozenSet[str]] = None) -> List[Dict[str, Any]]:
    """Возвращает только те рецепты, которые допущены манифестом релиза (15 пилотных по умолчанию)."""
    allowed_ids = released_ids if released_ids is not None else PILOT_RECIPE_IDS
    all_recipes = load_all_recipes()
    return [r for r in all_recipes if r.get("id") in allowed_ids]

def get_recipe_by_id(recipe_id: str, released_ids: Optional[FrozenSet[str]] = None) -> Optional[Dict[str, Any]]:
    """Возвращает рецепт по ID, строго проверяя границы релиза."""
    allowed_ids = released_ids if released_ids is not None else PILOT_RECIPE_IDS
    if recipe_id not in allowed_ids:
        return None

    for r in load_all_recipes():
        if r.get("id") == recipe_id:
            return r

    return None
