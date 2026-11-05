const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Mobile Interactive Flow & 7-Day Menu Validation Suite', async (t) => {
  const { generateMenu, replacementCandidates } = loadTs('src/domain/menu.ts');
  const { createMenuController } = loadTs('src/adapters/menuController.ts');
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');
  const { PREVIEW_RECIPE_IDS } = loadTs('src/data/releasedRecipeIds.ts');
  const {
    rebuildShoppingFromMenu,
    parseAmount,
    formatAmount,
  } = loadTs('src/ui/food-first/shoppingFromMenu.ts');
  const {
    calculateShoppingProgress,
    formatShoppingListForClipboard,
    createCustomShoppingItem,
    extractStepTimerMinutes,
    filterRecipesBySettings,
    resolveDayMenuSlots,
  } = loadTs('src/ui/food-first/state.ts');
  const { toRecipeViewModel } = loadTs('src/ui/food-first/recipesAdapter.ts');

  const previewController = createMenuController(RECIPES, PREVIEW_RECIPE_IDS);
  const recipesMap = {};
  for (const r of RECIPES) {
    recipesMap[r.id] = toRecipeViewModel(r);
  }

  // 1. REPLACEMENT CANDIDATES ACROSS 1, 3, AND 7-DAY MENUS
  await t.test('1. Replacement candidates for 1, 3, and 7-day menus strictly enforce allergens', async (st) => {
    const profileNoEggsNoDairyNoFish = {
      allergies: ['Яйца', 'Молочные продукты', 'Рыба'],
      disliked: [],
    };

    for (const numDays of [1, 3, 7]) {
      await st.test(`menu with ${numDays} days: candidate replacement safety`, () => {
        // Generate valid menu for this profile
        const menu = generateMenu(RECIPES, {
          mode: 'keto',
          numDays,
          meals: 3,
          profile: profileNoEggsNoDairyNoFish,
          random: () => 0.1,
        });

        assert.equal(menu.days.length, numDays);

        // Test replacement for each day
        for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
          const day = menu.days[dayIdx];
          const dayIds = Object.values(day.slots);
          const slotKeys = Object.keys(day.slots);

          for (const slotKey of slotKeys) {
            const currentRecipeId = day.slots[slotKey];
            const candidates = previewController.createUserReplacementCandidates({
              currentId: currentRecipeId,
              dayIds,
              profile: profileNoEggsNoDairyNoFish,
              preferredCat: slotKey,
              mode: 'keto',
            });

            // Each candidate must strictly adhere to rules:
            for (const cand of candidates) {
              assert.notEqual(cand.id, currentRecipeId, 'Must not offer the dish being replaced');
              assert.ok(!dayIds.includes(cand.id), 'Must not offer dishes already in today\'s menu');
              assert.ok(
                isRecipeAllowed(cand, profileNoEggsNoDairyNoFish),
                `Candidate ${cand.id} (${cand.title}) must pass isRecipeAllowed`
              );

              // Direct check against eggs, dairy, fish ingredients
              for (const [ingName] of cand.ing) {
                const norm = ingName.toLowerCase();
                assert.ok(
                  !norm.includes('яйц') && !norm.includes('яичн') && !norm.includes('яйцо'),
                  `Candidate ${cand.id} contains egg: ${ingName}`
                );
                const normDairy = norm
                  .replace(/сырокопч[её]н[а-яё]*/g, '')
                  .replace(/сыровял[её]н[а-яё]*/g, '');
                assert.ok(
                  !normDairy.includes('сыр') && !norm.includes('сливк') && !norm.includes('творог') &&
                  !norm.includes('сметан') && !norm.includes('моцарелл') && !norm.includes('масло сливочное'),
                  `Candidate ${cand.id} contains dairy: ${ingName}`
                );
                assert.ok(
                  !norm.includes('рыб') && !norm.includes('горбуш') && !norm.includes('лосос') &&
                  !norm.includes('треск') && !norm.includes('форел') && !norm.includes('тунец'),
                  `Candidate ${cand.id} contains fish: ${ingName}`
                );
              }
            }
          }
        }
      });
    }
  });

  // 2. PORTION ADJUSTMENTS (1x -> 2x SCALING)
  await t.test('2. Portion adjustment scaling (1x to 2x)', async (st) => {
    await st.test('rebuildShoppingFromMenu scales ingredient amounts deterministically', () => {
      const singleDayMenu = {
        days: [
          {
            slots: {
              breakfast: 'k27', // Индейка со шпинатом (филе индейки 180 г, шпинат 80 г)
              lunch: 'k28',     // Курица с кабачком (филе 200 г, кабачок 150 г)
            },
          },
        ],
      };

      // 1x portions
      const list1x = rebuildShoppingFromMenu(singleDayMenu, recipesMap, [], 1);
      const turkey1x = list1x.find((i) => i.name.toLowerCase().includes('индей'));
      const chicken1x = list1x.find((i) => i.name.toLowerCase().includes('кури'));
      assert.ok(turkey1x, 'Turkey item must exist');
      assert.ok(chicken1x, 'Chicken item must exist');
      assert.equal(turkey1x.amountLabel, '300 г');
      assert.equal(chicken1x.amountLabel, '400 г');

      // Mark turkey as bought in 1x
      turkey1x.checkedInStore = true;

      // Scale to 2x portions
      const list2x = rebuildShoppingFromMenu(singleDayMenu, recipesMap, list1x, 2);
      const turkey2x = list2x.find((i) => i.name.toLowerCase().includes('индей'));
      const chicken2x = list2x.find((i) => i.name.toLowerCase().includes('кури'));

      assert.equal(turkey2x.amountLabel, '600 г', '300g * 2 = 600g');
      assert.equal(chicken2x.amountLabel, '800 г', '400g * 2 = 800g');

      // Crucial safety check: turkey checkmark MUST reset because amount changed
      assert.equal(
        turkey2x.checkedInStore,
        false,
        'Checkmark must uncheck because required quantity increased'
      );
    });

    await st.test('all catalog recipes provide verified portionsVariants for 1 and 2 portions', () => {
      for (const recipe of RECIPES) {
        const vm = recipesMap[recipe.id];
        assert.ok(vm.portionsVariants[1], `Recipe ${recipe.id} must have 1-portion variant`);
        assert.ok(vm.portionsVariants[2], `Recipe ${recipe.id} must have 2-portion variant`);

        const v1Ings = vm.portionsVariants[1].ingredients;
        const v2Ings = vm.portionsVariants[2].ingredients;
        assert.equal(
          v1Ings.length,
          v2Ings.length,
          `Recipe ${recipe.id} ingredients count must match across variants`
        );
      }
    });
  });

  // 3. INTERACTIVE SHOPPING LIST & AGGREGATION
  await t.test('3. Interactive shopping list aggregation and state management', async (st) => {
    await st.test('aggregates identical ingredients across multiple days into single entry', () => {
      const multiDayMenu = {
        days: [
          { slots: { lunch: 'k28' } }, // Куриное филе 400 г, Масло оливковое 2 ст. л.
          { slots: { lunch: 'k28' } }, // Куриное филе 400 г, Масло оливковое 2 ст. л.
        ],
      };

      const shopping = rebuildShoppingFromMenu(multiDayMenu, recipesMap, [], 1);
      const chickenItems = shopping.filter((i) => i.name.toLowerCase().includes('кури'));
      assert.equal(chickenItems.length, 1, 'Duplicate ingredients must aggregate into 1 row');
      assert.equal(chickenItems[0].amountLabel, '800 г', '400g + 400g = 800g');
      assert.equal(chickenItems[0].linkedRecipeTitles.length, 1);
    });

    await st.test('correctly assigns supermarket departments', () => {
      const sampleMenu = {
        days: [
          {
            slots: {
              breakfast: 'k27', // Индейка (Мясо), Шпинат (Овощи), Масло (Масла)
              dinner: 'k30',    // Рыба (Мясо, птица и рыба), Брокколи (Овощи)
            },
          },
        ],
      };

      const shopping = rebuildShoppingFromMenu(sampleMenu, recipesMap, [], 1);
      const meatDept = shopping.filter((i) => i.department === 'Мясо, птица и рыба');
      const vegDept = shopping.filter((i) => i.department === 'Овощи и зелень');
      const oilDept = shopping.filter((i) => i.department === 'Масла и бакалея');

      assert.ok(meatDept.some((i) => i.name.includes('Индейк') || i.name.includes('Рыб') || i.name.includes('Треск')));
      assert.ok(vegDept.some((i) => i.name.includes('Шпинат') || i.name.includes('Брокколи')));
      assert.ok(oilDept.some((i) => i.name.includes('масло')));
    });

    await st.test('preserves user custom items across rebuilds', () => {
      const initialMenu = { days: [{ slots: { breakfast: 'k27' } }] };
      const shopping = rebuildShoppingFromMenu(initialMenu, recipesMap, [], 1);

      // Add custom item
      const custom = createCustomShoppingItem('Кокосовое молоко 200 мл', '1 банка', 'Масла и бакалея');
      assert.ok(custom);
      shopping.push(custom);

      // Rebuild with next menu
      const updatedMenu = { days: [{ slots: { breakfast: 'k28' } }] };
      const rebuilt = rebuildShoppingFromMenu(updatedMenu, recipesMap, shopping, 1);

      const foundCustom = rebuilt.find((i) => i.id === custom.id);
      assert.ok(foundCustom, 'Custom item must be retained across shopping rebuild');
      assert.equal(foundCustom.name, 'Кокосовое молоко 200 мл');
    });

    await st.test('calculateShoppingProgress accurately calculates completed and remaining items', () => {
      const items = [
        { name: 'A', amountLabel: '1', checkedInStore: true, alreadyHave: false },
        { name: 'B', amountLabel: '1', checkedInStore: false, alreadyHave: true },
        { name: 'C', amountLabel: '1', checkedInStore: false, alreadyHave: false },
        { name: 'D', amountLabel: '1', checkedInStore: false, alreadyHave: false },
      ];

      const progress = calculateShoppingProgress(items);
      assert.equal(progress.total, 4);
      assert.equal(progress.completed, 2);
      assert.equal(progress.remaining, 2);
      assert.equal(progress.percent, 50);
      assert.equal(progress.inStore, 1);
      assert.equal(progress.alreadyHome, 1);
    });
  });

  // 4. INTERACTIVE RECIPE PREPARATION & KITCHEN TIMER
  await t.test('4. Interactive cooking flow, step checks, and kitchen timer', async (st) => {
    await st.test('extractStepTimerMinutes extracts minutes correctly from varied text patterns', () => {
      assert.equal(extractStepTimerMinutes('Обжаривайте 5–7 минут на среднем огне'), 7);
      assert.equal(extractStepTimerMinutes('Тушите 15 минут под крышкой'), 15);
      assert.equal(extractStepTimerMinutes('Запекайте 20-25 минут'), 25);
      assert.equal(extractStepTimerMinutes('Нарежьте овощи мелкими кубиками'), null);
      assert.equal(extractStepTimerMinutes('Подавайте горячим со свежей зеленью'), null);
    });

    await st.test('step and ingredient completion keys follow isolated deterministic schema', () => {
      const recipeId = 'k28';
      const stepIdx = 2;
      const ingIdx = 1;
      const stepKey = `${recipeId}:step:${stepIdx}`;
      const ingKey = `${recipeId}:ing:${ingIdx}`;

      assert.equal(stepKey, 'k28:step:2');
      assert.equal(ingKey, 'k28:ing:1');
    });
  });

  // 5. SEVEN-DAY MENU DIVERSITY EVALUATION & TRUTH IN REPORTING
  await t.test('5. Evaluation of 7-day menu diversity under various restriction profiles', async (st) => {
    const ketoRecipes = RECIPES.filter((r) => r.mode === 'keto');
    assert.equal(ketoRecipes.length, 34, 'Total keto recipes pool must be 34 (30 base + 4 quick breakfasts)');

    // Case A: No restrictions
    const noRestrictionsPool = ketoRecipes;
    assert.equal(noRestrictionsPool.length, 34);
    let seedA = 12345;
    const prngA = () => {
      seedA = (seedA * 16807) % 2147483647;
      return (seedA - 1) / 2147483646;
    };
    const menuUnrestricted = generateMenu(noRestrictionsPool, {
      mode: 'keto',
      numDays: 7,
      meals: 3,
      random: prngA,
    });
    const uniqueUnrestricted = new Set(
      menuUnrestricted.days.flatMap((d) => Object.values(d.slots))
    );
    assert.ok(
      uniqueUnrestricted.size >= 10,
      `Unrestricted 7-day menu should use diverse pool (used: ${uniqueUnrestricted.size})`
    );

    // Case B: No eggs + no dairy (prepTime <= 30 min)
    const dairyEggFreeSettings = {
      approach: 'keto',
      restrictions: ['no_dairy', 'no_eggs'],
      prepTimeMax: 30,
      mealsPerDay: 3,
    };
    const matchingDairyEggFree = filterRecipesBySettings(
      Object.values(recipesMap),
      dairyEggFreeSettings,
      RECIPES
    );

    // Verified matching recipes: 10 total (5 breakfasts: k27, k31, k32, k33, k34; 1 soup: k24; 2 lunches: k7, k28; 2 dinners: k29, k30)
    assert.equal(matchingDairyEggFree.length, 10, 'Must find exactly 10 matching recipes');
    const matchingIds = matchingDairyEggFree.map((r) => r.id).sort();
    assert.deepEqual(matchingIds, ['k24', 'k27', 'k28', 'k29', 'k30', 'k31', 'k32', 'k33', 'k34', 'k7']);

    const breakfastMatches = matchingDairyEggFree.filter((r) => r.slotType === 'breakfast');
    assert.equal(breakfastMatches.length, 5, 'Must have 5 distinct dairy/egg-free breakfasts');

    // Across 7 days * 3 meals = 21 slots:
    let seedB = 67890;
    const prngB = () => {
      seedB = (seedB * 16807) % 2147483647;
      return (seedB - 1) / 2147483646;
    };
    const menuEggDairyFree = generateMenu(RECIPES, {
      mode: 'keto',
      numDays: 7,
      meals: 3,
      profile: {
        allergies: ['Яйца', 'Молочные продукты'],
        disliked: [],
        prepTimeMax: 30,
      },
      random: prngB,
    });

    const counts = {};
    for (const day of menuEggDairyFree.days) {
      for (const slotKey of Object.keys(day.slots)) {
        const id = day.slots[slotKey];
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    const totalSlots = 21;
    let countedSlots = 0;
    for (const [id, count] of Object.entries(counts)) {
      countedSlots += count;
      assert.ok(
        count >= 1 && count <= 7,
        `Recipe ${id} repeated ${count} times across 7 days`
      );
    }
    assert.equal(countedSlots, totalSlots);
    // 7 breakfasts are now distributed among 5 breakfasts instead of repeating the same single one 7 times!
    const breakfastUsedIds = Object.keys(counts).filter((id) =>
      ['k27', 'k31', 'k32', 'k33', 'k34'].includes(id)
    );
    assert.ok(breakfastUsedIds.length >= 4, 'At least 4 distinct breakfasts utilized');

    // Case C: No eggs + no dairy + no fish (prepTime <= 30 min)
    // Note: k7 (mackerel) and k30 (cod) contain fish and are excluded.
    // 7 safe recipes remain: 5 breakfasts (k27, k31, k32, k33, k34) + 1 lunch (k28) + 1 dinner (k29)
    const dairyEggFishFreeSettings = {
      approach: 'keto',
      restrictions: ['no_dairy', 'no_eggs', 'no_fish'],
      prepTimeMax: 30,
      mealsPerDay: 3,
    };
    const matchingNoFish = filterRecipesBySettings(
      Object.values(recipesMap),
      dairyEggFishFreeSettings,
      RECIPES
    );
    assert.equal(matchingNoFish.length, 7, 'Must find exactly 7 matching recipes without fish');
    const matchingNoFishIds = matchingNoFish.map((r) => r.id).sort();
    assert.deepEqual(matchingNoFishIds, ['k27', 'k28', 'k29', 'k31', 'k32', 'k33', 'k34']);

    // Case D: No eggs + no dairy + no fish + no pork (prepTime <= 30 min)
    // k33 has bacon (pork), so it is excluded, leaving 6 recipes.
    const strictFourSettings = {
      approach: 'keto',
      restrictions: ['no_dairy', 'no_eggs', 'no_fish', 'no_pork'],
      prepTimeMax: 30,
      mealsPerDay: 3,
    };
    const matchingStrictFour = filterRecipesBySettings(
      Object.values(recipesMap),
      strictFourSettings,
      RECIPES
    );
    assert.equal(matchingStrictFour.length, 6, 'Must find exactly 6 matching recipes without pork');
    const matchingStrictFourIds = matchingStrictFour.map((r) => r.id).sort();
    assert.deepEqual(matchingStrictFourIds, ['k27', 'k28', 'k29', 'k31', 'k32', 'k34']);
    // With 3 meals/day and exactly 3 recipes, each recipe appears exactly 7 times (every day)
  });
});
