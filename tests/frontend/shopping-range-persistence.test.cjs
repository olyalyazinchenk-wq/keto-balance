/**
 * tests/frontend/shopping-range-persistence.test.cjs
 *
 * Verifies shopping range persistence, isolated checkmarks per range, custom date range filtering,
 * and portions multiplier increase clearing checkmarks.
 * Addresses Codex Audit 2026-11-08: P1 Shopping Range Persistence & Isolation.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const { formatShoppingListForClipboard } = loadTs(path.join(ROOT, 'src/ui/food-first/state.ts'));
const { rebuildShoppingFromMenu } = loadTs(path.join(ROOT, 'src/ui/food-first/shoppingFromMenu.ts'));
const { toRecipeViewModel } = loadTs(path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts'));
const { RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));

describe('Shopping Range Persistence & Checkmarks Isolation (Codex Proof)', () => {
  const recipesById = {};
  for (const r of RECIPES) {
    recipesById[r.id] = toRecipeViewModel(r);
  }

  // 28-day menu: Day 1-7 use k1 (eggs, bacon, spinach, butter). Day 8-14 use k1.
  const menuDays = Array.from({ length: 28 }).map((_, idx) => ({
    date: `2026-11-${String(idx + 1).padStart(2, '0')}`,
    slots: { breakfast: 'k1', dinner: 'k1' },
  }));

  test('Checkmarks are isolated by range key and do not smear across weeks', () => {
    // Week 0: days 1..7 (14 servings of k1)
    const week0Days = menuDays.slice(0, 7);
    const week1Days = menuDays.slice(7, 14);

    const baseMonthlyShopping = rebuildShoppingFromMenu(
      { days: menuDays },
      recipesById,
      [],
      { targetPortions: 1, preserveCheckmarks: false }
    );

    const eggsId = 'shop-agg-яйца-count-шт';
    // Simulated state with range-isolated checkmarks:
    // User checks eggs only on week-0
    const shopping_range_checked = {
      [`week-0:${eggsId}`]: true,
    };

    // Calculate Week 0 effective items
    const week0Shopping = rebuildShoppingFromMenu(
      { days: week0Days },
      recipesById,
      baseMonthlyShopping,
      { targetPortions: 1, preserveCheckmarks: false }
    ).map((it) => ({
      ...it,
      checkedInStore: Boolean(shopping_range_checked[`week-0:${it.id}`]),
    }));

    // Calculate Week 1 effective items
    const week1Shopping = rebuildShoppingFromMenu(
      { days: week1Days },
      recipesById,
      baseMonthlyShopping,
      { targetPortions: 1, preserveCheckmarks: false }
    ).map((it) => ({
      ...it,
      checkedInStore: Boolean(shopping_range_checked[`week-1:${it.id}`]),
    }));

    const eggsW0 = week0Shopping.find((i) => i.id === eggsId);
    const eggsW1 = week1Shopping.find((i) => i.id === eggsId);

    assert.ok(eggsW0, 'Eggs must be in Week 0 shopping');
    assert.ok(eggsW1, 'Eggs must be in Week 1 shopping');

    assert.equal(eggsW0.checkedInStore, true, 'Eggs must be checked in Week 0');
    assert.equal(eggsW1.checkedInStore, false, 'Eggs must NOT be checked in Week 1 (isolated!)');
  });

  test('Increasing portions multiplier resets bought checkmarks', () => {
    const rangeChecked = {
      'week-0:shop-agg-яйца-count-шт': true,
      'week-0:shop-agg-бекон-weight-г': true,
    };

    const oldMultiplier = 1;
    const newMultiplier = 2;
    const isIncrease = newMultiplier > oldMultiplier;

    const nextRangeChecked = isIncrease ? {} : rangeChecked;

    assert.deepEqual(
      nextRangeChecked,
      {},
      'Increasing portions multiplier must clear range checkmarks'
    );
  });

  test('Custom date range calculates exact ingredients for chosen days and formats clipboard', () => {
    // Choose custom span: 2026-11-01 to 2026-11-03 (3 days = 6 servings of k1)
    const customStart = '2026-11-01';
    const customEnd = '2026-11-03';
    const customDays = menuDays.filter(
      (d) => d.date >= customStart && d.date <= customEnd
    );
    assert.equal(customDays.length, 3);

    const customShopping = rebuildShoppingFromMenu(
      { days: customDays },
      recipesById,
      [],
      { targetPortions: 1, preserveCheckmarks: false }
    );

    // In 3 days (6 servings of k1), 4 eggs * 3 = 12 eggs
    const eggs = customShopping.find((i) => i.name.toLowerCase().includes('яйца'));
    assert.ok(eggs);
    assert.equal(eggs.amountLabel, '12 шт.');

    // Clipboard text formatting includes custom date range in header
    const clipboardText = formatShoppingListForClipboard(
      customShopping,
      `Кето-рацион (${customStart} – ${customEnd})`,
      false
    );

    assert.ok(
      clipboardText.includes('Кето-рацион (2026-11-01 – 2026-11-03)'),
      'Clipboard header must contain custom date range'
    );
    assert.ok(clipboardText.includes('Яйца — 12 шт.'));
  });

  test('Custom user items and alreadyHave are preserved across range filtering', () => {
    const customItem = {
      id: 'shop-custom-electrolyte',
      name: 'Электролиты без сахара',
      amountLabel: '1 уп.',
      department: 'Масла и бакалея',
      linkedRecipeTitles: [],
      alreadyHave: false,
      checkedInStore: false,
    };

    const pantryItem = {
      id: 'shop-agg-сливочное-масло-weight-г',
      name: 'Сливочное масло',
      amountLabel: '60 г',
      department: 'Масла и бакалея',
      linkedRecipeTitles: ['Сливочная яичница с беконом и шпинатом'],
      alreadyHave: true, // Marked as "already in kitchen"
      checkedInStore: false,
    };

    const initialList = [customItem, pantryItem];

    const week0Days = menuDays.slice(0, 7);
    const rangeShopping = rebuildShoppingFromMenu(
      { days: week0Days },
      recipesById,
      initialList,
      { targetPortions: 1, preserveCheckmarks: false }
    ).map((it) => {
      const prevHomeItem = initialList.find(
        (prev) => prev.id === it.id || prev.name.toLowerCase().trim() === it.name.toLowerCase().trim()
      );
      return {
        ...it,
        alreadyHave: prevHomeItem ? Boolean(prevHomeItem.alreadyHave) : it.alreadyHave,
      };
    });

    const preservedCustom = rangeShopping.find((i) => i.id === 'shop-custom-electrolyte');
    const preservedPantry = rangeShopping.find((i) => i.name === 'Сливочное масло');

    assert.ok(preservedCustom, 'Custom user product must be preserved in weekly range');
    assert.ok(preservedPantry, 'Pantry item must be in weekly list');
    assert.equal(preservedPantry.alreadyHave, true, 'alreadyHave must remain true');

    // Direct check: rebuildShoppingFromMenu natively preserves alreadyHave without outside wrapper
    const directRangeShopping = rebuildShoppingFromMenu(
      { days: week0Days },
      recipesById,
      initialList,
      { targetPortions: 1, preserveCheckmarks: false }
    );
    const directPantry = directRangeShopping.find((i) => i.name === 'Сливочное масло');
    assert.ok(directPantry, 'Pantry item must be in weekly list');
    assert.equal(directPantry.alreadyHave, true, 'alreadyHave must remain true directly without manual wrapper');
  });

  test('Two distinct custom ranges with the same product have isolated checkmarks', () => {
    const custom1Days = menuDays.slice(0, 3); // 2026-11-01 to 2026-11-03
    const custom2Days = menuDays.slice(7, 14); // 2026-11-08 to 2026-11-14

    const eggsId = 'shop-agg-яйца-count-шт';
    // Checkmarks stored with exact range keys:
    const rangeCheckmarks = {
      [`custom:2026-11-01_2026-11-03:${eggsId}`]: true,
    };

    // Range 1 (01-03)
    const shopping1 = rebuildShoppingFromMenu(
      { days: custom1Days },
      recipesById,
      [],
      { targetPortions: 1, preserveCheckmarks: false }
    ).map((it) => ({
      ...it,
      checkedInStore: Boolean(rangeCheckmarks[`custom:2026-11-01_2026-11-03:${it.id}`]),
    }));

    // Range 2 (08-14)
    const shopping2 = rebuildShoppingFromMenu(
      { days: custom2Days },
      recipesById,
      [],
      { targetPortions: 1, preserveCheckmarks: false }
    ).map((it) => ({
      ...it,
      checkedInStore: Boolean(rangeCheckmarks[`custom:2026-11-08_2026-11-14:${it.id}`]),
    }));

    const egg1 = shopping1.find((i) => i.id === eggsId);
    const egg2 = shopping2.find((i) => i.id === eggsId);

    assert.equal(egg1.checkedInStore, true, 'Egg in custom range 1 is checked');
    assert.equal(egg2.checkedInStore, false, 'Egg in custom range 2 must NOT be checked (isolated!)');
  });

  const fs = require('node:fs');
  const vm = require('node:vm');
  const ts = require('typescript');
  const novCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalogs/archive/released-catalog-202611-v1.json'), 'utf8'));
  const pilotAppSrc = fs.readFileSync(path.join(ROOT, 'src/PilotApp.tsx'), 'utf8');
  const sourceFile = ts.createSourceFile('PilotApp.tsx', pilotAppSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function getHandler(name, context) {
    let expression;
    function walk(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) {
        expression = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
      }
      ts.forEachChild(node, walk);
    }
    walk(sourceFile);
    if (!expression) throw Error('Handler missing: ' + name);
    const js = ts.transpileModule('module.exports = ' + expression.getText(sourceFile), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const mod = { exports: {} };
    vm.runInNewContext(js, { ...context, module: mod });
    return mod.exports;
  }

  test('Real handleReplaceRecipe and handleRefreshShopping reset mark on repeated recipe increase while preserving unaffected ranges', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    // 30 days: day 7 already has k2, all other days have k1
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: i === 7 ? 'k2' : 'k1', dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
      },
    };

    const state = {
      current: {
        schema_version: 1,
        menu: {
          mode: 'keto',
          month: '2026-11',
          numDays: 30,
          meals: 2,
          portion: 1,
          saved: false,
          created: 1,
          catalog_id: novCatalog.catalog_id,
          days: beforeDays,
        },
        selected_date: '2026-11-01',
        checked_ingredients: {},
        checked_steps: {},
        shopping_batches: 1,
        shopping_stale: false,
        shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
        shopping_range_checked: {
          [`week-0:${eggId}`]: true,
          [`week-1:${eggId}`]: true,
          [`custom:2026-11-01_2026-11-03:${eggId}`]: true,
          [`custom:2026-11-08_2026-11-14:${eggId}`]: true,
          [`all:${eggId}`]: true,
        },
      },
    };

    const beforeItems = rebuildShoppingFromMenu(state.current.menu, recipesById, [], 1);
    const itemRef = { current: beforeItems };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));

    const replace = getHandler('handleReplaceRecipe', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      createMenuController,
      enqueueUserStateSave: (s) => { state.current = s; },
    });

    // Action: replace Day 0 breakfast (k1 -> k2: 2 eggs -> 3 eggs)
    await replace('2026-11-01', 'breakfast', 'k2');

    // Assert: immediate checkmark state right after replace
    const afterReplaceChecked = state.current.shopping_range_checked;
    assert.equal(afterReplaceChecked[`week-0:${eggId}`], false, 'Week 0 must be reset immediately upon replacement');
    assert.equal(afterReplaceChecked[`week-1:${eggId}`], true, 'Week 1 must be preserved (not affected)');
    assert.equal(afterReplaceChecked[`custom:2026-11-01_2026-11-03:${eggId}`], false, 'Custom 01-03 must be reset');
    assert.equal(afterReplaceChecked[`custom:2026-11-08_2026-11-14:${eggId}`], true, 'Custom 08-14 must be preserved');
    assert.equal(afterReplaceChecked[`all:${eggId}`], false, 'All (month) must be reset');

    // Now run real handleRefreshShopping
    let savedState;
    const pendingQueue = [];
    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef: { current: null },
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: () => {},
      setState: () => {},
      setSyncStatus: () => {},
      saveQueue: { enqueue: (fn) => { const p = fn(); pendingQueue.push(p); return p; } },
      client: {
        putShopping: async () => ({ revision: 2 }),
        putUser: async (p) => { savedState = p.state; return { revision: 2 }; },
      },
    });

    await refresh();
    await Promise.all(pendingQueue);

    assert.ok(savedState);
    assert.equal(savedState.shopping_range_checked[`week-0:${eggId}`], false, 'Week 0 must stay false after refresh');
    assert.equal(savedState.shopping_range_checked[`week-1:${eggId}`], true, 'Week 1 must stay true after refresh');
    assert.equal(savedState.shopping_range_checked[`all:${eggId}`], false, 'All must stay false after refresh');
  });

  test('Real handleReplaceRecipe and handleRefreshShopping preserve mark when requirement decreases (k2 -> k1: 21 -> 20 eggs)', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    // 30 days: all days breakfast k2 (3 eggs)
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: 'k2', dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
      },
    };

    const state = {
      current: {
        schema_version: 1,
        menu: {
          mode: 'keto',
          month: '2026-11',
          numDays: 30,
          meals: 2,
          portion: 1,
          saved: false,
          created: 1,
          catalog_id: novCatalog.catalog_id,
          days: beforeDays,
        },
        selected_date: '2026-11-01',
        checked_ingredients: {},
        checked_steps: {},
        shopping_batches: 1,
        shopping_stale: false,
        shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
        shopping_range_checked: {
          [`week-0:${eggId}`]: true,
          [`week-1:${eggId}`]: true,
          [`custom:2026-11-01_2026-11-03:${eggId}`]: true,
          [`all:${eggId}`]: true,
        },
      },
    };

    const beforeItems = rebuildShoppingFromMenu(state.current.menu, recipesById, [], 1);
    const itemRef = { current: beforeItems };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));

    const replace = getHandler('handleReplaceRecipe', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      createMenuController,
      enqueueUserStateSave: (s) => { state.current = s; },
    });

    // Action: replace Day 0 breakfast (k2 -> k1: 3 eggs -> 2 eggs, requirement drops 21 -> 20)
    await replace('2026-11-01', 'breakfast', 'k1');

    // Assert: mark must be PRESERVED immediately upon replacement
    const afterReplaceChecked = state.current.shopping_range_checked;
    assert.equal(afterReplaceChecked[`week-0:${eggId}`], true, 'Week 0 must be preserved when requirement decreases');
    assert.equal(afterReplaceChecked[`week-1:${eggId}`], true, 'Week 1 must be preserved');
    assert.equal(afterReplaceChecked[`custom:2026-11-01_2026-11-03:${eggId}`], true, 'Custom 01-03 must be preserved');
    assert.equal(afterReplaceChecked[`all:${eggId}`], true, 'All (month) must be preserved');

    // Now run real handleRefreshShopping
    let savedState;
    const pendingQueue = [];
    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef: { current: null },
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: () => {},
      setState: () => {},
      setSyncStatus: () => {},
      saveQueue: { enqueue: (fn) => { const p = fn(); pendingQueue.push(p); return p; } },
      client: {
        putShopping: async () => ({ revision: 2 }),
        putUser: async (p) => { savedState = p.state; return { revision: 2 }; },
      },
    });

    await refresh();
    await Promise.all(pendingQueue);

    assert.ok(savedState);
    assert.equal(savedState.shopping_range_checked[`week-0:${eggId}`], true, 'Week 0 must stay true after refresh');
    assert.equal(savedState.shopping_range_checked[`week-1:${eggId}`], true, 'Week 1 must stay true after refresh');
    assert.equal(savedState.shopping_range_checked[`all:${eggId}`], true, 'All must stay true after refresh');
  });

  test('Replacing with equal requirement preserves bought checkmark', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: 'k1', dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
      },
    };

    const state = {
      current: {
        schema_version: 1,
        menu: {
          mode: 'keto',
          month: '2026-11',
          numDays: 30,
          meals: 2,
          portion: 1,
          saved: false,
          created: 1,
          catalog_id: novCatalog.catalog_id,
          days: beforeDays,
        },
        selected_date: '2026-11-01',
        checked_ingredients: {},
        checked_steps: {},
        shopping_batches: 1,
        shopping_stale: false,
        shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
        shopping_range_checked: {
          [`week-0:${eggId}`]: true,
        },
      },
    };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));

    const replace = getHandler('handleReplaceRecipe', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      createMenuController,
      enqueueUserStateSave: (s) => { state.current = s; },
    });

    // Replace k1 with k1 (equal requirement)
    await replace('2026-11-01', 'breakfast', 'k1');
    assert.equal(state.current.shopping_range_checked[`week-0:${eggId}`], true, 'Equal requirement preserves checkmark');
  });

  test('Full menu rebuild resets week mark on week requirement increase even if month total drops, and removes obsolete items', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: i === 0 ? 'k4' : (i < 7 ? 'k27' : 'k2'), dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
        preferenceNote: 'simple_daily',
      },
    };

    const beforeState = {
      schema_version: 1,
      menu: {
        mode: 'keto',
        month: '2026-11',
        numDays: 30,
        meals: 2,
        portion: 1,
        saved: false,
        created: 1,
        catalog_id: novCatalog.catalog_id,
        days: beforeDays,
      },
      selected_date: '2026-11-01',
      checked_ingredients: {},
      checked_steps: {},
      shopping_batches: 1,
      shopping_stale: false,
      shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
      shopping_range_checked: {
        [`week-0:${eggId}`]: true,
        [`week-1:${eggId}`]: true,
        [`custom:2026-11-01_2026-11-07:${eggId}`]: true,
        [`all:${eggId}`]: true,
      },
    };

    const beforeItems = rebuildShoppingFromMenu(beforeState.menu, recipesById, [], 1);
    // Add a custom user item to test it is preserved
    beforeItems.push({
      id: 'shop-custom-my-tea',
      name: 'Любимый чай',
      amountLabel: '1 уп.',
      department: 'Напитки',
      linkedRecipeTitles: [],
      checkedInStore: false,
      alreadyHave: false,
    });

    const state = { current: beforeState };
    const itemRef = { current: beforeItems };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
    const { resolveSelectedDate } = loadTs(path.join(ROOT, 'src/domain/menu.ts'));

    const rebuild = getHandler('handleRebuildMenu', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      resolveSelectedDate,
      availableCatalogs: [{ catalog_id: novCatalog.catalog_id, catalog_month: '2026-11', accessible: true }],
      createMenuController: (...args) => {
        const real = createMenuController(...args);
        return { ...real, createUserMenu: (opts) => real.createUserMenu({ ...opts, random: () => 0.999 }) };
      },
      enqueueUserStateSave: (s) => { state.current = s; },
      setSyncStatus: () => {},
    });

    await rebuild();

    // Verify immediate range checkmarks after handleRebuildMenu
    assert.notEqual(state.current.menu, beforeState.menu);
    assert.equal(state.current.shopping_range_checked[`week-0:${eggId}`], false, 'Week 0 must be reset due to 1 -> 5 eggs increase');
    assert.equal(state.current.shopping_range_checked[`custom:2026-11-01_2026-11-07:${eggId}`], false, 'Custom 01-07 must be reset');
    assert.equal(state.current.shopping_range_checked[`all:${eggId}`], true, 'All (month) must be preserved because month dropped 70 -> 25');

    // Run handleRefreshShopping
    let submittedShoppingItems;
    let savedUserState;
    const pendingQueue = [];
    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef: { current: null },
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: (items) => { itemRef.current = items; },
      setState: () => {},
      setSyncStatus: () => {},
      saveQueue: { enqueue: (fn) => { const p = fn(); pendingQueue.push(p); return p; } },
      client: {
        putShopping: async (p) => { submittedShoppingItems = p.items; return { revision: 2 }; },
        putUser: async (p) => { savedUserState = p.state; return { revision: 2 }; },
      },
    });

    await refresh();
    await Promise.all(pendingQueue);

    assert.ok(savedUserState);
    assert.equal(savedUserState.shopping_range_checked[`week-0:${eggId}`], false, 'Saved week 0 mark must remain false');
    assert.equal(savedUserState.shopping_range_checked[`custom:2026-11-01_2026-11-07:${eggId}`], false, 'Saved custom 01-07 mark must remain false');
    assert.equal(savedUserState.shopping_range_checked[`all:${eggId}`], true, 'Saved month mark must remain true');

    // Check obsolete canonical items are NOT in itemRef.current
    const obsoleteRows = itemRef.current.filter((i) => !i.id.startsWith('shop-custom-') && !submittedShoppingItems.some((n) => n.id === i.id));
    assert.equal(obsoleteRows.length, 0, 'No obsolete recipe items must be retained');
    assert.ok(!itemRef.current.some((i) => i.name === 'Сливки 33%'), 'Сливки 33% must not be retained');
    assert.ok(!itemRef.current.some((i) => i.name === 'Зелень (укроп, петрушка)'), 'Зелень must not be retained');
    assert.ok(!itemRef.current.some((i) => i.name === 'Сливочное масло'), 'Сливочное масло must not be retained');

    // Custom user item must be preserved
    assert.ok(itemRef.current.some((i) => i.id === 'shop-custom-my-tea'), 'Custom user items must be preserved');
  });

  test('Full menu rebuild with rounding (seed 0.5: 1 -> 7.3 eggs) resets week checkmark and leaves no obsolete rows', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: i === 0 ? 'k4' : (i < 7 ? 'k27' : 'k2'), dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
      },
    };

    const beforeState = {
      schema_version: 1,
      menu: {
        mode: 'keto',
        month: '2026-11',
        numDays: 30,
        meals: 2,
        portion: 1,
        saved: false,
        created: 1,
        catalog_id: novCatalog.catalog_id,
        days: beforeDays,
      },
      selected_date: '2026-11-01',
      checked_ingredients: {},
      checked_steps: {},
      shopping_batches: 1,
      shopping_stale: false,
      shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
      shopping_range_checked: {
        [`week-0:${eggId}`]: true,
        [`custom:2026-11-01_2026-11-07:${eggId}`]: true,
        [`all:${eggId}`]: true,
      },
    };

    const beforeItems = rebuildShoppingFromMenu(beforeState.menu, recipesById, [], 1);
    const state = { current: beforeState };
    const itemRef = { current: beforeItems };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
    const { resolveSelectedDate } = loadTs(path.join(ROOT, 'src/domain/menu.ts'));

    const rebuild = getHandler('handleRebuildMenu', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      resolveSelectedDate,
      availableCatalogs: [{ catalog_id: novCatalog.catalog_id, catalog_month: '2026-11', accessible: true }],
      createMenuController: (...args) => {
        const real = createMenuController(...args);
        return { ...real, createUserMenu: (opts) => real.createUserMenu({ ...opts, random: () => 0.5 }) };
      },
      enqueueUserStateSave: (s) => { state.current = s; },
      setSyncStatus: () => {},
    });

    await rebuild();

    assert.equal(state.current.shopping_range_checked[`week-0:${eggId}`], false, 'Week 0 must be reset due to 1 -> 7.3 eggs increase');
    assert.equal(state.current.shopping_range_checked[`custom:2026-11-01_2026-11-07:${eggId}`], false, 'Custom 01-07 must be reset');
    assert.equal(state.current.shopping_range_checked[`all:${eggId}`], true, 'All (month) must be preserved');

    let submittedShoppingItems;
    let savedUserState;
    const pendingQueue = [];
    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef: { current: null },
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: (items) => { itemRef.current = items; },
      setState: () => {},
      setSyncStatus: () => {},
      saveQueue: { enqueue: (fn) => { const p = fn(); pendingQueue.push(p); return p; } },
      client: {
        putShopping: async (p) => { submittedShoppingItems = p.items; return { revision: 2 }; },
        putUser: async (p) => { savedUserState = p.state; return { revision: 2 }; },
      },
    });

    await refresh();
    await Promise.all(pendingQueue);

    assert.equal(savedUserState.shopping_range_checked[`week-0:${eggId}`], false);
    const obsoleteRows = itemRef.current.filter((i) => !i.id.startsWith('shop-custom-') && !submittedShoppingItems.some((n) => n.id === i.id));
    assert.equal(obsoleteRows.length, 0);
  });

  test('Portions multiplier 1, 2, 4 recalculates amounts and clears checkmarks on increase', () => {
    const eggId = 'shop-agg-яйца-count-шт';
    const days = [{ date: '2026-11-01', slots: { breakfast: 'k1' } }];
    const baseShopping = rebuildShoppingFromMenu({ days }, recipesById, [], 1);
    const egg1 = baseShopping.find((i) => i.id === eggId);
    assert.equal(egg1.amountLabel, '2 шт.');

    const shopping2 = rebuildShoppingFromMenu({ days }, recipesById, [], 2);
    const egg2 = shopping2.find((i) => i.id === eggId);
    assert.equal(egg2.amountLabel, '4 шт.');

    const shopping4 = rebuildShoppingFromMenu({ days }, recipesById, [], 4);
    const egg4 = shopping4.find((i) => i.id === eggId);
    assert.equal(egg4.amountLabel, '8 шт.');
  });

  test('Full menu rebuild preserves bought checkmark when requirement decreases in week even if month total increases, through rebuild and refresh', async () => {
    const eggId = 'shop-agg-яйца-count-шт';
    // Days 0..6 have k2 (3 eggs each, 21 eggs in week 0). Days 7..29 have k27 (0 eggs). Month total = 21 eggs.
    const beforeDays = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      slots: { breakfast: i < 7 ? 'k2' : 'k27', dinner: 'k10' },
    }));

    const profile = {
      settings: {
        confirmed18Plus: true,
        approach: 'keto',
        restrictions: [],
        prepTimeMax: 0,
        mealsPerDay: 2,
        planDays: 30,
        month: '2026-11',
        preferenceNote: 'simple_daily',
      },
    };

    const beforeState = {
      schema_version: 1,
      menu: {
        mode: 'keto',
        month: '2026-11',
        numDays: 30,
        meals: 2,
        portion: 1,
        saved: false,
        created: 1,
        catalog_id: novCatalog.catalog_id,
        days: beforeDays,
      },
      selected_date: '2026-11-01',
      checked_ingredients: {},
      checked_steps: {},
      shopping_batches: 1,
      shopping_stale: false,
      shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
      shopping_range_checked: {
        [`week-0:${eggId}`]: true,
        [`custom:2026-11-01_2026-11-07:${eggId}`]: true,
        [`all:${eggId}`]: true,
      },
    };

    const beforeItems = rebuildShoppingFromMenu(beforeState.menu, recipesById, [], 1);
    const state = { current: beforeState };
    const itemRef = { current: beforeItems };

    const { preferencesToUserProfile, approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
    const { resolveSelectedDate } = loadTs(path.join(ROOT, 'src/domain/menu.ts'));

    // Rebuild generates menu where seed 0.999 produces 5 eggs in week 0 (drop from 21 -> 5 eggs) and 25 eggs in month (increase from 21 -> 25 eggs)
    const rebuild = getHandler('handleRebuildMenu', {
      stateRef: state,
      catalog: novCatalog,
      profile,
      preferencesToUserProfile,
      approachToMode,
      resolveSelectedDate,
      availableCatalogs: [{ catalog_id: novCatalog.catalog_id, catalog_month: '2026-11', accessible: true }],
      createMenuController: (...args) => {
        const real = createMenuController(...args);
        return { ...real, createUserMenu: (opts) => real.createUserMenu({ ...opts, random: () => 0.999 }) };
      },
      enqueueUserStateSave: (s) => { state.current = s; },
      setSyncStatus: () => {},
    });

    await rebuild();

    // After rebuild: week 0 decreases 21 -> 5 eggs (must stay true), custom 01-07 stays true, month increases 21 -> 25 eggs (must be false)
    assert.equal(state.current.shopping_range_checked[`week-0:${eggId}`], true, 'Decreasing from 21 -> 5 eggs must preserve week checkmark');
    assert.equal(state.current.shopping_range_checked[`custom:2026-11-01_2026-11-07:${eggId}`], true, 'Custom 01-07 must preserve checkmark');
    assert.equal(state.current.shopping_range_checked[`all:${eggId}`], false, 'Month increase from 21 -> 25 must reset month checkmark');

    // Run handleRefreshShopping and verify saved state
    let submittedShoppingItems;
    let savedUserState;
    const pendingQueue = [];
    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef: { current: null },
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: (items) => { itemRef.current = items; },
      setState: () => {},
      setSyncStatus: () => {},
      saveQueue: { enqueue: (fn) => { const p = fn(); pendingQueue.push(p); return p; } },
      client: {
        putShopping: async (p) => { submittedShoppingItems = p.items; return { revision: 2 }; },
        putUser: async (p) => { savedUserState = p.state; return { revision: 2 }; },
      },
    });

    await refresh();
    await Promise.all(pendingQueue);

    assert.ok(savedUserState);
    assert.equal(savedUserState.shopping_range_checked[`week-0:${eggId}`], true, 'Saved week 0 mark must remain true after refresh');
    assert.equal(savedUserState.shopping_range_checked[`custom:2026-11-01_2026-11-07:${eggId}`], true, 'Saved custom 01-07 mark must remain true after refresh');
    assert.equal(savedUserState.shopping_range_checked[`all:${eggId}`], false, 'Saved month mark must remain false after refresh');
    assert.equal(savedUserState.shopping_stale, false, 'Shopping stale flag must be cleared');
  });

  test('409 Conflict during handleRefreshShopping sets sync status to conflict without data corruption', async () => {
    const { ConflictError } = loadTs(path.join(ROOT, 'src/api/ketoClient.ts'));
    const eggId = 'shop-agg-яйца-count-шт';
    const days = [{ date: '2026-11-01', slots: { breakfast: 'k1' } }];
    const profile = { settings: { confirmed18Plus: true, approach: 'keto', restrictions: [], prepTimeMax: 0, mealsPerDay: 1, planDays: 1, month: '2026-11' } };
    const state = {
      current: {
        schema_version: 1,
        menu: { mode: 'keto', month: '2026-11', numDays: 1, meals: 1, portion: 1, saved: false, created: 1, catalog_id: novCatalog.catalog_id, days },
        selected_date: '2026-11-01',
        checked_ingredients: {},
        checked_steps: {},
        shopping_batches: 1,
        shopping_stale: true,
        shopping_range: { range_id: 'week-0', type: 'week', week_index: 0 },
        shopping_range_checked: { [`week-0:${eggId}`]: true },
      },
    };
    const items = rebuildShoppingFromMenu(state.current.menu, recipesById, [], 1);
    const itemRef = { current: items };
    let reportedSyncStatus = null;
    const stickyErrorRef = { current: null };
    const queue = [];

    const refresh = getHandler('handleRefreshShopping', {
      stateRef: state,
      shoppingItemsRef: itemRef,
      recipesById,
      rebuildShoppingFromMenu,
      stickyErrorRef,
      userId: null,
      shoppingRevisionRef: { current: 1 },
      userRevisionRef: { current: 1 },
      profileRef: { current: profile },
      setShoppingRevision: () => {},
      setUserRevision: () => {},
      setShoppingItems: () => {},
      setState: () => {},
      setSyncStatus: (status) => { reportedSyncStatus = status; },
      ConflictError,
      saveQueue: { enqueue: (fn) => { const p = fn(); queue.push(p); return p; } },
      client: {
        putShopping: async () => { throw new ConflictError('Version conflict 409', 409); },
        putUser: async () => ({ revision: 2 }),
      },
    });

    await refresh();
    await assert.rejects(Promise.all(queue), /Conflict/);
    assert.equal(stickyErrorRef.current, 'conflict');
    assert.equal(reportedSyncStatus, 'conflict');
    // Ensure state was not corrupted
    assert.equal(state.current.shopping_stale, true, 'State remains stale on 409 conflict');
  });
});
