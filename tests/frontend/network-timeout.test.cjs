const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fetchWithTimeout } = loadTs('src/api/fetchWithTimeout.ts');

test('network deadline aborts a stalled connection and body without retrying', async () => {
  const original = global.fetch;
  try {
    for (const stalledBody of [false, true]) {
      let calls = 0;
      global.fetch = async (_url, options) => {
        calls++;
        const pending = new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        return stalledBody ? { text: () => pending } : pending;
      };
      await assert.rejects(fetchWithTimeout('/synthetic', {}, 10), /не ответил вовремя/);
      assert.equal(calls, 1);
    }
  } finally { global.fetch = original; }
});
