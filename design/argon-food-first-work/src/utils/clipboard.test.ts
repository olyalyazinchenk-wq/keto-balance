import test from 'node:test';
import assert from 'node:assert/strict';
import { copyShoppingText } from './clipboard';

test('clipboard result is honest for success, rejection and absent API', async () => {
  let received = '';
  assert.equal(await copyShoppingText('список', { writeText: async value => { received = value; } }), true);
  assert.equal(received, 'список');
  assert.equal(await copyShoppingText('список', { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(await copyShoppingText('список', undefined), false);
});
