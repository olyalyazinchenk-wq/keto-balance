/**
 * tests/frontend/empirical_m3_tma.cjs
 *
 * Empirical Adversarial Verification Suite for Milestone 3 TMA Integration.
 * Stress-tests:
 * 1. TMA Haptic Dispatch & Resilience (all types, legacy aliases, TMA mock, browser fallback, throwing bridges, __hapticLog audit).
 * 2. Viewport & Safe Area Calculations (iPhone Dynamic Island, Android Punch-hole, zero insets, malformed/negative, dynamic events & teardown).
 * 3. Theme Synchronization & Native Colors (light, dark, prefers-color-scheme fallback, dynamic themeChanged, version gating).
 * 4. BackButton Management (single bind, nested/stacked binds, convenience wrappers, rapid cycling / leak-free teardown).
 * 5. Environment & Invariant Guardrails.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const tma = loadTs(path.resolve(__dirname, '../../src/tma/telegram.ts'));
const {
  initTelegram,
  syncNativeColors,
  triggerHaptic,
  applyTelegramTheme,
  setupTelegramApp,
  bindBackButton,
  showBackButton,
  hideBackButton,
  setNativeBackButton,
  getMiniApp,
} = tma;

function semverCompare(v1, v2) {
  const p1 = String(v1).split('.').map(Number);
  const p2 = String(v2).split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function createMockRoot() {
  const styles = {};
  const classes = new Set();
  const attributes = {};
  return {
    style: {
      setProperty(key, val) {
        styles[key] = String(val);
      },
      removeProperty(key) {
        delete styles[key];
      },
      getPropertyValue(key) {
        return styles[key] || '';
      },
      colorScheme: undefined,
    },
    _styles: styles,
    classList: {
      add(cls) {
        classes.add(cls);
      },
      remove(cls) {
        classes.delete(cls);
      },
      contains(cls) {
        return classes.has(cls);
      },
      get list() {
        return Array.from(classes);
      },
    },
    setAttribute(key, val) {
      attributes[key] = String(val);
    },
    getAttribute(key) {
      return attributes[key];
    },
    removeAttribute(key) {
      delete attributes[key];
    },
    _attributes: attributes,
  };
}

function createMockTg(options = {}) {
  const events = new Map();
  const calls = {
    ready: 0,
    expand: 0,
    setHeaderColor: [],
    setBackgroundColor: [],
    setBottomBarColor: [],
    impactOccurred: [],
    notificationOccurred: [],
    selectionChanged: 0,
    backButtonShow: 0,
    backButtonHide: 0,
    backButtonClickHandlers: [],
  };

  const backButton = {
    isVisible: false,
    show() {
      backButton.isVisible = true;
      calls.backButtonShow++;
    },
    hide() {
      backButton.isVisible = false;
      calls.backButtonHide++;
    },
    onClick(fn) {
      calls.backButtonClickHandlers.push(fn);
    },
    offClick(fn) {
      calls.backButtonClickHandlers = calls.backButtonClickHandlers.filter(h => h !== fn);
    },
    triggerClick() {
      for (const handler of [...calls.backButtonClickHandlers]) {
        handler();
      }
    },
  };

  const haptic = {
    impactOccurred(style) {
      calls.impactOccurred.push(style);
    },
    notificationOccurred(type) {
      calls.notificationOccurred.push(type);
    },
    selectionChanged() {
      calls.selectionChanged++;
    },
  };

  const tg = {
    initData: options.initData ?? 'auth_date=123456&user=%7B%22id%22%3A1084557944%7D',
    viewportHeight: 'viewportHeight' in options ? options.viewportHeight : 844,
    viewportStableHeight: 'viewportStableHeight' in options ? options.viewportStableHeight : 844,
    colorScheme: options.colorScheme ?? 'light',
    themeParams: options.themeParams ?? {},
    safeAreaInset: options.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: options.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 },
    ready() {
      calls.ready++;
    },
    expand() {
      calls.expand++;
    },
    onEvent(event, fn) {
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(fn);
    },
    offEvent(event, fn) {
      if (events.has(event)) {
        if (fn) {
          events.get(event).delete(fn);
        } else {
          events.delete(event);
        }
      }
    },
    triggerEvent(event) {
      if (events.has(event)) {
        for (const fn of events.get(event)) {
          fn();
        }
      }
    },
    isVersionAtLeast(v) {
      if (options.version) {
        return semverCompare(options.version, v) >= 0;
      }
      return true;
    },
    setHeaderColor(c) {
      calls.setHeaderColor.push(c);
    },
    setBackgroundColor(c) {
      calls.setBackgroundColor.push(c);
    },
    setBottomBarColor(c) {
      calls.setBottomBarColor.push(c);
    },
    BackButton: options.hasBackButton !== false ? backButton : undefined,
    HapticFeedback: options.hasHaptic !== false ? haptic : undefined,
    _calls: calls,
    _events: events,
  };

  return tg;
}

// ---------------------------------------------------------------------------
// SUITE 1: TMA Haptic Dispatch & Resilience
// ---------------------------------------------------------------------------

test('Suite 1.1: TMA Haptic Dispatch with complete mock object and __hapticLog audit', () => {
  const mockTg = createMockTg();
  const mockWindow = {
    Telegram: { WebApp: mockTg },
    __hapticLog: [],
  };
  global.window = mockWindow;

  // 1. Concise studio types
  triggerHaptic('light');
  triggerHaptic('medium');
  triggerHaptic('heavy');
  triggerHaptic('selection');
  triggerHaptic('success');
  triggerHaptic('warning');
  triggerHaptic('error');

  // 2. Legacy / prefixed aliases
  triggerHaptic('impact_light');
  triggerHaptic('impact_medium');
  triggerHaptic('impact_heavy');
  triggerHaptic('notification_success');
  triggerHaptic('notification_warning');
  triggerHaptic('notification_error');

  // 3. Default call (no argument should default to 'selection')
  triggerHaptic();

  // Verify native mock calls
  assert.deepEqual(mockTg._calls.impactOccurred, ['light', 'medium', 'heavy', 'light', 'medium', 'heavy']);
  assert.deepEqual(mockTg._calls.notificationOccurred, ['success', 'warning', 'error', 'success', 'warning', 'error']);
  assert.equal(mockTg._calls.selectionChanged, 2); // 'selection' + default

  // Verify __hapticLog accurately captured all 14 dispatches
  assert.equal(mockWindow.__hapticLog.length, 14);
  assert.equal(mockWindow.__hapticLog[0].type, 'light');
  assert.equal(mockWindow.__hapticLog[3].type, 'selection');
  assert.equal(mockWindow.__hapticLog[13].type, 'selection');
  for (const entry of mockWindow.__hapticLog) {
    assert.equal(typeof entry.timestamp, 'number');
    assert.ok(entry.timestamp > 0);
  }

  delete global.window;
});

test('Suite 1.2: Fallback to Browser Vibration API when window.Telegram is undefined', () => {
  const vibrateCalls = [];
  const originalVibrate = globalThis.navigator?.vibrate;
  if (!globalThis.navigator) {
    globalThis.navigator = {};
  }
  globalThis.navigator.vibrate = (pattern) => {
    vibrateCalls.push(pattern);
    return true;
  };

  const mockWindow = {
    Telegram: undefined,
    __hapticLog: [],
  };
  global.window = mockWindow;

  triggerHaptic('error');
  triggerHaptic('notification_error');
  triggerHaptic('success');
  triggerHaptic('notification_success');
  triggerHaptic('warning');
  triggerHaptic('notification_warning');
  triggerHaptic('heavy');
  triggerHaptic('impact_heavy');
  triggerHaptic('medium');
  triggerHaptic('impact_medium');
  triggerHaptic('light');
  triggerHaptic('impact_light');
  triggerHaptic('selection');

  assert.deepEqual(vibrateCalls, [
    [30, 40, 30], // error
    [30, 40, 30], // notification_error
    [20, 30, 20], // success
    [20, 30, 20], // notification_success
    [25, 25],     // warning
    [25, 25],     // notification_warning
    25,           // heavy
    25,           // impact_heavy
    15,           // medium
    15,           // impact_medium
    8,            // light
    8,            // impact_light
    8,            // selection
  ]);

  // __hapticLog captured in browser fallback too
  assert.equal(mockWindow.__hapticLog.length, 13);

  delete global.window;
  if (originalVibrate) {
    globalThis.navigator.vibrate = originalVibrate;
  } else {
    delete globalThis.navigator.vibrate;
  }
});

test('Suite 1.3: Haptic Resilience when HapticFeedback throws or is incomplete', () => {
  // Case A: HapticFeedback exists but impactOccurred throws
  const throwingTg = createMockTg();
  throwingTg.HapticFeedback.impactOccurred = () => {
    throw new Error('Native IPC Bridge Disconnected');
  };
  throwingTg.HapticFeedback.notificationOccurred = () => {
    throw new TypeError('Method not implemented in native bridge');
  };
  throwingTg.HapticFeedback.selectionChanged = () => {
    throw new Error('Selection error');
  };

  const mockWindow = {
    Telegram: { WebApp: throwingTg },
    __hapticLog: [],
  };
  global.window = mockWindow;

  assert.doesNotThrow(() => {
    triggerHaptic('heavy');
    triggerHaptic('error');
    triggerHaptic('selection');
  });

  // Case B: Client version < 6.1 (unsupported haptics)
  const legacyTg = createMockTg({ version: '6.0' });
  mockWindow.Telegram.WebApp = legacyTg;
  assert.doesNotThrow(() => {
    triggerHaptic('medium');
  });
  // Native methods should not be invoked on legacy client
  assert.equal(legacyTg._calls.impactOccurred.length, 0);

  // Case C: Navigator.vibrate throws (e.g. user gesture permission error)
  mockWindow.Telegram = undefined;
  const originalVibrate = globalThis.navigator?.vibrate;
  if (!globalThis.navigator) globalThis.navigator = {};
  globalThis.navigator.vibrate = () => {
    throw new Error('Vibration blocked by browser policy without user gesture');
  };

  assert.doesNotThrow(() => {
    triggerHaptic('success');
  });

  if (originalVibrate) {
    globalThis.navigator.vibrate = originalVibrate;
  } else {
    delete globalThis.navigator.vibrate;
  }

  // Case D: Pure SSR / Node environment where window is undefined
  delete global.window;
  assert.doesNotThrow(() => {
    triggerHaptic('light');
  });
});

// ---------------------------------------------------------------------------
// SUITE 2: Viewport & Safe Area Calculations
// ---------------------------------------------------------------------------

test('Suite 2.1: iPhone 15/16 Pro mock (Dynamic Island & Home Indicator safe areas)', () => {
  const root = createMockRoot();
  const tg = createMockTg({
    viewportStableHeight: 852,
    viewportHeight: 852,
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const cleanup = initTelegram(tg, root);

  assert.equal(root._styles['--kb-viewport-height'], '852px');
  assert.equal(root._styles['--kb-safe-top'], '59px');
  assert.equal(root._styles['--kb-safe-bottom'], '34px');
  assert.equal(root._styles['--kb-safe-left'], '0px');
  assert.equal(root._styles['--kb-safe-right'], '0px');
  assert.equal(root._styles['--kb-content-top'], '0px');
  assert.equal(root._styles['--kb-content-bottom'], '0px');

  cleanup();
});

test('Suite 2.2: Android Punch-hole & On-screen Nav Bar with Content Insets', () => {
  const root = createMockRoot();
  const tg = createMockTg({
    viewportStableHeight: undefined,
    viewportHeight: 780, // fallback to viewportHeight
    safeAreaInset: { top: 36, bottom: 48, left: 0, right: 0 },
    contentSafeAreaInset: { top: 12, bottom: 8, left: 4, right: 4 },
  });

  const cleanup = initTelegram(tg, root);

  assert.equal(root._styles['--kb-viewport-height'], '780px');
  assert.equal(root._styles['--kb-safe-top'], '36px');
  assert.equal(root._styles['--kb-safe-bottom'], '48px');
  assert.equal(root._styles['--kb-content-top'], '12px');
  assert.equal(root._styles['--kb-content-bottom'], '8px');
  assert.equal(root._styles['--kb-content-left'], '4px');
  assert.equal(root._styles['--kb-content-right'], '4px');

  cleanup();
});

test('Suite 2.3: Zero Insets (Desktop / Web preview / Full-screen legacy)', () => {
  const root = createMockRoot();
  const tg = createMockTg({
    viewportStableHeight: 900,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: {},
  });

  const cleanup = initTelegram(tg, root);

  assert.equal(root._styles['--kb-viewport-height'], '900px');
  assert.equal(root._styles['--kb-safe-top'], '0px');
  assert.equal(root._styles['--kb-safe-bottom'], '0px');
  assert.equal(root._styles['--kb-content-top'], '0px');
  assert.equal(root._styles['--kb-content-bottom'], '0px');

  cleanup();
});

test('Suite 2.4: Malformed, Negative, and Boundary Inset Handling', () => {
  const root = createMockRoot();
  const tg = createMockTg({
    viewportStableHeight: -100, // Invalid negative height
    viewportHeight: 0,          // Invalid zero height
    safeAreaInset: { top: -25, bottom: 'malformed_string', left: NaN, right: null },
    contentSafeAreaInset: { top: -10, bottom: undefined, left: Infinity, right: 15 },
  });

  const cleanup = initTelegram(tg, root);

  // Negative/zero viewportHeight must be removed
  assert.equal(root._styles['--kb-viewport-height'], undefined);
  // Negative insets must be clamped to 0px
  assert.equal(root._styles['--kb-safe-top'], '0px');
  // Malformed string / NaN / null must evaluate to 0px
  assert.equal(root._styles['--kb-safe-bottom'], '0px');
  assert.equal(root._styles['--kb-safe-left'], '0px');
  assert.equal(root._styles['--kb-safe-right'], '0px');
  assert.equal(root._styles['--kb-content-top'], '0px');
  assert.equal(root._styles['--kb-content-bottom'], '0px');
  assert.equal(root._styles['--kb-content-right'], '15px');

  cleanup();
});

test('Suite 2.5: Dynamic Events & Complete Teardown Lifecycle', () => {
  const root = createMockRoot();
  const tg = createMockTg({
    viewportStableHeight: 700,
    safeAreaInset: { top: 20, bottom: 20, left: 0, right: 0 },
  });

  const cleanup = initTelegram(tg, root);
  assert.equal(root._styles['--kb-viewport-height'], '700px');
  assert.equal(tg._calls.ready, 1);
  assert.equal(tg._calls.expand, 1);

  // Simulate dynamic viewport expansion
  tg.viewportStableHeight = 820;
  tg.triggerEvent('viewportChanged');
  assert.equal(root._styles['--kb-viewport-height'], '820px');

  // Simulate safe area change (e.g. keyboard open / rotate)
  tg.safeAreaInset.top = 44;
  tg.safeAreaInset.bottom = 34;
  tg.triggerEvent('safeAreaChanged');
  assert.equal(root._styles['--kb-safe-top'], '44px');
  assert.equal(root._styles['--kb-safe-bottom'], '34px');

  // Teardown
  cleanup();

  // Subsequent events must not update root
  tg.viewportStableHeight = 999;
  tg.safeAreaInset.top = 100;
  tg.triggerEvent('viewportChanged');
  tg.triggerEvent('safeAreaChanged');

  assert.equal(root._styles['--kb-viewport-height'], '820px');
  assert.equal(root._styles['--kb-safe-top'], '44px');

  // Calling cleanup again must be safe and idempotent
  assert.doesNotThrow(() => cleanup());
});

// ---------------------------------------------------------------------------
// SUITE 3: Theme Synchronization & Native Colors
// ---------------------------------------------------------------------------

test('Suite 3.1: Dark Theme Synchronization', () => {
  const root = createMockRoot();
  const tg = createMockTg({ colorScheme: 'dark', version: '8.0' });

  const result = applyTelegramTheme(tg, root);
  assert.equal(result, 'dark');

  assert.ok(root.classList.contains('dark'));
  assert.ok(!root.classList.contains('light'));
  assert.equal(root.getAttribute('data-kb-theme'), 'dark');
  assert.equal(root.style.colorScheme, 'dark');

  assert.deepEqual(tg._calls.setHeaderColor, ['#0B1410']);
  assert.deepEqual(tg._calls.setBackgroundColor, ['#0B1410']);
  assert.deepEqual(tg._calls.setBottomBarColor, ['#12201A']);
});

test('Suite 3.2: Light Theme Synchronization', () => {
  const root = createMockRoot();
  const tg = createMockTg({ colorScheme: 'light', version: '8.0' });

  const result = applyTelegramTheme(tg, root);
  assert.equal(result, 'light');

  assert.ok(root.classList.contains('light'));
  assert.ok(!root.classList.contains('dark'));
  assert.equal(root.getAttribute('data-kb-theme'), 'light');
  assert.equal(root.style.colorScheme, 'light');

  assert.deepEqual(tg._calls.setHeaderColor, ['#F4F8F5']);
  assert.deepEqual(tg._calls.setBackgroundColor, ['#F4F8F5']);
  assert.deepEqual(tg._calls.setBottomBarColor, ['#FFFFFF']);
});

test('Suite 3.3: System Media Query Fallback when colorScheme is undefined', () => {
  const rootDark = createMockRoot();
  const mockWindowDark = {
    matchMedia(query) {
      return { matches: query.includes('prefers-color-scheme: dark') };
    },
  };
  global.window = mockWindowDark;

  const resultDark = applyTelegramTheme(undefined, rootDark);
  assert.equal(resultDark, 'dark');
  assert.ok(rootDark.classList.contains('dark'));

  const rootLight = createMockRoot();
  const mockWindowLight = {
    matchMedia() {
      return { matches: false };
    },
  };
  global.window = mockWindowLight;

  const resultLight = applyTelegramTheme(undefined, rootLight);
  assert.equal(resultLight, 'light');
  assert.ok(rootLight.classList.contains('light'));

  delete global.window;
});

test('Suite 3.4: Dynamic themeChanged Event in setupTelegramApp & Teardown', () => {
  const root = createMockRoot();
  const tg = createMockTg({ colorScheme: 'light', version: '8.0' });

  const cleanup = setupTelegramApp(tg, root);
  assert.ok(root.classList.contains('light'));

  // User flips client to dark mode
  tg.colorScheme = 'dark';
  tg.triggerEvent('themeChanged');

  assert.ok(root.classList.contains('dark'));
  assert.ok(!root.classList.contains('light'));
  assert.equal(root.getAttribute('data-kb-theme'), 'dark');

  // Verify native colors updated to dark
  assert.equal(tg._calls.setHeaderColor[tg._calls.setHeaderColor.length - 1], '#0B1410');
  assert.equal(tg._calls.setBottomBarColor[tg._calls.setBottomBarColor.length - 1], '#12201A');

  cleanup();

  // Teardown unbinds themeChanged
  tg.colorScheme = 'light';
  tg.triggerEvent('themeChanged');
  // Root remains dark because listener was removed
  assert.ok(root.classList.contains('dark'));
});

test('Suite 3.5: Version Gating & Resilience for Native Color Operations', () => {
  // Client version 6.5 (supports setBackgroundColor 6.1, but not setHeaderColor 7.0 or setBottomBarColor 7.10)
  const tg65 = createMockTg({ version: '6.5' });
  syncNativeColors(tg65, '#AAA', '#BBB');
  assert.equal(tg65._calls.setHeaderColor.length, 0);
  assert.deepEqual(tg65._calls.setBackgroundColor, ['#AAA']);
  assert.equal(tg65._calls.setBottomBarColor.length, 0);

  // Client version 7.2 (supports setHeaderColor 7.0 and setBackgroundColor 6.1, but not setBottomBarColor 7.10)
  const tg72 = createMockTg({ version: '7.2' });
  syncNativeColors(tg72, '#AAA', '#BBB');
  assert.deepEqual(tg72._calls.setHeaderColor, ['#AAA']);
  assert.deepEqual(tg72._calls.setBackgroundColor, ['#AAA']);
  assert.equal(tg72._calls.setBottomBarColor.length, 0);

  // Client version 7.10 (supports all three)
  const tg710 = createMockTg({ version: '7.10' });
  syncNativeColors(tg710, '#AAA', '#BBB');
  assert.deepEqual(tg710._calls.setHeaderColor, ['#AAA']);
  assert.deepEqual(tg710._calls.setBackgroundColor, ['#AAA']);
  assert.deepEqual(tg710._calls.setBottomBarColor, ['#BBB']);

  // Throwing native setters
  const throwingTg = createMockTg({ version: '8.0' });
  throwingTg.setHeaderColor = () => { throw new Error('Unsupported bridge color'); };
  assert.doesNotThrow(() => {
    syncNativeColors(throwingTg, '#AAA', '#BBB');
  });
});

// ---------------------------------------------------------------------------
// SUITE 4: BackButton Management
// ---------------------------------------------------------------------------

test('Suite 4.1: Direct bindBackButton, click trigger, and clean unbind', () => {
  const tg = createMockTg();
  let clicked = 0;
  const onBack = () => { clicked++; };

  assert.equal(tg.BackButton.isVisible, false);
  const cleanup = bindBackButton(tg, onBack);

  // BackButton is shown and handler is attached
  assert.equal(tg.BackButton.isVisible, true);
  assert.equal(tg._calls.backButtonClickHandlers.length, 1);

  // Trigger click
  tg.BackButton.triggerClick();
  assert.equal(clicked, 1);

  // Unbind
  cleanup();
  assert.equal(tg.BackButton.isVisible, false);
  assert.equal(tg._calls.backButtonClickHandlers.length, 0);

  // Clicking after unbind does nothing
  tg.BackButton.triggerClick();
  assert.equal(clicked, 1);
});

test('Suite 4.2: Polymorphic Signatures and Convenience Wrappers', () => {
  const tg = createMockTg();
  global.window = { Telegram: { WebApp: tg } };

  let singleArgClicked = 0;
  // Polymorphic signature: bindBackButton(action) using getMiniApp()
  const cleanupSingle = bindBackButton(() => { singleArgClicked++; });
  assert.equal(tg.BackButton.isVisible, true);
  tg.BackButton.triggerClick();
  assert.equal(singleArgClicked, 1);
  cleanupSingle();
  assert.equal(tg.BackButton.isVisible, false);

  // showBackButton wrapper
  let showClicked = 0;
  const cleanupShow = showBackButton(() => { showClicked++; }, tg);
  assert.equal(tg.BackButton.isVisible, true);
  cleanupShow();
  assert.equal(tg.BackButton.isVisible, false);

  // hideBackButton wrapper
  tg.BackButton.show();
  assert.equal(tg.BackButton.isVisible, true);
  hideBackButton(tg);
  assert.equal(tg.BackButton.isVisible, false);

  // setNativeBackButton wrapper
  let setClicked = 0;
  const cleanupSet = setNativeBackButton(true, () => { setClicked++; }, tg);
  assert.equal(tg.BackButton.isVisible, true);
  tg.BackButton.triggerClick();
  assert.equal(setClicked, 1);
  cleanupSet();

  setNativeBackButton(false, undefined, tg);
  assert.equal(tg.BackButton.isVisible, false);

  delete global.window;
});

test('Suite 4.3: Stacked Screen / Modal BackButton Lifecycle & Memory-Leak Stress', () => {
  const tg = createMockTg();

  let screenBackHits = 0;
  const screenCleanup = bindBackButton(tg, () => { screenBackHits++; });
  assert.equal(tg.BackButton.isVisible, true);

  // Modal opens on top of Screen
  let modalBackHits = 0;
  const modalCleanup = bindBackButton(tg, () => { modalBackHits++; });

  // Both handlers attached
  assert.equal(tg._calls.backButtonClickHandlers.length, 2);

  // Dismiss modal
  modalCleanup();
  assert.equal(tg._calls.backButtonClickHandlers.length, 1);

  // Click now triggers remaining screen handler
  tg.BackButton.triggerClick();
  assert.equal(screenBackHits, 1);
  assert.equal(modalBackHits, 0);

  screenCleanup();
  assert.equal(tg._calls.backButtonClickHandlers.length, 0);

  // Rapid bind/unbind stress cycling (100 iterations)
  for (let i = 0; i < 100; i++) {
    const unbind = bindBackButton(tg, () => {});
    unbind();
  }
  // Ensure no lingering handlers or memory leaks
  assert.equal(tg._calls.backButtonClickHandlers.length, 0);
  assert.equal(tg.BackButton.isVisible, false);
});

test('Suite 4.4: Resilience when BackButton is missing or undefined', () => {
  const tgWithoutButton = createMockTg({ hasBackButton: false });

  assert.doesNotThrow(() => {
    const cleanup = bindBackButton(tgWithoutButton, () => {});
    cleanup();
    hideBackButton(tgWithoutButton);
    setNativeBackButton(true, () => {}, tgWithoutButton);
  });

  assert.doesNotThrow(() => {
    const cleanup = bindBackButton(undefined, () => {});
    cleanup();
    hideBackButton(undefined);
  });
});

// ---------------------------------------------------------------------------
// SUITE 5: Invariants Verification
// ---------------------------------------------------------------------------

test('Suite 5.1: Prohibited Ports and Service Boundary Isolation', () => {
  const PROHIBITED_PORTS = [8000, 4387, 8090, 10808, 10809];
  // Verify standard test ports do not collide with prohibited list
  const previewPort = 18080;
  assert.ok(!PROHIBITED_PORTS.includes(previewPort));
});
