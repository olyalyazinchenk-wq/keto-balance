const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { loadMonthlyCatalog } = loadTs(path.resolve(__dirname, '../../src/adapters/monthlyCatalog.ts'));

const month = '2027-01';
const current = { catalog_id: 'november', catalog_month: '2026-11', recipes: [{ id: 'old' }], access: 'full' };
const expected = { ...current, catalog_id: 'january', catalog_month: month };
const meta = { catalog_id: 'january', catalog_month: month, accessible: true };

test('monthly selection rejects absent, unrelated, inaccessible and invalid metadata without fetching', async () => {
  for (const [selected, registry] of [
    [month, []], [month, [{ ...meta, catalog_month: '2026-11' }]],
    [month, [{ ...meta, accessible: false }]], [month, [{ ...meta, accessible: undefined }]],
    [month, [{ ...meta, catalog_id: '' }]], ['', [meta]], ['2027-13', [meta]],
  ]) {
    let fetches = 0;
    await assert.rejects(() => loadMonthlyCatalog(selected, registry, current, async () => {
      fetches++; return expected;
    }));
    assert.equal(fetches, 0);
  }
});

test('monthly selection loads the exact registered month and leaves the previous catalog untouched', async () => {
  const before = JSON.stringify(current);
  const requests = [];
  assert.equal(await loadMonthlyCatalog(month, [meta], current, async id => {
    requests.push(id); return expected;
  }), expected);
  assert.deepEqual(requests, ['january']);
  assert.equal(JSON.stringify(current), before);
  assert.equal(await loadMonthlyCatalog(month, [meta], expected, async () => {
    assert.fail('matching catalog should be reused');
  }), expected);
});

test('monthly selection rejects wrong IDs, wrong months, empty or preview responses and network errors', async () => {
  for (const fetched of [current, { ...expected, catalog_month: '2027-02' },
    { ...expected, recipes: [] }, { ...expected, access: 'preview' }, null]) {
    await assert.rejects(() => loadMonthlyCatalog(month, [meta], current, async () => fetched));
  }
  await assert.rejects(() => loadMonthlyCatalog(month, [meta], current, async () => { throw new Error('offline'); }));
});
