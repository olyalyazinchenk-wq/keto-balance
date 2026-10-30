const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const { toFoodRecipe, projectFoodDay } = loadTs(
  path.resolve(__dirname, '../../src/adapters/foodView.ts')
);
const { toFoodCard } = loadTs(
  path.resolve(__dirname, '../../src/ui/food-first/model.ts')
);
const { resolveSelectedDay } = loadTs(
  path.resolve(__dirname, '../../src/ui/food-first/selectedDay.ts')
);

function makeRecipe(id, title) {
  return {
    id, title, mode: 'keto', cat: 'breakfast',
    emoji: '', g: ['#fff', '#eee'], time: 20, serv: 2, diff: 'easy',
    kcal: 300, p: 20, f: 20, nc: 5, cost: 1,
    make: false, freeze: false, fam: false, batch: false,
    tags: [], ing: [['Продукт', '100 г']], steps: ['Шаг 1'],
    subs: {}, store: 'Холодильник',
  };
}

const recipes = [
  makeRecipe('r1', 'Блюдо дня 1'),
  makeRecipe('r2', 'Блюдо дня 1 ужин'),
  makeRecipe('r3', 'Блюдо дня 2 завтрак'),
  makeRecipe('r4', 'Блюдо дня 2 ужин'),
];

const menu = {
  mode: 'keto',
  numDays: 2,
  meals: 2,
  portion: 1,
  saved: false,
  created: 123456789,
  days: [
    { date: '2026-10-30', slots: { breakfast: 'r1', dinner: 'r2' } },
    { date: '2026-10-31', slots: { breakfast: 'r3', dinner: 'r4' } },
  ],
};

test('flow projects requested date and displays true recipe identity', () => {
  const day1 = projectFoodDay(menu, '2026-10-30', recipes);
  assert.equal(day1.date, '2026-10-30');
  assert.equal(day1.slots[0].recipe.id, 'r1');
  assert.equal(day1.slots[0].recipe.title, 'Блюдо дня 1');

  const card = toFoodCard(day1.slots[0].recipe);
  assert.equal(card.id, 'r1');
  assert.equal(card.title, 'Блюдо дня 1');
  assert.equal(card.minutes, 20);
});

test('selecting next date changes slots and recipes without dayIndex-as-date corruption', () => {
  const day2 = projectFoodDay(menu, '2026-10-31', recipes);
  assert.equal(day2.date, '2026-10-31');
  assert.equal(day2.slots[0].recipe.id, 'r3');
  assert.equal(day2.slots[1].recipe.id, 'r4');
});

test('selected day resolution preserves valid choice and falls back on invalid', () => {
  const days = [{ dayIndex: 0 }, { dayIndex: 1 }, { dayIndex: 2 }];
  assert.equal(resolveSelectedDay(1, days), 1);
  assert.equal(resolveSelectedDay(2, days), 2);
  assert.equal(resolveSelectedDay(999, days), 0);
  assert.equal(resolveSelectedDay('invalid', days), 0);
});
