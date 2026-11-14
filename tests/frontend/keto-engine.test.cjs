const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const engine = loadTs(path.resolve(__dirname, '../../src/core/keto-engine/index.ts'));

test('keto-engine: Net Carbs Calculation (Чистые углеводы)', async (t) => {
  await t.test('calculates basic net carbs as total carbs minus fiber', () => {
    const res = engine.calculateNetCarbs({ carbs: 12, fiber: 5 });
    assert.equal(res, 7);
  });

  await t.test('handles missing fiber and polyols gracefully', () => {
    const res = engine.calculateNetCarbs({ carbs: 15 });
    assert.equal(res, 15);
  });

  await t.test('deducts 100% of erythritol (0% net carb impact)', () => {
    const res = engine.calculateNetCarbs({
      carbs: 20,
      fiber: 4,
      polyols: { erythritol: 10 },
    });
    // 20 - 4 - 10 = 6
    assert.equal(res, 6);
  });

  await t.test('deducts 100% of erythritol using Russian name (эритрит/эритритол)', () => {
    const res = engine.calculateNetCarbs({
      carbs: 18,
      fiber: 3,
      polyols: { 'эритрит': 8 },
    });
    // 18 - 3 - 8 = 7
    assert.equal(res, 7);
  });

  await t.test('deducts 50% of maltitol (50% glycemic impact)', () => {
    const res = engine.calculateNetCarbs({
      carbs: 25,
      fiber: 2,
      polyols: { maltitol: 10 },
    });
    // deduction is 10 * (1 - 0.5) = 5. Net carbs = 25 - 2 - 5 = 18
    assert.equal(res, 18);
  });

  await t.test('deducts 25% of maltitol syrup (75% glycemic impact)', () => {
    const res = engine.calculateNetCarbs({
      carbs: 20,
      fiber: 0,
      polyols: { maltitol_syrup: 10 },
    });
    // deduction is 10 * (1 - 0.75) = 2.5. Net carbs = 20 - 2.5 = 17.5
    assert.equal(res, 17.5);
  });

  await t.test('handles polyols as array of details with custom absorption', () => {
    const res = engine.calculateNetCarbs({
      carbs: 30,
      fiber: 5,
      polyols: [
        { type: 'erythritol', amount: 10 }, // 10 deducted
        { type: 'xylitol', amount: 6 },     // 3 deducted
        { type: 'custom', amount: 4, absorption: 0.25 }, // 3 deducted (1 - 0.25 = 0.75 * 4 = 3)
      ],
    });
    // 30 - 5 - 10 - 3 - 3 = 9
    assert.equal(res, 9);
  });

  await t.test('handles generic numeric polyol with default absorption (0.5)', () => {
    const res = engine.calculateNetCarbs({
      carbs: 20,
      fiber: 2,
      polyols: 8,
    });
    // deduction is 8 * 0.5 = 4. Net carbs = 20 - 2 - 4 = 14
    assert.equal(res, 14);
  });

  await t.test('clamps negative net carbs to 0 when fiber exceeds carbs', () => {
    const res = engine.calculateNetCarbs({ carbs: 5, fiber: 10 });
    assert.equal(res, 0);
  });

  await t.test('does not mutate input objects', () => {
    const input = Object.freeze({
      carbs: 15,
      fiber: 5,
      polyols: Object.freeze({ erythritol: 5 }),
    });
    const res = engine.calculateNetCarbs(input);
    assert.equal(res, 5);
    assert.equal(input.carbs, 15);
    assert.equal(input.fiber, 5);
  });
});

test('keto-engine: Total Calories Calculation (Общая калорийность)', async (t) => {
  await t.test('calculates standard Atwater calories: 4*P + 9*F + 4*C', () => {
    const res = engine.calculateCalories({ protein: 25, fat: 40, carbs: 10 });
    // 25*4 + 40*9 + 10*4 = 100 + 360 + 40 = 500
    assert.equal(res, 500);
  });

  await t.test('handles zero macros returning 0 kcal without errors', () => {
    const res = engine.calculateCalories({ protein: 0, fat: 0, carbs: 0 });
    assert.equal(res, 0);
  });

  await t.test('handles missing or negative values by sanitizing to 0', () => {
    const res = engine.calculateCalories({ protein: 20, fat: null, carbs: -5 });
    // 20*4 + 0 + 0 = 80
    assert.equal(res, 80);
  });
});

