const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('food-first shell covers the four-screen journey and keeps navigation semantics', () => {
  const shell = fs.readFileSync('src/ui/food-first/AppShell.tsx', 'utf8');
  assert.match(shell, /\['today', 'menu', 'recipe', 'shopping'\]\.includes\(activeScreen\)/);
  assert.match(shell, /isNavHighlighted\(item\.id\)/);
  assert.match(shell, /onGoBack/);
  assert.match(shell, /shoppingNeedsRefresh/);
  assert.match(shell, /data-testid=\{`bottom-nav-\$\{item\.id\}`\}/);
});
