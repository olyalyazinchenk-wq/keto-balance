const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { rebuildShoppingFromMenu } = loadTs(
  path.resolve(__dirname, '../../src/ui/food-first/shoppingFromMenu.ts')
);

const fixtureRecipes = {
  r1: {
    id: 'r1',
    title: 'Яичница с авокадо',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: '1 порция',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Авокадо спелое', amountLabel: '1/2 шт.', department: 'Овощи и зелень' },
          { name: 'Яйца куриные', amountLabel: '2 шт.', department: 'Яйца и молочное' },
        ],
      },
    },
  },
  r2: {
    id: 'r2',
    title: 'Творожный скрэмбл',
    portionsVariants: {
      1: {
        portions: 1,
        yieldNote: '1 порция',
        nutritionStatus: '[УТОЧНИТЬ]',
        ingredients: [
          { name: 'Творог 9%', amountLabel: '80 г', department: 'Яйца и молочное' },
          { name: 'Яйца куриные', amountLabel: '2 шт.', department: 'Яйца и молочное' },
        ],
      },
    },
  },
};

const makeMenu = (recipeId) => ({
  id: 'menu-1',
  created: 1,
  title: 'Тестовое меню',
  days: [{ dayIndex: 0, label: 'День 1', slots: { breakfast: recipeId } }],
});

test('replacement rebuilds ingredients without inventing conversions', () => {
  const before = rebuildShoppingFromMenu(makeMenu('r1'), fixtureRecipes, []);
  const after = rebuildShoppingFromMenu(makeMenu('r2'), fixtureRecipes, before);
  assert.ok(before.some((item) => item.name === 'Авокадо спелое'));
  assert.ok(!after.some((item) => item.name === 'Авокадо спелое'));
  assert.ok(after.some((item) => item.name === 'Творог 9%' && item.amountLabel === '80 г'));
});

test('keeps custom items and exact matching checkmarks; rejects missing recipes', () => {
  const m = makeMenu('r1');
  const first = rebuildShoppingFromMenu(m, fixtureRecipes, []);
  first[0].alreadyHave = true;
  const custom = { ...first[0], id: 'shop-custom-123', name: 'Свой продукт', alreadyHave: false };
  const next = rebuildShoppingFromMenu(m, fixtureRecipes, [...first, custom]);
  assert.equal(next[0].alreadyHave, true);
  assert.ok(next.some((item) => item.id === custom.id));
  assert.throws(() => rebuildShoppingFromMenu(makeMenu('unknown'), fixtureRecipes, next));
});

test('smart aggregation sums identical ingredients across meals and days without duplicate rows', () => {
  const multiDayMenu = {
    id: 'menu-multi',
    created: 1,
    title: 'Многодневное меню',
    days: [
      { dayIndex: 0, label: 'День 1', slots: { breakfast: 'r1', dinner: 'r2' } },
      { dayIndex: 1, label: 'День 2', slots: { breakfast: 'r1' } },
    ],
  };

  const list = rebuildShoppingFromMenu(multiDayMenu, fixtureRecipes, []);

  // "Яйца куриные" appears in r1 (2 шт) + r2 (2 шт) + r1 (2 шт) = 6 шт
  const eggItems = list.filter((item) => item.name === 'Яйца куриные');
  assert.equal(eggItems.length, 1, 'Should have exactly 1 consolidated item for eggs');
  assert.equal(eggItems[0].amountLabel, '6 шт.');
  assert.ok(eggItems[0].linkedRecipeTitles.includes('Яичница с авокадо'));
  assert.ok(eggItems[0].linkedRecipeTitles.includes('Творожный скрэмбл'));

  // "Авокадо спелое" appears in r1 (0.5) twice = 1 шт.
  const avocado = list.find((item) => item.name === 'Авокадо спелое');
  assert.ok(avocado, 'Avocado should exist');
  assert.equal(avocado.amountLabel, '1 шт.');

  // "Творог 9%" appears once in r2 = 80 г
  const cottage = list.find((item) => item.name === 'Творог 9%');
  assert.ok(cottage, 'Cottage cheese should exist');
  assert.equal(cottage.amountLabel, '80 г');
});

test('scaling portions multiplier scales amounts and resets checkmarks when amount changes (R4)', () => {
  const multiDayMenu = {
    id: 'menu-multi',
    created: 1,
    title: 'Многодневное меню',
    days: [
      { dayIndex: 0, label: 'День 1', slots: { breakfast: 'r1', dinner: 'r2' } },
    ],
  };

  // Build 1x list
  const list1x = rebuildShoppingFromMenu(multiDayMenu, fixtureRecipes, [], 1);
  const egg1x = list1x.find((it) => it.name === 'Яйца куриные');
  const cottage1x = list1x.find((it) => it.name === 'Творог 9%');

  assert.equal(egg1x.amountLabel, '4 шт.');
  assert.equal(cottage1x.amountLabel, '80 г');

  // Mark eggs as checked in store, and cottage as already have at home
  egg1x.checkedInStore = true;
  cottage1x.alreadyHave = true;

  // Scale to 2x portions
  const list2x = rebuildShoppingFromMenu(multiDayMenu, fixtureRecipes, list1x, 2);
  const egg2x = list2x.find((it) => it.name === 'Яйца куриные');
  const cottage2x = list2x.find((it) => it.name === 'Творог 9%');

  // Amounts scaled 2x
  assert.equal(egg2x.amountLabel, '8 шт.');
  assert.equal(cottage2x.amountLabel, '160 г');

  // Checkbox states reset when amount changed (audit R4)
  assert.equal(egg2x.checkedInStore, false, 'checkedInStore should reset when amount changed');
  assert.equal(cottage2x.alreadyHave, false, 'alreadyHave should reset when amount changed');

  // When amount does NOT change, checkmark state is preserved
  egg2x.checkedInStore = true;
  const listSame = rebuildShoppingFromMenu(multiDayMenu, fixtureRecipes, list2x, 2);
  const eggSame = listSame.find((it) => it.name === 'Яйца куриные');
  assert.equal(eggSame.checkedInStore, true, 'checkedInStore preserved when amount is unchanged');
});
