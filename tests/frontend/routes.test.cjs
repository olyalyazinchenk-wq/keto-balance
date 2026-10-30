const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { normalizeRoute, activeSection } = loadTs(path.resolve(__dirname, '../../src/app/routes.ts'));

test('route normalization preserves supported callers', () => {
  assert.equal(normalizeRoute('#/home'), '/home');
  assert.equal(normalizeRoute('/home'), '/home');
  assert.equal(normalizeRoute(''), '/home');
  assert.equal(normalizeRoute('#/recipe/k2'), '/recipe/k2');
});

test('active navigation is not empty for leading slash', () => {
  assert.equal(activeSection('/home'), 'home');
  assert.equal(activeSection('#/menu'), 'menu');
  assert.equal(activeSection('/recipe/k2'), 'recipe');
});
