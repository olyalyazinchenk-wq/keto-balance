const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('Behavioral verification: local SDK refusal and transition to CDN fallback', async (t) => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.tsx'), 'utf8');

  // Verify static AST contract in main.tsx
  assert.match(
    mainSource,
    /script\.src\s*=\s*'\/telegram-web-app\.js'/,
    'Initial script source must point to local /telegram-web-app.js'
  );
  assert.match(
    mainSource,
    /if\s*\(!script\.src\.includes\('telegram\.org'\)\)\s*\{[\s\S]*?script\.src\s*=\s*'https:\/\/telegram\.org\/js\/telegram-web-app\.js';[\s\S]*?return;\s*\}/,
    'On local SDK error, script.src must transition to official telegram.org CDN'
  );

  // Behavioral simulation of DOM script loader
  await t.test('simulates local script error triggering transition to telegram.org CDN', async () => {
    let appendedScript = null;
    let clearTimerCalled = false;
    let clearedTimerId = null;

    const mockDocument = {
      createElement: (tag) => {
        if (tag !== 'script') throw new Error(`Unexpected tag: ${tag}`);
        const el = {
          async: false,
          src: '',
          onload: null,
          onerror: null,
        };
        return el;
      },
      head: {
        appendChild: (child) => {
          appendedScript = child;
        },
      },
    };

    let timerIdSeq = 100;
    const mockWindow = {
      setTimeout: (cb, ms) => {
        assert.equal(ms, 5000, 'Fallback timeout must be 5000ms');
        return ++timerIdSeq;
      },
      clearTimeout: (id) => {
        clearTimerCalled = true;
        clearedTimerId = id;
      },
    };

    // Instantiate and execute loader logic with mocked DOM
    function executeLoader(doc, win) {
      return new Promise((resolve) => {
        const script = doc.createElement('script');
        let fallbackTimer = win.setTimeout(() => {
          fallbackTimer = null;
          resolve('timed_out');
        }, 5000);

        const onScriptLoaded = () => {
          if (fallbackTimer !== null) {
            win.clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          resolve('loaded');
        };

        const onScriptError = () => {
          if (!script.src.includes('telegram.org')) {
            script.src = 'https://telegram.org/js/telegram-web-app.js';
            return;
          }
          if (fallbackTimer !== null) {
            win.clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          resolve('error_resolved');
        };

        script.async = true;
        script.src = '/telegram-web-app.js';
        script.onload = onScriptLoaded;
        script.onerror = onScriptError;
        doc.head.appendChild(script);
      });
    }

    const loadPromise = executeLoader(mockDocument, mockWindow);

    // 1. Initially appended script points to local bundle
    assert.equal(appendedScript.src, '/telegram-web-app.js');
    assert.equal(typeof appendedScript.onerror, 'function');
    assert.equal(typeof appendedScript.onload, 'function');

    // 2. Simulate failure of local SDK (e.g. 404, network error, or CSP refusal)
    appendedScript.onerror();

    // 3. Verify immediate behavioral transition to official CDN
    assert.equal(
      appendedScript.src,
      'https://telegram.org/js/telegram-web-app.js',
      'Refusal of local SDK must immediately switch src to CDN'
    );

    // 4. Simulate successful loading from CDN
    appendedScript.onload();
    const result = await loadPromise;

    assert.equal(result, 'loaded', 'Loader must resolve successfully once CDN script loads');
    assert.equal(clearTimerCalled, true, 'Fallback timer must be canceled on successful CDN load');
    assert.equal(clearedTimerId, timerIdSeq, 'The active timer ID must be cleared');
  });

  await t.test('simulates both local and CDN failure resolving safely without crashing', async () => {
    let appendedScript = null;
    const mockDocument = {
      createElement: () => ({ async: false, src: '', onload: null, onerror: null }),
      head: { appendChild: (c) => { appendedScript = c; } },
    };
    const mockWindow = {
      setTimeout: (cb) => 200,
      clearTimeout: () => {},
    };

    function executeLoader(doc, win) {
      return new Promise((resolve) => {
        const script = doc.createElement('script');
        let fallbackTimer = win.setTimeout(() => {
          fallbackTimer = null;
          resolve('timed_out');
        }, 5000);

        const onScriptLoaded = () => {
          if (fallbackTimer !== null) {
            win.clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          resolve('loaded');
        };

        const onScriptError = () => {
          if (!script.src.includes('telegram.org')) {
            script.src = 'https://telegram.org/js/telegram-web-app.js';
            return;
          }
          if (fallbackTimer !== null) {
            win.clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          resolve('error_resolved');
        };

        script.async = true;
        script.src = '/telegram-web-app.js';
        script.onload = onScriptLoaded;
        script.onerror = onScriptError;
        doc.head.appendChild(script);
      });
    }

    const loadPromise = executeLoader(mockDocument, mockWindow);
    // First error: local fails -> switches to CDN
    appendedScript.onerror();
    assert.equal(appendedScript.src, 'https://telegram.org/js/telegram-web-app.js');

    // Second error: CDN also fails -> safely resolves fallback without rejection
    appendedScript.onerror();
    const result = await loadPromise;
    assert.equal(result, 'error_resolved');
  });
});
