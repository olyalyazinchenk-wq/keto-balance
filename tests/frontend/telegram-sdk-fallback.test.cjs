const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

// Load the ACTUAL application module under test
const sdkLoaderMod = loadTs(path.join(ROOT, 'src/tma/loadTelegramSdk.ts'));
const { loadTelegramSDK } = sdkLoaderMod;

test('Behavioral verification: real loadTelegramSDK application code execution', async (t) => {
  assert.equal(typeof loadTelegramSDK, 'function', 'loadTelegramSDK must be an exported function');

  await t.test('executes real application code: local script error triggers transition to telegram.org CDN', async () => {
    let appendedScript = null;
    let clearTimerCalled = false;
    let clearedTimerId = null;

    const mockDocument = {
      createElement: (tag) => {
        if (tag !== 'script') throw new Error(`Unexpected tag: ${tag}`);
        return {
          async: false,
          src: '',
          onload: null,
          onerror: null,
        };
      },
      head: {
        appendChild: (child) => {
          appendedScript = child;
        },
      },
    };

    let timerIdSeq = 100;
    const mockWindow = {
      Telegram: undefined,
      setTimeout: (cb, ms) => {
        assert.equal(ms, 5000, 'Fallback timeout must be 5000ms');
        return ++timerIdSeq;
      },
      clearTimeout: (id) => {
        clearTimerCalled = true;
        clearedTimerId = id;
      },
    };

    // Execute the ACTUAL function from src/tma/loadTelegramSdk.ts
    const loadPromise = loadTelegramSDK(mockDocument, mockWindow);

    // 1. Initially appended script points to local bundle
    assert.ok(appendedScript, 'A script element must have been appended');
    assert.equal(appendedScript.src, '/telegram-web-app.js');
    assert.equal(typeof appendedScript.onerror, 'function');
    assert.equal(typeof appendedScript.onload, 'function');

    // 2. Simulate failure of local SDK (e.g. 404, network error, or CSP refusal)
    appendedScript.onerror();

    // 3. Verify immediate behavioral transition to official CDN inside the real code
    assert.equal(
      appendedScript.src,
      'https://telegram.org/js/telegram-web-app.js',
      'Refusal of local SDK must immediately switch src to CDN'
    );

    // 4. Simulate successful loading from CDN
    appendedScript.onload();
    await loadPromise;

    assert.equal(clearTimerCalled, true, 'Fallback timer must be canceled on successful CDN load');
    assert.equal(clearedTimerId, timerIdSeq, 'The active timer ID must be cleared');
  });

  await t.test('executes real application code: both local and CDN failure resolves safely without crashing', async () => {
    let appendedScript = null;
    const mockDocument = {
      createElement: () => ({ async: false, src: '', onload: null, onerror: null }),
      head: { appendChild: (c) => { appendedScript = c; } },
    };
    const mockWindow = {
      Telegram: undefined,
      setTimeout: () => 200,
      clearTimeout: () => {},
    };

    // Execute the ACTUAL function from src/tma/loadTelegramSdk.ts
    const loadPromise = loadTelegramSDK(mockDocument, mockWindow);

    // First error: local fails -> switches to CDN
    appendedScript.onerror();
    assert.equal(appendedScript.src, 'https://telegram.org/js/telegram-web-app.js');

    // Second error: CDN also fails -> safely resolves without throw or crash
    appendedScript.onerror();
    await loadPromise;
  });

  await t.test('executes real application code: bypasses script injection if Telegram.WebApp already exists', async () => {
    let createElementCalled = false;
    const mockDocument = {
      createElement: () => { createElementCalled = true; return {}; },
      head: { appendChild: () => {} },
    };
    const mockWindow = {
      Telegram: {
        WebApp: { initData: 'existing-data' },
      },
    };

    await loadTelegramSDK(mockDocument, mockWindow);
    assert.equal(createElementCalled, false, 'If Telegram.WebApp already present, no script tag should be injected');
  });
});