test('keto-engine: Macro Ratios & Zero-Division Handling (Доли БЖУ в калораже)', async (t) => {
  await t.test('calculates percentage shares accurately for keto distribution', () => {
    // P: 25g (100 kcal), F: 80g (720 kcal), C: 5g (20 kcal). Total = 840 kcal
    const res = engine.calculateMacroRatios({ protein: 25, fat: 80, carbs: 5 });
    assert.equal(res.totalCalories, 840);
    assert.equal(res.proteinCalories, 100);
    assert.equal(res.fatCalories, 720);
    assert.equal(res.carbsCalories, 20);
    assert.equal(res.proteinPct, 11.9);
    assert.equal(res.fatPct, 85.7);
    assert.equal(res.carbsPct, 2.4);
  });

  await t.test('handles zero calorie edge case without division by zero or NaN', () => {
    const res = engine.calculateMacroRatios({ protein: 0, fat: 0, carbs: 0, totalCalories: 0 });
    assert.equal(res.totalCalories, 0);
    assert.equal(res.proteinPct, 0);
    assert.equal(res.fatPct, 0);
    assert.equal(res.carbsPct, 0);
    assert.ok(!Number.isNaN(res.proteinPct));
    assert.ok(!Number.isNaN(res.fatPct));
    assert.ok(!Number.isNaN(res.carbsPct));
  });

  await t.test('respects explicit totalCalories parameter if passed', () => {
    const res = engine.calculateMacroRatios({
      protein: 20, // 80 kcal
      fat: 20,     // 180 kcal
      carbs: 5,    // 20 kcal -> sum = 280 kcal
      totalCalories: 320,
    });
    assert.equal(res.totalCalories, 320);
    assert.equal(res.proteinPct, 25); // 80 / 320 = 25%
    assert.equal(res.fatPct, 56.3);   // 180 / 320 = 56.25% -> 56.3%
    assert.equal(res.carbsPct, 6.3);  // 20 / 320 = 6.25% -> 6.3%
  });
});

test('keto-engine: Validation and Edge Cases', async (t) => {
  await t.test('validates correct macros as valid without errors', () => {
    const res = engine.validateMacros({ protein: 25, fat: 35, carbs: 8, fiber: 4 });
    assert.equal(res.isValid, true);
    assert.equal(res.issues.length, 0);
  });

  await t.test('catches negative numbers as validation errors', () => {
    const res = engine.validateMacros({ protein: -10, fat: 20, carbs: 5 });
    assert.equal(res.isValid, false);
    assert.ok(res.issues.some((i) => i.field === 'protein' && i.severity === 'error'));
  });

  await t.test('flags fiber > carbs as a warning', () => {
    const res = engine.validateMacros({ protein: 20, fat: 20, carbs: 5, fiber: 12 });
    assert.equal(res.isValid, true); // warning, not error
    assert.ok(res.issues.some((i) => i.field === 'fiber' && i.severity === 'warning'));
  });

  await t.test('flags large discrepancy between declared and calculated calories', () => {
    const res = engine.validateMacros({
      protein: 20,
      fat: 20,
      carbs: 5,
      declaredCalories: 600, // calculated is ~280
    });
    assert.ok(res.issues.some((i) => i.field === 'declaredCalories' && i.severity === 'warning'));
  });
});

