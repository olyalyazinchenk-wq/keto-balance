const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { loadTs } = require('../helpers/load-ts.cjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
const source = ts.createSourceFile('PilotApp.tsx', fs.readFileSync(path.join(root, 'src/PilotApp.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(name, context) {
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      callback = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, name);
  const js = ts.transpileModule('module.exports = ' + callback.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(js, { ...context, module: result });
  return result.exports;
}

for (const [approach, mode] of [['carnivore', 'carnivore'], ['keto', 'carnivore'], ['carnivore', 'keto']]) {
  for (const callback of ['handleReplaceRecipe', 'handleRebuildMenu']) {
    test(`${callback} refuses legacy ${approach}/${mode} without generation or writes and retains exclusions`, async () => {
      const restrictions = ['exclude_eggs', 'exclude_dairy', 'exclude_nuts'];
      const profile = { settings: { confirmed18Plus: true, approach, restrictions, prepTimeMax: 45, mealsPerDay: 2 } };
      const state = { menu: { mode, days: [{ date: '2026-11-01', slots: { breakfast: 'c1' } }] }, checked_steps: { 'c1:0': true } };
      const shopping = [{ id: 'own-item', name: 'Мой продукт', checkedInStore: true }];
      const before = JSON.stringify({ profile, state, shopping });
      const ui = {};
      const forbidden = () => assert.fail('legacy menu must not generate, fetch or save');
      const run = handler(callback, {
        profile, catalog: { catalog_id: 'legacy', recipes: [{ id: 'c1', mode: 'carnivore' }] },
        stateRef: { current: state },
        setMonthlyCatalogError: () => {},
        setDraftApproach: value => { ui.approach = value; },
        setDraftRestrictions: value => { ui.restrictions = value; },
        setErrorMessage: value => { ui.message = value; },
        setPhase: value => { ui.phase = value; },
        enqueueUserStateSave: forbidden,
        createMenuController: forbidden,
        preferencesToUserProfile: forbidden,
        approachToMode: forbidden,
        client: { getCatalog: forbidden, putUser: forbidden, putShopping: forbidden },
      });
      await run('2026-11-01', 'breakfast', 'k1');
      assert.equal(ui.approach, 'keto');
      assert.deepEqual(Array.from(ui.restrictions), restrictions);
      assert.equal(ui.phase, 'needs_settings');
      assert.match(ui.message, /Прежн.*сохран|Сохран.*прежн/i);
      assert.equal(JSON.stringify({ profile, state, shopping }), before);
    });
  }
}

test('opening keto settings from a legacy plan retains individual exclusions and cooking preferences', () => {
  const restrictions = ['exclude_eggs', 'exclude_fish', 'exclude_nuts'];
  const settings = { confirmed18Plus: true, approach: 'carnivore', restrictions, prepTimeMax: 45, mealsPerDay: 2, planDays: 7 };
  const before = JSON.stringify(settings);
  const draft = {};
  handler('handleOpenSettings', {
    profile: { settings }, state: { menu: { mode: 'carnivore', days: [] } },
    setDraftConfirmed18: value => { draft.confirmed18 = value; },
    setDraftApproach: value => { draft.approach = value; },
    setDraftRestrictions: value => { draft.restrictions = value; },
    setDraftPrepTime: value => { draft.prepTimeMax = value; },
    setDraftMealsPerDay: value => { draft.mealsPerDay = value; },
    setDraftPlanDays: value => { draft.planDays = value; },
    setDraftMonth: () => {}, setGatePassed: () => {}, setViewHomeBeforeGate: () => {},
    setPhase: value => { draft.phase = value; }, setErrorMessage: () => {},
  })();
  assert.equal(draft.approach, 'keto');
  assert.deepEqual(Array.from(draft.restrictions), restrictions);
  assert.equal(draft.prepTimeMax, 45);
  assert.equal(draft.mealsPerDay, 2);
  assert.equal(draft.planDays, 7);
  assert.equal(draft.phase, 'needs_settings');
  assert.equal(JSON.stringify(settings), before);
});

function renderApp(approach, mode, extra = {}) {
  const { FoodFirstApp } = loadTs(path.join(root, 'src/ui/food-first/FoodFirstApp.tsx'));
  const { RECIPES } = loadTs(path.join(root, 'src/data/recipes.ts'));
  const oldWindow = global.window;
  global.window = { location: { search: '?screen=menu', hash: '' } };
  const recipe = RECIPES.find(r => r.mode === mode);
  try {
    return ReactDOMServer.renderToStaticMarkup(React.createElement(FoodFirstApp, {
      catalog: { schema_version: 1, catalog_id: 'read-only-fixture', test_only: false, released_ids: [recipe.id], recipes: [recipe] },
      profile: { settings: { confirmed18Plus: true, approach, restrictions: [], prepTimeMax: 0, mealsPerDay: 2 } },
      state: { menu: { mode, numDays: 1, meals: 2, days: [{ date: '2026-11-01', slots: { breakfast: recipe.id } }] },
        selected_date: '2026-11-01', checked_ingredients: {}, checked_steps: {}, shopping_batches: 1, shopping_stale: false },
      shoppingItems: [], syncStatus: 'idle', onOpenSettings: () => {}, subscription: { is_premium: true },
      ...extra,
    }));
  } finally {
    global.window = oldWindow;
  }
}

test('legacy menu remains visible as saved content with explicit keto action, without replacement controls', () => {
  const html = renderApp('carnivore', 'carnivore');
  assert.ok(html.includes('data-testid="legacy-plan-notice"'));
  assert.ok(html.includes('data-testid="legacy-plan-create-keto"'));
  assert.ok(html.includes('Ваш прежний рацион сохранён'));
  assert.ok(html.includes('data-testid="menu-slot-breakfast"'), 'saved meal stays readable');
  assert.ok(!html.includes('data-testid="replace-slot-btn-'));
  assert.ok(!html.includes('data-testid="menu-rebuild-button"'));
  assert.ok(!html.includes('Карнивор'));
});

test('keto plan keeps replacement controls and shows no migration warning', () => {
  const html = renderApp('keto', 'keto');
  assert.ok(html.includes('data-testid="replace-slot-btn-breakfast"'));
  assert.ok(html.includes('data-testid="menu-rebuild-button"'));
  assert.ok(!html.includes('data-testid="legacy-plan-notice"'));
  assert.ok(!html.includes('data-testid="pilot-sync-banner"'));
});

test('save and shopping notices are event-specific and contain no internal status terminology', () => {
  const error = renderApp('keto', 'keto', { syncStatus: 'error' });
  assert.ok(error.includes('Не удалось сохранить изменения'));
  assert.ok(!error.includes('Ошибка синхронизации'));
  const saving = renderApp('keto', 'keto', { syncStatus: 'saving' });
  assert.ok(saving.includes('Сохраняем изменения'));
  assert.ok(!saving.includes('Тестовый каталог'));
});

test('explicit keto plan submission preserves own products and exclusions while recalculating shopping', async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalogs/archive/released-catalog-202611-v1.json'), 'utf8'));
  const { preferencesToUserProfile } = loadTs(path.join(root, 'src/adapters/pilotState.ts'));
  const { createMenuController } = loadTs(path.join(root, 'src/adapters/menuController.ts'));
  const { resolveSelectedDate } = loadTs(path.join(root, 'src/domain/menu.ts'));
  const { toRecipeViewModel } = loadTs(path.join(root, 'src/ui/food-first/recipesAdapter.ts'));
  const { rebuildShoppingFromMenu } = loadTs(path.join(root, 'src/ui/food-first/shoppingFromMenu.ts'));
  const custom = { id: 'shop-custom-user-tea', name: 'Мой чай', amountLabel: '1 уп.', department: 'Напитки', linkedRecipeTitles: [], checkedInStore: true, alreadyHave: false };
  const shoppingRef = { current: [custom] };
  const userWrites = [];
  const shoppingWrites = [];
  const pending = [];
  let phase;
  const noop = () => {};
  const context = {
    draftConfirmed18: true, draftApproach: 'keto', draftRestrictions: ['exclude_nuts'], draftPrepTime: 0,
    draftMealsPerDay: 2, draftPlanDays: 3, draftMonth: '', catalog,
    recipesById: {}, preferencesToUserProfile, createMenuController, resolveSelectedDate, toRecipeViewModel, rebuildShoppingFromMenu,
    stateRef: { current: { menu: { mode: 'carnivore', days: [] }, selected_date: null } },
    shoppingItemsRef: shoppingRef, profileRef: { current: null }, userRevisionRef: { current: 1 }, shoppingRevisionRef: { current: 1 }, stickyErrorRef: { current: null },
    userId: null,
    client: {
      putUser: async data => { userWrites.push(data); return { revision: userWrites.length + 1 }; },
      putShopping: async data => { shoppingWrites.push(data); return { revision: 2 }; },
    },
    saveQueue: { enqueue: fn => { const result = fn(); pending.push(result); return result; } },
    setPhase: value => { phase = value; }, setErrorMessage: message => { if (message) assert.fail(message); },
    setMonthlyCatalogError: noop, setSyncStatus: noop, setCatalog: noop, setProfile: noop, setState: noop,
    setShoppingItems: noop, setUserRevision: noop, setShoppingRevision: noop,
    ApiError: class ApiError extends Error {}, ConflictError: class ConflictError extends Error {},
  };
  await handler('handleSubmitSettings', context)({ preventDefault() {} });
  await Promise.all(pending);
  assert.equal(phase, 'ready');
  assert.equal(userWrites.length, 2);
  assert.equal(userWrites[1].profile.settings.approach, 'keto');
  assert.equal(userWrites[1].state.menu.mode, 'keto');
  assert.deepEqual(Array.from(userWrites[1].profile.settings.restrictions), ['exclude_nuts']);
  assert.equal(shoppingWrites.length, 1);
  assert.deepEqual(shoppingWrites[0].items.find(item => item.id === custom.id), custom);
  assert.ok(shoppingWrites[0].items.some(item => item.id.startsWith('shop-agg-')));
});
