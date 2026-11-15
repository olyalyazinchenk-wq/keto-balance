const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { backEntries } = loadTs('src/ui/food-first/navigation.ts');

test('Back restores the previous recipe identity and scroll without losing earlier entries', () => {
  const stack = [
    { screen: 'menu', scrollY: 620 },
    { screen: 'recipe', recipeId: 'k1', scrollY: 340 },
    { screen: 'recipe', recipeId: 'k2', scrollY: 0 },
  ];
  assert.deepEqual(backEntries(stack), stack.slice(0, 2));
  assert.equal(stack.length, 3);
});
test('direct links have an in-app parent rather than closing Telegram', () => {
  for (const [screen, parent] of [['recipe', 'menu'], ['support', 'more'], ['rules', 'today'], ['education', 'today'], ['guides', 'today']]) {
    assert.deepEqual(backEntries([{ screen, scrollY: 100 }]), [{ screen: parent, scrollY: 0 }]);
  }
});
