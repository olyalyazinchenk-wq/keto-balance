/**
 * tests/frontend/kitchen-timer-unit.test.cjs
 * Node test runner unit tests using REAL TypeScript modules via loadTs helper.
 * Tests pure timer calculation, persistence, user isolation, SecurityError handling, and corrupt JSON safety.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

// Mock browser environment for unit test
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
global.window = {
  localStorage: mockStorage,
};

// Load REAL application modules directly
const { timerDeadline, remainingTimerSeconds } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/kitchenTimer.ts'));
const {
  saveActiveTimer,
  loadActiveTimer,
  clearActiveTimer,
  getTimerStorageKey,
  validateTimerRecord,
  getSafeStorage,
} = loadTs(path.resolve(__dirname, '../../src/ui/food-first/kitchenTimerState.ts'));

test('Kitchen Timer: Absolute deadline and countdown calculation (real kitchenTimer.ts)', () => {
  const fixedNow = 1731600000000;

  // 1. Normal deadline
  const deadline = timerDeadline(300, fixedNow); // 5 minutes
  assert.equal(deadline, fixedNow + 300000);

  // 2. Remaining seconds after 100 seconds
  const remaining1 = remainingTimerSeconds(deadline, fixedNow + 100000);
  assert.equal(remaining1, 200);

  // 3. Exact expiration
  const remainingExact = remainingTimerSeconds(deadline, fixedNow + 300000);
  assert.equal(remainingExact, 0);

  // 4. Overdue (past deadline) clamped to 0
  const remainingPast = remainingTimerSeconds(deadline, fixedNow + 350000);
  assert.equal(remainingPast, 0);

  // 5. Invalid values
  assert.equal(timerDeadline(-10, fixedNow), null);
  assert.equal(timerDeadline(NaN, fixedNow), null);
  assert.equal(remainingTimerSeconds(null, fixedNow), 0);
});

test('Kitchen Timer: Persistence and background reload restoration (real kitchenTimerState.ts)', () => {
  mockStorage.clear();
  const t0 = 1731600000000;
  const initialTimer = {
    userId: 'user_100',
    recipeId: 'k1',
    recipeTitle: 'Яичница с авокадо',
    stepIndex: 1,
    label: 'Шаг 2 · 5 мин',
    totalDurationSeconds: 300,
    deadline: t0 + 300000,
    remainingSeconds: 300,
    isPaused: false,
    isCompleted: false,
    startedAt: t0,
  };

  saveActiveTimer(initialTimer);

  // Simulate reload after 120 seconds in background
  const t1 = t0 + 120000;
  const restored = loadActiveTimer('user_100', t1);
  assert.ok(restored, 'Timer must be restored from localStorage');
  assert.equal(restored.recipeId, 'k1');
  assert.equal(restored.remainingSeconds, 180, 'Must have 180s left after 120s elapsed');
  assert.equal(restored.isCompleted, false);

  // Simulate reload after 305 seconds (timer finished in background)
  const t2 = t0 + 305000;
  const finished = loadActiveTimer('user_100', t2);
  assert.ok(finished);
  assert.equal(finished.remainingSeconds, 0);
  assert.equal(finished.isCompleted, true);
  assert.equal(finished.deadline, null);
});

test('Kitchen Timer: Strict user isolation', () => {
  mockStorage.clear();
  const t0 = 1731600000000;
  const timerUserA = {
    userId: 'user_A',
    recipeId: 'k2',
    recipeTitle: 'Омлет с беконом',
    stepIndex: 0,
    label: 'Шаг 1 · 3 мин',
    totalDurationSeconds: 180,
    deadline: t0 + 180000,
    remainingSeconds: 180,
    isPaused: false,
    isCompleted: false,
    startedAt: t0,
  };

  saveActiveTimer(timerUserA);

  // User B loads active timer -> must NOT see User A's timer
  const loadedUserB = loadActiveTimer('user_B', t0);
  assert.equal(loadedUserB, null, 'User B must not see User A timer');

  // User A loads active timer -> must see it
  const loadedUserA = loadActiveTimer('user_A', t0);
  assert.ok(loadedUserA);
  assert.equal(loadedUserA.recipeId, 'k2');

  // Clearing User A must not affect User B
  clearActiveTimer('user_A');
  assert.equal(loadActiveTimer('user_A', t0), null);
});

test('Kitchen Timer: Corrupted localStorage record is safely handled without throwing', () => {
  mockStorage.clear();
  // Corrupt string
  mockStorage.setItem('kb:timer:user_corrupt', '{not-valid-json');
  const res1 = loadActiveTimer('user_corrupt');
  assert.equal(res1, null, 'Must safely return null on invalid JSON');
  assert.equal(mockStorage.getItem('kb:timer:user_corrupt'), null, 'Corrupted key must be cleaned up');

  // Object missing required fields
  mockStorage.setItem('kb:timer:user_incomplete', JSON.stringify({ foo: 'bar' }));
  const res2 = loadActiveTimer('user_incomplete');
  assert.equal(res2, null, 'Must safely return null on incomplete object');

  // Object with non-string recipeTitle (P2 counterexample)
  mockStorage.setItem(
    'kb:timer:user_obj_title',
    JSON.stringify({
      userId: 'user_obj_title',
      recipeId: 'k1',
      recipeTitle: { bad: 'object' },
      label: 'Таймер',
      remainingSeconds: 60,
      totalDurationSeconds: 60,
      isPaused: true,
      isCompleted: false,
      deadline: null,
    })
  );
  const res3 = loadActiveTimer('user_obj_title');
  assert.equal(res3, null, 'Must safely reject object recipeTitle');
  assert.equal(mockStorage.getItem('kb:timer:user_obj_title'), null, 'Corrupted key must be cleaned up');
});

test('Kitchen Timer: Pause and resume preserves exact elapsed seconds', () => {
  mockStorage.clear();
  const t0 = 1731600000000;
  const timer = {
    userId: 'user_pause_test',
    recipeId: 'k7',
    recipeTitle: 'Кето-салат',
    stepIndex: 0,
    label: 'Шаг 1 · 10 мин',
    totalDurationSeconds: 600,
    deadline: t0 + 600000,
    remainingSeconds: 600,
    isPaused: false,
    isCompleted: false,
    startedAt: t0,
  };
  saveActiveTimer(timer);

  // User pauses at t0 + 150s (450s remaining)
  const tPause = t0 + 150000;
  const remainingAtPause = remainingTimerSeconds(timer.deadline, tPause);
  assert.equal(remainingAtPause, 450);

  const pausedTimer = {
    ...timer,
    remainingSeconds: remainingAtPause,
    deadline: null,
    isPaused: true,
  };
  saveActiveTimer(pausedTimer);

  // 10 minutes pass in paused state
  const tLater = tPause + 600000;
  const loadedPaused = loadActiveTimer('user_pause_test', tLater);
  assert.ok(loadedPaused);
  assert.equal(loadedPaused.isPaused, true);
  assert.equal(loadedPaused.remainingSeconds, 450, 'Remaining seconds must remain frozen while paused');

  // Resume timer at tLater
  const resumedDeadline = timerDeadline(loadedPaused.remainingSeconds, tLater);
  const resumedTimer = {
    ...loadedPaused,
    deadline: resumedDeadline,
    isPaused: false,
  };
  saveActiveTimer(resumedTimer);

  // 50 seconds after resume
  const tAfterResume = tLater + 50000;
  const runningAgain = loadActiveTimer('user_pause_test', tAfterResume);
  assert.ok(runningAgain);
  assert.equal(runningAgain.remainingSeconds, 400);
});

test('Kitchen Timer: SecurityError on storage getter is safely handled (P1 counterexample)', () => {
  // Save original window.localStorage descriptor
  const origDescriptor = Object.getOwnPropertyDescriptor(global.window, 'localStorage');
  try {
    // Configure window.localStorage getter to throw SecurityError (e.g. private browsing / sandboxed iframe)
    Object.defineProperty(global.window, 'localStorage', {
      get() {
        const err = new Error('Access is denied for this document');
        err.name = 'SecurityError';
        throw err;
      },
      configurable: true,
    });

    assert.equal(getSafeStorage(), null, 'getSafeStorage must return null on SecurityError');
    assert.doesNotThrow(() => loadActiveTimer('user_sec'), 'loadActiveTimer must not throw on storage access denial');
    assert.equal(loadActiveTimer('user_sec'), null);
    assert.doesNotThrow(() => saveActiveTimer({ userId: 'user_sec', recipeId: 'k1', recipeTitle: 'Title', label: 'L', remainingSeconds: 10, totalDurationSeconds: 10, isPaused: false, isCompleted: false, deadline: 1000, startedAt: 1 }), 'saveActiveTimer must not throw on storage access denial');
    assert.doesNotThrow(() => clearActiveTimer('user_sec'), 'clearActiveTimer must not throw on storage access denial');
  } finally {
    // Restore mockStorage
    Object.defineProperty(global.window, 'localStorage', origDescriptor || { value: mockStorage, configurable: true, writable: true });
  }
});
