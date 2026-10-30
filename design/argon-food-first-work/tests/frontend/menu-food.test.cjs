const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const file = path.resolve('src/components/kb/TodayAndMenuScreens.tsx');
const output = esbuild.buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' }, jsx: 'automatic' });
const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file)); mod._compile(output.outputFiles[0].text, file);
const recipe = { id: 'r1', title: 'Омлет', subtitle: 'С зеленью', prepMinutes: 12, suitableFor: ['keto'], avoids: [], portionsVariants: [{ ingredients: [] }, { ingredients: [{ name: 'Яйцо', amountLabel: '2 шт.' }] }] };
const props = { menu: { title: 'Моё меню', days: [{ dayIndex: 1, label: 'День 1 · Понедельник', slots: { breakfast: 'r1' } }] }, selectedDayIndex: 1, recipes: [recipe], recipesById: { r1: recipe }, settings: { approach: 'keto', restrictions: [], prepTimeMax: 30, mealsPerDay: 3 }, onSelectDayIndex() {}, onReplaceRecipe() {}, onOpenRecipe() {}, onChooseMenuAndGoToShopping() {}, onEditSettings() {} };
test('menu renders food-first meal cards with actual ingredients and actions', () => {
  const html = renderToStaticMarkup(React.createElement(mod.exports.MenuScreen, props));
  assert.match(html, /class="fm-card"/);
  for (const text of ['Омлет', 'Яйцо', '2 шт.', '12 мин', 'Заменить', 'Открыть рецепт', 'покупки']) assert.ok(html.includes(text), text);
});
test('empty days and missing slots render without crashing', () => {
  const html = renderToStaticMarkup(React.createElement(mod.exports.MenuScreen, { ...props, menu: { title: 'Пусто', days: [] } }));
  assert.match(html, /Нет дней меню/);
});
test('filters with no matching recipes show an actionable conflict', () => {
  const html = renderToStaticMarkup(React.createElement(mod.exports.MenuScreen, { ...props, recipes: [] }));
  assert.match(html, /не найдено/i);
  assert.match(html, /Изменить ограничения/);
});
