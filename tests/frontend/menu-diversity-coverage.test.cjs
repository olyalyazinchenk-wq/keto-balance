const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');

const { evaluateSevenDayDiversity } = loadTs('src/ui/food-first/state.ts');
const food = (slotType) => ({ slotType });

test('7-day warning detects scarce breakfasts even with 9 total safe recipes', () => {
  const recipes = [
    ...Array.from({ length: 5 }, () => food('breakfast')),
    ...Array.from({ length: 2 }, () => food('lunch')),
    ...Array.from({ length: 2 }, () => food('dinner')),
  ];
  assert.deepEqual(evaluateSevenDayDiversity(recipes, 7), {
    totalCount: 9, breakfastCount: 5, warn: true,
  });
});

test('non-weekly menus do not trigger 7-day warning', () => {
  const recipes = [food('breakfast'), food('lunch'), food('dinner')];
  for (const days of [1, 3]) {
    assert.equal(evaluateSevenDayDiversity(recipes, days).warn, false);
  }
});

test('empty catalog does not duplicate the separate no-recipes error', () => {
  assert.equal(evaluateSevenDayDiversity([], 7).warn, false);
});

test('7 distinct breakfasts with adequate pool removes repeat-warning', () => {
  const recipes = Array.from({ length: 7 }, () => food('breakfast'));
  assert.equal(evaluateSevenDayDiversity(recipes, 7).warn, false);
});

test('diversity alert does not advise overriding medical allergy exclusions', () => {
  const ui = fs.readFileSync('src/ui/food-first/Menu.tsx', 'utf8');
  assert.match(ui, /не отменяйте их ради разнообразия/);
  assert.match(ui, /evaluateSevenDayDiversity\(matchingRecipes, menu.days.length\)/);
});