test('keto-engine: Full Macro Profile Integration (calculateMacroProfile)', async (t) => {
  await t.test('computes complete profile on realistic keto recipe', () => {
    // e.g. eggs + bacon dish
    const profile = engine.calculateMacroProfile({
      protein: 24,
      fat: 44,
      carbs: 7,
      fiber: 4,
      declaredCalories: 520,
    });

    assert.equal(profile.protein, 24);
    assert.equal(profile.fat, 44);
    assert.equal(profile.carbs, 7);
    assert.equal(profile.fiber, 4);
    assert.equal(profile.netCarbs, 3);
    assert.equal(profile.calculatedCalories, 520);
    assert.equal(profile.calorieDiscrepancy, 0);
    assert.equal(profile.validation.isValid, true);
    assert.ok(profile.ratios.fatPct > 70); // High-fat keto profile
  });

  await t.test('computes profile without declaredCalories and passes options through', () => {
    const profile = engine.calculateMacroProfile(
      {
        protein: 30,
        fat: 30,
        carbs: 10,
        fiber: 5,
        polyols: { erythritol: 4 },
      },
      {
        netCarbsOptions: { roundDecimals: 2 },
        caloriesOptions: { roundDecimals: 1 },
        ratiosOptions: { roundDecimals: 2 },
      }
    );

    assert.equal(profile.netCarbs, 1);
    assert.equal(profile.declaredCalories, undefined);
    assert.equal(profile.calorieDiscrepancy, undefined);
    assert.equal(profile.totalPolyols, 4);
    assert.equal(profile.effectivePolyolsDeduction, 4);
    assert.equal(profile.calculatedCalories, 430);
    assert.equal(profile.validation.isValid, true);
  });
});

test('keto-engine: Polyols Edge Cases & Helper Functions', async (t) => {
  await t.test('normalizePolyolName handles whitespace, hyphens, underscores and empty values', () => {
    assert.equal(engine.normalizePolyolName(' Maltitol_Syrup '), 'maltitol syrup');
    assert.equal(engine.normalizePolyolName('ERYTHRITOL'), 'erythritol');
    assert.equal(engine.normalizePolyolName('allulose-powder'), 'allulose powder');
    assert.equal(engine.normalizePolyolName(''), '');
    assert.equal(engine.normalizePolyolName(null), '');
    assert.equal(engine.normalizePolyolName(undefined), '');
  });

  await t.test('getPolyolAbsorptionCoefficient handles custom coefficients and clamping', () => {
    assert.equal(engine.getPolyolAbsorptionCoefficient('custom-sweet', { 'custom-sweet': 0.25 }), 0.25);
    assert.equal(engine.getPolyolAbsorptionCoefficient('custom-sweet', { 'custom-sweet': -0.5 }), 0);
    assert.equal(engine.getPolyolAbsorptionCoefficient('custom-sweet', { 'custom-sweet': 1.8 }), 1);
    assert.equal(engine.getPolyolAbsorptionCoefficient('erythritol', { 'erythritol': NaN }), 0.0);
    assert.equal(engine.getPolyolAbsorptionCoefficient('unknown-polyol'), 0.5);
    assert.equal(engine.getPolyolAbsorptionCoefficient('unknown-polyol', undefined, 0.7), 0.7);
    assert.equal(engine.getPolyolAbsorptionCoefficient('unknown-polyol', undefined, -0.2), 0);
    assert.equal(engine.getPolyolAbsorptionCoefficient('unknown-polyol', undefined, 1.5), 1);
  });

  await t.test('calculatePolyolDeduction handles null or empty inputs', () => {
    assert.deepEqual(engine.calculatePolyolDeduction(null), {
      totalPolyols: 0,
      deduction: 0,
      digestiblePolyols: 0,
      calories: 0,
    });
    assert.deepEqual(engine.calculatePolyolDeduction(undefined), {
      totalPolyols: 0,
      deduction: 0,
      digestiblePolyols: 0,
      calories: 0,
    });
  });

  await t.test('calculatePolyolDeduction handles non-positive numeric polyols', () => {
    assert.deepEqual(engine.calculatePolyolDeduction(0), { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 });
    assert.deepEqual(engine.calculatePolyolDeduction(-10), { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 });
    assert.deepEqual(engine.calculatePolyolDeduction(NaN), { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 });
    assert.deepEqual(engine.calculatePolyolDeduction(Infinity), { totalPolyols: 0, deduction: 0, digestiblePolyols: 0, calories: 0 });
  });

  await t.test('calculatePolyolDeduction handles numeric polyols with options', () => {
    const res = engine.calculatePolyolDeduction(10, {
      defaultPolyolAbsorption: 0.3,
      defaultPolyolCalorieFactor: 2.0,
    });
    assert.equal(res.totalPolyols, 10);
    assert.equal(res.deduction, 7);
    assert.equal(res.digestiblePolyols, 3);
    assert.equal(res.calories, 20);
  });

  await t.test('calculatePolyolDeduction sanitizes default options', () => {
    const res = engine.calculatePolyolDeduction(10, {
      defaultPolyolAbsorption: NaN,
      defaultPolyolCalorieFactor: NaN,
    });
    assert.equal(res.deduction, 5);
    assert.equal(res.calories, 24);
  });

  await t.test('calculatePolyolDeduction handles array elements with null, invalid amounts and custom calories', () => {
    const res = engine.calculatePolyolDeduction([
      null,
      undefined,
      'not-an-object',
      { type: 'erythritol', amount: 10 },
      { type: 'allulose', amount: 5 },
      { type: 'xylitol', amount: -5 },
      { type: 'isomalt', amount: NaN },
      { type: 'sorbitol', amount: 10, absorption: 0.5 },
      { type: 'special_polyol', amount: 4 },
    ], {
      customPolyolCalories: { 'special polyol': 1.5 },
    });

    assert.equal(res.totalPolyols, 29);
    assert.equal(res.deduction, 22);
    assert.equal(res.digestiblePolyols, 7);
    assert.equal(res.calories, 36);
  });

  await t.test('calculatePolyolDeduction handles object with non-numeric amount', () => {
    const res = engine.calculatePolyolDeduction({
      erythritol: 'not-a-number',
      xylitol: 10,
    });
    assert.equal(res.totalPolyols, 10);
    assert.equal(res.deduction, 5);
  });
});

