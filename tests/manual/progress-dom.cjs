// Synthetic server responses only. No Telegram, storage or real user data.
const { JSDOM } = require('jsdom');
const React = require('react');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
window.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = require('react-dom/client');
const { Progress } = loadTs('src/ui/food-first/Progress.tsx');
const { progressToday } = loadTs('src/ui/food-first/progressModel.ts');
const today = progressToday();
let snapshot = { age: 40, revision: 1, entries: [{ date: today, weight: 80.5, chest: null, waist: 90, hips: null }] };
let puts = 0, deletes = 0, conflict = false;
global.fetch = async (url, options) => {
  assert.equal(options.headers.get('Authorization'), 'Bearer synthetic-progress');
  if (options.method === 'PUT') {
    puts++;
    const body = JSON.parse(options.body);
    assert.equal(body.expected_revision, snapshot.revision);
    assert.equal(body.consent, true);
    if (conflict) { conflict = false; snapshot = { ...snapshot, revision: snapshot.revision + 1, entries: [{ ...snapshot.entries[0], hips: 105 }] }; return new Response(JSON.stringify({ detail: 'conflict' }), { status: 409 }); }
    snapshot = { age: body.age, revision: snapshot.revision + 1, entries: [body.entry] };
  }
  if (options.method === 'DELETE') { deletes++; snapshot = { ...snapshot, entries: [], revision: snapshot.revision + 1 }; }
  return new Response(JSON.stringify(snapshot), { status: 200 });
};
const root = createRoot(document.getElementById('root'));
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
async function click(text) { await React.act(async () => button(text).click()); }
async function set(name, value) { const input = document.querySelector(`input[name="${name}"]`); await React.act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })); }); }
async function submit() { await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
(async () => {
  await React.act(async () => root.render(React.createElement(Progress, { sessionToken: 'synthetic-progress' })));
  assert.ok(document.body.textContent.includes('80,5 кг'));
  await React.act(async () => document.querySelector('input[type="checkbox"]').click());
  await set('chest', '100');
  await submit();
  assert.equal(puts, 0, 'partial entry must not overwrite existing date');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Изменить'));
  await click('Изменить');
  assert.equal(document.querySelector('input[name="waist"]').value, '90');
  await set('chest', '100');
  await submit();
  assert.equal(snapshot.entries[0].weight, 80.5);
  assert.equal(snapshot.entries[0].waist, 90);
  assert.equal(snapshot.entries[0].chest, 100);
  conflict = true;
  await set('weight', '79'); await submit();
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('другой сессии'));
  await click('Обновить данные');
  const previousPuts = puts; await submit();
  assert.equal(puts, previousPuts, 'refresh after conflict must require re-opening latest entry');
  await click('Изменить');
  assert.equal(document.querySelector('input[name="hips"]').value, '105');
  await set('weight', '79'); await submit();
  assert.equal(snapshot.entries[0].hips, 105, 'concurrent value preserved');
  await click('Удалить'); assert.equal(deletes, 0);
  await click('Отмена'); assert.equal(deletes, 0);
  await click('Удалить'); await click('Да, удалить запись'); assert.equal(deletes, 1);
  await React.act(async () => root.unmount()); dom.window.close();
  console.log('PASS: progress DOM load, consent, duplicate-date protection, edit, conflict/refresh preservation, confirmed delete');
})().catch(error => { console.error(error); process.exitCode = 1; });
