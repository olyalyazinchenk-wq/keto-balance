const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('choosing menu rebuilds shopping before navigating', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const handler = app.match(/onChooseMenuAndGoToShopping=\{\(\) => \{([^]*?)\n\s*\}\}/);
  assert.ok(handler, 'menu handler exists');
  assert.ok(handler[1].includes('handleRefreshShoppingFromMenu()'), 'must rebuild, not just navigate');
});
