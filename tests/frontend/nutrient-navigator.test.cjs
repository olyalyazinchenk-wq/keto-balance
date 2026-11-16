const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { filterNutrients } = loadTs('src/ui/food-first/nutrients.ts');
test('search and categories work together and ignore case and surrounding spaces', () => {
  assert.deepEqual(filterNutrients('  КАЛИЙ ', 'Все').map(x => x.name), ['Калий']);
  assert.deepEqual(filterNutrients('', 'Витамины').map(x => x.name), ['Витамин D', 'Витамин B12', 'Витамин A', 'Витамин C']);
  assert.deepEqual(filterNutrients('калий', 'Витамины'), []);
  assert.deepEqual(filterNutrients('неизвестный', 'Все'), []);
});
