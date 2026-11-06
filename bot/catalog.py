"""
bot/catalog.py — Канонический доступ к статическому артефакту каталога (PilotCatalogV1).
Чтение только dist/released-catalog.json либо через внедрённый provider.
Никакого обращения к bot_data.json или несанкционированным рецептам.
"""
import json
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from bot.recipe_eligibility import (
    is_recipe_allowed,
    is_menu_compatible_with_profile,
    RESTRICTION_MAP,
    KNOWN_ALLERGY_MAP,
)

CatalogProvider = Callable[[], Dict[str, Any]]

EMPTY_CATALOG: Dict[str, Any] = {
    "schema_version": 1,
    "catalog_id": "empty",
    "test_only": False,
    "released_ids": [],
    "recipes": [],
    "nutrition_status": "unverified",
}

def load_static_catalog(dist_dir: Path, app_stage: str = "prod") -> Dict[str, Any]:
    artifact_path = dist_dir / "released-catalog.json"
    if not artifact_path.is_file():
        return dict(EMPTY_CATALOG)
    try:
        data = json.loads(artifact_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "recipes" not in data:
            return dict(EMPTY_CATALOG)
        if data.get("test_only") is True and app_stage != "test":
            return dict(EMPTY_CATALOG)
        return data
    except Exception:
        return dict(EMPTY_CATALOG)

class CatalogService:
    def __init__(
        self,
        dist_dir: Path,
        provider: Optional[CatalogProvider] = None,
        app_stage: str = "prod",
        db_path: Optional[Path] = None,
    ):
        self.dist_dir = dist_dir
        self.provider = provider
        self.app_stage = app_stage
        self.db_path = db_path
        self._cached_catalog: Optional[Dict[str, Any]] = None

    def invalidate_cache(self) -> None:
        self._cached_catalog = None

    def get_catalog_data(self) -> Dict[str, Any]:
        if self._cached_catalog is not None:
            return self._cached_catalog

        if self.provider is not None:
            data = self.provider()
            self._cached_catalog = data
            return data

        if self.db_path is not None and Path(self.db_path).is_file():
            try:
                from bot.app_db import get_admin_catalog_version, get_catalog_snapshot
                ver = get_admin_catalog_version(self.db_path)
                snapshot = get_catalog_snapshot(ver, self.db_path)
                if snapshot is not None and len(snapshot) > 0:
                    released_ids = [r.get("id") for r in snapshot if r.get("id")]
                    data = {
                        "schema_version": 1,
                        "catalog_id": f"admin-catalog-v{ver}",
                        "catalog_version": ver,
                        "test_only": self.app_stage == "test",
                        "released_ids": released_ids,
                        "recipes": snapshot,
                        "nutrition_status": "verified",
                    }
                    self._cached_catalog = data
                    return data
            except Exception:
                pass

        data = load_static_catalog(self.dist_dir, self.app_stage)
        self._cached_catalog = data
        return data

    def get_released_recipes(self) -> List[Dict[str, Any]]:
        data = self.get_catalog_data()
        released_ids = set(data.get("released_ids", []))
        recipes = data.get("recipes", [])
        return [r for r in recipes if r.get("id") in released_ids]

    def get_recipe_by_id(self, recipe_id: str) -> Optional[Dict[str, Any]]:
        data = self.get_catalog_data()
        released_ids = set(data.get("released_ids", []))
        if recipe_id not in released_ids:
            return None
        for r in data.get("recipes", []):
            if r.get("id") == recipe_id:
                return r
        return None

class ParsedAmount:
    def __init__(self, value: float, base_unit: str, unit_type: str, is_text: bool, text_label: str = ""):
        self.value = value
        self.base_unit = base_unit
        self.unit_type = unit_type
        self.is_text = is_text
        self.text_label = text_label


def normalize_unit(raw_unit: str) -> tuple[str, str, float]:
    u = raw_unit.lower().rstrip(".").strip()
    if u in ("г", "гр"):
        return ("г", "weight", 1.0)
    if u == "кг":
        return ("г", "weight", 1000.0)
    if u == "мл":
        return ("мл", "volume", 1.0)
    if u == "л":
        return ("мл", "volume", 1000.0)
    if u in ("шт", "штук", "штуки", "шт."):
        return ("шт.", "count", 1.0)
    if "ст" in u and "л" in u:
        return ("ст. л.", "tbsp", 1.0)
    if u.startswith("банк"):
        return ("банка", "can", 1.0)
    if u.startswith("стейк"):
        return ("стейка", "steak", 1.0)
    if u.startswith("нож"):
        return ("ножки", "leg", 1.0)
    return (u or "ед", "custom" if u else "text", 1.0)


def parse_amount(raw: str) -> ParsedAmount:
    s = raw.strip()
    m_frac = re.match(r"^(\d+)/(\d+)\s*(.*)$", s)
    if m_frac:
        try:
            val = float(m_frac.group(1)) / float(m_frac.group(2))
            base_unit, unit_type, scale = normalize_unit(m_frac.group(3))
            return ParsedAmount(val * scale, base_unit, unit_type, False)
        except (ValueError, ZeroDivisionError):
            pass
    m_dec = re.match(r"^(\d+(?:[.,]\d+)?)\s*(.*)$", s)
    if m_dec:
        try:
            val = float(m_dec.group(1).replace(",", "."))
            base_unit, unit_type, scale = normalize_unit(m_dec.group(2))
            return ParsedAmount(val * scale, base_unit, unit_type, False)
        except ValueError:
            pass
    return ParsedAmount(0.0, s, "text", True, text_label=s)


def parse_amount_value(raw: str) -> Optional[float]:
    pa = parse_amount(raw)
    return None if pa.is_text else pa.value


def is_shopping_consistent_with_menu(
    menu_data: Optional[Dict[str, Any]],
    shopping_batches: int,
    shopping_items: List[Dict[str, Any]],
    catalog_service: CatalogService,
) -> bool:
    if not menu_data or not menu_data.get("days"):
        return True

    days = menu_data.get("days") or []
    menu_recipes_sequence: list[str] = []
    for day in days:
        slots = day.get("slots") or {}
        for r_id in slots.values():
            if r_id:
                menu_recipes_sequence.append(r_id)

    if not menu_recipes_sequence:
        return True

    if not shopping_items:
        return False

    admitted_recipes = catalog_service.get_released_recipes()
    admitted_ids = {r.get("id") for r in admitted_recipes if r.get("id")}
    for rid in set(menu_recipes_sequence):
        if rid not in admitted_ids:
            return False

    multiplier = max(1, shopping_batches)
    expected_groups: dict[str, dict[str, Any]] = {}
    menu_titles: set[str] = set()

    for rid in menu_recipes_sequence:
        r = catalog_service.get_recipe_by_id(rid)
        if not r:
            return False
        title = r.get("title")
        if title:
            menu_titles.add(title)
        for ing in r.get("ing") or []:
            if isinstance(ing, (list, tuple)) and len(ing) >= 2:
                raw_name = str(ing[0]).strip()
                raw_amount = str(ing[1]).strip()
                if not raw_name or not raw_amount:
                    continue
                parsed = parse_amount(raw_amount)
                group_key = f"{raw_name.lower()}:{parsed.unit_type}:{parsed.base_unit}"
                if group_key not in expected_groups:
                    expected_groups[group_key] = {
                        "name": raw_name.lower(),
                        "unit_type": parsed.unit_type,
                        "base_unit": parsed.base_unit,
                        "total_value": 0.0,
                        "total_value_legacy": 0.0,
                        "is_text": parsed.is_text,
                        "text_label": parsed.text_label,
                        "linked_titles": set(),
                    }
                g = expected_groups[group_key]
                serv_raw = r.get("serv")
                try:
                    serv = float(serv_raw) if serv_raw is not None else 1.0
                except (ValueError, TypeError):
                    serv = 1.0
                portion_yield = parsed.value / (serv if serv > 0 else 1.0)
                g["total_value"] += portion_yield
                g["total_value_legacy"] += parsed.value
                if title:
                    g["linked_titles"].add(title)
                if parsed.text_label and not g.get("text_label"):
                    g["text_label"] = parsed.text_label

    canonical_items: list[dict[str, Any]] = []
    for it in shopping_items:
        it_id = str(it.get("id", ""))
        if it_id.startswith("shop-custom-"):
            continue
        canonical_items.append(it)

    shopping_titles: set[str] = set()
    for it in canonical_items:
        for t in it.get("linkedRecipeTitles") or []:
            shopping_titles.add(t)

    if menu_titles != shopping_titles:
        return False

    if len(canonical_items) != len(expected_groups):
        return False

    matched_group_keys: set[str] = set()
    portion_consistent = True
    legacy_consistent = True

    for it in canonical_items:
        it_name = str(it.get("name", "")).strip().lower()
        amount_label = str(it.get("amountLabel", "")).strip()
        parsed_it = parse_amount(amount_label)

        matched_key = None
        for key, g in expected_groups.items():
            if key in matched_group_keys:
                continue
            if g["name"] == it_name and g["unit_type"] == parsed_it.unit_type and g["base_unit"] == parsed_it.base_unit:
                matched_key = key
                break

        if not matched_key:
            return False

        g = expected_groups[matched_key]
        scaled_expected = g["total_value"] * multiplier
        scaled_expected_legacy = g["total_value_legacy"] * multiplier

        if not g["is_text"]:
            if abs(parsed_it.value - scaled_expected) > 0.15:
                portion_consistent = False
            if abs(parsed_it.value - scaled_expected_legacy) > 0.15:
                legacy_consistent = False

        matched_group_keys.add(matched_key)

    if len(matched_group_keys) != len(expected_groups):
        return False

    return portion_consistent or legacy_consistent
