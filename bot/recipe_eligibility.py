"""
bot/recipe_eligibility.py — Серверная проверка совместимости рецептов и меню с ограничениями пользователя.
Строго синхронизировано с src/domain/eligibility.ts и src/adapters/pilotState.ts.
"""
import re
from typing import Any, Dict, List, Optional, Tuple, Union

# Маппинг токенов ограничений в канонические поля и значения
RESTRICTION_MAP: Dict[str, Tuple[str, str]] = {
    "exclude_eggs": ("allergies", "яйца"),
    "exclude_dairy": ("allergies", "молочные продукты"),
    "exclude_fish": ("allergies", "рыба"),
    "exclude_nuts": ("allergies", "орехи"),
    "exclude_offal": ("disliked", "субпродукты"),
    "exclude_mushrooms": ("disliked", "грибы"),
    "exclude_pork": ("disliked", "свинина"),
    "no_eggs": ("allergies", "яйца"),
    "no_dairy": ("allergies", "молочные продукты"),
    "no_fish": ("allergies", "рыба"),
    "no_nuts": ("allergies", "орехи"),
    "no_offal": ("disliked", "субпродукты"),
    "no_mushrooms": ("disliked", "грибы"),
    "no_pork": ("disliked", "свинина"),
}

KNOWN_ALLERGY_MAP: Dict[str, str] = {
    "яйца": "eggs",
    "яйцо": "eggs",
    "яйца куриные": "eggs",
    "яица": "eggs",
    "яицо": "eggs",
    "яичные": "eggs",
    "яица куриные": "eggs",
    "egg": "eggs",
    "eggs": "eggs",

    "молочные продукты": "dairy",
    "молочные": "dairy",
    "молочка": "dairy",
    "молоко": "dairy",
    "лактоза": "dairy",
    "dairy": "dairy",
    "milk": "dairy",

    "рыба": "fish",
    "рыбные продукты": "fish",
    "рыбные": "fish",
    "fish": "fish",

    "орехи": "nuts",
    "орех": "nuts",
    "nuts": "nuts",
    "nut": "nuts",
}

DAIRY_KEYWORDS: List[str] = [
    "сыр",
    "сливк",
    "сметан",
    "творог",
    "моцарелл",
    "сливочное масло",
    "сливочн",
    "топленое масло",
    "топлен",
    "гхи",
    "молок",
    "молочн",
    "коровь",
    "козь",
    "овечь",
    "лактоз",
    "маскарпон",
    "пармезан",
    "рикотт",
    "сулугун",
    "брынз",
    "йогурт",
    "кефир",
    "ряженк",
    "сыворотк",
    "казеин",
    "простокваш",
    "ацидофил",
    "пахта",
]

PLANT_MILK_PATTERNS: List[str] = [
    r"кокосов[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*|масл[а-яё]*|мук[а-яё]*|стружк[а-яё]*|урбеч[а-яё]*)",
    r"миндальн[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*|масл[а-яё]*|мук[а-яё]*|паст[а-яё]*)",
    r"растительн[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*|масл[а-яё]*)",
    r"соев[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*|масл[а-яё]*)",
    r"овсян[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*)",
    r"кедров[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*)",
    r"фундучн[а-яё]*\s+(?:молок[а-яё]*|сливк[а-яё]*)",
    r"маков[а-яё]*\s+(?:молок[а-яё]*)",
    r"кунжутн[а-яё]*\s+(?:молок[а-яё]*)",
]

FISH_KEYWORDS: List[str] = [
    "горбуш",
    "скумбри",
    "семг",
    "тунец",
    "рыб",
    "лосос",
    "треск",
    "форел",
    "минтай",
    "сельд",
    "селедк",
    "шпрот",
    "сардин",
]

NUTS_KEYWORDS: List[str] = [
    "орех",
    "миндал",
    "фундук",
    "кешью",
    "пекан",
    "грецк",
    "арахис",
    "фисташк",
    "макадам",
]

def normalize_str(s: str) -> str:
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[^a-zа-я0-9]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def contains_any_keyword(text: str, keywords: List[str]) -> bool:
    return any(kw in text for kw in keywords)

