const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

test('Catalog Release Exporter Unit Tests', async (t) => {
  const { exportReleaseCatalog, computeRecipeHash } = await import('../../scripts/export-release-catalog.mjs');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-export-test-'));

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('exports empty locked catalog when RELEASED_RECIPE_IDS is empty', () => {
    const outPath = path.join(tempDir, 'empty-catalog.json');
    const result = exportReleaseCatalog({
      releasedIds: [],
      approvals: [],
      outputPath: outPath,
      testOnly: false,
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.totalReleased, 0);
    assert.equal(fs.existsSync(outPath), true);

    const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    assert.equal(data.schema_version, 1);
    assert.equal(data.test_only, false);
    assert.deepEqual(data.released_ids, []);
    assert.deepEqual(data.recipes, []);
    assert.equal(data.nutrition_status, 'unverified');
  });

  await t.test('rejects duplicate IDs in released list', () => {
    const outPath = path.join(tempDir, 'duplicate.json');
    assert.throws(
      () => {
        exportReleaseCatalog({
          releasedIds: ['k1', 'k1'],
          approvals: [],
          outputPath: outPath,
        });
      },
      /Duplicate recipe ID/
    );
  });

  await t.test('rejects recipe ID missing from catalog', () => {
    const outPath = path.join(tempDir, 'missing.json');
    assert.throws(
      () => {
        exportReleaseCatalog({
          releasedIds: ['non_existent_recipe_999'],
          approvals: [],
          outputPath: outPath,
        });
      },
      /not found in recipes catalog/
    );
  });

  await t.test('rejects missing approval record in production mode', () => {
    const outPath = path.join(tempDir, 'no-approval.json');
    assert.throws(
      () => {
        exportReleaseCatalog({
          releasedIds: ['k1'],
          approvals: [],
          outputPath: outPath,
          testOnly: false,
        });
      },
      /Missing approval record/
    );
  });

  await t.test('rejects stale content hash', () => {
    const outPath = path.join(tempDir, 'stale-hash.json');
    assert.throws(
      () => {
        exportReleaseCatalog({
          releasedIds: ['k1'],
          approvals: [{
            id: 'k1',
            approvalRef: 'DECISION_2026_01',
            approvalDate: '2026-10-31',
            serv: 2,
            imageStatus: 'verified',
            license: 'CC-BY-SA',
            sourceHash: 'stale_deadbeef_hash'
          }],
          outputPath: outPath,
          testOnly: false,
        });
      },
      /Stale content hash/
    );
  });

  await t.test('exports valid synthetic catalog when testOnly is true', () => {
    const outPath = path.join(tempDir, 'test-catalog.json');
    const result = exportReleaseCatalog({
      releasedIds: ['k1', 'k2'],
      outputPath: outPath,
      testOnly: true,
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.totalReleased, 2);
    const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    assert.equal(data.test_only, true);
    assert.equal(data.recipes.length, 2);
    assert.equal(data.recipes[0].id, 'k1');
    assert.equal(data.recipes[1].id, 'k2');
  });

  await t.test('computeRecipeHash detects changes in nested subs object', () => {
    const k1 = {
      id: 'k1',
      title: 'Яичница с авокадо',
      time: 12,
      serv: 2,
      mode: 'keto',
      ing: [['Яйца', '4 шт.'], ['Авокадо', '1 шт.']],
      steps: ['Шаг 1'],
      subs: { 'авокадо': 'оливки 50г' }
    };
    const hash1 = computeRecipeHash(k1);

    const k1ModifiedSubs = {
      ...k1,
      subs: { 'авокадо': 'сливочное масло 30г' }
    };
    const hash2 = computeRecipeHash(k1ModifiedSubs);
    assert.notEqual(hash1, hash2, 'Changing nested subs entry MUST change recipe hash');
  });

  await t.test('exportReleaseCatalog requires non-empty sourceHash in approval', () => {
    const outPath = path.join(tempDir, 'no-sourcehash.json');
    assert.throws(
      () => {
        exportReleaseCatalog({
          releasedIds: ['k1'],
          approvals: [{
            id: 'k1',
            approvalRef: 'DECISION_2026_01',
            approvalDate: '2026-10-31',
            serv: 2,
            imageStatus: 'verified',
            license: 'CC-BY-SA',
            sourceHash: '' // empty or missing sourceHash must be rejected!
          }],
          outputPath: outPath,
          testOnly: false,
        });
      },
      /Missing required sourceHash/
    );
  });
});
