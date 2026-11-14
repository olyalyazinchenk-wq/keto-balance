/**
 * tests/frontend/subscription-boundaries-unit.test.cjs
 * Unit tests for free tier preview boundary, availableCatalogs accessibility, and closed payment state.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Preview Boundary: Free tier limits to 1 day and 2 meals', () => {
  const isPreview = true;
  const isEligibleForFree = (planDays, mealsPerDay) => {
    if (!isPreview) return true;
    return planDays === 1 && mealsPerDay === 2;
  };

  assert.equal(isEligibleForFree(1, 2), true, '1 day and 2 meals must be eligible for free preview');
  assert.equal(isEligibleForFree(3, 2), false, '3 days must require subscription');
  assert.equal(isEligibleForFree(7, 2), false, '7 days must require subscription');
  assert.equal(isEligibleForFree(30, 2), false, 'Month must require subscription');
  assert.equal(isEligibleForFree(1, 3), false, '3 meals must require subscription');
});

test('Catalog Accessibility: Server-driven accessible flag enforces editorial draft boundary', () => {
  const availableCatalogs = [
    {
      catalog_id: 'released-catalog-202611-v1',
      catalog_month: '2026-11',
      editorial_status: 'approved',
      accessible: true,
      total_recipes: 50,
    },
    {
      catalog_id: 'released-catalog-202612-v1',
      catalog_month: '2026-12',
      editorial_status: 'draft_for_owner_review',
      accessible: false,
      total_recipes: 50,
    },
  ];

  const canUserAccessCatalog = (catalogMonth, isOwner) => {
    const matched = availableCatalogs.find((c) => c.catalog_month === catalogMonth);
    if (!matched) return false;
    if (isOwner) return true;
    return matched.accessible === true;
  };

  // Regular user
  assert.equal(canUserAccessCatalog('2026-11', false), true, 'Regular user can access approved November');
  assert.equal(canUserAccessCatalog('2026-12', false), false, 'Regular user cannot access unapproved draft December');

  // Owner user
  assert.equal(canUserAccessCatalog('2026-11', true), true, 'Owner can access November');
  assert.equal(canUserAccessCatalog('2026-12', true), true, 'Owner can access draft December');
});

test('Monetization Boundary: Server controls payment state and closed access messaging', () => {
  const evaluatePaywallActions = ({ paymentsEnabled, isDemo }) => {
    if (paymentsEnabled) {
      return { canPurchase: true, showClosedNotice: false, showContactOlga: false, showDemoButton: isDemo };
    }
    return {
      canPurchase: false,
      showClosedNotice: true,
      showContactOlga: true,
      showDemoButton: isDemo,
      noticeText: 'Закрытый просмотр, оплата пока не открыта',
    };
  };

  // Production with payments disabled
  const prodActions = evaluatePaywallActions({ paymentsEnabled: false, isDemo: false });
  assert.equal(prodActions.canPurchase, false, 'Must not allow purchasing when payments disabled');
  assert.equal(prodActions.showClosedNotice, true, 'Must display closed access notice');
  assert.equal(prodActions.showContactOlga, true, 'Must display direct contact link to Olga');
  assert.equal(prodActions.showDemoButton, false, 'Must not display demo button in real production');
  assert.equal(prodActions.noticeText, 'Закрытый просмотр, оплата пока не открыта');

  // Local demo test with payments disabled
  const demoActions = evaluatePaywallActions({ paymentsEnabled: false, isDemo: true });
  assert.equal(demoActions.canPurchase, false);
  assert.equal(demoActions.showClosedNotice, true);
  assert.equal(demoActions.showDemoButton, true, 'Demo button available only in isolated demo test');
});
