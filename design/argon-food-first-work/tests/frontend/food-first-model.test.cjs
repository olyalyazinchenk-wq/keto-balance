const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { toFoodCard, photoForRecipe } = loadTs('src/ui/food-first/model.ts');

const source = Object.freeze({ id: '0007', title: 'Яичница с авокадо', time: 10, serv: 1 });

test('recipe photos match only reviewed recipe identifiers', () => {
  assert.equal(photoForRecipe('kb-rec-eggs-avocado'), '/media/food-first/hero.webp');
  assert.equal(photoForRecipe('kb-rec-cottage-scramble'), null);
  assert.equal(photoForRecipe('unknown'), null);
});

test('keeps the exact source ID, title and explicit metadata', () => {
  const result = toFoodCard(source);
  assert.equal(result.id, '0007');
  assert.equal(result.title, source.title);
  assert.equal(result.minutes, 10);
  assert.equal(result.servings, 1);
});

test('missing photo is null, not a fake plate image', () => {
  assert.equal(toFoodCard(source).photo, null);
});

test('unknown metadata is not invented', () => {
  const result = toFoodCard({ ...source, time: 0, serv: 0 });
  assert.equal(result.minutes, null);
  assert.equal(result.servings, null);
});

test('requires an explicit local photo path when provided', () => {
  assert.throws(() => toFoodCard(source, 'https://example.com/photo.jpg'));
  assert.equal(toFoodCard(source, '/media/food-first/hero.webp').photo,
    '/media/food-first/hero.webp');
});

test('does not mutate inputs or invent nutrition', () => {
  const before = JSON.stringify(source);
  const result = toFoodCard(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal('kcal' in result, false);
  assert.equal('carbs' in result, false);
});
