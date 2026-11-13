const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { calculateReviewedRecipeNutrition } = loadTs(path.resolve(__dirname, '../../src/core/keto-engine/recipeNutrition.ts'));

function recipe(serv = 2) {
  return {
    id: 'fixture', serv, ing: [['Продукт', '200 г']],
    nutrition: {
      schemaVersion: 1, status: 'reviewed', method: 'keto-engine-default-v1',
      recipeId: 'fixture', basePortions: serv, revision: 'test-v1',
      reviewedBy: 'test-reviewer', reviewedAt: '2026-11-13',
      ingredients: [{ index: 0, name: 'Продукт', amount: '200 г', edibleGrams: 200,
        foodState: 'raw', source: { title: 'TEST DATA ONLY', url: 'https://example.org/test', recordId: '1', accessedAt: '2026-11-13' },
        per100g: { protein: 10, fat: 20, carbs: 6, fiber: 2, carbohydrateBasis: 'total_including_fiber' } }],
    },
  };
}

for (const base of [1, 2, 3, 4]) {
  for (const target of [1, 2, 4]) {
    test(`reviewed nutrition uses real base yield ${base} → ${target}`, () => {
      const n = calculateReviewedRecipeNutrition(recipe(base), target);
      assert.equal(n.status, 'reviewed');
      assert.equal(n.profile.protein, 20 * target / base);
      assert.equal(n.profile.fat, 40 * target / base);
      assert.equal(n.profile.carbs, 12 * target / base);
      assert.equal(n.profile.netCarbs, Math.round((8 * target / base) * 10) / 10);
    });
  }
}

test('legacy, unapproved, missing mass, missing source, stale recipe and unknown nutrients never become zero', () => {
  assert.equal(calculateReviewedRecipeNutrition({ id: 'old', serv: 1, ing: [] }, 1).status, 'unverified');
  for (const mutate of [
    r => { r.nutrition.status = 'candidate'; },
    r => { delete r.nutrition.ingredients[0].edibleGrams; },
    r => { r.nutrition.ingredients[0].source.url = ''; },
    r => { r.nutrition.ingredients[0].per100g.protein = null; },
    r => { r.ing[0][1] = '400 г'; },
    r => { r.nutrition.ingredients[0].per100g.fiber = 8; },
    r => { r.nutrition.basePortions = 4; },
  ]) {
    const r = recipe(); mutate(r);
    const n = calculateReviewedRecipeNutrition(r, 1);
    assert.equal(n.status, 'unverified');
    assert.equal(n.profile, undefined);
    assert.ok(n.issues.length > 0);
  }
});

test('available carbs do not subtract fiber a second time', () => {
  const r = recipe();
  r.nutrition.ingredients[0].per100g.carbohydrateBasis = 'available_excluding_fiber';
  const n = calculateReviewedRecipeNutrition(r, 1);
  assert.equal(n.profile.carbs, 8);
  assert.equal(n.profile.netCarbs, 6);
});

test('all ingredients must be represented exactly once, including spices and liquids', () => {
  const r = recipe();
  r.ing.push(['Соль', 'по вкусу']);
  assert.equal(calculateReviewedRecipeNutrition(r, 1).status, 'unverified');
  const q = recipe(); q.nutrition.ingredients.push(q.nutrition.ingredients[0]);
  assert.equal(calculateReviewedRecipeNutrition(q, 1).status, 'unverified');
});

test('malformed wire evidence, zero mass and overflow cannot crash or produce verified zero', () => {
  for (const value of [{}, [null], [false], 'invalid']) {
    const r = recipe(); r.nutrition.ingredients = value;
    assert.equal(calculateReviewedRecipeNutrition(r, 1).status, 'unverified');
  }
  for (const mass of [0, null, Number.POSITIVE_INFINITY, -1, Number.MAX_VALUE]) {
    const r = recipe(); r.nutrition.ingredients[0].edibleGrams = mass;
    assert.equal(calculateReviewedRecipeNutrition(r, 4).status, 'unverified');
  }
});
