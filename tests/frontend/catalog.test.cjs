const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Catalog integrity baseline (P05)', async (t) => {
  const { RECIPES } = loadTs('src/data/recipes.ts');

  await t.test('has exactly 42 recipes: 26 keto and 16 carnivore', () => {
    assert.equal(RECIPES.length, 42);
    const keto = RECIPES.filter(r => r.mode === 'keto');
    const carnivore = RECIPES.filter(r => r.mode === 'carnivore');
    assert.equal(keto.length, 26);
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
      assert.ok(['breakfast', 'lunch', 'dinner', 'snack', 'prep', 'dessert', 'soup', 'salad'].includes(r.cat), `Recipe ${r.id} invalid cat: ${r.cat}`);
      assert.ok(typeof r.kcal === 'number' && r.kcal > 0, `Recipe ${r.id} invalid kcal`);
      assert.ok(typeof r.p === 'number' && r.p >= 0, `Recipe ${r.id} invalid protein`);
      assert.ok(typeof r.f === 'number' && r.f >= 0, `Recipe ${r.id} invalid fat`);
      assert.ok(typeof r.nc === 'number' && r.nc >= 0, `Recipe ${r.id} invalid net carbs`);
      assert.ok(Array.isArray(r.ing) && r.ing.length > 0, `Recipe ${r.id} missing ingredients`);
      assert.ok(Array.isArray(r.steps) && r.steps.length > 0, `Recipe ${r.id} missing steps`);
    }
  });

  await t.test('keto-engine validates all recipes without fatal calculation errors', () => {
    const engine = loadTs('src/core/keto-engine/index.ts');
    for (const r of RECIPES) {
      const profile = engine.calculateMacroProfile({
        protein: r.p,
        fat: r.f,
        carbs: r.nc,
        declaredCalories: r.kcal,
      });
      assert.equal(profile.validation.isValid, true, `Recipe ${r.id} failed macro validation`);
      assert.ok(profile.calculatedCalories > 0, `Recipe ${r.id} calculated calories must be > 0`);
      assert.ok(!Number.isNaN(profile.ratios.proteinPct), `Recipe ${r.id} proteinPct is NaN`);
      assert.ok(!Number.isNaN(profile.ratios.fatPct), `Recipe ${r.id} fatPct is NaN`);
      assert.ok(!Number.isNaN(profile.ratios.carbsPct), `Recipe ${r.id} carbsPct is NaN`);
    }
  });

  await t.test('catalog validation script succeeds and generates comprehensive report', async () => {
    const { runCatalogValidation } = await import('../../scripts/validate-catalog.mjs');
    const report = runCatalogValidation();
    assert.equal(report.summary.status, 'PASSED');
    assert.equal(report.summary.errorCount, 0, 'No calculation errors in catalog');
    assert.equal(report.summary.botSyncErrors, 0, 'Zero bot data sync errors');
    assert.equal(report.summary.totalRecipes, 42);
    assert.ok(report.summary.maxCalorieDiscrepancy < 60, 'Max discrepancy within tolerance');
  });

  await t.test('keto-engine catches corrupted recipe macros and blocks publication', () => {
    const engine = loadTs('src/core/keto-engine/index.ts');
    const badProfile = engine.calculateMacroProfile({
      protein: -10,
      fat: 20,
      carbs: 5,
      declaredCalories: 300,
    });
    assert.equal(badProfile.validation.isValid, false, 'Negative protein must be invalid');
    assert.ok(badProfile.validation.issues.some(i => i.field === 'protein' && i.severity === 'error'));
  });
});