def ingredient_has_allergen(ing_norm: str, cat: str) -> bool:
    if cat == "eggs":
        return "яиц" in ing_norm or "яичн" in ing_norm or "яйц" in ing_norm

    elif cat == "dairy":
        # 1. Убираем "сырокопчёный", "сыровяленый", "сырой" (сырой/необработанный, а не молочный сыр)
        dairy_inspect = re.sub(r"сырокопч[её]н[а-яё]*", " ", ing_norm)
        dairy_inspect = re.sub(r"сыровял[её]н[а-яё]*", " ", dairy_inspect)
        dairy_inspect = re.sub(r"(?:^|\s)сыр(ой|ая|ое|ые|ого|ую|ым|ых|ому)(?=$|\s)", " ", dairy_inspect)

        # 2. Убираем признанные формы чистого растительного молока/сливок/масла/муки
        for pattern in PLANT_MILK_PATTERNS:
            dairy_inspect = re.sub(pattern, " ", dairy_inspect)

        # 3. Проверяем остаток на любые молочные компоненты (включая сухое молоко, коровье молоко, сыворотку, казеин)
        return contains_any_keyword(dairy_inspect, DAIRY_KEYWORDS)

    elif cat == "fish":
        return contains_any_keyword(ing_norm, FISH_KEYWORDS)

    elif cat == "nuts":
        return contains_any_keyword(ing_norm, NUTS_KEYWORDS)

    return False

def ingredient_has_disliked(ing_norm: str, dis_norm: str) -> bool:
    if dis_norm in ("печень и субпродукты", "субпродукты", "печень"):
        return any(k in ing_norm for k in ("печень", "сердц", "субпродукт", "костный бульон"))
    elif dis_norm in ("грибы", "гриб"):
        return "гриб" in ing_norm or "шампиньон" in ing_norm
    elif dis_norm == "рыба":
        return contains_any_keyword(ing_norm, FISH_KEYWORDS)
    elif dis_norm == "авокадо":
        return "авокадо" in ing_norm
    elif dis_norm == "брокколи":
        return "брокколи" in ing_norm
    elif dis_norm == "лук":
        return ing_norm == "лук" or ing_norm.startswith("лук ") or " лук" in ing_norm
    elif dis_norm in ("болгарский перец", "перец"):
        return "болгарский перец" in ing_norm or "перец болгарский" in ing_norm
    elif dis_norm in ("морепродукты", "морепродукт"):
        return any(k in ing_norm for k in ("креветк", "кальмар", "миди", "осьминог", "гребешк", "морепродукт"))
    elif dis_norm in ("свинина", "свиной"):
        return any(k in ing_norm for k in ("свинин", "свин", "бекон", "сало", "ветчин", "грудинк"))
    return dis_norm in ing_norm

def extract_profile_rules(profile: Any) -> Dict[str, Any]:
    rules: Dict[str, Any] = {
        "approach": None,
        "prep_time_max": None,
        "allergies": [],
        "disliked": [],
        "allergy_note": "",
    }
    if profile is None:
        return rules

    if hasattr(profile, "model_dump"):
        p_dict = profile.model_dump()
    elif isinstance(profile, dict):
        p_dict = profile
    else:
        p_dict = {}

    settings = p_dict.get("settings")
    if settings and isinstance(settings, dict):
        rules["approach"] = settings.get("approach")
        rules["prep_time_max"] = settings.get("prepTimeMax")
        restrictions = settings.get("restrictions") or []
        for token in restrictions:
            token_str = str(token)
            if token_str in RESTRICTION_MAP:
                field, val = RESTRICTION_MAP[token_str]
                if field == "allergies":
                    if val not in rules["allergies"]:
                        rules["allergies"].append(val)
                elif field == "disliked":
                    if val not in rules["disliked"]:
                        rules["disliked"].append(val)

    if "allergies" in p_dict and isinstance(p_dict["allergies"], list):
        for a in p_dict["allergies"]:
            if a and a not in rules["allergies"]:
                rules["allergies"].append(a)
    if "disliked" in p_dict and isinstance(p_dict["disliked"], list):
        for d in p_dict["disliked"]:
            if d and d not in rules["disliked"]:
                rules["disliked"].append(d)
    if "allergyNote" in p_dict:
        rules["allergy_note"] = p_dict.get("allergyNote") or ""
    elif "allergy_note" in p_dict:
        rules["allergy_note"] = p_dict.get("allergy_note") or ""

    return rules

