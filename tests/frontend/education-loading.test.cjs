const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { loadEducationGuides, createEducationGuideLoader } = loadTs('src/api/loadEducationGuides.ts');
const { fetchWithTimeout } = loadTs('src/api/fetchWithTimeout.ts');
const response = (status = 200) => new Response(JSON.stringify({ guides: [{ id: 'test' }] }), { status });

test('learning accepts a response slower than the former five-second deadline', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (_url, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response()), 5200);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
    });
    const [previous, candidate] = await Promise.allSettled([
      fetchWithTimeout('/api/education/guides', {}, 5000),
      loadEducationGuides(new AbortController().signal),
    ]);
    assert.equal(previous.status, 'rejected');
    assert.match(previous.reason.message, /не ответил вовремя/);
    assert.deepEqual(candidate, { status: 'fulfilled', value: [{ id: 'test' }] });
  } finally { global.fetch = original; }
});

test('transient GET failures retry once with the same session, auth errors never retry', async () => {
  const original = global.fetch;
  try {
    for (const failure of [503, 504, 'network']) {
      let calls = 0;
      global.fetch = async (url, options) => {
        calls++;
        assert.equal(url, '/api/education/guides');
        assert.equal(options.headers.Authorization, 'Bearer synthetic-session');
        if (calls === 1 && failure === 'network') throw new Error('network');
        return response(calls === 1 ? failure : 200);
      };
      assert.equal((await loadEducationGuides(new AbortController().signal, 'synthetic-session')).length, 1);
      assert.equal(calls, 2);
    }
    for (const status of [401, 403, 500]) {
      let calls = 0;
      global.fetch = async () => { calls++; return response(status); };
      await assert.rejects(loadEducationGuides(new AbortController().signal));
      assert.equal(calls, 1);
    }
    let calls = 0;
    global.fetch = async () => { calls++; return response(503); };
    await assert.rejects(loadEducationGuides(new AbortController().signal));
    assert.equal(calls, 2);
  } finally { global.fetch = original; }
});

test('cancellation stops retries; malformed payloads cannot appear as successful empty lists', async () => {
  const original = global.fetch;
  try {
    const controller = new AbortController();
    let calls = 0;
    global.fetch = async () => { calls++; controller.abort(); throw new Error('cancel'); };
    await assert.rejects(loadEducationGuides(controller.signal));
    assert.equal(calls, 1);
    global.fetch = async () => new Response('{"guides":null}');
    await assert.rejects(loadEducationGuides(new AbortController().signal), /неверный список/);
  } finally { global.fetch = original; }
});

test('learning and microguides reuse a recent response within one session only', async () => {
  const original = global.fetch;
  const originalNow = Date.now;
  const sessions = [];
  let now = 100_000;
  Date.now = () => now;
  global.fetch = async (_url, options) => {
    const session = options.headers.Authorization;
    sessions.push(session);
    return new Response(JSON.stringify({ guides: [{ id: session }] }));
  };
  try {
    const first = createEducationGuideLoader('first');
    const second = createEducationGuideLoader('second');
    const controller = new AbortController();
    const initial = await first(controller.signal);
    assert.deepEqual(await first(controller.signal), initial);
    assert.deepEqual(await second(controller.signal), [{ id: 'Bearer second' }]);
    assert.deepEqual(sessions, ['Bearer first', 'Bearer second']);
    now += 60_000;
    await first(controller.signal);
    controller.abort();
    await assert.rejects(first(controller.signal), /отменена/);
    assert.deepEqual(sessions, ['Bearer first', 'Bearer second', 'Bearer first']);
  } finally { global.fetch = original; Date.now = originalNow; }
});
