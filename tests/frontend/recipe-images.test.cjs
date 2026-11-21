const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { photoForRecipe } = loadTs('src/ui/food-first/model.ts');
const { EditorialCatalog } = loadTs('src/ui/food-first/EditorialCatalog.tsx');
const { toRecipeViewModel } = loadTs('src/ui/food-first/recipesAdapter.ts');
const { RecipeScreen } = loadTs('src/ui/food-first/Recipe.tsx');
const released = loadTs('src/data/recipes.ts').KETO_RELEASED_RECIPES;

test('all 36 keto recipes have unique packaged WebP and JPEG images', async () => {
  const { validateRecipeImages } = await import('../../scripts/validate-recipe-images.mjs');
  const result = validateRecipeImages();
  assert.equal(result.recipes, 36);
  assert.equal(result.files, 72);
  assert.ok(result.bytes < 12 * 1024 * 1024);
  assert.equal(photoForRecipe('c1'), null);
  assert.equal(photoForRecipe('unknown'), null);
});

test('image gate rejects an unmapped recipe and a missing fallback', async () => {
  const { validateRecipeImages } = await import('../../scripts/validate-recipe-images.mjs');
  assert.throws(() => validateRecipeImages({ recipes: [{ id: 'new-dish' }] }), /no valid local photo/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keto-image-check-'));
  try {
    const src = photoForRecipe('k6');
    fs.mkdirSync(path.dirname(path.join(dir, src)), { recursive: true });
    fs.copyFileSync(path.join('public', src), path.join(dir, src));
    assert.throws(() => validateRecipeImages({ publicDir: dir, recipes: [{ id: 'k6' }] }), /missing jpg/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('catalog renders a photo for every released recipe with no external requests', () => {
  const html = renderToStaticMarkup(React.createElement(EditorialCatalog, { recipes: released.map(toRecipeViewModel), onOpenRecipe() {} }));
  assert.equal((html.match(/<img /g) || []).length, released.length);
  for (const recipe of released) assert.ok(html.includes(`src="${photoForRecipe(recipe.id)}"`), recipe.id);
  assert.doesNotMatch(html, /https?:\/\//);
  const all = [...released, ...loadTs('src/data/ketoDraftRecipes.ts').KETO_DRAFT_RECIPES,
    ...loadTs('src/data/monthlyCandidateRecipes.ts').DECEMBER_REVIEW_CANDIDATES.filter(r => r.mode === 'keto')];
  for (const recipe of all) {
    const detail = renderToStaticMarkup(React.createElement(RecipeScreen, {
      recipe: toRecipeViewModel(recipe), checkedIngredients: {}, checkedSteps: {}, onToggleIngredient() {}, onToggleStep() {},
    }));
    assert.ok(detail.includes(`src="${photoForRecipe(recipe.id)}"`), `detail photo ${recipe.id}`);
  }
});