def is_recipe_allowed(recipe: Dict[str, Any], profile: Any) -> Tuple[bool, str]:
    """
    Проверяет, подходит ли рецепт под ограничения профиля.
    Возвращает (True, "") или (False, причина).
    """
    if not isinstance(recipe, dict) or not recipe.get("id"):
        return False, "Некорректный рецепт"

    if profile is None:
        return True, ""

    rules = extract_profile_rules(profile)

    # 1. Неуточнённые индивидуальные аллергии
    allergy_note = rules.get("allergy_note")
    if allergy_note and str(allergy_note).strip():
        return False, "Неуточнённая заметка об аллергии блокирует автоподбор"

    # 2. Лимит времени приготовления
    prep_max = rules.get("prep_time_max")
    if prep_max is not None and prep_max > 0:
        r_time = recipe.get("time")
        if r_time is not None and r_time > prep_max:
            return False, f"Время приготовления ({r_time} мин) превышает лимит ({prep_max} мин)"

    # 3. Режим питания
    approach = rules.get("approach")
    if approach == "explore":
        return False, "Режим ознакомления ('explore') не формирует персональное меню"
    elif approach in ("keto", "carnivore"):
        r_mode = recipe.get("mode")
        if r_mode and r_mode != approach:
            return False, f"Режим рецепта '{r_mode}' не совпадает с профилем '{approach}'"

    # 4. Активные категории аллергий
    active_categories: List[str] = []
    for raw_a in rules.get("allergies", []):
        norm_a = normalize_str(str(raw_a))
        if not norm_a:
            continue
        cat = KNOWN_ALLERGY_MAP.get(norm_a)
        if not cat:
            return False, f"Неизвестная аллергия '{raw_a}' блокирует автоподбор"
        if cat not in active_categories:
            active_categories.append(cat)

    norm_disliked = [normalize_str(str(d)) for d in rules.get("disliked", []) if d]

    # 5. Проверка состава ингредиентов
    ing_list = recipe.get("ing") or []
    if not ing_list:
        return False, "Рецепт без ингредиентов"

    for item in ing_list:
        if isinstance(item, (list, tuple)) and len(item) > 0:
            ing_name = str(item[0])
        else:
            ing_name = str(item)

        ing_norm = normalize_str(ing_name)
        if not ing_norm:
            continue

        if active_categories:
            if any(w in ing_norm for w in ("неизвестн", "состав", "непроверен", "не проверен", "секретн", "уточнить", "уточняется", "неоднозначн")):
                return False, f"Ингредиент '{ing_name}' имеет неоднозначный или непроверенный состав"

        for cat in active_categories:
            if ingredient_has_allergen(ing_norm, cat):
                return False, f"Ингредиент '{ing_name}' содержит аллерген категории '{cat}'"

        for dis in norm_disliked:
            if ingredient_has_disliked(ing_norm, dis):
                return False, f"Ингредиент '{ing_name}' исключён по предпочтениям ('{dis}')"

    return True, ""

def is_menu_compatible_with_profile(
    menu: Any,
    profile: Any,
    catalog_service: Any,
    is_owner: bool = False
) -> Tuple[bool, str]:
    """
    Проверяет совместимость меню с каталогом и ограничениями пользователя.
    Возвращает (True, "") или (False, причина отклонения).
    """
    if menu is None:
        return True, ""

    if hasattr(menu, "days"):
        days = menu.days
    elif isinstance(menu, dict):
        days = menu.get("days", [])
    else:
        days = []

    if not days:
        return True, ""

    cat_id = getattr(menu, "catalog_id", None) if hasattr(menu, "catalog_id") else (menu.get("catalog_id") if isinstance(menu, dict) else None)
    try:
        admitted_recipes = catalog_service.get_released_recipes(catalog_id=cat_id, is_owner=is_owner)
    except TypeError:
        admitted_recipes = catalog_service.get_released_recipes()
    admitted_ids = {r.get("id") for r in admitted_recipes if r.get("id")}

    for day in days:
        if hasattr(day, "slots"):
            slots = day.slots
        elif isinstance(day, dict):
            slots = day.get("slots", {})
        else:
            slots = {}

        # Проверка отсутствия дубликатов блюд в рамках одного дня
        day_slot_ids = [r_id for r_id in slots.values() if r_id]
        if len(set(day_slot_ids)) != len(day_slot_ids):
            return False, "Повторяющиеся блюда в рамках одного дня запрещены"

        for slot_key, r_id in slots.items():
            if not r_id:
                continue
            if r_id not in admitted_ids:
                return False, f"Menu contains unreleased or unknown recipe ID: '{r_id}'"

            try:
                recipe = catalog_service.get_recipe_by_id(r_id, catalog_id=cat_id, is_owner=is_owner)
            except TypeError:
                recipe = catalog_service.get_recipe_by_id(r_id)
            if not recipe:
                return False, f"Menu contains unreleased or unknown recipe ID: '{r_id}'"

            allowed, reason = is_recipe_allowed(recipe, profile)
            if not allowed:
                return False, f"Menu contains recipe '{r_id}' incompatible with user restrictions: {reason}"

    return True, ""
