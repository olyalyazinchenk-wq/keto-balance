const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { supportReviewRequest, SupportReviewError } = loadTs(path.resolve(__dirname, '../../src/adapters/supportReviewApi.ts'));

test('review action binds exact recipient and saved draft version; never retries a write', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify({ detail: 'stale' }), { status: 409 }); };
  try {
    await assert.rejects(supportReviewRequest('test-only', '/4/send', { expected_version: 3, recipient_id: 9 }), e => e instanceof SupportReviewError && e.status === 409);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/admin/support/4/send');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer test-only');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { expected_version: 3, recipient_id: 9 });
  } finally { global.fetch = original; }
});

test('non-owner response stays forbidden, never interpreted as an empty successful queue', async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ detail: 'Forbidden' }), { status: 403 });
  try { await assert.rejects(supportReviewRequest('test-only'), e => e.status === 403); }
  finally { global.fetch = original; }
});
