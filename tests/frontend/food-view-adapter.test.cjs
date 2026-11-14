const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { toFoodRecipe, projectFoodDay } = loadTs(
  path.resolve(__dirname, '../../src/adapters/foodView.ts')
);

function recipe(id) {
  return {
    id, title: `Synthetic ${id}`, mode: 'keto', cat: 'breakfast',
    emoji: '', g: ['#fff', '#eee'], time: 12, serv: 2, diff: 'test',
    kcal: 123, p: 1, f: 2, nc: 3, cost: 1,
    make: false, freeze: false, fam: false, batch: false,
    tags: [], ing: [['Synthetic item', '4 шт']], steps: ['Test step'],
    subs: {}, store: 'Test storage',
  };
}

function menu() {
  return {
    mode: 'keto', numDays: 1, meals: 2, portion: 1,
    saved: false, created: 1,
    days: [{ date: '2026-10-30', slots: { breakfast: 'r1', dinner: 'r2' } }],
  };
}

test('preserves identity, raw ingredients and source yield without nutrients', () => {
  const source = recipe('r1');
  const before = JSON.stringify(source);
  const view = toFoodRecipe(source);
  assert.equal(view.id, 'r1');
  assert.equal(view.minutes, 12);
  assert.equal(view.sourceYield, 2);
  assert.deepEqual(view.ingredients, [{ name: 'Synthetic item', amount: '4 шт' }]);
  assert.equal(view.nutritionStatus, '[УТОЧНИТЬ]');
  assert.equal(Object.hasOwn(view, 'kcal'), false);
  view.ingredients[0].amount = 'changed';
  assert.equal(JSON.stringify(source), before);
});

test('keeps requested slot keys even if recipe category is different', () => {
  const day = projectFoodDay(menu(), '2026-10-30', [recipe('r1'), recipe('r2')]);
  assert.equal(day.date, '2026-10-30');
  assert.deepEqual(day.slots.map((slot) => slot.key), ['breakfast', 'dinner']);
  assert.deepEqual(day.slots.map((slot) => slot.recipe.id), ['r1', 'r2']);
});

test('rejects a selected date absent from the current menu', () => {
  assert.throws(() => projectFoodDay(menu(), '2026-10-31', [recipe('r1')]));
});

test('does not silently replace an unknown recipe reference', () => {
  assert.throws(() => projectFoodDay(menu(), '2026-10-30', [recipe('r1')]));
});
