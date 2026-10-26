const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Catalog integrity baseline (P05)', async (t) => {
  const { RECIPES } = loadTs('src/data/recipes.ts');

  await t.test('has exactly 37 recipes: 21 keto and 16 carnivore', () => {
    assert.equal(RECIPES.length, 37);
    const keto = RECIPES.filter(r => r.mode === 'keto');
    const carnivore = RECIPES.filter(r => r.mode === 'carnivore');
    assert.equal(keto.length, 21);
    assert.equal(carnivore.length, 16);
  });

  await t.test('all recipe IDs are unique and follow conventions', () => {
    const ids = new Set();
    for (const r of RECIPES) {
      assert.ok(r.id, 'Recipe must have an id');
      assert.ok(!ids.has(r.id), `Duplicate recipe id: ${r.id}`);
      ids.add(r.id);
    }
  });

  await t.test('k4 does not have erroneous "без яиц" tag while containing eggs', () => {
    const k4 = RECIPES.find(r => r.id === 'k4');
    assert.ok(k4, 'k4 must exist');
    assert.ok(k4.tags.every(t => t !== 'без яиц'), 'k4 must not have "без яиц" tag');
    assert.ok(k4.ing.some(([name]) => name.includes('Яйца')), 'k4 ingredients must still include eggs');
  });

  await t.test('all recipes have valid required fields and nutrients', () => {
    for (const r of RECIPES) {
      assert.ok(r.title && r.title.length > 0, `Recipe ${r.id} missing title`);
      assert.ok(['breakfast', 'lunch', 'dinner', 'snack', 'prep', 'dessert'].includes(r.cat), `Recipe ${r.id} invalid cat: ${r.cat}`);
      assert.ok(typeof r.kcal === 'number' && r.kcal > 0, `Recipe ${r.id} invalid kcal`);
      assert.ok(typeof r.p === 'number' && r.p >= 0, `Recipe ${r.id} invalid protein`);
      assert.ok(typeof r.f === 'number' && r.f >= 0, `Recipe ${r.id} invalid fat`);
      assert.ok(typeof r.nc === 'number' && r.nc >= 0, `Recipe ${r.id} invalid net carbs`);
      assert.ok(Array.isArray(r.ing) && r.ing.length > 0, `Recipe ${r.id} missing ingredients`);
      assert.ok(Array.isArray(r.steps) && r.steps.length > 0, `Recipe ${r.id} missing steps`);
    }
  });
});
