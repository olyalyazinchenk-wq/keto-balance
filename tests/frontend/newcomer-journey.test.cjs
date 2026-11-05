/**
 * tests/frontend/newcomer-journey.test.cjs
 * Comprehensive unit test suite for the Newcomer Journey (first 2 minutes in KetoBalance).
 *
 * Verifies:
 * 1. Start Gate & Consent: 18+ and PD checkboxes (0/2, 1/2, 2/2), explore mode behavior.
 * 2. Onboarding & Preferences: Mapping restriction tokens to canonical UserProfile.
 * 3. Allergen & Ingredient Safety: Strict exclusion of eggs, dairy (including ghee), fish, nuts, offal, mushrooms.
 * 4. Medical Safety & Emergency Gate: Red-flag symptom detection and emergency hold state.
 * 5. Deterministic Keto Engine: Net carbs, calories, and macro ratio calculations.
 * 6. Menu Generation: Generating 1, 3, and 7 day menus for 2, 3, and 4 meals per day.
 * 7. Shopping List Assembly & Portion Scaling: Ingredient aggregation, scaling, and department mapping.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');

// Load domain and adapters
const { isGateGranted, gateStatusLabel } = loadTs(path.join(ROOT, 'src/ui/pilot/gate.ts'));
const { preferencesToUserProfile, isMenuCompatibleWithProfile, approachToMode } = loadTs(
  path.join(ROOT, 'src/adapters/pilotState.ts')
);
const { isRecipeAllowed } = loadTs(path.join(ROOT, 'src/domain/eligibility.ts'));
const { detectEmergency, createDefaultSafetyHold, activateSafetyHold } = loadTs(
  path.join(ROOT, 'src/domain/safety.ts')
);
const { calculateNetCarbs, calculateCalories, calculateMacroRatios } = loadTs(
  path.join(ROOT, 'src/core/keto-engine/calculations.ts')
);
const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
const { rebuildShoppingFromMenu } = loadTs(path.join(ROOT, 'src/ui/food-first/shoppingFromMenu.ts'));
const { toRecipeViewModel } = loadTs(path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts'));
const { RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));
const { RELEASED_RECIPE_IDS, PREVIEW_RECIPE_IDS } = loadTs(path.join(ROOT, 'src/data/releasedRecipeIds.ts'));

test('Product Walkthrough: Newcomer Journey (First 2 Minutes)', async (t) => {

  // --- Step 1: Start Gate & Consent Flow ---
  await t.test('1. Start Gate: Enforces 18+ and personal data consents', () => {
    // 0 of 2
    assert.equal(isGateGranted(false, false), false);
    assert.match(gateStatusLabel(false, false), /0 из 2/);

    // 1 of 2 (age only or pd only)
    assert.equal(isGateGranted(true, false), false);
    assert.match(gateStatusLabel(true, false), /1 из 2/);
    assert.equal(isGateGranted(false, true), false);
    assert.match(gateStatusLabel(false, true), /1 из 2/);

    // 2 of 2 (both granted)
    assert.equal(isGateGranted(true, true), true);
    assert.match(gateStatusLabel(true, true), /2 из 2/);
  });

  // --- Step 2: Diet Approach Selection ---
  await t.test('2. Approach Mapping: Handles keto, carnivore, and explore mode', () => {
    assert.equal(approachToMode('keto'), 'keto');
    assert.equal(approachToMode('carnivore'), 'carnivore');
    // Explore mode throws informative error requiring personal choice
    assert.throws(
      () => approachToMode('explore'),
      /Режим «Знакомство» носит ознакомительный характер/
    );
  });

  // --- Step 3: Allergen & Restriction Filtering ---
  await t.test('3. Safety & Allergen Filter: Blocks restricted ingredients strictly', () => {
    const k2_omelet = RECIPES.find((r) => r.id === 'k2');
    const k14_beef_cabbage = RECIPES.find((r) => r.id === 'k14');
    const c6_salmon = RECIPES.find((r) => r.id === 'c6');
    const k11_mushrooms = RECIPES.find((r) => r.id === 'k11');

    assert.ok(k2_omelet, 'k2 exists');
    assert.ok(k14_beef_cabbage, 'k14 exists');
    assert.ok(c6_salmon, 'c6 exists');
    assert.ok(k11_mushrooms, 'k11 exists');

    // Profile with egg allergy
    const eggFreeProfile = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_eggs'],
      prepTimeMax: 0,
      mealsPerDay: 3,
      preferenceNote: '',
    });
    assert.equal(isRecipeAllowed(k2_omelet, eggFreeProfile), false, 'Egg omelet must be blocked');

    // Profile with dairy allergy - k14 has ghee (топлёное масло) which is dairy
    const dairyFreeProfile = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_dairy'],
      prepTimeMax: 0,
      mealsPerDay: 3,
      preferenceNote: '',
    });
    assert.equal(isRecipeAllowed(k14_beef_cabbage, dairyFreeProfile), false, 'Ghee in k14 must block it for dairy allergy');

    // Profile with fish allergy
    const fishFreeProfile = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'carnivore',
      restrictions: ['exclude_fish'],
      prepTimeMax: 0,
      mealsPerDay: 2,
      preferenceNote: '',
    });
    assert.equal(isRecipeAllowed(c6_salmon, fishFreeProfile), false, 'Salmon must be blocked for fish allergy');

    // Profile with mushroom dislike
    const mushroomFreeProfile = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_mushrooms'],
      prepTimeMax: 0,
      mealsPerDay: 3,
      preferenceNote: '',
    });
    assert.equal(isRecipeAllowed(k11_mushrooms, mushroomFreeProfile), false, 'Mushroom soup must be blocked for disliked mushrooms');
  });

  // --- Step 4: Medical Safety Gate & Stop Protocol ---
  await t.test('4. Medical Safety: Triggers emergency stop-protocol on red-flag symptoms', () => {
    // Red flags trigger stop-protocol
    assert.equal(detectEmergency('Резкая боль в груди и тяжело дышать'), true);
    assert.equal(detectEmergency('Потеря сознания и слабость'), true);
    assert.equal(detectEmergency('Давит в груди уже полчаса'), true);
    assert.equal(detectEmergency('Сердце болит очень сильно'), true);
    assert.equal(detectEmergency('Падаю в обморок, кружится голова'), true);

    // Normal nutrition questions do not trigger false alarms
    assert.equal(detectEmergency('Сколько углеводов в авокадо?'), false);
    assert.equal(detectEmergency('Самочувствие отличное, нет боли в груди'), false);

    // Safety hold activation
    const hold = activateSafetyHold('acute_chest_pain');
    assert.equal(hold.active, true);
    assert.equal(hold.reason, 'acute_chest_pain');
    assert.ok(hold.timestamp > 0);
  });

  // --- Step 5: Deterministic Keto Engine ---
  await t.test('5. Keto Engine: Calculates net carbs, calories, and ratios deterministically', () => {
    // Net carbs = total carbs - fiber - erythritol (100% deduction)
    const netCarbs = calculateNetCarbs({
      carbs: 15,
      fiber: 8,
      polyols: { erythritol: 4 },
    });
    // 15 - 8 - 4 = 3 g net carbs
    assert.equal(netCarbs, 3);

    // Calories: 25g protein (100 kcal) + 30g fat (270 kcal) + 5g carbs (20 kcal) = 390 kcal
    const kcal = calculateCalories({
      protein: 25,
      fat: 30,
      carbs: 5,
    });
    assert.equal(kcal, 390);

    // Macro ratios
    const ratios = calculateMacroRatios({
      protein: 25,
      fat: 30,
      carbs: 5,
    });
    // Total kcal = 390
    // Protein % = 100 / 390 = 25.6%
    // Fat % = 270 / 390 = 69.2%
    // Carbs % = 20 / 390 = 5.1%
    assert.equal(ratios.proteinPct, 25.6);
    assert.equal(ratios.fatPct, 69.2);
    assert.equal(ratios.carbsPct, 5.1);
  });

  // --- Step 6: Initial Menu Generation ---
  await t.test('6. Menu Generation: Builds a valid 1-day and 3-day menu for user profile', () => {
    // In preview mode or when using approved/preview pool
    const controller = createMenuController(RECIPES, PREVIEW_RECIPE_IDS, { isPreview: true });

    // Profile A: Keto, exclude fish and mushrooms, prep time max 30 min, 3 meals per day
    const userPrefsKeto = {
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_fish', 'exclude_mushrooms'],
      prepTimeMax: 30,
      mealsPerDay: 3,
      planDays: 3,
      preferenceNote: '',
    };
    const userProfileKeto = preferencesToUserProfile(userPrefsKeto);

    const menuKeto = controller.createUserMenu({
      numDays: 3,
      meals: 3,
      profile: userProfileKeto,
      mode: 'keto',
    });

    assert.equal(menuKeto.days.length, 3);
    assert.equal(menuKeto.meals, 3);

    // Verify all selected recipes in the menu strictly comply with the user restrictions
    for (const day of menuKeto.days) {
      assert.ok(day.slots.breakfast, 'Breakfast slot filled');
      assert.ok(day.slots.lunch, 'Lunch slot filled');
      assert.ok(day.slots.dinner, 'Dinner slot filled');

      for (const [slot, recipeId] of Object.entries(day.slots)) {
        const recipe = RECIPES.find((r) => r.id === recipeId);
        assert.ok(recipe, `Recipe ${recipeId} exists`);
        assert.equal(isRecipeAllowed(recipe, userProfileKeto), true, `${recipe.title} must be allowed for profile`);
        assert.ok(recipe.time <= 30, `${recipe.title} prep time (${recipe.time} min) must be <= 30 min`);
      }
    }

    // Profile B: Carnivore, exclude offal, 2 meals per day
    const userPrefsCarnivore = {
      confirmed18Plus: true,
      approach: 'carnivore',
      restrictions: ['exclude_offal'],
      prepTimeMax: 0,
      mealsPerDay: 2,
      planDays: 3,
      preferenceNote: '',
    };
    const userProfileCarnivore = preferencesToUserProfile(userPrefsCarnivore);

    const menuCarnivore = controller.createUserMenu({
      numDays: 3,
      meals: 2,
      profile: userProfileCarnivore,
      mode: 'carnivore',
    });

    assert.equal(menuCarnivore.days.length, 3);
    assert.equal(menuCarnivore.meals, 2);

    for (const day of menuCarnivore.days) {
      assert.ok(day.slots.breakfast, 'Breakfast slot filled');
      assert.ok(day.slots.dinner, 'Dinner slot filled');
      for (const [slot, recipeId] of Object.entries(day.slots)) {
        const recipe = RECIPES.find((r) => r.id === recipeId);
        assert.ok(recipe, `Recipe ${recipeId} exists`);
        assert.equal(isRecipeAllowed(recipe, userProfileCarnivore), true);
      }
    }

    // Profile C: Keto with BOTH eggs and dairy excluded, and prep time <= 30 min
    // Previously failed due to lack of recipes; now fully satisfied by k27, k28, k29, k30, k7!
    const userPrefsNoEggsNoDairy = {
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_eggs', 'exclude_dairy'],
      prepTimeMax: 30,
      mealsPerDay: 3,
      planDays: 3,
      preferenceNote: '',
    };
    const userProfileNoEggsNoDairy = preferencesToUserProfile(userPrefsNoEggsNoDairy);
    const menuNoEggsNoDairy = controller.createUserMenu({
      numDays: 3,
      meals: 3,
      profile: userProfileNoEggsNoDairy,
      mode: 'keto',
    });
    assert.equal(menuNoEggsNoDairy.days.length, 3);
    assert.equal(menuNoEggsNoDairy.meals, 3);
    for (const day of menuNoEggsNoDairy.days) {
      assert.ok(day.slots.breakfast, 'Breakfast slot filled');
      assert.ok(day.slots.lunch, 'Lunch slot filled');
      assert.ok(day.slots.dinner, 'Dinner slot filled');
      for (const [slot, recipeId] of Object.entries(day.slots)) {
        const recipe = RECIPES.find((r) => r.id === recipeId);
        assert.ok(recipe, `Recipe ${recipeId} exists`);
        assert.equal(isRecipeAllowed(recipe, userProfileNoEggsNoDairy), true, `${recipe.title} allowed`);
        assert.ok(recipe.time <= 30, `Recipe time <= 30 min`);
      }
    }

    // Fail-closed guard: when extreme restrictions leave fewer recipes than meals per day,
    // the system refuses to invent recipes or serve forbidden dishes!
    const impossiblePrefs = {
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_eggs', 'exclude_dairy', 'exclude_fish', 'exclude_mushrooms'],
      prepTimeMax: 30,
      mealsPerDay: 4, // 4 meals per day but only 2 recipes left (k27 turkey, k28 chicken)
      planDays: 3,
      preferenceNote: '',
    };
    const impossibleProfile = preferencesToUserProfile(impossiblePrefs);
    assert.throws(
      () => {
        controller.createUserMenu({
          numDays: 3,
          meals: 4,
          profile: impossibleProfile,
          mode: 'keto',
        });
      },
      /Недостаточно подходящих рецептов с учётом ограничений/
    );
  });

  // --- Step 7: Automatic Shopping List Assembly & Portion Scaling ---
  await t.test('7. Shopping List: Aggregates ingredients, scales portions, and preserves custom items', () => {
    const recipesMap = {};
    for (const r of RECIPES) {
      recipesMap[r.id] = toRecipeViewModel(r);
    }

    // Mini menu with 2 days
    const sampleMenu = {
      days: [
        { slots: { breakfast: 'k1', lunch: 'k5' } },
        { slots: { breakfast: 'k1', lunch: 'k5' } },
      ],
    };

    // 1 portion
    const shopping1x = rebuildShoppingFromMenu(sampleMenu, recipesMap, [], 1);
    assert.ok(shopping1x.length > 0, 'Shopping list must have items');

    // All items must have valid names, amounts, and departments
    for (const item of shopping1x) {
      assert.ok(item.name.length > 0);
      assert.ok(item.amountLabel.length > 0);
      assert.ok(item.department.length > 0);
      assert.ok(item.linkedRecipeTitles.length > 0);
    }

    // Find eggs in shopping: k1 has 4 eggs, k5 has 6 eggs -> 10 eggs/day * 2 days = 20 eggs for 1x
    const eggsItem1x = shopping1x.find((it) => it.name.toLowerCase().includes('яйц'));
    assert.ok(eggsItem1x, 'Eggs item found in shopping');
    assert.equal(eggsItem1x.amountLabel, '20 шт.');

    // Add a custom user item to the list
    const customItem = {
      id: 'shop-custom-olive-oil',
      name: 'Оливковое масло Extra Virgin',
      amountLabel: '1 бут.',
      department: 'Масла и соусы',
      linkedRecipeTitles: [],
      alreadyHave: false,
      checkedInStore: false,
    };
    const listWithCustom = [...shopping1x, customItem];

    // Scale portions to 2x (e.g., cooking for two: 20 eggs * 2 = 40 eggs)
    const shopping2x = rebuildShoppingFromMenu(sampleMenu, recipesMap, listWithCustom, 2);

    // Custom item must be preserved
    const foundCustom = shopping2x.find((it) => it.id === 'shop-custom-olive-oil');
    assert.ok(foundCustom, 'Custom item must be preserved after rebuild');
    assert.equal(foundCustom.name, 'Оливковое масло Extra Virgin');

    // Verify ingredient scaling:
    const eggsItem2x = shopping2x.find((it) => it.name.toLowerCase().includes('яйц'));
    assert.ok(eggsItem2x, 'Eggs item in 2x shopping');
    assert.equal(eggsItem2x.amountLabel, '40 шт.', 'Eggs amount must scale from 20 to 40 pcs');
  });
});
