const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const root = path.resolve(__dirname, '../..');

test('all 50 recipes and the 36 starter candidates have explicit review records without approvals', () => {
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'docs/release/catalog-nutrition-review-20261113.json')));
  const { RECIPES } = loadTs(path.join(root, 'src/data/recipes.ts'));
  assert.equal(pack.recipes.length, 50);
  assert.equal(pack.recipes.filter(r => r.priority === 'starter_36').length, 36);
  for (const r of RECIPES) {
    const entry = pack.recipes.find(e => e.id === r.id);
    assert.equal(entry.title, r.title);
    assert.equal(entry.basePortions, r.serv);
    assert.deepEqual(entry.ingredients.map(i => [i.name, i.originalAmount]), r.ing);
    assert.equal(entry.status, 'awaiting_editorial_review');
    assert.ok(entry.issues.length);
  }
});

test('December candidates have unique identities; saved archive remains distinct', () => {
  const { RECIPES } = loadTs(path.join(root, 'src/data/recipes.ts'));
  const { DECEMBER_REVIEW_CANDIDATES } = loadTs(path.join(root, 'src/data/monthlyCandidateRecipes.ts'));
  const ids = new Set(RECIPES.map(r => r.id));
  assert.deepEqual(DECEMBER_REVIEW_CANDIDATES.map(r => r.id), ['k35', 'k36', 'c17', 'c18']);
  for (const r of DECEMBER_REVIEW_CANDIDATES) {
    assert.ok(!ids.has(r.id));
    assert.equal(r.editorial_status, 'candidate');
    assert.equal(r.nutrition, undefined);
  }
});

test('all educational guides have explicit pending editorial status and no invented author approval', () => {
  const guides = JSON.parse(fs.readFileSync(path.join(root, 'docs/content/educational-guides.json')));
  assert.equal(guides.length, 8);
  assert.deepEqual(guides.slice(0, 2).map(g => g.id), ['intro_approaches', 'reading_labels']);
  for (const g of guides) {
    assert.equal(g.editorial_status, 'draft_for_owner_review');
    assert.equal(g.verified_date, '');
    assert.ok(!/одобрено|до 20–30|щедро солите|30 мл на кг|90%|протокол исключения/i.test(JSON.stringify(g)));
    assert.ok(g.actions.length > 0);
  }
});
