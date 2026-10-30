import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushNavigationStack,
  popNavigationStack,
  filterRecipesBySettings,
  extractStepTimerMinutes,
  calculateShoppingProgress,
  createCustomShoppingItem,
  calculateSilhouetteForecast,
  calculateDopamineMomentum,
} from './ketoBalanceState';
import { DEMO_RECIPES, DEMO_SHOPPING_FIXTURE } from '../data/ketoBalanceFixtures';

test('navigation stack pushes and pops without emptying root', () => {
  const s1 = pushNavigationStack(['today'], 'menu');
  assert.deepEqual(s1, ['today', 'menu']);
  const s2 = pushNavigationStack(s1, 'menu');
  assert.deepEqual(s2, ['today', 'menu']);
  const popped = popNavigationStack(s2);
  assert.deepEqual(popped.nextStack, ['today']);
  assert.equal(popped.targetScreen, 'today');
});

test('extractStepTimerMinutes parses ranges and single minute values', () => {
  assert.equal(
    extractStepTimerMinutes('Аккуратно вылей яйца, накрой крышкой на 3–4 минуты'),
    4
  );
  assert.equal(
    extractStepTimerMinutes('Запекай в духовке при 190 °C около 20 минут.'),
    20
  );
  assert.equal(
    extractStepTimerMinutes('Положи половинку авокадо и зелень на тарелку.'),
    null
  );
});

test('calculateShoppingProgress computes accurate counts and percentage', () => {
  const sample = DEMO_SHOPPING_FIXTURE.slice(0, 4).map((item, idx) => ({
    ...item,
    alreadyHave: idx === 0,
    checkedInStore: idx === 1,
  }));
  const progress = calculateShoppingProgress(sample);
  assert.equal(progress.total, 4);
  assert.equal(progress.alreadyHome, 1);
  assert.equal(progress.inStore, 1);
  assert.equal(progress.completed, 2);
  assert.equal(progress.remaining, 2);
  assert.equal(progress.percent, 50);
});

test('createCustomShoppingItem validates empty names and defaults amount', () => {
  assert.equal(createCustomShoppingItem('   ', '1 шт.'), null);
  const created = createCustomShoppingItem('Морская соль', '');
  assert.ok(created);
  assert.equal(created.name, 'Морская соль');
  assert.equal(created.amountLabel, '1 шт.');
  assert.equal(created.department, 'Масла и бакалея');
});

test('filterRecipesBySettings respects restrictions and prep time', () => {
  const filtered = filterRecipesBySettings(DEMO_RECIPES, {
    approach: 'keto',
    restrictions: ['no_dairy', 'no_fish'],
    prepTimeMax: 20,
  });
  assert.ok(filtered.length > 0);
  for (const r of filtered) {
    assert.ok(r.prepMinutes <= 20);
    assert.ok(r.avoids.includes('no_dairy'));
    assert.ok(r.avoids.includes('no_fish'));
  }
});

test('calculateSilhouetteForecast scales waist contour and energy across stages', () => {
  const s0 = calculateSilhouetteForecast(0, 'waist');
  const s2 = calculateSilhouetteForecast(2, 'dress');
  const s3 = calculateSilhouetteForecast(3, 'energy');
  assert.ok(s2.waistScale < s0.waistScale);
  assert.ok(s3.waistScale < s2.waistScale);
  assert.ok(s3.energyPercent > s0.energyPercent);
  assert.equal(s3.waistDeltaCm, '−7,5 см');
});

test('calculateDopamineMomentum rewards completed habits and cooked meals', () => {
  const initial = calculateDopamineMomentum([], 0);
  const active = calculateDopamineMomentum(['water', 'breakfast', 'walk'], 2);
  assert.ok(active.points > initial.points);
  assert.ok(active.percent > initial.percent);
  assert.equal(active.streakDays, 4);
});

