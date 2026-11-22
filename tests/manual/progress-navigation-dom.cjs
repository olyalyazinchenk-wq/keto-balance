const { JSDOM } = require('jsdom');
const React = require('react');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
window.scrollTo = ({ top }) => { window.scrollY = top; };
global.requestAnimationFrame = callback => setTimeout(callback, 0);
const { createRoot } = require('react-dom/client');
const { FoodFirstApp } = loadTs('src/ui/food-first/FoodFirstApp.tsx');
const catalog = require('../fixtures/pilot/catalog.json');
global.fetch = async url => new Response(JSON.stringify(String(url).includes('/api/progress') ? { age: null, revision: 0, entries: [] } : { guides: [] }), { status: 200 });
const memory = { current: null };
const props = { navigationMemory: memory, catalog, sessionToken: 'synthetic-a', userId: 901,
  profile: { settings: { approach: 'keto', prepTimeMax: 60, planDays: 7, confirmed18Plus: true, restrictions: [], mealsPerDay: 2 } },
  state: { menu: null, checked_steps: {}, checked_ingredients: {}, shopping_stale: false, shopping_batches: 1 }, shoppingItems: [], syncStatus: 'idle',
  onSelectDate(){}, onReplaceRecipe:async()=>{}, onRebuildMenu:async()=>{}, onToggleIngredient(){}, onToggleStep(){}, onChangeBatches(){}, onRefreshShopping(){}, onToggleCheckedInStore(){}, onToggleAlreadyHave(){}, onAddCustomItem(){} };
const root = createRoot(document.getElementById('root'));
const get = id => [...document.querySelectorAll(`[data-testid="${id}"]`)].find(el => !el.closest('[hidden]'));
async function click(id) { await React.act(async () => get(id).click()); }
(async () => {
  await React.act(async () => root.render(React.createElement(FoodFirstApp, props)));
  await click('bottom-nav-more');
  await click('more-open-progress');
  assert.ok(get('progress-screen'));
  const input = document.querySelector('input[name="weight"]');
  await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '77,5'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  window.scrollY = 205;
  await click('app-back-button'); assert.ok(get('more-screen'));
  await click('more-open-progress'); assert.equal(document.querySelector('input[name="weight"]').value, '77,5');
  // The previous user's draft must not appear after a session/account change.
  await React.act(async () => root.render(React.createElement(FoodFirstApp, { ...props, sessionToken: 'synthetic-b', userId: 902 })));
  assert.equal(document.querySelector('input[name="weight"]').value, '');
  await React.act(async () => root.unmount()); dom.window.close();
  console.log('PASS: More → Progress → Back, retained draft, account-change reset');
})().catch(err => { console.error(err); process.exitCode = 1; });
