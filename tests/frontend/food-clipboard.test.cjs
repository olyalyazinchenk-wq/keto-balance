const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { copyShoppingText } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/clipboard.ts'));

test('clipboard result is honest for success, rejection and absent API', async () => {
  let received = '';
  assert.equal(await copyShoppingText('список', { writeText: async value => { received = value; } }), true);
  assert.equal(received, 'список');
  assert.equal(await copyShoppingText('список', { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(await copyShoppingText('список', undefined), false);
});
