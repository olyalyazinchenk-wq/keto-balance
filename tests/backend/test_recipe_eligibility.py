"""
tests/backend/test_recipe_eligibility.py — Модульные тесты серверной проверки совместимости рецептов.
Проверка исключения яиц, молочных продуктов, рыбы, свинины, растительного молока, сырокопчёного мяса.
"""
import unittest
from bot.recipe_eligibility import (
    is_recipe_allowed,
    is_menu_compatible_with_profile,
    normalize_str,
    ingredient_has_allergen,
    ingredient_has_disliked,
)

class DummyCatalog:
    def __init__(self, recipes):
        self.recipes = recipes

    def get_released_recipes(self):
        return self.recipes

    def get_recipe_by_id(self, rid):
        for r in self.recipes:
            if r.get("id") == rid:
                return r
        return None

class TestRecipeEligibility(unittest.TestCase):
    def test_normalize_str(self):
        self.assertEqual(normalize_str("Сыр твёрдый, 40 г!"), "сыр твердый 40 г")
        self.assertEqual(normalize_str("Топлёное масло"), "топленое масло")
        self.assertEqual(normalize_str("  Бекон   сырокопчёный  "), "бекон сырокопченый")

    def test_exclude_eggs(self):
        egg_recipe = {
            "id": "r_egg",
            "title": "Яичница",
            "mode": "keto",
            "time": 10,
            "ing": [["Яйца куриные", "3 шт"], ["Оливковое масло", "1 ст. л."]],
        }
        no_egg_recipe = {
            "id": "r_no_egg",
            "title": "Курица с кабачками",
            "mode": "keto",
            "time": 15,
            "ing": [["Куриное филе", "200 г"], ["Кабачки", "150 г"]],
        }
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_eggs"], "prepTimeMax": 30}}

        allowed_egg, reason_egg = is_recipe_allowed(egg_recipe, profile)
        self.assertFalse(allowed_egg)
        self.assertIn("eggs", reason_egg)

        allowed_no_egg, reason_no_egg = is_recipe_allowed(no_egg_recipe, profile)
        self.assertTrue(allowed_no_egg)
        self.assertEqual(reason_no_egg, "")

    def test_exclude_dairy_keywords_and_ghee(self):
        dairy_recipes = [
            ("r_cheese", "Сыр твёрдый"),
            ("r_butter", "Сливочное масло"),
            ("r_cream", "Сливки 33%"),
            ("r_sour_cream", "Сметана 20%"),
            ("r_cottage", "Творог 5%"),
            ("r_mozzarella", "Моцарелла"),
            ("r_ghee", "Топлёное масло (гхи)"),
            ("r_parmesan", "Пармезан"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}

        for rid, ing_name in dairy_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 10,
                "ing": [[ing_name, "50 г"], ["Огурец", "100 г"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertFalse(allowed, f"Recipe with '{ing_name}' must be blocked for exclude_dairy")
            self.assertIn("dairy", reason)

    def test_exclude_dairy_plant_milk_no_false_positive(self):
        # Чистое растительное молоко (кокосовое, миндальное) НЕ должно блокироваться по exclude_dairy
        plant_milk_recipes = [
            ("r_coco_milk", "Кокосовое молоко 17%"),
            ("r_almond_milk", "Миндальное молоко без сахара"),
            ("r_plant_milk", "Растительное молоко"),
            ("r_coco_cream", "Кокосовые сливки"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}

        for rid, ing_name in plant_milk_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 10,
                "ing": [[ing_name, "100 мл"], ["Семена чиа", "30 г"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertTrue(allowed, f"Recipe with '{ing_name}' must be allowed for exclude_dairy (no false positive), reason: {reason}")

    def test_exclude_dairy_compound_plant_milk_with_dairy_additives_blocked(self):
        # Растительное молоко с молочными добавками (сухое коровье молоко, молочная сыворотка, казеин) ОБЯЗАНО блокироваться
        forbidden_compound_recipes = [
            ("r_coco_cow", "Кокосовое молоко с сухим коровьим молоком"),
            ("r_almond_whey", "Миндальное молоко с молочной сывороткой"),
            ("r_coco_butter", "Кокосовые сливки со сливочным маслом"),
            ("r_coco_casein", "Кокосовое молоко с казеинатом натрия"),
            ("r_plant_whey", "Растительное молоко с молочной сывороткой"),
            ("r_coco_sour_cream", "Кокосовое молоко со сметаной"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}

        for rid, ing_name in forbidden_compound_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 10,
                "ing": [[ing_name, "100 мл"], ["Семена чиа", "30 г"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertFalse(allowed, f"Compound ingredient '{ing_name}' must be blocked for exclude_dairy")
            self.assertIn("dairy", reason)

    def test_ambiguous_composition_blocked_until_clarified(self):
        # При неоднозначном или неуточнённом составе рецепт блокируется до выяснения
        ambiguous_recipes = [
            ("r_ambig_1", "Растительное молоко [уточнить состав]"),
            ("r_ambig_2", "Кокосовый напиток (неоднозначный состав)"),
            ("r_ambig_3", "Смесь растительная непроверенная"),
            ("r_ambig_4", "Молочный напиток (состав уточняется)"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}

        for rid, ing_name in ambiguous_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 10,
                "ing": [[ing_name, "100 мл"], ["Орехи", "20 г"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertFalse(allowed, f"Ambiguous recipe '{ing_name}' must be blocked until clarified")

    def test_exclude_dairy_cured_meat_no_false_positive(self):
        # Сырокопчёное и сыровяленое мясо содержит корень 'сыр', но НЕ является сыром
        cured_meat_recipes = [
            ("r_bacon_cured", "Бекон сырокопчёный"),
            ("r_sausage_cured", "Колбаса сыровяленая"),
            ("r_beef_cured", "Сыровяленая говядина"),
            ("r_raw_mince", "Сырой фарш говяжий"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}

        for rid, ing_name in cured_meat_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 10,
                "ing": [[ing_name, "80 г"], ["Оливковое масло", "10 г"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertTrue(allowed, f"Recipe with '{ing_name}' must not trigger false positive dairy allergy, reason: {reason}")

    def test_exclude_fish(self):
        fish_recipes = [
            ("r_salmon", "Сёмга запечённая"),
            ("r_mackerel", "Скумбрия на гриле"),
            ("r_tuna", "Тунец консервированный"),
            ("r_cod", "Треска на пару"),
            ("r_trout", "Форель слабосолёная"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_fish"], "prepTimeMax": 30}}

        for rid, ing_name in fish_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 15,
                "ing": [[ing_name, "150 г"], ["Лимонный сок", "1 ст. л."]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertFalse(allowed, f"Recipe with '{ing_name}' must be blocked for exclude_fish")
            self.assertIn("fish", reason)

    def test_exclude_pork(self):
        pork_recipes = [
            ("r_pork_chop", "Свиная отбивная"),
            ("r_bacon", "Бекон"),
            ("r_cured_bacon", "Бекон сырокопчёный"),
            ("r_lard", "Сало свиное"),
            ("r_ham", "Ветчина"),
            ("r_belly", "Грудинка свиная"),
        ]
        non_pork_recipes = [
            ("r_beef", "Говядина запечённая"),
            ("r_chicken", "Куриное филе"),
            ("r_turkey", "Филе индейки"),
            ("r_duck", "Утиная грудка"),
        ]
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_pork"], "prepTimeMax": 30}}

        for rid, ing_name in pork_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 15,
                "ing": [[ing_name, "150 г"], ["Соль", "по вкусу"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertFalse(allowed, f"Recipe with '{ing_name}' must be blocked for exclude_pork")
            self.assertIn("свинина", reason)

        for rid, ing_name in non_pork_recipes:
            recipe = {
                "id": rid,
                "title": f"Блюдо с {ing_name}",
                "mode": "keto",
                "time": 15,
                "ing": [[ing_name, "150 г"], ["Соль", "по вкусу"]],
            }
            allowed, reason = is_recipe_allowed(recipe, profile)
            self.assertTrue(allowed, f"Recipe with '{ing_name}' must be allowed for exclude_pork")

    def test_exclude_mushrooms_and_offal(self):
        mushroom_recipe = {
            "id": "r_mush",
            "title": "Грибы жареные",
            "mode": "keto",
            "time": 15,
            "ing": [["Шампиньоны свежие", "150 г"], ["Оливковое масло", "1 ст. л."]],
        }
        offal_recipe = {
            "id": "r_offal",
            "title": "Печень говяжья",
            "mode": "keto",
            "time": 15,
            "ing": [["Печень говяжья", "150 г"], ["Оливковое масло", "1 ст. л."]],
        }

        prof_mush = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_mushrooms"], "prepTimeMax": 30}}
        prof_offal = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_offal"], "prepTimeMax": 30}}

        self.assertFalse(is_recipe_allowed(mushroom_recipe, prof_mush)[0])
        self.assertTrue(is_recipe_allowed(offal_recipe, prof_mush)[0])

        self.assertFalse(is_recipe_allowed(offal_recipe, prof_offal)[0])
        self.assertTrue(is_recipe_allowed(mushroom_recipe, prof_offal)[0])

    def test_russian_morphology_stems_and_offal_variants(self):
        prof_offal = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_offal"], "prepTimeMax": 60}}

        # Offal: "сердечки" (c4), "сердца" (c14), "сердец", "печень" (c5), "печенка", "костный бульон" (c12), "бульон костный"
        offal_cases = [
            ("r_hearts", "Куриные сердечки на сковороде", [["Куриные сердечки", "400 г"]]),
            ("r_beef_hearts", "Говяжьи сердца тушёные", [["Говяжьи сердца", "300 г"]]),
            ("r_hearts_gen", "Сердечки куриные", [["500 г куриных сердец", "500 г"]]),
            ("r_liver", "Говяжья печень с луком", [["Говяжья печень", "250 г"]]),
            ("r_liver_dim", "Печёнка куриная", [["Печёнка куриная", "200 г"]]),
            ("r_bone_broth", "Костный бульон", [["Костный бульон говяжий", "500 мл"]]),
            ("r_broth_inverted", "Бульон на костях", [["Бульон костный", "400 мл"]]),
        ]
        for rid, title, ing in offal_cases:
            recipe = {"id": rid, "title": title, "mode": "carnivore", "time": 30, "ing": ing}
            allowed, reason = is_recipe_allowed(recipe, prof_offal)
            self.assertFalse(allowed, f"Offal recipe '{title}' must be blocked: got allowed={allowed}")

        # Non-offal recipes must remain allowed
        non_offal_cases = [
            ("r_ribeye", "Стейк рибай", [["Говяжий стейк рибай", "350 г"], ["Соль", "по вкусу"]]),
            ("r_pork", "Свиная корейка", [["Свиная корейка", "300 г"], ["Топлёное масло", "1 ст. л."]]),
        ]
        for rid, title, ing in non_offal_cases:
            recipe = {"id": rid, "title": title, "mode": "carnivore", "time": 20, "ing": ing}
            allowed, _ = is_recipe_allowed(recipe, prof_offal)
            self.assertTrue(allowed, f"Non-offal recipe '{title}' must remain allowed")

        # Allergens: fish, dairy, nuts morphological stems
        prof_fish = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_fish"], "prepTimeMax": 30}}
        fish_stems = [
            ("r_tuna", "Филе тунца", [["Филе тунца", "200 г"]]),
            ("r_pollock", "Филе минтая", [["Филе минтая", "250 г"]]),
            ("r_herring", "Селедочный паштет", [["Селедка слабосоленая", "150 г"]]),
        ]
        for rid, title, ing in fish_stems:
            recipe = {"id": rid, "title": title, "mode": "keto", "time": 15, "ing": ing}
            allowed, _ = is_recipe_allowed(recipe, prof_fish)
            self.assertFalse(allowed, f"Fish recipe '{title}' must be blocked")

        prof_dairy = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_dairy"], "prepTimeMax": 30}}
        dairy_stems = [
            ("r_tvorog", "Творожная запеканка", [["Творожная масса", "200 г"]]),
            ("r_whey", "Сывороточный коктейль", [["Сывороточный протеин", "30 г"]]),
        ]
        for rid, title, ing in dairy_stems:
            recipe = {"id": rid, "title": title, "mode": "keto", "time": 15, "ing": ing}
            allowed, _ = is_recipe_allowed(recipe, prof_dairy)
            self.assertFalse(allowed, f"Dairy recipe '{title}' must be blocked")

        prof_nuts = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": ["exclude_nuts"], "prepTimeMax": 30}}
        nut_stems = [
            ("r_hazelnut", "Фундучное печенье", [["Фундучная мука", "50 г"]]),
            ("r_nuts_dim", "Салат с орешками", [["Орешки кедровые", "30 г"]]),
            ("r_pistachio", "Фисташковый перекус", [["Фисташки очищенные", "40 г"]]),
        ]
        for rid, title, ing in nut_stems:
            recipe = {"id": rid, "title": title, "mode": "keto", "time": 15, "ing": ing}
            allowed, _ = is_recipe_allowed(recipe, prof_nuts)
            self.assertFalse(allowed, f"Nut recipe '{title}' must be blocked")

    def test_prep_time_limit(self):
        slow_recipe = {
            "id": "r_slow",
            "title": "Долгое блюдо",
            "mode": "keto",
            "time": 45,
            "ing": [["Говядина", "200 г"]],
        }
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 20}}
        allowed, reason = is_recipe_allowed(slow_recipe, profile)
        self.assertFalse(allowed)
        self.assertIn("превышает лимит", reason)

    def test_menu_duplicate_slots_forbidden(self):
        r1 = {"id": "r1", "title": "Блюдо 1", "mode": "keto", "time": 10, "ing": [["Говядина", "100 г"]]}
        catalog = DummyCatalog([r1])
        profile = {"settings": {"confirmed18Plus": True, "approach": "keto", "restrictions": [], "prepTimeMax": 30}}

        dup_menu = {
            "days": [
                {"date": "2026-11-05", "slots": {"breakfast": "r1", "lunch": "r1"}}
            ]
        }
        compatible, reason = is_menu_compatible_with_profile(dup_menu, profile, catalog)
        self.assertFalse(compatible)
        self.assertIn("Повторяющиеся блюда", reason)

if __name__ == "__main__":
    unittest.main()
