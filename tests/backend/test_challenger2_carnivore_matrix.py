"""
tests/backend/test_challenger2_carnivore_matrix.py — Empirical Challenger 2 backend probe:
Full cross-matrix verification of candidate carnivore recipes c1..c16 against
dairy, eggs, fish, and offal restrictions in Python (bot.recipe_eligibility),
ensuring 100% parity with TypeScript frontend eligibility rules.
"""
import unittest
from typing import Dict, List, Any

from bot.recipe_eligibility import is_recipe_allowed

# The 16 carnivore candidate recipes from src/data/carnivoreDraftRecipes.ts
CARNIVORE_CANDIDATE_RECIPES = [
    {"id": "c1", "title": "Стейк на сковороде с топлёным маслом", "mode": "carnivore", "time": 15, "ing": [["Стейк рибай", "1 шт"], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по желанию"]]},
    {"id": "c2", "title": "Говяжьи котлеты без хлеба и лука", "mode": "carnivore", "time": 25, "ing": [["Фарш говяжий", "600 г"], ["Яйца", "1 шт"], ["Специи и соль", "по вкусу"], ["Топлёное масло", "1 ст. л."]]},
    {"id": "c3", "title": "Запечённая курица целиком", "mode": "carnivore", "time": 80, "ing": [["Курица целая", "1 шт"], ["Топлёное масло", "2 ст. л."], ["Специи и соль", "по вкусу"]]},
    {"id": "c4", "title": "Куриные сердечки на сковороде", "mode": "carnivore", "time": 20, "ing": [["Куриные сердечки", "400 г"], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по вкусу"]]},
    {"id": "c5", "title": "Говяжья печень со сметаной", "mode": "carnivore", "time": 20, "ing": [["Говяжья печень", "400 г"], ["Сметана", "3 ст. л."], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по вкусу"]]},
    {"id": "c6", "title": "Лосось на пару с топлёным маслом", "mode": "carnivore", "time": 20, "ing": [["Сёмга", "2 стейка"], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по желанию"]]},
    {"id": "c7", "title": "Говядина долгого тушения «рваное мясо»", "mode": "carnivore", "time": 180, "ing": [["Говядина", "1 кг"], ["Специи и соль", "по вкусу"], ["Костный бульон", "300 мл"]]},
    {"id": "c8", "title": "Яичница на сале", "mode": "carnivore", "time": 10, "ing": [["Яйца", "3 шт"], ["Сало", "40 г"], ["Специи и соль", "по вкусу"]]},
    {"id": "c9", "title": "Запечённая скумбрия (карнивор-версия)", "mode": "carnivore", "time": 30, "ing": [["Скумбрия", "2 шт"], ["Специи и соль", "по вкусу"]]},
    {"id": "c10", "title": "Куриные бёдра на противне", "mode": "carnivore", "time": 45, "ing": [["Куриные бёдра", "800 г"], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по вкусу"]]},
    {"id": "c11", "title": "Говяжий фарш с яйцом и маслом", "mode": "carnivore", "time": 15, "ing": [["Фарш говяжий", "400 г"], ["Яйца", "2 шт"], ["Сливочное масло", "30 г"], ["Специи и соль", "по вкусу"]]},
    {"id": "c12", "title": "Костный бульон длительного томления", "mode": "carnivore", "time": 240, "ing": [["Костный бульон", "1,5 л"], ["Специи и соль", "по вкусу"]]},
    {"id": "c13", "title": "Рыбные котлеты из консервов", "mode": "carnivore", "time": 25, "ing": [["Тунец консервированный", "2 банки"], ["Яйца", "2 шт"], ["Специи и соль", "по вкусу"], ["Топлёное масло", "1 ст. л."]]},
    {"id": "c14", "title": "Запечённые говяжьи сердечки", "mode": "carnivore", "time": 40, "ing": [["Говяжьи сердца", "600 г"], ["Топлёное масло", "1 ст. л."], ["Специи и соль", "по вкусу"]]},
    {"id": "c15", "title": "Утиные ножки конфи в собственном жиру", "mode": "carnivore", "time": 150, "ing": [["Утка", "3 ножки"], ["Специи и соль", "по вкусу"]]},
    {"id": "c16", "title": "Мясная нарезка и яйца вкрутую (перекус)", "mode": "carnivore", "time": 10, "ing": [["Яйца", "2 шт"], ["Бекон", "60 г"], ["Сыр твёрдый", "40 г"]]},
]

CLASSIFICATION = {
    "c1":  {"dairy": True,  "eggs": False, "fish": False, "offal": False},
    "c2":  {"dairy": True,  "eggs": True,  "fish": False, "offal": False},
    "c3":  {"dairy": True,  "eggs": False, "fish": False, "offal": False},
    "c4":  {"dairy": True,  "eggs": False, "fish": False, "offal": True },
    "c5":  {"dairy": True,  "eggs": False, "fish": False, "offal": True },
    "c6":  {"dairy": True,  "eggs": False, "fish": True,  "offal": False},
    "c7":  {"dairy": False, "eggs": False, "fish": False, "offal": True },
    "c8":  {"dairy": False, "eggs": True,  "fish": False, "offal": False},
    "c9":  {"dairy": False, "eggs": False, "fish": True,  "offal": False},
    "c10": {"dairy": True,  "eggs": False, "fish": False, "offal": False},
    "c11": {"dairy": True,  "eggs": True,  "fish": False, "offal": False},
    "c12": {"dairy": False, "eggs": False, "fish": False, "offal": True },
    "c13": {"dairy": True,  "eggs": True,  "fish": True,  "offal": False},
    "c14": {"dairy": True,  "eggs": False, "fish": False, "offal": True },
    "c15": {"dairy": False, "eggs": False, "fish": False, "offal": False},
    "c16": {"dairy": True,  "eggs": True,  "fish": False, "offal": False},
}


class TestChallenger2CarnivoreMatrix(unittest.TestCase):
    def test_single_restrictions_ground_truth(self):
        for recipe in CARNIVORE_CANDIDATE_RECIPES:
            rid = recipe["id"]
            cls = CLASSIFICATION[rid]

            # Dairy
            prof_dairy = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_dairy"], "prepTimeMax": 300}}
            allowed_dairy, _ = is_recipe_allowed(recipe, prof_dairy)
            self.assertEqual(allowed_dairy, not cls["dairy"], f"{rid} ({recipe['title']}) dairy mismatch")

            # Eggs
            prof_eggs = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_eggs"], "prepTimeMax": 300}}
            allowed_eggs, _ = is_recipe_allowed(recipe, prof_eggs)
            self.assertEqual(allowed_eggs, not cls["eggs"], f"{rid} ({recipe['title']}) eggs mismatch")

            # Fish
            prof_fish = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_fish"], "prepTimeMax": 300}}
            allowed_fish, _ = is_recipe_allowed(recipe, prof_fish)
            self.assertEqual(allowed_fish, not cls["fish"], f"{rid} ({recipe['title']}) fish mismatch")

            # Offal
            prof_offal = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_offal"], "prepTimeMax": 300}}
            allowed_offal, _ = is_recipe_allowed(recipe, prof_offal)
            self.assertEqual(allowed_offal, not cls["offal"], f"{rid} ({recipe['title']}) offal mismatch")

    def test_all_16_combinations(self):
        flags = [False, True]
        combinations_tested = 0

        for restr_dairy in flags:
            for restr_eggs in flags:
                for restr_fish in flags:
                    for restr_offal in flags:
                        combinations_tested += 1
                        restrictions = []
                        if restr_dairy:
                            restrictions.append("exclude_dairy")
                        if restr_eggs:
                            restrictions.append("exclude_eggs")
                        if restr_fish:
                            restrictions.append("exclude_fish")
                        if restr_offal:
                            restrictions.append("exclude_offal")

                        profile = {
                            "settings": {
                                "confirmed18Plus": True,
                                "approach": "carnivore",
                                "restrictions": restrictions,
                                "prepTimeMax": 300,
                            }
                        }

                        expected_ids = []
                        for rid, cls in CLASSIFICATION.items():
                            if restr_dairy and cls["dairy"]:
                                continue
                            if restr_eggs and cls["eggs"]:
                                continue
                            if restr_fish and cls["fish"]:
                                continue
                            if restr_offal and cls["offal"]:
                                continue
                            expected_ids.append(rid)

                        actual_ids = [
                            r["id"]
                            for r in CARNIVORE_CANDIDATE_RECIPES
                            if is_recipe_allowed(r, profile)[0]
                        ]

                        self.assertEqual(
                            sorted(actual_ids),
                            sorted(expected_ids),
                            f"Mismatch for restrictions={restrictions}",
                        )

        self.assertEqual(combinations_tested, 16)

    def test_c4_chicken_hearts_specifically_excluded_by_offal(self):
        c4 = next(r for r in CARNIVORE_CANDIDATE_RECIPES if r["id"] == "c4")
        self.assertEqual(c4["title"], "Куриные сердечки на сковороде")

        # Must be blocked by exclude_offal
        prof = {"settings": {"confirmed18Plus": True, "approach": "carnivore", "restrictions": ["exclude_offal"], "prepTimeMax": 60}}
        allowed, reason = is_recipe_allowed(c4, prof)
        self.assertFalse(allowed, "c4 must be excluded when offal is restricted")
        self.assertIn("Куриные сердечки", reason)
        self.assertIn("субпродукты", reason)

    def test_impossible_combination_leaves_only_c15(self):
        prof = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "carnivore",
                "restrictions": ["exclude_dairy", "exclude_eggs", "exclude_fish", "exclude_offal"],
                "prepTimeMax": 300,
            }
        }
        allowed_recipes = [r["id"] for r in CARNIVORE_CANDIDATE_RECIPES if is_recipe_allowed(r, prof)[0]]
        self.assertEqual(allowed_recipes, ["c15"], "Only c15 (duck confit) remains when all 4 are restricted")


if __name__ == "__main__":
    unittest.main()
