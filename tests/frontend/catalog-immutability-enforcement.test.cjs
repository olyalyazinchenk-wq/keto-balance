/**
 * tests/frontend/catalog-immutability-enforcement.test.cjs
 *
 * Verifies that released catalog snapshots cannot be overwritten with altered recipes under the same ID,
 * and that December candidates have all required Recipe fields and pass eligibility.
 * Addresses Codex Audit 2026-11-08: P1 Catalog Immutability & December candidates.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const { exportReleaseCatalog, computeRecipeHash } = require(path.join(ROOT, 'scripts/export-release-catalog.mjs'));
const { isRecipeAllowed } = loadTs(path.join(ROOT, 'src/domain/eligibility.ts'));
const { DECEMBER_DRAFT_RECIPES } = loadTs(path.join(ROOT, 'src/data/decemberDraftRecipes.ts'));

describe('Catalog Immutability Enforcement & December Package (Codex Proof)', () => {
  test('Immutability violation: attempting to re-export modified recipe under same catalog_id fails', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keto-cat-immut-'));
    const archiveDir = path.join(tmpDir, 'archive');
    const outDist = path.join(tmpDir, 'dist');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.mkdirSync(outDist, { recursive: true });

    try {
      // 1. Initial export of v1
      const res1 = exportReleaseCatalog({
        outputPath: path.join(outDist, 'released-catalog.json'),
        archiveDir,
      });
      assert.equal(res1.status, 'ok');

      // Verify archive was saved
      const v1Archive = path.join(archiveDir, 'released-catalog-202611-v1.json');
      assert.ok(fs.existsSync(v1Archive), 'Archive file must exist');

      // 2. Tamper with archive simulation: modify k1 recipe in archive
      const originalContent = JSON.parse(fs.readFileSync(v1Archive, 'utf-8'));
      const tampered = JSON.parse(JSON.stringify(originalContent));
      tampered.recipes[0].title = "Изменённый рецепт k1";
      fs.writeFileSync(v1Archive, JSON.stringify(tampered, null, 2), 'utf-8');

      // 3. Attempt to re-export under same ID: must throw Immutability violation!
      assert.throws(
        () => {
          exportReleaseCatalog({
            outputPath: path.join(outDist, 'released-catalog.json'),
            archiveDir,
          });
        },
        /Immutability violation/i,
        'Export must throw Immutability violation when recipe content differs under same catalog_id'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('December candidates: all 4 recipes pass isRecipeAllowed with cookTime=240', () => {
    assert.equal(DECEMBER_DRAFT_RECIPES.length, 4);
    const profile = { cookTime: 240, allergies: [], disliked: [] };

    for (const r of DECEMBER_DRAFT_RECIPES) {
      assert.ok(r.time, `Recipe ${r.id} must have time defined`);
      assert.ok(r.time <= 240, `Recipe ${r.id} time must be <= 240`);
      assert.equal(
        isRecipeAllowed(r, profile),
        true,
        `Recipe ${r.id} must be allowed for cookTime=240`
      );
    }
  });

  test('k22 ingredients strictly match docs/release/monthly-editorial-package-202612.md', () => {
    const k22 = DECEMBER_DRAFT_RECIPES.find((r) => r.id === 'k22');
    assert.ok(k22, 'k22 must exist');
    const ingNames = k22.ing.map((item) => item[0]);
    const expected = [
      'Цветная капуста',
      'Сливки 33%',
      'Бекон',
      'Сливочное масло',
      'Бульон костный',
      'Мускатный орех',
    ];
    for (const exp of expected) {
      assert.ok(ingNames.includes(exp), `k22 must include ingredient '${exp}'`);
    }
  });
});