test('keto-engine: Calculations Module Edge Cases', async (t) => {
  await t.test('calculateNetCarbs edge cases and options', () => {
    assert.equal(engine.calculateNetCarbs(null), 0);
    assert.equal(engine.calculateNetCarbs(undefined), 0);
    assert.equal(engine.calculateNetCarbs('invalid'), 0);
    assert.equal(engine.calculateNetCarbs({ carbs: -10, fiber: 5 }), 0);
    assert.equal(engine.calculateNetCarbs({ carbs: 5, fiber: 12 }, { clampNegative: false }), -7);
    assert.equal(engine.calculateNetCarbs({ carbs: -5, fiber: 2 }, { clampNegative: false }), -7);
    assert.equal(engine.calculateNetCarbs({ carbs: 10.555, fiber: 3.222 }, { roundDecimals: 2 }), 7.33);
  });

  await t.test('calculateCalories edge cases and useNetCarbs', () => {
    assert.equal(engine.calculateCalories(null), 0);
    assert.equal(engine.calculateCalories(undefined), 0);
    assert.equal(engine.calculateCalories('invalid'), 0);
    const res = engine.calculateCalories(
      { protein: 20, fat: 10, carbs: 20, fiber: 5, polyols: { erythritol: 10 } },
      { useNetCarbs: true }
    );
    assert.equal(res, 192);
    const resWithFactors = engine.calculateCalories(
      { protein: 10, fat: 10, carbs: 10, fiber: 5 },
      { proteinFactor: 4.2, fatFactor: 9.3, carbsFactor: 4.1, fiberFactor: 2.0, roundDecimals: 1 }
    );
    assert.equal(resWithFactors, 186);
  });

  await t.test('calculateMacroRatios edge cases', () => {
    assert.deepEqual(engine.calculateMacroRatios(null), {
      proteinPct: 0, fatPct: 0, carbsPct: 0, proteinCalories: 0, fatCalories: 0, carbsCalories: 0, totalCalories: 0
    });
    assert.deepEqual(engine.calculateMacroRatios(undefined), {
      proteinPct: 0, fatPct: 0, carbsPct: 0, proteinCalories: 0, fatCalories: 0, carbsCalories: 0, totalCalories: 0
    });
    const res = engine.calculateMacroRatios({ protein: 0, fat: 0, carbs: 0, totalCalories: -50 });
    assert.equal(res.totalCalories, 0);
  });

  await t.test('validateMacros edge cases (NaN, polyols > carbs, negative declaredCalories)', () => {
    assert.equal(engine.validateMacros(null).isValid, false);
    const resNaN = engine.validateMacros({ protein: NaN, fat: Infinity, carbs: 'invalid' });
    assert.equal(resNaN.isValid, false);
    const resPolyolsWarn = engine.validateMacros({ protein: 10, fat: 10, carbs: 5, polyols: { erythritol: 12 } });
    assert.equal(resPolyolsWarn.isValid, true);
    assert.ok(resPolyolsWarn.issues.some((i) => i.field === 'polyols' && i.severity === 'warning'));
    const resNegDeclared = engine.validateMacros({ protein: 10, fat: 10, carbs: 5, declaredCalories: -100 });
    assert.equal(resNegDeclared.isValid, false);
    const resOkDeclared = engine.validateMacros({ protein: 25, fat: 40, carbs: 10, declaredCalories: 510 });
    assert.equal(resOkDeclared.isValid, true);
    assert.equal(resOkDeclared.issues.length, 0);
  });
});

