const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, file) => module._compile(ts.transpileModule(
    fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }
  ).outputText, file);
}
require.extensions['.css'] = () => {};
const { RecipeScreen } = require('../../src/ui/food-first/Recipe.tsx');
const { UI_RECIPES_BY_ID } = require('../../src/ui/food-first/recipesAdapter.ts');
const { photoForRecipe } = require('../../src/ui/food-first/model.ts');
const noop = () => {};

test('recipe uses the same reviewed photo as the menu; unknown photos retain fallback', () => {
  const render = id => renderToStaticMarkup(React.createElement(RecipeScreen, {
    recipe: UI_RECIPES_BY_ID[id], checkedIngredients: {}, checkedSteps: {},
    onToggleIngredient: noop, onToggleStep: noop,
  }));
  assert.ok(render('k1').includes(`src="${photoForRecipe('k1')}"`));
  assert.ok(!render('k1').includes('Фото блюда пока не подключено'));
  assert.ok(!render('k7').includes('<img'));
});

const { FoodToday } = require('../../src/ui/food-first/Today.tsx');
const { ShoppingScreen } = require('../../src/ui/food-first/Shopping.tsx');
test('daily rhythm displays actual preparation state, not fabricated eaten meals', () => {
  const html = renderToStaticMarkup(React.createElement(FoodToday, {
    dateLabel: 'День 1', primary: null, others: [], onOpenRecipe: noop, onChooseMenu: noop,
    rhythm: [{ key: 'breakfast', label: 'Завтрак', completed: true }, { key: 'dinner', label: 'Ужин', completed: false }],
  }));
  assert.match(html, /Ритм дня/);
  assert.match(html, /Приготовлено/);
  assert.match(html, /В плане/);
});
test('shopping exposes accessible progress that reflects checked and home items', () => {
  const html = renderToStaticMarkup(React.createElement(ShoppingScreen, {
    menuTitle: 'Test', items: [
      { id: 'a', name: 'A', amountLabel: '1', department: 'Яйца и молочное', checkedInStore: true },
      { id: 'b', name: 'B', amountLabel: '1', department: 'Яйца и молочное' },
    ], isStaleAfterMenuEdit: false, onRefreshShoppingFromMenu: noop,
    onToggleCheckedInStore: noop, onToggleAlreadyHave: noop,
  }));
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="50"/);
  assert.match(html, /width:50%/);
});
