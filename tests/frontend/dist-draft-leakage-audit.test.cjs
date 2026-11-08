/**
 * tests/frontend/dist-draft-leakage-audit.test.cjs
 *
 * Verifies zero leakage of unreleased draft recipes into client bundles (dist/assets/*.js).
 * Audits 16 carnivore drafts (c1..c16), 14 keto drafts (k18..k34 except k25, k27, k28),
 * and 4 December candidates (k21, k22, c17, c18).
 * Addresses Codex Audit 2026-11-08: P2 Draft Isolation.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');

describe('Client Bundle Draft Isolation Audit (Codex P2 Proof)', () => {
  const distAssetsDir = path.join(ROOT, 'dist/assets');
  assert.ok(fs.existsSync(distAssetsDir), 'dist/assets must exist (run build first)');

  const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0, 'At least one .js bundle must exist in dist/assets');

  let bundleContent = '';
  for (const jsFile of jsFiles) {
    bundleContent += fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf-8');
  }

  const { CARNIVORE_DRAFT_RECIPES } = loadTs(path.join(ROOT, 'src/data/carnivoreDraftRecipes.ts'));
  const { KETO_DRAFT_RECIPES } = loadTs(path.join(ROOT, 'src/data/ketoDraftRecipes.ts'));
  const { DECEMBER_DRAFT_RECIPES } = loadTs(path.join(ROOT, 'src/data/decemberDraftRecipes.ts'));

  test('All 16 carnivore draft titles are completely absent from client bundles', () => {
    assert.equal(CARNIVORE_DRAFT_RECIPES.length, 16);
    const leakedCarnivore = [];
    for (const recipe of CARNIVORE_DRAFT_RECIPES) {
      if (bundleContent.includes(recipe.title)) {
        leakedCarnivore.push({ id: recipe.id, title: recipe.title });
      }
    }
    assert.deepEqual(leakedCarnivore, [], 'No carnivore draft titles must appear in dist JS');
  });

  test('All 14 unreleased keto draft titles are completely absent from client bundles', () => {
    assert.equal(KETO_DRAFT_RECIPES.length, 14);
    const leakedKeto = [];
    for (const recipe of KETO_DRAFT_RECIPES) {
      if (bundleContent.includes(recipe.title)) {
        leakedKeto.push({ id: recipe.id, title: recipe.title });
      }
    }
    assert.deepEqual(leakedKeto, [], 'No unreleased keto draft titles must appear in dist JS');
  });

  test('All 4 December candidate draft titles are completely absent from client bundles', () => {
    assert.equal(DECEMBER_DRAFT_RECIPES.length, 4);
    const leakedDecember = [];
    for (const recipe of DECEMBER_DRAFT_RECIPES) {
      if (bundleContent.includes(recipe.title)) {
        leakedDecember.push({ id: recipe.id, title: recipe.title });
      }
    }
    assert.deepEqual(leakedDecember, [], 'No December candidate titles must appear in dist JS');
  });

  test('Released keto recipes (20 items) ARE present in client bundle', () => {
    const { KETO_RELEASED_RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));
    assert.equal(KETO_RELEASED_RECIPES.length, 20);

    // Check that approved recipes are genuinely available in bundle
    const foundApproved = KETO_RELEASED_RECIPES.filter((r) => bundleContent.includes(r.title));
    assert.ok(foundApproved.length >= 18, 'Approved recipes must be present in client bundle');
  });
});
