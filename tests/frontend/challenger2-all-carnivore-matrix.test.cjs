// tests/frontend/challenger2-all-carnivore-matrix.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Challenger 2 — Empirical Carnivore Allergen & Offal Matrix Probe (c1..c16 across all 16 restriction subsets)', async (t) => {
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const { generateMenu } = loadTs('src/domain/menu.ts');
  const { CARNIVORE_DRAFT_RECIPES } = loadTs('src/data/carnivoreDraftRecipes.ts');

  assert.equal(CARNIVORE_DRAFT_RECIPES.length, 16, 'Must have exactly 16 candidate carnivore recipes');

  // Ground truth classification for c1..c16
  const CLASSIFICATION = {
    c1:  { dairy: true,  eggs: false, fish: false, offal: false },
    c2:  { dairy: true,  eggs: true,  fish: false, offal: false },
    c3:  { dairy: true,  eggs: false, fish: false, offal: false },
    c4:  { dairy: true,  eggs: false, fish: false, offal: true  },
    c5:  { dairy: true,  eggs: false, fish: false, offal: true  },
    c6:  { dairy: true,  eggs: false, fish: true,  offal: false },
    c7:  { dairy: false, eggs: false, fish: false, offal: true  },
    c8:  { dairy: false, eggs: true,  fish: false, offal: false },
    c9:  { dairy: false, eggs: false, fish: true,  offal: false },
    c10: { dairy: true,  eggs: false, fish: false, offal: false },
    c11: { dairy: true,  eggs: true,  fish: false, offal: false },
    c12: { dairy: false, eggs: false, fish: false, offal: true  },
    c13: { dairy: true,  eggs: true,  fish: true,  offal: false },
    c14: { dairy: true,  eggs: false, fish: false, offal: true  },
    c15: { dairy: false, eggs: false, fish: false, offal: false },
    c16: { dairy: true,  eggs: true,  fish: false, offal: false },
  };

  await t.test('1. Verify ground-truth ingredient assertions for every recipe', () => {
    for (const r of CARNIVORE_DRAFT_RECIPES) {
      const cls = CLASSIFICATION[r.id];
      assert.ok(cls, `Recipe ${r.id} must be in CLASSIFICATION map`);

      // Test single restriction filtering
      const allowDairy = isRecipeAllowed(r, { allergies: ['Молочные продукты'] });
      assert.equal(allowDairy, !cls.dairy, `${r.id} (${r.title}) dairy filter mismatch`);

      const allowEggs = isRecipeAllowed(r, { allergies: ['Яйца'] });
      assert.equal(allowEggs, !cls.eggs, `${r.id} (${r.title}) eggs filter mismatch`);

      const allowFish = isRecipeAllowed(r, { allergies: ['Рыба'] });
      assert.equal(allowFish, !cls.fish, `${r.id} (${r.title}) fish filter mismatch`);

      const allowOffalFull = isRecipeAllowed(r, { disliked: ['Печень и субпродукты'] });
      assert.equal(allowOffalFull, !cls.offal, `${r.id} (${r.title}) offal full label filter mismatch`);

      const allowOffalShort = isRecipeAllowed(r, { disliked: ['субпродукты'] });
      assert.equal(allowOffalShort, !cls.offal, `${r.id} (${r.title}) offal 'субпродукты' label filter mismatch`);

      const allowLiverShort = isRecipeAllowed(r, { disliked: ['печень'] });
      // Note: 'печень' label blocks offal dishes
      assert.equal(allowLiverShort, !cls.offal, `${r.id} (${r.title}) offal 'печень' label filter mismatch`);
    }
  });

  await t.test('2. Exhaustive test of all 2^4 = 16 restriction combinations across c1..c16', () => {
    const flags = [false, true];
    let combinationsTested = 0;

    for (const restrDairy of flags) {
      for (const restrEggs of flags) {
        for (const restrFish of flags) {
          for (const restrOffal of flags) {
            combinationsTested++;
            const allergies = [];
            if (restrDairy) allergies.push('Молочные продукты');
            if (restrEggs) allergies.push('Яйца');
            if (restrFish) allergies.push('Рыба');

            const disliked = [];
            if (restrOffal) disliked.push('Печень и субпродукты');

            const profile = { allergies, disliked };

            const expectedAllowedIds = [];
            for (const [id, cls] of Object.entries(CLASSIFICATION)) {
              if (restrDairy && cls.dairy) continue;
              if (restrEggs && cls.eggs) continue;
              if (restrFish && cls.fish) continue;
              if (restrOffal && cls.offal) continue;
              expectedAllowedIds.push(id);
            }

            const actualAllowed = CARNIVORE_DRAFT_RECIPES.filter(r => isRecipeAllowed(r, profile));
            const actualAllowedIds = actualAllowed.map(r => r.id);

            assert.deepEqual(
              actualAllowedIds.sort(),
              expectedAllowedIds.sort(),
              `Mismatch for subset dairy=${restrDairy}, eggs=${restrEggs}, fish=${restrFish}, offal=${restrOffal}`
            );

            // If at least 2 dishes exist, generateMenu with meals=2 should succeed
            if (expectedAllowedIds.length >= 2) {
              const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
                mode: 'carnivore',
                numDays: 3,
                meals: 2,
                profile,
                catalogId: 'released-catalog-202611-v1',
              });
              assert.equal(menu.days.length, 3);
              for (const day of menu.days) {
                for (const slotId of Object.values(day.slots)) {
                  assert.ok(expectedAllowedIds.includes(slotId), `Menu dish ${slotId} must be allowed`);
                }
              }
            } else {
              // Less than 2 dishes: generating 2 meals/day menu must throw descriptive error
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
                /Недостаточно подходящих рецептов с учётом ограничений/
              );
            }
          }
        }
      }
    }

    assert.equal(combinationsTested, 16, 'Must test all 16 combinations');
  });

  await t.test('3. Verification of offal synonyms and Russian morphological stem coverage', () => {
    const offalVariations = [
      'Печень и субпродукты',
      'субпродукты',
      'печень',
      'печень и субпродукты',
    ];

    for (const offalLabel of offalVariations) {
      const allowed = CARNIVORE_DRAFT_RECIPES.filter(r =>
        isRecipeAllowed(r, { disliked: [offalLabel] })
      ).map(r => r.id);

      const expected = ['c1', 'c2', 'c3', 'c6', 'c8', 'c9', 'c10', 'c11', 'c13', 'c15', 'c16'];
      assert.deepEqual(
        allowed.sort(),
        expected.sort(),
        `Offal synonym '${offalLabel}' must exclude exactly c4, c5, c7, c12, c14`
      );
    }
  });

  await t.test('4. Robustness under varied menu periods (1, 3, 7, 28, 30, 31 days) with dairy+eggs+offal (2 dishes pool)', () => {
    // Subset: Dairy + Eggs + Offal -> exactly 2 dishes remain: c9 (mackerel), c15 (duck)
    const profile = {
      allergies: ['Молочные продукты', 'Яйца'],
      disliked: ['Печень и субпродукты'],
    };

    const eligible = CARNIVORE_DRAFT_RECIPES.filter(r => isRecipeAllowed(r, profile));
    assert.deepEqual(eligible.map(r => r.id).sort(), ['c15', 'c9']);

    for (const numDays of [1, 3, 7, 28, 30, 31]) {
      const menu = generateMenu(CARNIVORE_DRAFT_RECIPES, {
        mode: 'carnivore',
        numDays,
        meals: 2,
        profile,
        catalogId: 'released-catalog-202611-v1',
      });
      assert.equal(menu.days.length, numDays);
      for (const day of menu.days) {
        const slots = Object.values(day.slots);
        assert.equal(slots.length, 2);
        assert.notEqual(slots[0], slots[1], `Day ${day.date} must not repeat recipe within day`);
        assert.ok(slots.includes('c9'));
        assert.ok(slots.includes('c15'));
      }
    }
  });
});
