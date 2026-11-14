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

def catalog_is_public(data):
    status = data.get("editorial_status", "approved")
    return status in ("approved", "published", "released") or (status == "owner_review" and bool(data.get("public_released_ids")))


def _public_partition(data):
    """Every current/historical catalog uses the same admission rules."""
    if not catalog_is_public(data):
        return {**data, "recipes": [], "released_ids": [], "public_released_ids": []}
    public_ids = set(data.get("public_released_ids", data.get("released_ids", [])))
    review_ids = set(data.get("owner_review_ids", []))
    recipes = [r for r in data.get("recipes", []) if r.get("id") in public_ids
               and r.get("id") not in review_ids
               and r.get("editorial_status", "approved") in ("approved", "published", "released")]
    ids = {r.get("id") for r in recipes}
    return {**data, "recipes": recipes, "released_ids": [i for i in data.get("released_ids", []) if i in ids],
            "public_released_ids": [i for i in data.get("released_ids", []) if i in ids]}

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
        self._cached_owner_catalog: Optional[Dict[str, Any]] = None
        self._cached_public_catalog: Optional[Dict[str, Any]] = None

    def invalidate_cache(self) -> None:
        self._cached_catalog = None
        self._cached_owner_catalog = None
        self._cached_public_catalog = None

    def get_catalog_data(self, is_owner: bool = False) -> Dict[str, Any]:
        if is_owner:
            if self._cached_owner_catalog is not None:
                return self._cached_owner_catalog
        else:
            if self._cached_public_catalog is not None:
                return self._cached_public_catalog

        data: Dict[str, Any]
        if self.provider is not None:
            data = self.provider()
        elif is_owner:
            # Owner can read latest admin DB snapshot or fall back to static
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
                            "nutrition_status": "unverified",
                        }
                    else:
                        data = load_static_catalog(self.dist_dir, self.app_stage)
                except Exception:
                    data = load_static_catalog(self.dist_dir, self.app_stage)
            else:
                data = load_static_catalog(self.dist_dir, self.app_stage)
        else:
            # Non-owner must NEVER receive admin snapshots from DB
            static_cat = load_static_catalog(self.dist_dir, self.app_stage)
            if static_cat and static_cat.get("recipes"):
                data = static_cat
            elif self.db_path is not None and Path(self.db_path).is_file():
                # Fallback for headless test environments without dist artifacts (e.g. publication validation)
                try:
                    from bot.app_db import get_admin_catalog_version, get_catalog_snapshot
                    ver = get_admin_catalog_version(self.db_path)
                    snapshot = get_catalog_snapshot(ver, self.db_path)
                    if snapshot is not None and len(snapshot) > 0:
                        pub_recipes = [
                            r for r in snapshot
                            if r.get("editorial_status", "approved") in ("approved", "published", "released")
                        ]
                        pub_ids = [r.get("id") for r in pub_recipes if r.get("id")]
                        data = {
                            "schema_version": 1,
                            "catalog_id": f"released-catalog-v{ver}",
                            "catalog_version": ver,
                            "test_only": self.app_stage == "test",
                            "released_ids": pub_ids,
                            "public_released_ids": pub_ids,
                            "recipes": pub_recipes,
                            "nutrition_status": "unverified",
                        }
                    else:
                        data = load_static_catalog(self.dist_dir, self.app_stage)
                except Exception:
                    data = load_static_catalog(self.dist_dir, self.app_stage)
            else:
                data = load_static_catalog(self.dist_dir, self.app_stage)

        # Apply identical rules to all catalog versions; no ID-prefix exceptions.
        if not is_owner and data:
            filtered_data = _public_partition(data)
            self._cached_public_catalog = filtered_data
            return filtered_data

        if is_owner:
            self._cached_owner_catalog = data
        else:
            self._cached_public_catalog = data
        return data

    def get_catalog_data_for_version(self, catalog_id: Optional[str], is_owner: bool = False) -> Optional[Dict[str, Any]]:
        if not catalog_id or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", catalog_id):
            return None
        if catalog_id.startswith("admin-catalog-v"):
            try:
                ver = int(catalog_id.replace("admin-catalog-v", ""))
                if self.db_path is not None and Path(self.db_path).is_file():
                    from bot.app_db import get_catalog_snapshot
                    snapshot = get_catalog_snapshot(ver, self.db_path)
                    if snapshot is not None:
                        if not is_owner:
                            snapshot = [
                                r for r in snapshot
                                if r.get("editorial_status", "approved") in ("approved", "published", "released")
                            ]
                        released_ids = [r.get("id") for r in snapshot if r.get("id")]
                        return {
                            "schema_version": 1,
                            "catalog_id": catalog_id,
                            "catalog_version": ver,
                            "test_only": self.app_stage == "test",
                            "released_ids": released_ids,
                            "recipes": snapshot,
                            "nutrition_status": "unverified",
                        }
            except Exception:
                pass
            return None

        current = self.get_catalog_data(is_owner=is_owner)
        if current.get("catalog_id") == catalog_id:
            return current

        # Check static catalog from dist.
        static_data = load_static_catalog(self.dist_dir, self.app_stage)
        if static_data.get("catalog_id") == catalog_id:
            return static_data if is_owner else _public_partition(static_data)

        # Check versioned artifact in dist or catalogs/archive
        candidate_file = self.dist_dir / f"{catalog_id}.json"
        if not candidate_file.is_file():
            archive_candidate = self.dist_dir.parent / "catalogs" / "archive" / f"{catalog_id}.json"
            if archive_candidate.is_file():
                candidate_file = archive_candidate

        if candidate_file.is_file():
            try:
                hist_data = json.loads(candidate_file.read_text(encoding="utf-8"))
                if isinstance(hist_data, dict) and hist_data.get("catalog_id") == catalog_id:
                    return hist_data if is_owner else _public_partition(hist_data)
            except Exception:
                pass

        return None

    def list_catalogs(self, is_owner: bool = False) -> List[Dict[str, Any]]:
        candidates = {}
        archive_dir = self.dist_dir.parent / "catalogs" / "archive"
        for search_dir in [archive_dir, self.dist_dir]:
            if search_dir.is_dir():
                for f in search_dir.glob("*.json"):
                    if f.name == "released-catalog.json" or f.stem.startswith("synthetic-"):
                        continue
                    try:
                        cdata = json.loads(f.read_text(encoding="utf-8"))
                        if isinstance(cdata, dict) and "catalog_id" in cdata:
                            cid = cdata["catalog_id"]
                            if cid not in candidates:
                                candidates[cid] = cdata
                    except Exception:
                        pass

        result = []
        for cid in sorted(candidates.keys()):
            cdata = candidates[cid]
            is_draft = cdata.get("editorial_status") == "draft_for_owner_review"
            recipes_count = len(cdata.get("recipes", []))
            if not is_owner and "public_released_ids" in cdata:
                recipes_count = len(cdata.get("public_released_ids", []))
            result.append({
                "catalog_id": cid,
                "catalog_month": cdata.get("catalog_month"),
                "editorial_status": cdata.get("editorial_status", "approved"),
                "accessible": is_owner if is_draft else True,
                "total_recipes": recipes_count,
            })
        return result

    def get_released_recipes(self, catalog_id: Optional[str] = None, is_owner: bool = False) -> List[Dict[str, Any]]:
        if catalog_id is not None:
            data = self.get_catalog_data_for_version(catalog_id, is_owner=is_owner)
            if data is None:
                return []
        else:
            data = self.get_catalog_data(is_owner=is_owner)
        released_ids = set(data.get("released_ids", []))
        recipes = data.get("recipes", [])
        return [r for r in recipes if r.get("id") in released_ids]

    def get_recipe_by_id(self, recipe_id: str, catalog_id: Optional[str] = None, is_owner: bool = False) -> Optional[Dict[str, Any]]:
        if catalog_id is not None:
            data = self.get_catalog_data_for_version(catalog_id, is_owner=is_owner)
            if data is None:
                return None
        else:
            data = self.get_catalog_data(is_owner=is_owner)

        if data is None:
            return None

        released_ids = set(data.get("released_ids", []))
        if recipe_id not in released_ids:
            return None

        if not is_owner:
            if data.get("owner_review_ids") and recipe_id in set(data.get("owner_review_ids", [])):
                return None

        for r in data.get("recipes", []):
            if r.get("id") == recipe_id:
                if not is_owner and r.get("editorial_status", "approved") not in ("approved", "published", "released"):
                    return None
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
    is_owner: bool = False,
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

    cat_id = menu_data.get("catalog_id") if isinstance(menu_data, dict) else None
    try:
        admitted_recipes = catalog_service.get_released_recipes(catalog_id=cat_id, is_owner=is_owner)
    except TypeError:
        admitted_recipes = catalog_service.get_released_recipes()
    admitted_ids = {r.get("id") for r in admitted_recipes if r.get("id")}
    for rid in set(menu_recipes_sequence):
        if rid not in admitted_ids:
            return False

    multiplier = max(1, shopping_batches)
    expected_groups: dict[str, dict[str, Any]] = {}
    menu_titles: set[str] = set()

    for rid in menu_recipes_sequence:
        try:
            r = catalog_service.get_recipe_by_id(rid, catalog_id=cat_id, is_owner=is_owner)
        except TypeError:
            try:
                r = catalog_service.get_recipe_by_id(rid, catalog_id=cat_id)
            except TypeError:
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