test('keto-engine: Reference Keto Diet Foods (Эталонные продукты)', async (t) => {
  await t.test('Авокадо Хасс (100г): чистые углеводы ~1.8г, fatPct >= 75%', () => {
    const avocado = engine.calculateMacroProfile({
      protein: 2.0,
      fat: 14.7,
      carbs: 8.5,
      fiber: 6.7,
      declaredCalories: 160,
    });
    assert.equal(avocado.netCarbs, 1.8);
    assert.equal(avocado.validation.isValid, true);
    assert.ok(avocado.ratios.fatPct >= 75);
  });

  await t.test('Сливочное масло 82.5% (100г): чистый жир, практически нулевые углеводы', () => {
    const butter = engine.calculateMacroProfile({
      protein: 0.5,
      fat: 82.5,
      carbs: 0.8,
      fiber: 0.0,
      declaredCalories: 748,
    });
    assert.equal(butter.netCarbs, 0.8);
    assert.ok(butter.ratios.fatPct > 98);
  });

  await t.test('Стейк Рибай / говядина (100г): carnivore-кето, 0г углеводов', () => {
    const ribeye = engine.calculateMacroProfile({
      protein: 22.0,
      fat: 24.0,
      carbs: 0.0,
      fiber: 0.0,
      declaredCalories: 304,
    });
    assert.equal(ribeye.netCarbs, 0.0);
    assert.equal(ribeye.ratios.carbsPct, 0.0);
    assert.equal(ribeye.calculatedCalories, 304);
  });

  await t.test('Минеральная вода / соль: нулевой калораж без деления на ноль', () => {
    const water = engine.calculateMacroProfile({
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
    });
    assert.equal(water.netCarbs, 0);
    assert.equal(water.calculatedCalories, 0);
    assert.equal(water.ratios.proteinPct, 0);
    assert.ok(!Number.isNaN(water.ratios.proteinPct));
  });

  await t.test('Яйцо куриное вареное (100г): эталон кето-белка и жира', () => {
    const egg = engine.calculateMacroProfile({
      protein: 12.7,
      fat: 11.5,
      carbs: 0.7,
      fiber: 0.0,
      declaredCalories: 157,
    });
    assert.equal(egg.netCarbs, 0.7);
    assert.equal(egg.calculatedCalories, 157);
    assert.ok(egg.ratios.fatPct > 65);
    assert.equal(egg.validation.isValid, true);
  });

  await t.test('Грецкий орех (100г): клетчатка снижает чистые углеводы с 13.7г до 7.0г', () => {
    const walnut = engine.calculateMacroProfile({
      protein: 15.2,
      fat: 65.2,
      carbs: 13.7,
      fiber: 6.7,
      declaredCalories: 654,
    });
    assert.equal(walnut.netCarbs, 7.0);
    assert.ok(walnut.ratios.fatPct >= 80);
    assert.equal(walnut.validation.isValid, true);
  });

  await t.test('Лосось дикий / сёмга (100г): чистый карнивор/кето белок и омега-3', () => {
    const salmon = engine.calculateMacroProfile({
      protein: 20.0,
      fat: 13.0,
      carbs: 0.0,
      fiber: 0.0,
      declaredCalories: 197,
    });
    assert.equal(salmon.netCarbs, 0.0);
    assert.equal(salmon.calculatedCalories, 197);
    assert.equal(salmon.ratios.carbsPct, 0.0);
    assert.ok(salmon.ratios.fatPct > 55);
    assert.equal(salmon.validation.isValid, true);
  });

  await t.test('Сливки 33% (100г): высокий процент жира', () => {
    const cream = engine.calculateMacroProfile({
      protein: 2.2,
      fat: 33.0,
      carbs: 4.0,
      fiber: 0.0,
      declaredCalories: 322,
    });
    assert.equal(cream.netCarbs, 4.0);
    assert.equal(cream.calculatedCalories, 322);
    assert.ok(cream.ratios.fatPct > 90);
    assert.equal(cream.validation.isValid, true);
  });

  await t.test('Кето-десерт с эритритом и миндальной мукой (100г): вычет клетчатки и 100% эритрита', () => {
    const dessert = engine.calculateMacroProfile({
      protein: 10.0,
      fat: 35.0,
      carbs: 18.0,
      fiber: 6.0,
      polyols: { erythritol: 10.0 },
      declaredCalories: 363,
    });
    // чистые углеводы = 18 - 6 - 10 = 2г
    assert.equal(dessert.netCarbs, 2.0);
    assert.equal(dessert.totalPolyols, 10.0);
    assert.equal(dessert.effectivePolyolsDeduction, 10.0);
    assert.equal(dessert.validation.isValid, true);
  });

  await t.test('Кето-шоколад на мальтитоле (100г): мальтитол вычитается на 50%', () => {
    const chocolate = engine.calculateMacroProfile({
      protein: 6.0,
      fat: 38.0,
      carbs: 45.0,
      fiber: 10.0,
      polyols: { maltitol: 30.0 },
    });
    // чистые углеводы = 45 - 10 - (30 * 0.5) = 20г
    assert.equal(chocolate.netCarbs, 20.0);
    assert.equal(chocolate.totalPolyols, 30.0);
    assert.equal(chocolate.effectivePolyolsDeduction, 15.0);
    assert.equal(chocolate.validation.isValid, true);
  });
});

