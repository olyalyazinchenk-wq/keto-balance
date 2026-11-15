const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');
const { KetoRules, PrivacyInfo } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/ClientInfo.tsx'));
const { PaywallModal } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/PaywallModal.tsx'));

test('keto rules explain food groups and portions independently from settings', () => {
  const html = renderToStaticMarkup(React.createElement(KetoRules));
  for (const text of ['Правила кето', 'основы рациона', 'ограничивать', 'обычно заменяют', 'углеводы и порцию', 'не медицинские запреты']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('onOpenSettings'));
  assert.ok(!html.includes('карнивор'));
});

test('privacy describes persisted data without unsupported security and prototype claims', () => {
  const html = renderToStaticMarkup(React.createElement(PrivacyInfo));
  assert.ok(html.includes('сохраняются на сервере'));
  assert.ok(html.includes('Ольги'));
  assert.doesNotMatch(html, /localStorage|прототип|SQLite|никогда не переда|защищены на 100|тестов/);
});

test('public paywall cannot expose demonstration controls through query or explicit preview prop', () => {
  const previous = global.window;
  try {
    global.window = { location: { hostname: '84.54.56.73.nip.io', search: '?demo_user=42' } };
    for (const isDemoPreview of [undefined, true, false]) {
      const html = renderToStaticMarkup(React.createElement(PaywallModal, {
        isOpen: true, paymentsEnabled: false, isDemoPreview, onClose() {}, onSuccess() {},
      }));
      assert.ok(html.includes('closed-access-notice'));
      assert.doesNotMatch(html, /paywall-demo-activate-btn|Оформить доступ ·/);
    }
  } finally {
    if (previous === undefined) delete global.window; else global.window = previous;
  }
});
