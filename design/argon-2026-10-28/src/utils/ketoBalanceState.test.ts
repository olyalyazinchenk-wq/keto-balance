import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushNavigationStack,
  popNavigationStack,
  filterRecipesBySettings,
  formatAppliedConditionsSummary,
  resolveDayMenuSlots,
  formatShoppingListForClipboard,
} from './ketoBalanceState';
import type { ScreenId } from '../types/ketoBalanceContract';
import {
  DEMO_RECIPES,
  DEMO_GENERATED_MENU,
  DEMO_SHOPPING_FIXTURE,
} from '../data/ketoBalanceFixtures';

test('navigation stack preserves history when visiting Support from Settings and returning', () => {
  let stack: ScreenId[] = ['start'];
  stack = pushNavigationStack(stack, 'settings');
  stack = pushNavigationStack(stack, 'support');
  assert.deepEqual(stack, ['start', 'settings', 'support']);

  const afterBack = popNavigationStack(stack);
  assert.equal(afterBack.targetScreen, 'settings');
  assert.deepEqual(afterBack.nextStack, ['start', 'settings']);
});

test('filterRecipesBySettings never silently drops restrictions when conflicting filters are selected', () => {
  // Selecting carnivore + no_eggs + no_dairy + no_fish + no_pork + 20 min leaves only matching recipes or 0
  const strictMatches = filterRecipesBySettings(DEMO_RECIPES, {
    approach: 'carnivore',
    restrictions: ['no_eggs', 'no_dairy', 'no_fish', 'no_pork'],
    prepTimeMax: 20,
  });

  for (const r of strictMatches) {
    assert.ok(r.suitableFor.includes('carnivore'));
    assert.ok(r.prepMinutes <= 20);
    assert.ok(r.avoids.includes('no_eggs'));
    assert.ok(r.avoids.includes('no_dairy'));
  }
});

test('DayMenu.slots contract uses string recipe IDs and resolves 2 or 3 meals per day', () => {
  const day1 = DEMO_GENERATED_MENU.days[0];
  assert.equal(typeof day1.slots.breakfast, 'string');
  assert.equal(typeof DEMO_GENERATED_MENU.created, 'number');

  const mapById = Object.fromEntries(DEMO_RECIPES.map((r) => [r.id, r]));
  const twoMeals = resolveDayMenuSlots(day1, mapById, 2);
  assert.equal(twoMeals.length, 2);
  assert.ok(twoMeals[0].recipe !== null);

  const threeMeals = resolveDayMenuSlots(day1, mapById, 3);
  assert.equal(threeMeals.length, 3);
});

test('formatShoppingListForClipboard formats text cleanly and notes when menu changed', () => {
  const text = formatShoppingListForClipboard(
    DEMO_SHOPPING_FIXTURE,
    'Стартовое меню на 3 дня',
    true
  );
  assert.ok(text.includes('Кето Баланс — Список покупок'));
  assert.ok(text.includes('в меню были замены блюд'));
});

test('formatAppliedConditionsSummary outputs readable Russian conditions', () => {
  const summary = formatAppliedConditionsSummary({
    approach: 'keto',
    restrictions: ['no_dairy', 'no_nuts'],
    prepTimeMax: 35,
    mealsPerDay: 3,
  });
  assert.ok(summary.includes('Режим: Кето'));
  assert.ok(summary.includes('без молочных продуктов'));
  assert.ok(summary.includes('без орехов и семечек'));
});
