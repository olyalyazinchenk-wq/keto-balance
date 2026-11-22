const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');
const { Lifehacks } = loadTs('src/ui/food-first/Lifehacks.tsx');
const { SUPPLEMENT_LIFEHACKS, searchLifehacks } = loadTs('src/data/supplementLifehacks.ts');
const { backEntries } = loadTs('src/ui/food-first/navigation.ts');

test('client section renders every agreed supplement as a separate expandable card', () => {
  const html = renderToStaticMarkup(React.createElement(Lifehacks));
  assert.equal(new Set(SUPPLEMENT_LIFEHACKS.map(item => item.id)).size, 13);
  for (const item of SUPPLEMENT_LIFEHACKS) assert.ok(html.includes(`data-testid="lifehack-${item.id}"`), item.title);
  assert.match(html, /Найдено:\s*13/);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 13);
});

test('direct Lifehacks link has an in-app parent', () => {
  assert.deepEqual(backEntries([{ screen: 'lifehacks', scrollY: 0 }]), [{ screen: 'today', scrollY: 0 }]);
});

test('search understands names used by clients and combines them with categories', () => {
  for (const [query, id] of [['5htp', '5htp'], ['5 htp', '5htp'], ['валерьянка', 'valerian'], ['потассиум', 'potassium'], ['potassium', 'potassium'], ['омега 3', 'omega3']]) {
    assert.ok(searchLifehacks(query).some(item => item.id === id), query);
  }
  assert.equal(searchLifehacks('potassium', 'Витамины').length, 0);
  assert.equal(searchLifehacks('несуществующая добавка').length, 0);
});
