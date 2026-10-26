const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Replacement candidates and UI constraints (P07)', async (t) => {
  const { replacementCandidates, generateMenu } = loadTs('src/domain/menu.ts');
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');

  await t.test('excludes current recipe and recipes already used on the current day', () => {
    const currentId = 'k1';
    const dayIds = ['k1', 'k2', 'k3'];
    const candidates = replacementCandidates(currentId, dayIds, RECIPES, null, 'breakfast', 'keto');

    assert.ok(candidates.length > 0, 'Should find candidates');
    for (const c of candidates) {
      assert.notEqual(c.id, currentId, 'Current recipe must be excluded');
      assert.ok(!dayIds.includes(c.id), 'Already used recipes of the day must be excluded');
      assert.equal(c.mode, 'keto', 'Candidate mode must match requested mode');
    }
  });

  await t.test('strictly filters candidates by user profile allergies', () => {
    const profile = { allergies: ['Яйца'] };
    const candidates = replacementCandidates('k14', ['k14'], RECIPES, profile, 'breakfast', 'keto');

    assert.ok(candidates.length > 0);
    for (const c of candidates) {
      assert.ok(isRecipeAllowed(c, profile), `Candidate ${c.id} must be allowed by profile`);
      const hasEgg = c.ing.some(([name]) => name.toLowerCase().includes('яйц'));
      assert.ok(!hasEgg, `Candidate ${c.id} (${c.title}) contains eggs!`);
    }
  });

  await t.test('returns empty array when no eligible candidates exist without fallback to forbidden dishes', () => {
    // Profile that bans all dairy, eggs, fish, nuts, and disliked all common items
    const strictProfile = {
      allergies: ['Яйца', 'Молочные продукты', 'Рыба', 'Орехи'],
      disliked: ['Авокадо', 'Брокколи', 'Лук', 'Перец', 'Грибы', 'Субпродукты', 'Морепродукты']
    };
    const allIds = RECIPES.map(r => r.id);
    const candidates = replacementCandidates('k1', allIds, RECIPES, strictProfile, 'breakfast', 'keto');
    assert.deepEqual(candidates, [], 'Must return empty array instead of substituting forbidden dishes');
  });

  await t.test('places preferred category first in candidate list', () => {
    const candidates = replacementCandidates('k1', ['k1'], RECIPES, null, 'lunch', 'keto');
    assert.ok(candidates.length > 0);
    const firstPref = candidates.findIndex(c => c.cat === 'lunch');
    assert.equal(firstPref, 0, 'First candidate should be of preferred category if available');
  });

  await t.test('never crosses mode boundary between keto and carnivore', () => {
    const carnivoreCandidates = replacementCandidates('c1', ['c1'], RECIPES, null, 'lunch', 'carnivore');
    assert.ok(carnivoreCandidates.length > 0);
    for (const c of carnivoreCandidates) {
      assert.equal(c.mode, 'carnivore');
    }

    const ketoCandidates = replacementCandidates('k1', ['k1'], RECIPES, null, 'lunch', 'keto');
    assert.ok(ketoCandidates.length > 0);
    for (const c of ketoCandidates) {
      assert.equal(c.mode, 'keto');
    }
  });
});
