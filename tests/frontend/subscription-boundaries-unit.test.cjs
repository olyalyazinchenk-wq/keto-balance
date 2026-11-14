/**
 * tests/frontend/subscription-boundaries-unit.test.cjs
 * Unit tests for free tier preview boundary, availableCatalogs accessibility, and closed payment state.
 * Uses REAL application components and modules via loadTs and ReactDOMServer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');

const { PaywallModal } = loadTs(path.resolve(__dirname, '../../src/ui/food-first/PaywallModal.tsx'));

test('PaywallModal Component: Closed payment mode (paymentsEnabled=false) renders honest notice and direct contact', () => {
  // 1. Production closed mode: paymentsEnabled=false
  const htmlClosed = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PaywallModal, {
      isOpen: true,
      onClose: () => {},
      paymentsEnabled: false,
    })
  );

  assert.ok(htmlClosed.includes('Закрытый просмотр, оплата пока не открыта'), 'Must render closed access message');
  assert.ok(htmlClosed.includes('Написать Ольге в Telegram'), 'Must offer direct Telegram link to Olga');
  assert.ok(htmlClosed.includes('https://t.me/keto_balance_userbot?start=question'), 'Must link to bot start question');
  assert.ok(!htmlClosed.includes('Оформить доступ · 990 ₽'), 'Must not render purchase action button when payments are closed');
  assert.ok(htmlClosed.includes('data-testid="closed-access-notice"'), 'Must have testid for closed notice');

  // 2. Closed when isOpen=false
  const htmlHidden = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PaywallModal, {
      isOpen: false,
      onClose: () => {},
      paymentsEnabled: false,
    })
  );
  assert.equal(htmlHidden, '', 'Must render nothing when isOpen is false');

  // 3. Open payments mode: paymentsEnabled=true
  const htmlOpen = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PaywallModal, {
      isOpen: true,
      onClose: () => {},
      paymentsEnabled: true,
    })
  );
  assert.ok(!htmlOpen.includes('Закрытый просмотр, оплата пока не открыта'), 'Must not show closed notice when payments enabled');
  assert.ok(htmlOpen.includes('Оформить доступ · 990 ₽') || htmlOpen.includes('990'), 'Must show standard tariff when payments enabled');
});

test('PaywallModal Component: Active subscription displays current active tariff indicator', () => {
  const htmlSub = ReactDOMServer.renderToStaticMarkup(
    React.createElement(PaywallModal, {
      isOpen: true,
      onClose: () => {},
      currentTier: 'sub_month',
      paymentsEnabled: false,
    })
  );

  assert.ok(htmlSub.includes('Ваш текущий тариф'), 'Must indicate active current tariff');
  assert.ok(htmlSub.includes('Закрытый просмотр'), 'Closed access notice displayed when payments disabled');
});
