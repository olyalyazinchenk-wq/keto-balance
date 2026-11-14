const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { timerDeadline, remainingTimerSeconds } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/kitchenTimer.ts'));

test('timer catches up after WebView suspension instead of counting missed callbacks', () => {
  const deadline = timerDeadline(120, 100000);
  assert.equal(remainingTimerSeconds(deadline, 115000), 105);
  assert.equal(remainingTimerSeconds(deadline, 230000), 0);
  assert.equal(remainingTimerSeconds(deadline, 500000), 0);
});

test('pause preserves remaining duration; resume starts a fresh deadline', () => {
  const original = timerDeadline(120, 100000);
  const paused = remainingTimerSeconds(original, 115000);
  const resumed = timerDeadline(paused, 300000);
  assert.equal(remainingTimerSeconds(resumed, 314000), 91);
  assert.equal(remainingTimerSeconds(resumed, 406000), 0);
});

test('timer uses ceiling for partial seconds and rejects invalid clocks/durations', () => {
  assert.equal(remainingTimerSeconds(1001, 0), 2);
  assert.equal(remainingTimerSeconds(0, 0), 0);
  assert.equal(remainingTimerSeconds(null, 100), 0);
  assert.equal(timerDeadline(NaN, 0), null);
  assert.equal(timerDeadline(-1, 0), null);
});
