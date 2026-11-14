// tests/frontend/challenger2-carnivore-probe.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Challenger 2 — Empirical Carnivore Combinations, Catalog ID & Editorial Badge Probe', async (t) => {
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const { generateMenu } = loadTs('src/domain/menu.ts');
  const { createMenuController } = loadTs('src/adapters/menuController.ts');
  const { toRecipeViewModel } = loadTs('src/ui/food-first/recipesAdapter.ts');
  const { CARNIVORE_DRAFT_RECIPES } = loadTs('src/data/carnivoreDraftRecipes.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');

  assert.equal(CARNIVORE_DRAFT_RECIPES.length, 16, 'Must have exactly 16 candidate carnivore recipes');

  // Helper to extract all recipe IDs from a generated menu
  function getAllMenuRecipeIds(menu) {
    const ids = [];
    for (const day of menu.days) {
      for (const rid of Object.values(day.slots)) {
        ids.push(rid);
      }
    }
    return ids;
  }

  // Helper to verify no ingredients contain given forbidden substrings
  function assertNoForbiddenIngredients(menu, recipesMap, forbiddenKeywords, contextDesc) {
    for (const day of menu.days) {
      for (const [slot, rid] of Object.entries(day.slots)) {
        const recipe = recipesMap.get(rid);
        assert.ok(recipe, `Recipe ${rid} must exist in catalog`);
        for (const [ingName] of recipe.ing) {
          const lower = ingName.toLowerCase();
          for (const kw of forbiddenKeywords) {
            assert.ok(
              !lower.includes(kw),
              `[${contextDesc}] Recipe ${recipe.id} (${recipe.title}) in day ${day.date} slot ${slot} contains forbidden ingredient "${ingName}" (keyword "${kw}")`
            );
          }
        }
      }
    }
  }

  const recipesMap = new Map();
  for (const r of RECIPES) {
    recipesMap.set(r.id, r);
  }

  await t.test('Probe 1.1: Carnivore with Dairy restriction', () => {
    const profile = {
      allergies: ['Молочные продукты'],
      disliked: [],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter((r) => isRecipeAllowed(r, profile));
    const eligibleIds = eligible.map((r) => r.id);

    // Ghee / butter / sour cream / cheese recipes must be excluded:
    // c1 (Топлёное масло), c2 (Топлёное масло), c3 (Топлёное масло), c4 (Топлёное масло),
    // c5 (Сметана, Топлёное масло), c6 (Топлёное масло), c10 (Топлёное масло), c11 (Сливочное масло),
    // c13 (Топлёное масло), c14 (Топлёное масло), c16 (Сыр твёрдый)
    const expectedExcluded = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c10', 'c11', 'c13', 'c14', 'c16'];
    for (const id of expectedExcluded) {
      assert.ok(!eligibleIds.includes(id), `Recipe ${id} must be excluded by dairy allergy`);
    }

    // Expected remaining: c7, c8, c9, c12, c15
    const expectedRemaining = ['c7', 'c8', 'c9', 'c12', 'c15'];
    assert.deepEqual(eligibleIds.sort(), expectedRemaining.sort(), 'Exactly c7, c8, c9, c12, c15 remain without dairy');

    // Generate menus across multiple durations (1, 3, 7, 28 days) with 2 meals/day
    for (const numDays of [1, 3, 7, 28]) {
      const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
        mode: 'carnivore',
        numDays,
        meals: 2,
        profile,
        catalogId: 'released-catalog-202611-v1',
      });
      assert.equal(menu.days.length, numDays);
      assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
      const menuIds = getAllMenuRecipeIds(menu);
      for (const id of menuIds) {
        assert.ok(expectedRemaining.includes(id), `Menu dish ${id} must be in allowed dairy-free set`);
      }
      assertNoForbiddenIngredients(menu, recipesMap, ['масло', 'сметан', 'сыр'], 'Dairy-free Carnivore');
    }
  });

  await t.test('Probe 1.2: Carnivore with Eggs restriction', () => {
    const profile = {
      allergies: ['Яйца'],
      disliked: [],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter((r) => isRecipeAllowed(r, profile));
    const eligibleIds = eligible.map((r) => r.id);

    // Recipes with eggs: c2, c8, c11, c13, c16
    const expectedExcluded = ['c2', 'c8', 'c11', 'c13', 'c16'];
    for (const id of expectedExcluded) {
      assert.ok(!eligibleIds.includes(id), `Recipe ${id} must be excluded by egg allergy`);
    }

    const expectedRemaining = ['c1', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9', 'c10', 'c12', 'c14', 'c15'];
    assert.deepEqual(eligibleIds.sort(), expectedRemaining.sort(), 'Exactly 11 recipes remain without eggs');

    for (const numDays of [1, 3, 7, 28]) {
      const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
        mode: 'carnivore',
        numDays,
        meals: 2,
        profile,
        catalogId: 'released-catalog-202611-v1',
      });
      assert.equal(menu.days.length, numDays);
      assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
      assertNoForbiddenIngredients(menu, recipesMap, ['яйц', 'яиц'], 'Egg-free Carnivore');
    }
  });

  await t.test('Probe 1.3: Carnivore with Fish restriction', () => {
    const profile = {
      allergies: ['Рыба'],
      disliked: [],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter((r) => isRecipeAllowed(r, profile));
    const eligibleIds = eligible.map((r) => r.id);

    // Recipes with fish: c6 (Сёмга), c9 (Скумбрия), c13 (Тунец)
    const expectedExcluded = ['c6', 'c9', 'c13'];
    for (const id of expectedExcluded) {
      assert.ok(!eligibleIds.includes(id), `Recipe ${id} must be excluded by fish allergy`);
    }

    const expectedRemaining = ['c1', 'c2', 'c3', 'c4', 'c5', 'c7', 'c8', 'c10', 'c11', 'c12', 'c14', 'c15', 'c16'];
    assert.deepEqual(eligibleIds.sort(), expectedRemaining.sort(), 'Exactly 13 recipes remain without fish');

    for (const numDays of [1, 3, 7, 28]) {
      const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
        mode: 'carnivore',
        numDays,
        meals: 2,
        profile,
        catalogId: 'released-catalog-202611-v1',
      });
      assert.equal(menu.days.length, numDays);
      assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
      assertNoForbiddenIngredients(menu, recipesMap, ['рыб', 'семг', 'скумбри', 'тунец'], 'Fish-free Carnivore');
    }
  });

  await t.test('Probe 1.4: Carnivore with Offal restriction', () => {
    const profile = {
      allergies: [],
      disliked: ['Печень и субпродукты'],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter((r) => isRecipeAllowed(r, profile));
    const eligibleIds = eligible.map((r) => r.id);

    // Recipes with offal: c4 (Куриные сердечки), c5 (Говяжья печень), c7 (Костный бульон), c12 (Костный бульон), c14 (Говяжьи сердца)
    const expectedExcluded = ['c4', 'c5', 'c7', 'c12', 'c14'];
    for (const id of expectedExcluded) {
      assert.ok(
        !eligibleIds.includes(id),
        `Recipe ${id} must be excluded by offal restriction. (c4 "Куриные сердечки" fails because src/domain/eligibility.ts checks ingNorm.includes("сердц"), which does not match "сердечки" due to ц vs ч).`
      );
    }

    const expectedRemaining = ['c1', 'c2', 'c3', 'c6', 'c8', 'c9', 'c10', 'c11', 'c13', 'c15', 'c16'];
    assert.deepEqual(eligibleIds.sort(), expectedRemaining.sort(), 'Exactly 11 recipes remain without offal');

    for (const numDays of [1, 3, 7, 28]) {
      const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
        mode: 'carnivore',
        numDays,
        meals: 2,
        profile,
        catalogId: 'released-catalog-202611-v1',
      });
      assert.equal(menu.days.length, numDays);
      assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
      assertNoForbiddenIngredients(menu, recipesMap, ['печен', 'сердц', 'костный бульон'], 'Offal-free Carnivore');
    }
  });

  await t.test('Probe 1.5: Impossible combination (All 4 restricted) -> safe error and warning', () => {
    const profile = {
      allergies: ['Молочные продукты', 'Яйца', 'Рыба'],
      disliked: ['Печень и субпродукты'],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter((r) => isRecipeAllowed(r, profile));
    const eligibleIds = eligible.map((r) => r.id);

    // Only c15 (duck) remains
    assert.deepEqual(eligibleIds, ['c15'], 'Only c15 (duck) remains when all 4 are restricted');

    // Generating menu with meals=2 must fail safely with clear error
    assert.throws(
      () => {
        generateMenu(CARNIVORE_DRAFT_RECIPES, {
          mode: 'carnivore',
          numDays: 3,
          meals: 2,
          profile,
          catalogId: 'released-catalog-202611-v1',
        });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Недостаточно подходящих рецептов с учётом ограничений: найдено 1, требуется минимум 2 на день/);
        return true;
      }
    );

    // Verify PilotApp.tsx code inspection:
    // 1. Warning banner renders when pool.length < draftMealsPerDay
    // 2. Text NEVER suggests removing allergen restrictions
    // 3. Text explicitly states: "Пожалуйста, не отменяйте медицинские исключения аллергенов."
    // 4. Settings are preserved upon generation failure
    const pilotAppCode = fs.readFileSync(path.resolve('src/PilotApp.tsx'), 'utf8');

    assert.ok(
      pilotAppCode.includes('data-testid="carnivore-conflict-warning"'),
      'PilotApp must have testable carnivore-conflict-warning banner'
    );
    assert.ok(
      pilotAppCode.includes('Пожалуйста, не отменяйте медицинские исключения аллергенов.'),
      'PilotApp must explicitly instruct users NEVER to disable allergen exclusions'
    );
    assert.ok(
      !pilotAppCode.includes('отмените исключения') && !pilotAppCode.includes('снимите ограничения'),
      'PilotApp must never advise removing or relaxing allergen restrictions'
    );
    assert.ok(
      pilotAppCode.includes('Ваши настройки сохранятся.'),
      'PilotApp must confirm user settings are preserved'
    );
    assert.ok(
      pilotAppCode.includes('client.putUser') && pilotAppCode.includes('setProfile(newProfile);'),
      'PilotApp must preserve and save profile even when menu generation fails'
    );
  });

  await t.test('Probe 2: Catalog ID propagation — released-catalog-202611-v1', () => {
    // 1. generateMenu default fallback
    const defaultMenu = generateMenu(RECIPES, {
      mode: 'keto',
      numDays: 3,
      meals: 2,
    });
    assert.equal(defaultMenu.catalog_id, 'released-catalog-202611-v1', 'Default fallback must be released-catalog-202611-v1');

    // 2. Explicit catalogId passed
    const explicitMenu = generateMenu(RECIPES, {
      mode: 'keto',
      numDays: 3,
      meals: 2,
      catalogId: 'released-catalog-202611-v1',
    });
    assert.equal(explicitMenu.catalog_id, 'released-catalog-202611-v1');

    // 3. createMenuController propagation
    const controller = createMenuController(RECIPES, ['k1', 'k2', 'k3'], {
      catalogId: 'released-catalog-202611-v1',
    });
    const cMenu = controller.createUserMenu({
      numDays: 3,
      meals: 2,
      mode: 'keto',
    });
    assert.equal(cMenu.catalog_id, 'released-catalog-202611-v1', 'Controller must propagate catalog ID to created menu');
  });

  await t.test('Probe 3: Editorial badge «На проверке» in Menu.tsx & Recipe.tsx', () => {
    // 1. toRecipeViewModel mapping
    const reviewRecipe = {
      ...CARNIVORE_DRAFT_RECIPES[0],
      editorial_status: 'review',
    };
    const vmReview = toRecipeViewModel(reviewRecipe);
    assert.equal(vmReview.editorial_status, 'review');
    assert.equal(vmReview.sourceStatus, 'review');

    const approvedRecipe = {
      ...RECIPES[0],
      editorial_status: 'approved',
    };
    const vmApproved = toRecipeViewModel(approvedRecipe);
    assert.equal(vmApproved.editorial_status, 'approved');
    assert.equal(vmApproved.sourceStatus, 'approved');

    // 2. Code inspection of Menu.tsx and Recipe.tsx for «На проверке»
    const menuCode = fs.readFileSync(path.resolve('src/ui/food-first/Menu.tsx'), 'utf8');
    const recipeCode = fs.readFileSync(path.resolve('src/ui/food-first/Recipe.tsx'), 'utf8');

    // Both files must check editorial_status === 'review' or sourceStatus === 'review'
    assert.ok(
      menuCode.includes("recipe.sourceStatus === 'review' || recipe.editorial_status === 'review'"),
      'Menu.tsx must check server editorial status'
    );
    assert.ok(
      menuCode.includes('🔍 На проверке'),
      'Menu.tsx must render «🔍 На проверке» badge'
    );
    // Menu.tsx must NOT rely on recipe.id.startsWith('c')
    assert.ok(
      !menuCode.includes("recipe.id.startsWith('c')") && !menuCode.includes("r.id.startsWith('c')"),
      'Menu.tsx must not use ID prefix heuristic'
    );

    assert.ok(
      recipeCode.includes("recipe.sourceStatus === 'review' || (recipe as any).editorial_status === 'review'"),
      'Recipe.tsx must check server editorial status'
    );
    assert.ok(
      recipeCode.includes('🔍 На проверке'),
      'Recipe.tsx must render «🔍 На проверке» badge'
    );
  });
});
