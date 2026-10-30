const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { initTelegram, syncNativeColors, bindBackButton, getMiniApp } = loadTs(
  path.resolve(__dirname, '../../src/tma/telegram.ts')
);

test('initTelegram handles undefined tg safely without throwing', () => {
  const cleanup = initTelegram(undefined);
  assert.equal(typeof cleanup, 'function');
  assert.doesNotThrow(() => cleanup());
});

test('initTelegram attaches listeners and updates CSS variables', () => {
  const events = {};
  const rootProps = {};
  const mockRoot = {
    style: {
      setProperty(key, val) { rootProps[key] = val; },
      removeProperty(key) { delete rootProps[key]; },
    },
  };
  const mockTg = {
    viewportStableHeight: 650,
    safeAreaInset: { top: 20, bottom: 30, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready() {},
    expand() {},
    onEvent(ev, fn) { events[ev] = fn; },
    offEvent(ev) { delete events[ev]; },
  };

  const cleanup = initTelegram(mockTg, mockRoot);
  assert.equal(rootProps['--kb-viewport-height'], '650px');
  assert.equal(rootProps['--kb-safe-top'], '20px');
  assert.equal(rootProps['--kb-safe-bottom'], '30px');
  assert.ok(events['viewportChanged']);

  cleanup();
  assert.equal(Object.keys(events).length, 0);
});

test('bindBackButton handles missing button and manages click subscriptions', () => {
  assert.doesNotThrow(() => {
    const cleanup = bindBackButton(undefined, () => {});
    cleanup();
  });

  let shown = false;
  let clicked = false;
  let handler = null;
  const mockTg = {
    BackButton: {
      show() { shown = true; },
      hide() { shown = false; },
      onClick(fn) { handler = fn; },
      offClick(fn) { if (handler === fn) handler = null; },
    },
  };

  const cleanup = bindBackButton(mockTg, () => { clicked = true; });
  assert.equal(shown, true);
  assert.equal(typeof handler, 'function');
  handler();
  assert.equal(clicked, true);

  cleanup();
  assert.equal(shown, false);
  assert.equal(handler, null);
});

test('syncNativeColors calls supported versioned methods safely', () => {
  const calls = [];
  const mockTg = {
    isVersionAtLeast(v) { return true; },
    setHeaderColor(c) { calls.push(['header', c]); },
    setBackgroundColor(c) { calls.push(['bg', c]); },
    setBottomBarColor(c) { calls.push(['bottom', c]); },
  };
  syncNativeColors(mockTg, '#111', '#222');
  assert.deepEqual(calls, [
    ['header', '#111'],
    ['bg', '#111'],
    ['bottom', '#222'],
  ]);
});
