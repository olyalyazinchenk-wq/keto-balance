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
