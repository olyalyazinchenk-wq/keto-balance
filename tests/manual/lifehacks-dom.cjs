// Run locally with the optional jsdom package; no live API or bot access.
const { JSDOM } = require('jsdom');
const React = require('react');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { Lifehacks } = loadTs('src/ui/food-first/Lifehacks.tsx');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = require('react-dom/client');
const root = createRoot(document.getElementById('root'));
(async () => {
  await React.act(async () => root.render(React.createElement(Lifehacks)));
  const card = document.querySelector('[data-testid="lifehack-biotin"]');
  assert.ok(card);
  await React.act(async () => card.querySelector('button').click());
  assert.ok(card.textContent.includes('тропонина'));
  assert.equal(card.querySelector('button').getAttribute('aria-expanded'), 'true');
  const input = document.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, 'магний'); input.dispatchEvent(new window.Event('input', { bubbles: true })); input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.equal(document.querySelectorAll('[data-testid^="lifehack-"]').length, 1);
  assert.ok(document.querySelector('[data-testid="lifehack-magnesium"]'));
  // The selected search and category combine, and reset restores the full list.
  const minerals = [...document.querySelectorAll('button')].find(b => b.textContent === 'Минералы');
  await React.act(async () => minerals.click());
  assert.ok(document.querySelector('[data-testid="lifehack-magnesium"]'));
  assert.ok(!document.querySelector('[data-testid="lifehack-biotin"]'));
  const reset = [...document.querySelectorAll('button')].find(b => b.textContent === 'Сбросить поиск и фильтры');
  await React.act(async () => reset.click());
  assert.equal(document.querySelectorAll('[data-testid^="lifehack-"]').length, 13);
  await React.act(async () => root.unmount());
  dom.window.close();
  console.log('PASS: client Lifehacks DOM: 13 cards, biotin details, minerals filter, reset');
})().catch(error => { console.error(error); process.exitCode=1; });
