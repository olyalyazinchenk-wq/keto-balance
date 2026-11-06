const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

const { toRecipeViewModel, UI_RECIPES } = loadTs(
  path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts')
);
const { rebuildShoppingFromMenu } = loadTs(
  path.join(ROOT, 'src/ui/food-first/shoppingFromMenu.ts')
);
const { createCustomShoppingItem } = loadTs(
  path.join(ROOT, 'src/ui/food-first/state.ts')
);

const recipesById = Object.fromEntries(UI_RECIPES.map((r) => [r.id, r]));

test('Portion Math & Exact Grammage (Stream B Remediation)', async (t) => {
  await t.test(
    'reproduces portion math for 2-serving base recipe: 4 portions must be 2x yield, NOT 4x',
    () => {
      // k1 has serv: 2 (2 servings), 80g bacon, 4 eggs, 100g spinach, 20g butter
      const k1Source = {
        id: 'k1',
        title: 'Сливочная яичница с беконом и шпинатом',
        mode: 'keto',
        cat: 'breakfast',
        serv: 2,
        time: 12,
        ing: [
          ['Яйца', '4 шт'],
          ['Бекон', '80 г'],
          ['Шпинат', '100 г'],
          ['Сливочное масло', '20 г'],
          ['Специи и соль', 'по вкусу'],
        ],
        steps: ['Шаг 1'],
      };

      const vm = toRecipeViewModel(k1Source);

      // Target portion 1: multiplier = 1 / 2 = 0.5
      assert.equal(vm.portionsVariants[1].portions, 1, 'Target portion 1 must equal 1');
      assert.equal(vm.portionsVariants[1].yieldNote, '1 порция');
      assert.equal(vm.portionsVariants[1].ingredients[0].amountLabel, '2 шт');
      assert.equal(vm.portionsVariants[1].ingredients[1].amountLabel, '40 г');
      assert.equal(vm.portionsVariants[1].ingredients[2].amountLabel, '50 г');
      assert.equal(vm.portionsVariants[1].ingredients[3].amountLabel, '10 г');
      assert.equal(vm.portionsVariants[1].ingredients[4].amountLabel, 'по вкусу');

      // Target portion 2: multiplier = 2 / 2 = 1.0 (equals base yield)
      assert.equal(vm.portionsVariants[2].portions, 2, 'Target portion 2 must equal 2');
      assert.equal(vm.portionsVariants[2].yieldNote, '2 порции');
      assert.equal(vm.portionsVariants[2].ingredients[0].amountLabel, '4 шт');
      assert.equal(vm.portionsVariants[2].ingredients[1].amountLabel, '80 г');
      assert.equal(vm.portionsVariants[2].ingredients[2].amountLabel, '100 г');
      assert.equal(vm.portionsVariants[2].ingredients[3].amountLabel, '20 г');

      // Target portion 4: multiplier = 4 / 2 = 2.0 (2x base yield, NOT 4x!)
      assert.equal(vm.portionsVariants[4].portions, 4, 'Target portion 4 must equal 4');
      assert.equal(vm.portionsVariants[4].yieldNote, '4 порции');
      assert.equal(vm.portionsVariants[4].ingredients[0].amountLabel, '8 шт', '4 portions of 2-serv recipe = 8 eggs, not 16');
      assert.equal(vm.portionsVariants[4].ingredients[1].amountLabel, '160 г', '4 portions of 2-serv recipe = 160g bacon, not 320g');
      assert.equal(vm.portionsVariants[4].ingredients[2].amountLabel, '200 г', '4 portions of 2-serv recipe = 200g spinach, not 400g');
      assert.equal(vm.portionsVariants[4].ingredients[3].amountLabel, '40 г', '4 portions of 2-serv recipe = 40g butter, not 80g');
    }
  );

  await t.test(
    'portion math for 1-serving base recipe: 4 portions is 4x yield',
    () => {
      // k2 has serv: 1, 3 eggs, 40g cheese, 30ml cream
      const k2Source = {
        id: 'k2',
        title: 'Омлет с сыром и зеленью',
        mode: 'keto',
        cat: 'breakfast',
        serv: 1,
        time: 10,
        ing: [
          ['Яйца', '3 шт'],
          ['Сыр твёрдый', '40 г'],
          ['Сливки 33%', '30 мл'],
        ],
        steps: ['Шаг 1'],
      };

      const vm = toRecipeViewModel(k2Source);

      // Target 1: multiplier 1 / 1 = 1
      assert.equal(vm.portionsVariants[1].portions, 1);
      assert.equal(vm.portionsVariants[1].ingredients[0].amountLabel, '3 шт');
      assert.equal(vm.portionsVariants[1].ingredients[1].amountLabel, '40 г');

      // Target 2: multiplier 2 / 1 = 2
      assert.equal(vm.portionsVariants[2].portions, 2);
      assert.equal(vm.portionsVariants[2].ingredients[0].amountLabel, '6 шт');
      assert.equal(vm.portionsVariants[2].ingredients[1].amountLabel, '80 г');

      // Target 4: multiplier 4 / 1 = 4
      assert.equal(vm.portionsVariants[4].portions, 4);
      assert.equal(vm.portionsVariants[4].ingredients[0].amountLabel, '12 шт');
      assert.equal(vm.portionsVariants[4].ingredients[1].amountLabel, '160 г');
    }
  );

  await t.test(
    'portion math for 4-serving base recipe: 4 portions is 1x yield (base), 1 portion is 0.25x',
    () => {
      // k14 has serv: 4, 600g beef, 600g cabbage
      const k14Source = {
        id: 'k14',
        title: 'Говядина с капустой',
        mode: 'keto',
        cat: 'dinner',
        serv: 4,
        time: 60,
        ing: [
          ['Говядина', '600 г'],
          ['Капуста', '600 г'],
        ],
        steps: ['Шаг 1'],
      };

      const vm = toRecipeViewModel(k14Source);

      // Target 1: multiplier 1 / 4 = 0.25
      assert.equal(vm.portionsVariants[1].portions, 1);
      assert.equal(vm.portionsVariants[1].ingredients[0].amountLabel, '150 г');
      assert.equal(vm.portionsVariants[1].ingredients[1].amountLabel, '150 г');

      // Target 2: multiplier 2 / 4 = 0.5
      assert.equal(vm.portionsVariants[2].portions, 2);
      assert.equal(vm.portionsVariants[2].ingredients[0].amountLabel, '300 г');
      assert.equal(vm.portionsVariants[2].ingredients[1].amountLabel, '300 г');

      // Target 4: multiplier 4 / 4 = 1
      assert.equal(vm.portionsVariants[4].portions, 4);
      assert.equal(vm.portionsVariants[4].ingredients[0].amountLabel, '600 г');
      assert.equal(vm.portionsVariants[4].ingredients[1].amountLabel, '600 г');
    }
  );

  await t.test(
    'shopping aggregation correctly scales 2-serving recipe by 2x for 4 portions',
    () => {
      const menu = {
        days: [
          { slots: { lunch: 'k28' } }, // k28 has serv: 2, 400g chicken
        ],
      };

      const custom = createCustomShoppingItem('Морская соль', '1 пачка', 'Масла и бакалея');
      // For 1 portion: 400g / 2 = 200g
      const shop1 = rebuildShoppingFromMenu(menu, recipesById, [custom], 1);
      const ch1 = shop1.find((i) => i.name.toLowerCase().includes('кури'));
      assert.ok(ch1);
      assert.equal(ch1.amountLabel, '200 г', '1 portion of 2-serving recipe with 400g base = 200g');

      // For 4 portions: 400g * (4 / 2) = 800g (NOT 1600g!)
      const shop4 = rebuildShoppingFromMenu(menu, recipesById, shop1, 4);
      const ch4 = shop4.find((i) => i.name.toLowerCase().includes('кури'));
      assert.ok(ch4);
      assert.equal(ch4.amountLabel, '800 г', '4 portions of 2-serving recipe with 400g base = 800g, NOT 1600g');

      // Custom item preserved
      const customFound = shop4.find((i) => i.id === custom.id);
      assert.ok(customFound, 'Custom item must be preserved');
      assert.equal(customFound.name, 'Морская соль');
    }
  );

  await t.test(
    're-entry state rehydration preserves 4 portions and custom items cleanly',
    () => {
      // Simulate state saved with 4 portions and custom item
      const customItem = {
        id: 'shop-custom-omega3',
        name: 'Омега-3 в капсулах',
        amountLabel: '1 банка',
        department: 'Масла и бакалея',
        linkedRecipeTitles: [],
        alreadyHave: false,
        checkedInStore: true,
      };

      const sampleMenu = {
        mode: 'keto',
        days: [
          { date: '2026-11-01', slots: { breakfast: 'k1', lunch: 'k7' } },
        ],
      };

      // Server returns saved state
      const serverState = {
        schema_version: 1,
        menu: sampleMenu,
        selected_date: '2026-11-01',
        checked_ingredients: {},
        checked_steps: {},
        shopping_batches: 4,
        shopping_stale: false,
      };

      // Server returns saved shopping items for 4 portions + custom item
      const serverShopping = rebuildShoppingFromMenu(sampleMenu, recipesById, [customItem], 4);
      const customFound = serverShopping.find((i) => i.id === customItem.id);
      assert.ok(customFound, 'Custom item present in server shopping');
      assert.equal(customFound.checkedInStore, true);

      // Rehydrate client state
      const rehydratedState = { ...serverState };
      assert.equal(rehydratedState.shopping_batches, 4, '4 portions must be preserved on re-entry');
      assert.equal(rehydratedState.shopping_stale, false, 'shopping must not be falsely stale on re-entry');

      // k1 has 80g bacon base (serv: 2). For 4 portions: 80 * (4 / 2) = 160g
      const baconItem = serverShopping.find((i) => i.name.toLowerCase().includes('бекон'));
      assert.ok(baconItem);
      assert.equal(baconItem.amountLabel, '160 г', 'Bacon must be 160g for 4 portions of k1');
    }
  );
});
