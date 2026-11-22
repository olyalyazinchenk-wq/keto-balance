const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { parseProgressEntry, progressDelta } = loadTs('src/ui/food-first/progressModel.ts');
const { KetoClient } = loadTs('src/api/ketoClient.ts');
const { backEntries } = loadTs('src/ui/food-first/navigation.ts');
const fields = { weight: '80,5', chest: '', waist: '90', hips: '' };

test('measurements accept decimal comma and optional fields, reject invalid/future dates and values', () => {
  assert.deepEqual(parseProgressEntry('2020-02-29', fields), { date: '2020-02-29', weight: 80.5, chest: null, waist: 90, hips: null });
  for (const date of ['2020-02-30', '2020-13-01', '2099-01-01', '1899-01-01']) assert.throws(() => parseProgressEntry(date, fields));
  for (const weight of ['NaN', 'Infinity', '-1', '401', '80.55', '8e1']) assert.throws(() => parseProgressEntry('2020-01-01', { ...fields, weight }));
  assert.throws(() => parseProgressEntry('2020-01-01', { weight: '', chest: '', waist: '', hips: '' }));
});

test('change is chronological, skips missing values and uses separate baselines', () => {
  const entries = [
    { date: '2020-03-01', weight: 78.3, waist: 88 },
    { date: '2020-01-01', weight: 80.5, waist: null },
    { date: '2020-02-01', weight: null, waist: 90 },
  ];
  assert.deepEqual(progressDelta(entries, 'weight'), { first: 80.5, latest: 78.3, delta: -2.2 });
  assert.deepEqual(progressDelta(entries, 'waist'), { first: 90, latest: 88, delta: -2 });
  assert.equal(progressDelta([entries[0]], 'weight'), null);
  assert.deepEqual(backEntries([{ screen: 'progress', scrollY: 0 }]), [{ screen: 'more', scrollY: 0 }]);
});

test('client uses authenticated progress API with revision and consent, never user selector', async () => {
  const oldFetch = global.fetch, requests = [];
  global.fetch = async (url, options) => { requests.push({ url, ...options }); return new Response(JSON.stringify({ age: 40, entries: [], revision: 1 }), { status: 200 }); };
  try {
    const api = new KetoClient(); api.setToken('synthetic-progress');
    await api.getProgress();
    await api.saveProgress({ age: 40, entry: parseProgressEntry('2020-01-01', fields), expected_revision: 0, consent: true });
    await api.deleteProgress('2020-01-01', 1);
    assert.deepEqual(requests.map(r => r.url), ['/api/progress', '/api/progress', '/api/progress/2020-01-01?expected_revision=1']);
    assert.ok(requests.every(r => r.headers.get('Authorization') === 'Bearer synthetic-progress'));
    assert.equal(JSON.parse(requests[1].body).consent, true);
  } finally { global.fetch = oldFetch; }
});
