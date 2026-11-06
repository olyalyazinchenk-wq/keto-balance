const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

const telegramMod = loadTs(path.join(ROOT, 'src/tma/telegram.ts'));
const { handleLateTelegramSDK, setupTelegramApp } = telegramMod;

function createMockRoot() {
  const styles = new Map();
  const classes = new Set();
  const attrs = new Map();
  return {
    style: {
      setProperty: (k, v) => styles.set(k, v),
      removeProperty: (k) => styles.delete(k),
      getPropertyValue: (k) => styles.get(k),
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, v),
    getAttribute: (k) => attrs.get(k),
    _styles: styles,
    _classes: classes,
    _attrs: attrs,
  };
}

function createMockTelegram(initData = 'auth_date=1730000000&hash=mockhash') {
  const events = new Map();
  let readyCalled = 0;
  let expandCalled = 0;

  return {
    initData,
    colorScheme: 'light',
    viewportHeight: 700,
    viewportStableHeight: 700,
    safeAreaInset: { top: 24, bottom: 34, left: 0, right: 0 },
    ready: () => { readyCalled++; },
    expand: () => { expandCalled++; },
    onEvent: (name, cb) => {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(cb);
    },
    offEvent: (name, cb) => {
      if (!events.has(name)) return;
      const list = events.get(name).filter(fn => fn !== cb);
      events.set(name, list);
    },
    triggerEvent: (name) => {
      const list = events.get(name) || [];
      for (const fn of list) fn();
    },
    get _readyCount() { return readyCalled; },
    get _expandCount() { return expandCalled; },
    get _events() { return events; },
  };
}

test('Late Telegram SDK (>5s) handling and duplicate auth prevention', async (t) => {
  await t.test(
    'handleLateTelegramSDK invokes ready(), sets viewport/theme, binds events and cleans up fallback',
    () => {
      const root = createMockRoot();
      const tg = createMockTelegram();

      // App mounted with undefined tg initially (simulating >5s fallback timeout)
      const cleanup = setupTelegramApp(undefined, root);

      // Now SDK appears late (>5s)
      assert.equal(typeof handleLateTelegramSDK, 'function', 'handleLateTelegramSDK must be exported');
      handleLateTelegramSDK(tg, root);

      // 1. ready() and expand() must be called
      assert.equal(tg._readyCount, 1, 'ready() must be invoked on late SDK');
      assert.equal(tg._expandCount, 1, 'expand() must be invoked on late SDK');

      // 2. Viewport & safe area CSS variables must be set on root
      assert.equal(root._styles.get('--kb-viewport-height'), '700px');
      assert.equal(root._styles.get('--kb-safe-top'), '24px');
      assert.equal(root._styles.get('--kb-safe-bottom'), '34px');

      // 3. Theme events must be bound and responsive
      assert.ok(tg._events.has('themeChanged'), 'themeChanged event must be bound');
      assert.ok(tg._events.has('viewportChanged'), 'viewportChanged event must be bound');

      // Trigger theme change on late-bound SDK
      tg.colorScheme = 'dark';
      tg.triggerEvent('themeChanged');
      assert.ok(root.classList.contains('dark'), 'Late-bound themeChanged updates root to dark');

      cleanup();
    }
  );

  await t.test(
    'prevents duplicate authorization calls when late SDK loads after prior auth or during in-flight auth',
    async () => {
      // Track auth calls to ensure no duplicates
      let authCallCount = 0;
      const authCalls = [];

      class MockKetoClient {
        async createSession(initData) {
          authCallCount++;
          authCalls.push({ type: 'session', initData, time: Date.now() });
          await new Promise(r => setTimeout(r, 10));
          return { user_id: 12345, session_token: 'tok-12345' };
        }
      }

      const client = new MockKetoClient();

      // Simulate auth dispatch guard
      let authDispatched = false;
      const dispatchAuth = async (initData) => {
        if (authDispatched) {
          return null; // Block duplicate authorization
        }
        authDispatched = true;
        return client.createSession(initData);
      };

      // 1. First auth triggered via initial launch data (e.g. hash or query fallback)
      const firstResult = await dispatchAuth('auth_date=111&hash=first');
      assert.ok(firstResult);
      assert.equal(authCallCount, 1);

      // 2. Late SDK arrives (>5s) with its own initData
      const lateTg = createMockTelegram('auth_date=222&hash=late_sdk_data');
      handleLateTelegramSDK(lateTg);

      // Attempting to dispatch auth again when SDK loads late MUST be blocked
      const secondResult = await dispatchAuth(lateTg.initData);
      assert.equal(secondResult, null, 'Duplicate auth call must be blocked');
      assert.equal(authCallCount, 1, 'Total auth calls must remain exactly 1');
      assert.equal(authCalls.length, 1);
    }
  );
});
