const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');

const { filterRecipesBySettings } = loadTs('src/ui/food-first/state.ts');
const { toRecipeViewModel } = loadTs('src/ui/food-first/recipesAdapter.ts');
const { RECIPES } = loadTs('src/data/recipes.ts');

const sample = RECIPES.filter((r) => ['k2', 'k27', 'k28', 'k30'].includes(r.id));
const viewModels = sample.map(toRecipeViewModel);
const settings = {
  approach: 'keto',
  restrictions: ['exclude_eggs', 'exclude_dairy', 'exclude_fish'],
  prepTimeMax: 30,
};

test('mobile replacement only offers explicitly admitted recipes', () => {
  const candidates = filterRecipesBySettings(viewModels, settings, sample, ['k27']);
  assert.deepEqual(candidates.map((r) => r.id), ['k27']);
});

test('empty allowlist and empty server catalog fail closed without bundled fallback', () => {
  assert.deepEqual(filterRecipesBySettings(viewModels, settings, sample, []), []);
  assert.deepEqual(filterRecipesBySettings(viewModels, settings, [], ['k27']), []);
});

test('admission never bypasses food restrictions: eggs and fish stay excluded', () => {
  const candidates = filterRecipesBySettings(viewModels, settings, sample, sample.map((r) => r.id));
  const ids = candidates.map((r) => r.id);
  assert.ok(ids.includes('k27'), 'safe egg/dairy/fish-free recipe stays selectable');
  assert.ok(!ids.includes('k2'), 'egg-containing recipe must be blocked');
  assert.ok(!ids.includes('k30'), 'fish-containing recipe must be blocked');
});

test('mobile UI passes server-admitted recipe IDs into replacement filter', () => {
  const app = fs.readFileSync('src/ui/food-first/FoodFirstApp.tsx', 'utf8');
  const menu = fs.readFileSync('src/ui/food-first/Menu.tsx', 'utf8');
  assert.match(app, /admittedRecipeIds=\{effectiveCatalogIds\}/);
  assert.match(menu, /filterRecipesBySettings\([\s\S]*?admittedRecipeIds\s*\)/);
});
