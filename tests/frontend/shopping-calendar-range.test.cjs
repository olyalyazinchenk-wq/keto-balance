const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require('../helpers/load-ts.cjs');

const { ShoppingScreen } = loadTs(path.join(ROOT, 'src/ui/food-first/Shopping.tsx'));
const { rebuildShoppingFromMenu } = loadTs(path.join(ROOT, 'src/ui/food-first/shoppingFromMenu.ts'));

test('Shopping Range & Calendar Month Math Verification', async (t) => {
  // Setup 28 days with 1 meat dish of 100g per day
  const recipeId = 'c1';
  const recipeTitle = 'Стейк рибай';
  const recipesMap = {
    [recipeId]: {
      id: recipeId,
      title: recipeTitle,
      portionsVariants: {
        1: {
          portions: 1,
          yieldNote: '',
          nutritionStatus: 'verified',
          ingredients: [
            {
              name: 'Стейк рибай',
              amountLabel: '100 г',
              department: 'Мясо, птица и рыба',
            },
          ],
        },
        2: {
          portions: 2,
          yieldNote: '',
          nutritionStatus: 'verified',
          ingredients: [
            {
              name: 'Стейк рибай',
              amountLabel: '200 г',
              department: 'Мясо, птица и рыба',
            },
          ],
        },
      },
    },
  };

  const menuDays = Array.from({ length: 28 }).map((_, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    slots: { dinner: recipeId },
  }));

  const fullMonthShopping = rebuildShoppingFromMenu({ days: menuDays }, recipesMap, [], 1);
  assert.equal(fullMonthShopping.length, 1);
  assert.equal(fullMonthShopping[0].amountLabel, '2800 г');

  await t.test('Codex proof: ShoppingScreen for 28-day plan displays 700g for default week-0 and NOT 2800g', () => {
    // Render ShoppingScreen with 28 days and default week-0 selection
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ShoppingScreen, {
        items: fullMonthShopping,
        menuTitle: 'Карнивор-рацион',
        isStaleAfterMenuEdit: false,
        onRefreshShoppingFromMenu: () => {},
        onToggleCheckedInStore: () => {},
        onToggleAlreadyHave: () => {},
        portionsMultiplier: 1,
        menuDays: menuDays,
        recipesById: recipesMap,
      })
    );

    // Week-0 has 7 days -> 700 г!
    assert.match(html, /700\s*г/, 'HTML must contain 700 г for week-0');
    assert.doesNotMatch(html, /2800\s*г/, 'HTML must NOT contain 2800 г when week-0 is active');
    assert.match(html, /Мясо,\s*птица\s*и\s*рыба/);
  });

  await t.test('Portions multiplier: 2x on week-0 yields 1400g', () => {
    const html2x = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ShoppingScreen, {
        items: fullMonthShopping,
        menuTitle: 'Карнивор-рацион',
        isStaleAfterMenuEdit: false,
        onRefreshShoppingFromMenu: () => {},
        onToggleCheckedInStore: () => {},
        onToggleAlreadyHave: () => {},
        portionsMultiplier: 2,
        menuDays: menuDays,
        recipesById: recipesMap,
      })
    );

    assert.match(html2x, /1400\s*г/, 'HTML must contain 1400 г for week-0 with 2x portions');
    assert.doesNotMatch(html2x, /5600\s*г/, 'HTML must NOT contain 5600 г when week-0 is active');
  });

  await t.test('Checkmarks and custom items are preserved across range shopping', () => {
    const checkedItem = {
      ...fullMonthShopping[0],
      checkedInStore: true,
      alreadyHave: false,
    };
    const customItem = {
      id: 'shop-custom-salt',
      name: 'Морская соль',
      amountLabel: '1 пачка',
      department: 'Масла и бакалея',
      alreadyHave: true,
      checkedInStore: false,
    };

    const week0Rebuilt = rebuildShoppingFromMenu(
      { days: menuDays.slice(0, 7) },
      recipesMap,
      [checkedItem, customItem],
      { targetPortions: 1, preserveCheckmarks: true }
    );

    const meatItem = week0Rebuilt.find((it) => it.name === 'Стейк рибай');
    assert.ok(meatItem);
    assert.equal(meatItem.amountLabel, '700 г');
    assert.equal(meatItem.checkedInStore, true, 'checkedInStore must be preserved');

    const customPreserved = week0Rebuilt.find((it) => it.id === 'shop-custom-salt');
    assert.ok(customPreserved);
    assert.equal(customPreserved.alreadyHave, true, 'custom item alreadyHave must be preserved');
  });
});
