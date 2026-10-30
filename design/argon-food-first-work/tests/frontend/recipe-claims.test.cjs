const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('recipe artwork and portion UI do not assert unverified effects or weights', () => {
  const artwork = fs.readFileSync('src/components/kb/RecipeArtwork.tsx', 'utf8');
  const recipe = fs.readFileSync('src/components/kb/RecipeAndShoppingScreens.tsx', 'utf8');
  for (const phrase of ['5 ч сытости', 'скачков сахара', 'сжигание запасов', 'тонкая талия', 'массу', 'PLATE_META']) {
    assert.ok(!artwork.includes(phrase), phrase);
  }
  assert.ok(!recipe.includes('~230 г'));
  assert.ok(!recipe.includes('~460 г'));
});
