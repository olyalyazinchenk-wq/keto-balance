const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Menu generation with stable slots (P06)', async (t) => {
  const { generateMenu, getSlotKeys, replacementCandidates } = loadTs('src/domain/menu.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');

  await t.test('slot keys conform to contract for 2, 3, 4 meals', () => {
    assert.deepEqual([...getSlotKeys(2)], ['breakfast', 'dinner']);
    assert.deepEqual([...getSlotKeys(3)], ['breakfast', 'lunch', 'dinner']);
    assert.deepEqual([...getSlotKeys(4)], ['breakfast', 'lunch', 'dinner', 'snack']);
    assert.throws(() => getSlotKeys(5), /Недопустимое количество/);
  });

  await t.test('validates 2x3x3 combinations of mode x numDays x meals and numeric created', () => {
    const modes = ['keto', 'carnivore'];
    const daysList = [1, 3, 7];
    const mealsList = [2, 3, 4];
    let seed = 42;
    const seededRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (const mode of modes) {
      for (const numDays of daysList) {
        for (const meals of mealsList) {
          const menu = generateMenu(RECIPES, {
            mode,
            numDays,
            meals,
            today: new Date(2026, 9, 26),
            random: seededRandom,
          });

          assert.equal(menu.mode, mode);
          assert.equal(menu.numDays, numDays);
          assert.equal(menu.meals, meals);
          assert.equal(typeof menu.created, 'number', 'menu.created must be a numeric timestamp');
          assert.equal(menu.days.length, numDays);

          const expectedSlots = getSlotKeys(meals);
          for (const day of menu.days) {
            assert.ok(day.date, 'Day must have date string');
            const keys = Object.keys(day.slots);
            assert.deepEqual(keys.sort(), [...expectedSlots].sort());

            // Slots contain string recipe IDs
            for (const slotKey of expectedSlots) {
              const recipeId = day.slots[slotKey];
              assert.equal(typeof recipeId, 'string', `Slot ${slotKey} must contain a string recipe ID`);
              const r = RECIPES.find(x => x.id === recipeId);
              assert.ok(r, `Recipe ${recipeId} must exist in catalog`);
              assert.equal(r.mode, mode, `Recipe mode must match menu mode: ${r.mode} vs ${mode}`);
            }

            // No duplicate recipes within the same day
            const dayRecipeIds = Object.values(day.slots);
            const uniqueIds = new Set(dayRecipeIds);
            assert.equal(uniqueIds.size, expectedSlots.length, 'No duplicate recipes in the same day');
          }
        }
      }
    }
  });

  await t.test('strictly respects allergies during menu generation', () => {
    const menu = generateMenu(RECIPES, {
      mode: 'keto',
      numDays: 3,
      meals: 3,
      profile: { allergies: ['Яйца'] },
      today: new Date(2026, 9, 26),
    });

    for (const day of menu.days) {
      for (const recipeId of Object.values(day.slots)) {
        const r = RECIPES.find(x => x.id === recipeId);
        assert.ok(!r.ing.some(([name]) => name.toLowerCase().includes('яйц')), `Recipe ${r.id} contains eggs!`);
      }
    }
  });

  await t.test('replacementCandidates strictly restricts replacements to current menu mode', () => {
    // Keto mode replacements must only return keto recipes
    const ketoReplacements = replacementCandidates('k1', ['k1', 'k2'], RECIPES, null, 'lunch', 'keto');
    assert.ok(ketoReplacements.length > 0, 'Must find keto replacements');
    for (const rep of ketoReplacements) {
      assert.equal(rep.mode, 'keto', 'Replacement must stay in keto mode');
      assert.notEqual(rep.id, 'k1', 'Must not be current recipe');
      assert.notEqual(rep.id, 'k2', 'Must not be a recipe already used today');
    }

    // Carnivore mode replacements must only return carnivore recipes
    const carnivoreReplacements = replacementCandidates('c1', ['c1'], RECIPES, null, 'lunch', 'carnivore');
    assert.ok(carnivoreReplacements.length > 0, 'Must find carnivore replacements');
    for (const rep of carnivoreReplacements) {
      assert.equal(rep.mode, 'carnivore', 'Replacement must stay in carnivore mode');
    }
  });

  await t.test('safely throws on invalid inputs, corrupted profiles, and insufficient pools', () => {
    assert.throws(() => generateMenu(RECIPES, { mode: 'invalid', numDays: 3, meals: 3 }), /Недопустимый режим/);
    assert.throws(() => generateMenu(RECIPES, { mode: 'keto', numDays: 5, meals: 3 }), /Недопустимое количество дней/);
    assert.throws(() => generateMenu([], { mode: 'keto', numDays: 3, meals: 3 }), /Недостаточно подходящих рецептов/);
    // Corrupted restrictions
    assert.throws(
      () => generateMenu(RECIPES, { mode: 'keto', numDays: 3, meals: 3, profile: { allergies: 'corrupted_string_not_array' } }),
      /Повреждённые ограничения/
    );
  });
});
