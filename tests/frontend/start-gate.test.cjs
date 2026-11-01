/**
 * tests/frontend/start-gate.test.cjs
 * Unit tests for Start Gate pure logic.
 * Runner: node:test & node:assert/strict via load-ts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const { isGateGranted, gateStatusLabel } = loadTs(
  path.resolve(__dirname, '../../src/ui/pilot/gate.ts')
);

test('gate requires both consents, not one', () => {
  assert.equal(isGateGranted(false, false), false, '0/2 must be denied');
  assert.equal(isGateGranted(true, false), false, '1/2 (age only) must be denied');
  assert.equal(isGateGranted(false, true), false, '1/2 (pd only) must be denied');
  assert.equal(isGateGranted(true, true), true, '2/2 must be granted');
});

test('status label counts completed conditions', () => {
  assert.match(gateStatusLabel(false, false), /0 из 2/, '0/2 label');
  assert.match(gateStatusLabel(true, false), /1 из 2/, '1/2 (age only) label');
  assert.match(gateStatusLabel(false, true), /1 из 2/, '1/2 (pd only) label');
});

test('status label opens access only at 2 of 2', () => {
  assert.equal(
    gateStatusLabel(true, true),
    'Доступ открыт · 2 из 2 условий выполнены',
    '2/2 exact granted status'
  );
  assert.match(gateStatusLabel(true, true), /2 из 2/);
});
