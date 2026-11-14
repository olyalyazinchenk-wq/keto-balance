const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/components/kb/RecipeAndShoppingScreens.tsx'), 'utf8');

test('recipe and shopping use mobile food-first layout without editorial rails', () => {
  assert.match(source, /import '\.\/recipe-shopping-food\.css'/);
  assert.match(source, /className="food-recipe"/);
  assert.match(source, /className="food-shopping"/);
  assert.doesNotMatch(source, /kb-editorial-grid|kb-section-spine|kb-cover-headline|kb-spine-row/);
});
