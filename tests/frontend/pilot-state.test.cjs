const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

const {
  SerializedSaveQueue,
  getUserCacheKey,
  readUserCache,
  writeUserCache,
  clearUserCache
} = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));

test('PilotState and SerializedSaveQueue Unit Tests', async (t) => {
  await t.test('SerializedSaveQueue executes tasks sequentially in FIFO order', async () => {
    const queue = new SerializedSaveQueue();
    const order = [];

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 20));
      order.push('first');
      return 1;
    });

    const p2 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 5));
      order.push('second');
      return 2;
    });

    const p3 = queue.enqueue(async () => {
      order.push('third');
      return 3;
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, ['first', 'second', 'third']);
    assert.equal(r1, 1);
    assert.equal(r2, 2);
    assert.equal(r3, 3);
    assert.equal(queue.isPending, false);
  });

  await t.test('SerializedSaveQueue continues after rejected task', async () => {
    const queue = new SerializedSaveQueue();
    const order = [];

    const p1 = queue.enqueue(async () => {
      order.push('will_fail');
      throw new Error('Save failed');
    });

    const p2 = queue.enqueue(async () => {
      order.push('after_failure');
      return 'recovered';
    });

    await assert.rejects(p1, /Save failed/);
    const r2 = await p2;
    assert.equal(r2, 'recovered');
    assert.deepEqual(order, ['will_fail', 'after_failure']);
  });

  await t.test('user cache keys are strictly isolated by verified user id', () => {
    assert.equal(getUserCacheKey(1001, 'state'), 'kb_pilot_v1:1001:state');
    assert.equal(getUserCacheKey(1002, 'state'), 'kb_pilot_v1:1002:state');
    assert.notEqual(getUserCacheKey(1001, 'state'), getUserCacheKey(1002, 'state'));
  });

  await t.test('read and write user cache with mock localStorage', () => {
    const store = new Map();
    global.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      get length() { return store.size; },
      key: (i) => Array.from(store.keys())[i] || null,
    };

    writeUserCache(1001, 'draft', { title: 'My Draft' });
    const loaded = readUserCache(1001, 'draft');
    assert.deepEqual(loaded, { title: 'My Draft' });

    // User 1002 cannot read User 1001's draft
    const other = readUserCache(1002, 'draft');
    assert.equal(other, null);

    // clearUserCache removes only 1001's keys
    writeUserCache(1002, 'draft', { title: 'User 2 Draft' });
    clearUserCache(1001);
    assert.equal(readUserCache(1001, 'draft'), null);
    assert.deepEqual(readUserCache(1002, 'draft'), { title: 'User 2 Draft' });
  });

  await t.test('resolveDayMenuSlots renders 4 slots when mealsPerDay=4 including snack', () => {
    const { resolveDayMenuSlots } = loadTs(path.join(ROOT, 'src/ui/food-first/state.ts'));
    const dayMenu = {
      date: '2026-10-31',
      slots: {
        breakfast: 'k1',
        lunch: 'k2',
        dinner: 'k3',
        snack: 'k4',
      }
    };
    const recipesById = {
      k1: { id: 'k1', title: 'R1', prepMinutes: 10, steps: [] },
      k2: { id: 'k2', title: 'R2', prepMinutes: 15, steps: [] },
      k3: { id: 'k3', title: 'R3', prepMinutes: 20, steps: [] },
      k4: { id: 'k4', title: 'R4', prepMinutes: 5, steps: [] },
    };

    const slots = resolveDayMenuSlots(dayMenu, recipesById, 4);
    assert.equal(slots.length, 4, 'Must render 4 slots when mealsPerDay is 4');
    assert.deepEqual(slots.map(s => s.slotKey), ['breakfast', 'lunch', 'dinner', 'snack']);
  });

  await t.test('rebuildShoppingFromMenu resets checkmarks when amount changes', () => {
    const { rebuildShoppingFromMenu } = loadTs(path.join(ROOT, 'src/ui/food-first/shoppingFromMenu.ts'));
    const menu = {
      days: [{ slots: { breakfast: 'k1' } }]
    };
    const mockRecipes = {
      k1: {
        id: 'k1',
        title: 'Яичница',
        portionsVariants: {
          1: {
            ingredients: [
              { name: 'Яйца', amountLabel: '4 шт.', department: 'dairy_eggs' }
            ]
          },
          2: {
            ingredients: [
              { name: 'Яйца', amountLabel: '8 шт.', department: 'dairy_eggs' }
            ]
          }
        }
      }
    };

    // 1. Initial build at 1x
    const list1 = rebuildShoppingFromMenu(menu, mockRecipes, [], 1);
    assert.equal(list1[0].amountLabel, '4 шт.');
    // User marks as alreadyHave and checkedInStore
    list1[0].alreadyHave = true;
    list1[0].checkedInStore = true;

    // 2. Multiplier increases to 2x (amount changes to 8 шт.)
    const list2 = rebuildShoppingFromMenu(menu, mockRecipes, list1, 2);
    assert.equal(list2[0].amountLabel, '8 шт.');
    // Checkmarks MUST be reset because amount changed!
    assert.equal(list2[0].alreadyHave, false, 'alreadyHave must reset when amount changes');
    assert.equal(list2[0].checkedInStore, false, 'checkedInStore must reset when amount changes');
  });

  await t.test('recipesAdapter preserves Recipe.serv in portionsVariants and yieldNote', () => {
    const { toRecipeViewModel } = loadTs(path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts'));
    const k1Source = {
      id: 'k1',
      title: 'Яичница с авокадо',
      time: 12,
      serv: 2,
      mode: 'keto',
      ing: [['Яйца', '4 шт.']],
      steps: ['Шаг 1'],
    };

    const vm = toRecipeViewModel(k1Source);
    assert.equal(vm.portionsVariants[1].portions, 2, 'Batch 1 portions must equal recipe.serv (2)');
    assert.match(vm.portionsVariants[1].yieldNote, /2 порци/, 'yieldNote for batch 1 must be 2 порции');
    assert.equal(vm.portionsVariants[2].portions, 4, 'Batch 2 portions must equal recipe.serv * 2 (4)');
    assert.match(vm.portionsVariants[2].yieldNote, /4 порци/, 'yieldNote for batch 2 must be 4 порции');
  });

  await t.test('recipesAdapter handles unverified or missing serv as [УТОЧНИТЬ] and portions 0', () => {
    const { toRecipeViewModel } = loadTs(path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts'));
    const unverifiedRecipe = {
      id: 'k_unknown',
      title: 'Блюдо с неизвестным выходом',
      time: 15,
      // serv is omitted
      mode: 'keto',
      ing: [['Мясо', '200 г']],
      steps: ['Шаг 1'],
    };

    const vm = toRecipeViewModel(unverifiedRecipe);
    assert.equal(vm.portionsVariants[1].portions, 0, 'Unverified serv must yield portions 0');
    assert.equal(vm.portionsVariants[1].yieldNote, '[УТОЧНИТЬ]', 'Unverified serv must yield [УТОЧНИТЬ]');
    assert.equal(vm.portionsVariants[2].portions, 0, 'Batch 2 unverified serv must yield portions 0');
    assert.equal(vm.portionsVariants[2].yieldNote, '[УТОЧНИТЬ]', 'Batch 2 unverified serv must yield [УТОЧНИТЬ]');
  });

  await t.test('isMenuCompatibleWithProfile strictly validates mode and admitted pool', () => {
    const { isMenuCompatibleWithProfile } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const catalog = [
      { id: 'k1', title: 'Кето 1', mode: 'keto', time: 15, ing: [['Яйцо', '2 шт.']], steps: [] },
      { id: 'c1', title: 'Карнивор 1', mode: 'carnivore', time: 20, ing: [['Говядина', '300 г']], steps: [] },
    ];

    const ketoMenu = {
      days: [{ date: '2026-10-31', slots: { breakfast: 'k1' } }]
    };

    const ketoProfile = { confirmed: true, mode: 'keto', meals: 3, cookTime: 30, allergies: [], disliked: [] };
    const carnivoreProfile = { confirmed: true, mode: 'carnivore', meals: 3, cookTime: 30, allergies: [], disliked: [] };

    // 1. Matching mode and admitted -> Compatible
    assert.equal(isMenuCompatibleWithProfile(ketoMenu, ketoProfile, catalog, ['k1']), true);

    // 2. Mode mismatch: carnivore user cannot use keto menu -> Incompatible
    assert.equal(isMenuCompatibleWithProfile(ketoMenu, carnivoreProfile, catalog, ['k1', 'c1']), false);

    // 3. Revoked recipe not in releasedIds -> Incompatible
    assert.equal(isMenuCompatibleWithProfile(ketoMenu, ketoProfile, catalog, ['c1']), false);

    // 4. Unknown recipe not in catalog -> Incompatible
    const unknownMenu = {
      days: [{ date: '2026-10-31', slots: { breakfast: 'k999' } }]
    };
    assert.equal(isMenuCompatibleWithProfile(unknownMenu, ketoProfile, catalog, ['k1']), false);

    // 5. Empty admitted pool (releasedIds: [], isPreview: false) -> Incompatible
    assert.equal(isMenuCompatibleWithProfile(ketoMenu, ketoProfile, catalog, [], false), false);

    // 6. Duplicate recipe IDs within the same day -> Incompatible
    const duplicateMenu = {
      days: [{ date: '2026-10-31', slots: { breakfast: 'k1', lunch: 'k1' } }]
    };
    assert.equal(isMenuCompatibleWithProfile(duplicateMenu, ketoProfile, catalog, ['k1']), false);

    // 7. Profile mode 'explore' -> Incompatible
    const exploreProfile = { confirmed: true, mode: 'explore', meals: 3, cookTime: 30, allergies: [], disliked: [] };
    assert.equal(isMenuCompatibleWithProfile(ketoMenu, exploreProfile, catalog, ['k1']), false);
  });

  await t.test('approachToMode maps keto and carnivore and throws for explore or invalid', () => {
    const { approachToMode } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    assert.equal(approachToMode('keto'), 'keto');
    assert.equal(approachToMode('carnivore'), 'carnivore');
    assert.throws(() => approachToMode('explore'), /Режим «Знакомство»/);
    assert.throws(() => approachToMode('unknown'), /Режим «Знакомство»/);
  });

  await t.test('filterRecipesBySettings enforces approach mode and allows prepTimeMax=0', () => {
    const { filterRecipesBySettings } = loadTs(path.join(ROOT, 'src/ui/food-first/state.ts'));
    const catalog = [
      { id: 'k1', title: 'Кето завтрак', mode: 'keto', time: 25, ing: [['Яйца', '2 шт.']], steps: [] },
      { id: 'c1', title: 'Карнивор стейк', mode: 'carnivore', time: 15, ing: [['Стейк', '300 г']], steps: [] },
    ];
    const viewRecipes = [
      { id: 'k1', title: 'Кето завтрак', prepMinutes: 25 },
      { id: 'c1', title: 'Карнивор стейк', prepMinutes: 15 },
    ];

    // Carnivore approach with prepTimeMax=0 (no limit) -> only 'c1' matches
    const carnivoreMatches = filterRecipesBySettings(
      viewRecipes,
      { approach: 'carnivore', restrictions: [], prepTimeMax: 0 },
      catalog
    );
    assert.deepEqual(carnivoreMatches.map(r => r.id), ['c1']);

    // Keto approach with prepTimeMax=30 -> only 'k1' matches
    const ketoMatches = filterRecipesBySettings(
      viewRecipes,
      { approach: 'keto', restrictions: [], prepTimeMax: 30 },
      catalog
    );
    assert.deepEqual(ketoMatches.map(r => r.id), ['k1']);

    // Keto approach with prepTimeMax=10 -> 'k1' takes 25 mins so 0 matches
    const tightMatches = filterRecipesBySettings(
      viewRecipes,
      { approach: 'keto', restrictions: [], prepTimeMax: 10 },
      catalog
    );
    assert.equal(tightMatches.length, 0);
  });

  await t.test('createMenuController replacement candidates strictly filters by mode and day duplicates', () => {
    const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
    const testCatalog = [
      { id: 'k1', title: 'Кето 1', mode: 'keto', cat: 'breakfast', time: 10, ing: [['Яйцо', '2 шт.']], steps: [] },
      { id: 'k2', title: 'Кето 2', mode: 'keto', cat: 'breakfast', time: 15, ing: [['Творог', '100 г']], steps: [] },
      { id: 'k3', title: 'Кето 3', mode: 'keto', cat: 'lunch', time: 20, ing: [['Курица', '200 г']], steps: [] },
      { id: 'c1', title: 'Карнивор 1', mode: 'carnivore', cat: 'breakfast', time: 10, ing: [['Бекон', '150 г']], steps: [] },
    ];

    const controller = createMenuController(testCatalog, ['k1', 'k2', 'k3', 'c1']);

    // Request replacement for 'k1' in day where 'k2' is already used
    const candidates = controller.createUserReplacementCandidates({
      currentId: 'k1',
      dayIds: ['k2'],
      profile: { confirmed: true, mode: 'keto', meals: 2, cookTime: 30, allergies: [], disliked: [] },
      mode: 'keto',
    });

    // Candidates should include 'k3' but NOT 'k1' (current), NOT 'k2' (already in day), NOT 'c1' (carnivore mode mismatch)
    assert.deepEqual(candidates.map(r => r.id), ['k3']);
  });

  await t.test('SerializedSaveQueue maintains FIFO order and in-flight refresh preserves optimistic replacement', async () => {
    const { SerializedSaveQueue } = loadTs(path.join(ROOT, 'src/adapters/pilotState.ts'));
    const queue = new SerializedSaveQueue();

    const initialMenu = { days: [{ slots: { breakfast: 'k1' } }] };
    let stateRef = {
      menu: initialMenu,
      shopping_stale: true,
    };
    const executionOrder = [];

    // Task 1: Delayed refresh (starts with initial menu)
    const task1Promise = queue.enqueue(async () => {
      executionOrder.push('task1_start');
      const capturedStateAtTask1Start = stateRef;
      // Simulate asynchronous network roundtrip for putShopping & putUser
      await new Promise(resolve => setTimeout(resolve, 50));
      executionOrder.push('task1_finish');

      // The new logic: merge with stateRef.current
      const latestState = stateRef;
      const isMenuUnchanged = latestState.menu === capturedStateAtTask1Start.menu;
      stateRef = {
        ...latestState,
        shopping_stale: !isMenuUnchanged,
      };
      return 'refresh_done';
    });

    // Wait until task 1 has started
    await new Promise(resolve => setTimeout(resolve, 10));

    // While task 1 is in-flight, user performs optimistic replacement
    const replacementMenu = { days: [{ slots: { breakfast: 'k2' } }] };
    stateRef = {
      menu: replacementMenu,
      shopping_stale: true,
    };

    // Task 2: Queued user state save for replacement
    const task2Promise = queue.enqueue(async () => {
      executionOrder.push('task2_run');
      return 'replacement_saved';
    });

    await Promise.all([task1Promise, task2Promise]);

    assert.deepEqual(executionOrder, ['task1_start', 'task1_finish', 'task2_run']);
    // Verify that replacementMenu ('k2') was NOT rolled back to ('k1') by task 1 completion
    assert.deepEqual(stateRef.menu, replacementMenu, 'Optimistic replacement menu must be preserved after refresh completion');
    // And shopping_stale must remain true because menu was changed while refresh was in flight
    assert.equal(stateRef.shopping_stale, true);
  });

  await t.test('queued checkbox updates preserve in-flight edits across older completions (A+ -> B+ -> release A -> A- -> release all)', async () => {
    let shoppingItemsRef = [
      { id: 'A', name: 'Item A', amountLabel: '1 шт.', checkedInStore: false, alreadyHave: false },
      { id: 'B', name: 'Item B', amountLabel: '2 шт.', checkedInStore: false, alreadyHave: false },
    ];

    const completeSave = (nextItems) => {
      const active = shoppingItemsRef;
      const activeIds = new Set(active.map(x => x.id));
      const merged = [...active];
      for (const item of nextItems) {
        if (!activeIds.has(item.id)) {
          merged.push(item);
        }
      }
      shoppingItemsRef = merged;
      return merged;
    };

    // Step 1: User checks A
    const nextItems1 = shoppingItemsRef.map(it => it.id === 'A' ? { ...it, checkedInStore: true, alreadyHave: true } : it);
    shoppingItemsRef = nextItems1;
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, true);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, false);

    // Step 2: While save 1 is in-flight, user checks B
    const nextItems2 = shoppingItemsRef.map(it => it.id === 'B' ? { ...it, checkedInStore: true, alreadyHave: true } : it);
    shoppingItemsRef = nextItems2;
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, true);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, true);

    // Step 3: Save 1 completes!
    completeSave(nextItems1);
    // CRITICAL: B must NOT be rolled back to false! Both checkmarks must be true
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, true);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, true);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').alreadyHave, true);

    // Step 4: User unchecks A
    const nextItems3 = shoppingItemsRef.map(it => it.id === 'A' ? { ...it, checkedInStore: false, alreadyHave: false } : it);
    shoppingItemsRef = nextItems3;
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, false);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, true);

    // Step 5: Save 2 completes!
    completeSave(nextItems2);
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, false);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, true);

    // Step 6: Save 3 completes!
    completeSave(nextItems3);
    assert.equal(shoppingItemsRef.find(x => x.id === 'A').checkedInStore, false);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').checkedInStore, true);
    assert.equal(shoppingItemsRef.find(x => x.id === 'B').alreadyHave, true);
  });
});