test('keto-engine: Comprehensive All Known Polyols Glycemic Coefficients', async (t) => {
  const polyolCases = [
    { name: 'erythritol', amount: 10, expectedDeduction: 10.0 },
    { name: 'allulose', amount: 10, expectedDeduction: 10.0 },
    { name: 'mannitol', amount: 10, expectedDeduction: 10.0 },
    { name: 'lactitol', amount: 10, expectedDeduction: 6.0 },
    { name: 'xylitol', amount: 10, expectedDeduction: 5.0 },
    { name: 'isomalt', amount: 10, expectedDeduction: 5.0 },
    { name: 'maltitol', amount: 10, expectedDeduction: 5.0 },
    { name: 'maltitol_syrup', amount: 10, expectedDeduction: 2.5 },
    { name: 'sorbitol', amount: 10, expectedDeduction: 4.0 },
    { name: 'glycerol', amount: 10, expectedDeduction: 0.0 },
  ];

  for (const pc of polyolCases) {
    await t.test(`correctly calculates net carbs for polyol: ${pc.name}`, () => {
      const netCarbs = engine.calculateNetCarbs({
        carbs: 20,
        fiber: 0,
        polyols: { [pc.name]: pc.amount },
      });
      const expectedNetCarbs = 20 - pc.expectedDeduction;
      assert.equal(netCarbs, expectedNetCarbs);
    });
  }
});
