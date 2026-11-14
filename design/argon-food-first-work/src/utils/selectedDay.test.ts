import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelectedDay } from './selectedDay';

const days = [{ dayIndex: 1 }, { dayIndex: 2 }];

test('retains a saved non-default day that exists', () => {
  assert.equal(resolveSelectedDay(2, days), 2);
});

test('missing or removed day falls back to first existing day', () => {
  assert.equal(resolveSelectedDay(99, [{ dayIndex: 3 }]), 3);
  assert.equal(resolveSelectedDay(null, days), 1);
});

test('does not coerce strings or accept fractional indexes', () => {
  assert.equal(resolveSelectedDay('2', days), 1);
  assert.equal(resolveSelectedDay(1.5, days), 1);
});

test('does not invent a day for an empty menu', () => {
  assert.equal(resolveSelectedDay(2, []), null);
});

test('rejects non-finite saved values', () => {
  assert.equal(resolveSelectedDay(Number.NaN, days), 1);
  assert.equal(resolveSelectedDay(Number.POSITIVE_INFINITY, days), 1);
});
