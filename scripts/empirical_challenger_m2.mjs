/**
 * scripts/empirical_challenger_m2.mjs
 * Comprehensive Empirical Challenge Harness for Milestone 2 (Frontend Paywall & Monetization Flow)
 */

import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';

const SYNTHETIC_SIGNING_KEY = 'synthetic-pilot-signing-key-not-a-telegram-token';
const BASE_URL = 'http://127.0.0.1:18088';

function signTelegramInitData(user, botToken = SYNTHETIC_SIGNING_KEY) {
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify(user);
  const pairs = [`auth_date=${authDate}`, `user=${userJson}`];
  const dataCheckString = pairs.sort().join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', userJson);
  params.set('hash', hash);
  return params.toString();
}

function createTelegramMockScript(initData, user) {
  return `
    (function() {
      const mockWebApp = {
        initData: ${JSON.stringify(initData)},
        initDataUnsafe: { user: ${JSON.stringify(user)} },
        ready: () => {},
        expand: () => {},
        close: () => {},
        themeParams: {},
        colorScheme: 'light',
        isExpanded: true,
        viewportHeight: 844,
        viewportStableHeight: 844,
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        BackButton: { isVisible: false, onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {} },
        MainButton: { isVisible: false, onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {}, setText: () => {} },
        HapticFeedback: {
          impactOccurred: (style) => { window.__hapticLog = window.__hapticLog || []; window.__hapticLog.push({ type: 'impact', style }); },
          notificationOccurred: (type) => { window.__hapticLog = window.__hapticLog || []; window.__hapticLog.push({ type: 'notification', type }); },
          selectionChanged: () => { window.__hapticLog = window.__hapticLog || []; window.__hapticLog.push({ type: 'selection' }); }
        },
      };

      const tgObj = {};
      Object.defineProperty(tgObj, 'WebApp', {
        get() { return mockWebApp; },
        set(val) {
          if (val && typeof val === 'object') {
            Object.assign(mockWebApp, val);
            mockWebApp.initData = ${JSON.stringify(initData)};
            mockWebApp.initDataUnsafe = { user: ${JSON.stringify(user)} };
          }
        },
        configurable: true,
      });

      Object.defineProperty(window, 'Telegram', {
        get() { return tgObj; },
        set(val) {
          if (val && typeof val === 'object') {
            Object.assign(tgObj, val);
          }
        },
        configurable: true,
      });
    })();
  `;
}

async function passOnboarding(page) {
  // 1. Start Gate Screen
  const gate = page.locator('[data-testid="start-gate-screen"]');
  await gate.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#gate-checkbox-age').check();
  await page.locator('#gate-checkbox-pd').check();
  await page.locator('#start-btn-continue').click();

  // 2. Settings Form
  const form = page.locator('[data-testid="pilot-settings-form"]');
  await form.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-testid="settings-approach-keto"]').click();
  await page.locator('[data-testid="settings-time-30"]').click();

  const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
    page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
    submitBtn.click(),
  ]);

  // 3. Today screen appears
  const today = page.locator('[data-testid="food-today"]');
  await today.waitFor({ state: 'visible', timeout: 15000 });
}

async function runEmpiricalChallenge() {
  console.log('===============================================================');
  console.log('🚀 EMPIRICAL CHALLENGE HARNESS: MILESTONE 2 (PAYWALL & MONETIZATION)');
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const results = {
    testsPassed: 0,
    testsFailed: 0,
    failures: [],
    observations: [],
  };

  const consoleErrors = [];
  const unhandledExceptions = [];

  function recordPass(testName, details) {
    results.testsPassed++;
    console.log(`  ✅ PASS: ${testName} - ${details || ''}`);
  }

  function recordFail(testName, reason) {
    results.testsFailed++;
    results.failures.push({ testName, reason });
    console.log(`  ❌ FAIL: ${testName} - ${reason}`);
  }

  try {
    // -------------------------------------------------------------
    // Test Scenario 1: New User Onboarding -> Today -> Paywall Modal -> 3 Tariffs
    // -------------------------------------------------------------
    console.log('\n--- Scenario 1: Onboarding -> Today -> Header Trigger -> Tariff Selection ---');
    const user1 = { id: 8101, first_name: 'ChallengerAlpha' };
    const context1 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const initData1 = signTelegramInitData(user1);
    await context1.addInitScript(createTelegramMockScript(initData1, user1));
    const page1 = await context1.newPage();

    page1.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Page 1 Console Error]: ${msg.text()}`);
    });
    page1.on('pageerror', (err) => unhandledExceptions.push(`[Page 1 Page Error]: ${err.message}`));

    await page1.goto(BASE_URL);
    await passOnboarding(page1);
    recordPass('Onboarding Journey', 'Passed Start Gate & Settings form, arrived at Today screen');

    // Header Trigger check
    const headerBtn = page1.locator('[data-testid="header-premium-btn"]');
    if (await headerBtn.isVisible()) {
      recordPass('Header Premium Trigger (Free User)', 'Found [data-testid="header-premium-btn"]');
    } else {
      recordFail('Header Premium Trigger (Free User)', 'header-premium-btn missing in header');
    }

    // Open Paywall
    await headerBtn.click();
    const paywallModal = page1.locator('[data-testid="paywall-modal"]');
    await paywallModal.waitFor({ state: 'visible', timeout: 5000 });
    recordPass('Paywall Modal Open via Header Trigger', 'Found [data-testid="paywall-modal"]');

    // Check all 3 Tariffs
    const tariffs = [
      { id: 'sub_month', expectedPrice: '1 900' },
      { id: 'plateau_guide', expectedPrice: '490' },
      { id: 'vip_care', expectedPrice: '15 000' },
    ];

    for (const t of tariffs) {
      const card = page1.locator(`[data-testid="tariff-card-${t.id}"]`);
      if (await card.isVisible()) {
        recordPass(`Tariff Card [${t.id}] Visibility`, 'Card rendered');
      } else {
        recordFail(`Tariff Card [${t.id}] Visibility`, 'Card not found');
      }

      await card.click();
      const buyText = await page1.locator('[data-testid="paywall-buy-btn"]').innerText();
      if (buyText.includes(t.expectedPrice) || buyText.replace(/\s+/g, '').includes(t.expectedPrice.replace(/\s+/g, ''))) {
        recordPass(`Tariff Selection [${t.id}]`, `CTA price updated: "${buyText.trim()}"`);
      } else {
        recordFail(`Tariff Selection [${t.id}]`, `Expected ${t.expectedPrice} in CTA, got: "${buyText.trim()}"`);
      }
    }

    // Check haptic feedback was triggered on selection
    const hapticEvents = await page1.evaluate(() => (window.__hapticLog || []).length);
    if (hapticEvents >= 3) {
      recordPass('Telegram Haptic Feedback on Tariff Selection', `Recorded ${hapticEvents} haptic events`);
    } else {
      recordFail('Telegram Haptic Feedback on Tariff Selection', `Expected >= 3 events, got: ${hapticEvents}`);
    }

    // -------------------------------------------------------------
    // Test Scenario 2: Instant Demo Activation & Header Switch
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: Instant Demo Activation & Header Badge Switch ---');
    const demoBtn = page1.locator('[data-testid="paywall-demo-activate-btn"]');
    if (await demoBtn.isVisible()) {
      recordPass('Demo Activate Button Presence', 'Found [data-testid="paywall-demo-activate-btn"]');
    } else {
      recordFail('Demo Activate Button Presence', 'paywall-demo-activate-btn not found');
    }

    await demoBtn.click();
    await paywallModal.waitFor({ state: 'hidden', timeout: 5000 });
    recordPass('Paywall Modal Auto-Close on Demo Activate', 'Modal smoothly closed');

    // Confirm Header displays 👑 Premium
    const premiumBadge = page1.locator('[data-testid="header-premium-badge"]');
    await premiumBadge.waitFor({ state: 'visible', timeout: 5000 });
    const badgeText = await premiumBadge.innerText();
    if (badgeText.includes('Premium')) {
      recordPass('Header Badge Transition to 👑 Premium', `Badge text: "${badgeText.trim()}"`);
    } else {
      recordFail('Header Badge Transition to 👑 Premium', `Badge text unexpected: "${badgeText}"`);
    }

    // Confirm free button replaced
    const isFreeBtnVisible = await page1.locator('[data-testid="header-premium-btn"]').isVisible();
    if (!isFreeBtnVisible) {
      recordPass('Header Free Button Removal', 'Free button cleanly replaced by badge');
    } else {
      recordFail('Header Free Button Removal', 'Free button remains visible after activation');
    }

    // -------------------------------------------------------------
    // Test Scenario 3: "Ещё" (More) Tab Entry Point & Close Button
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: "Ещё" Tab Entry Point & Close Button ---');
    const moreTab = page1.locator('[data-testid="bottom-nav-more"]');
    if (await moreTab.isVisible()) {
      recordPass('Bottom Nav "Ещё" Tab Presence', 'Found [data-testid="bottom-nav-more"]');
    } else {
      recordFail('Bottom Nav "Ещё" Tab Presence', 'bottom-nav-more missing');
    }

    await moreTab.click();
    await page1.waitForTimeout(500);

    const morePaywallBtn = page1.locator('[data-testid="more-open-paywall-btn"]');
    if (await morePaywallBtn.isVisible()) {
      recordPass('More Tab Paywall Trigger', 'Found [data-testid="more-open-paywall-btn"]');
    } else {
      recordFail('More Tab Paywall Trigger', 'more-open-paywall-btn missing in More screen');
    }

    // Open Paywall from More tab
    await morePaywallBtn.click();
    await paywallModal.waitFor({ state: 'visible', timeout: 5000 });
    recordPass('Paywall Modal Re-Open from More Tab', 'Modal visible');

    // Test Close Button
    const closeBtn = page1.locator('[data-testid="paywall-close-btn"]');
    await closeBtn.click();
    await paywallModal.waitFor({ state: 'hidden', timeout: 5000 });
    recordPass('Paywall Close Button Dismissal', 'Modal closed on close-btn click');

    await context1.close();

    // -------------------------------------------------------------
    // Test Scenario 4: Modal Dismissal via Backdrop (Outside Click) & Escape Key
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Modal Dismissal via Backdrop Click & Escape Key ---');
    const user2 = { id: 8102, first_name: 'ChallengerBeta' };
    const context2 = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const initData2 = signTelegramInitData(user2);
    await context2.addInitScript(createTelegramMockScript(initData2, user2));
    const page2 = await context2.newPage();
    page2.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Page 2 Console Error]: ${msg.text()}`);
    });
    page2.on('pageerror', (err) => unhandledExceptions.push(`[Page 2 Page Error]: ${err.message}`));

    await page2.goto(BASE_URL);
    await passOnboarding(page2);

    // Open paywall
    await page2.locator('[data-testid="header-premium-btn"]').click();
    const modal2 = page2.locator('[data-testid="paywall-modal"]');
    await modal2.waitFor({ state: 'visible', timeout: 5000 });

    // Test Backdrop Click at top-left outside modal card: (15, 15)
    console.log('  Testing click on backdrop overlay (15, 15)...');
    await page2.mouse.click(15, 15);
    await page2.waitForTimeout(600);

    const isModalVisibleAfterBackdrop = await modal2.isVisible();
    if (!isModalVisibleAfterBackdrop) {
      recordPass('Paywall Dismissal via Backdrop Click', 'Modal closed on backdrop click');
    } else {
      recordFail(
        'Paywall Dismissal via Backdrop Click',
        'DEFECT: Clicking the backdrop at (15, 15) DID NOT close the modal. PaywallModal lacks an outside-click or backdrop click handler.'
      );
    }

    // Test Escape key dismissal
    console.log('  Testing Escape key press...');
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(600);
    const isModalVisibleAfterEsc = await modal2.isVisible();
    if (!isModalVisibleAfterEsc) {
      recordPass('Paywall Dismissal via Escape Key', 'Modal closed on Escape key press');
    } else {
      recordFail(
        'Paywall Dismissal via Escape Key',
        'DEFECT: Pressing Escape key DID NOT close the modal. No keydown listener is registered.'
      );
    }

    await context2.close();

    // -------------------------------------------------------------
    // Test Scenario 5: Full Real Purchase Flow with Backend Order & Reload Persistence
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: Full Real Purchase Flow via Backend API ---');
    const user3 = { id: 8103, first_name: 'ChallengerGamma' };
    const context3 = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const initData3 = signTelegramInitData(user3);
    await context3.addInitScript(createTelegramMockScript(initData3, user3));
    const page3 = await context3.newPage();
    page3.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Page 3 Console Error]: ${msg.text()}`);
    });
    page3.on('pageerror', (err) => unhandledExceptions.push(`[Page 3 Page Error]: ${err.message}`));

    await page3.goto(BASE_URL);
    await passOnboarding(page3);

    // Open paywall
    await page3.locator('[data-testid="header-premium-btn"]').click();
    const modal3 = page3.locator('[data-testid="paywall-modal"]');
    await modal3.waitFor({ state: 'visible', timeout: 5000 });

    // Select sub_month
    await page3.locator('[data-testid="tariff-card-sub_month"]').click();

    let purchaseApiCalled = false;
    let confirmApiCalled = false;
    let createdOrderId = null;

    page3.on('request', (req) => {
      if (req.url().includes('/api/subscription/purchase')) purchaseApiCalled = true;
      if (req.url().includes('/api/subscription/confirm-demo')) confirmApiCalled = true;
    });

    page3.on('response', async (res) => {
      if (res.url().includes('/api/subscription/purchase') && res.status() === 200) {
        try {
          const body = await res.json();
          createdOrderId = body.order_id;
        } catch {}
      }
    });

    // Click buy button
    await page3.locator('[data-testid="paywall-buy-btn"]').click();
    await modal3.waitFor({ state: 'hidden', timeout: 10000 });

    if (purchaseApiCalled && confirmApiCalled) {
      recordPass('Backend API Purchase & Confirm Calls', `Order ID created & confirmed: ${createdOrderId}`);
    } else {
      recordFail('Backend API Purchase & Confirm Calls', `Purchase called: ${purchaseApiCalled}, Confirm called: ${confirmApiCalled}`);
    }

    // Verify header badge
    const premiumBadge3 = page3.locator('[data-testid="header-premium-badge"]');
    await premiumBadge3.waitFor({ state: 'visible', timeout: 5000 });
    recordPass('Header Badge Switched to 👑 Premium', 'Header displays Premium after purchase');

    // Reload page to verify persistence across page reload
    await page3.reload();
    await page3.locator('[data-testid="food-today"]').waitFor({ state: 'visible', timeout: 10000 });
    const isStillPremium = await page3.locator('[data-testid="header-premium-badge"]').isVisible();
    if (isStillPremium) {
      recordPass('Subscription Persistence across Reload', 'Premium state persisted in SQLite DB');
    } else {
      recordFail('Subscription Persistence across Reload', 'Premium state was lost on page reload');
    }

    await context3.close();

    // -------------------------------------------------------------
    // Test Scenario 6: Mobile Viewport 390x844 Layout & Overflow
    // -------------------------------------------------------------
    console.log('\n--- Scenario 6: Mobile Viewport (390x844) Layout Integrity ---');
    const user4 = { id: 8104, first_name: 'ChallengerDelta' };
    const context4 = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const initData4 = signTelegramInitData(user4);
    await context4.addInitScript(createTelegramMockScript(initData4, user4));
    const page4 = await context4.newPage();

    await page4.goto(BASE_URL);
    await passOnboarding(page4);
    await page4.locator('[data-testid="header-premium-btn"]').click();
    await page4.locator('[data-testid="paywall-modal"]').waitFor({ state: 'visible' });

    const hasHorizontalOverflow = await page4.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });

    if (!hasHorizontalOverflow) {
      recordPass('Mobile Viewport Horizontal Overflow', 'scrollWidth <= clientWidth (no horizontal overflow)');
    } else {
      recordFail('Mobile Viewport Horizontal Overflow', 'Horizontal overflow detected at 390x844');
    }

    await context4.close();

    // -------------------------------------------------------------
    // Test Scenario 7: Network Error Banner Resilience
    // -------------------------------------------------------------
    console.log('\n--- Scenario 7: Network Error Banner Resilience ---');
    const user5 = { id: 8105, first_name: 'ChallengerEpsilon' };
    const context5 = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const initData5 = signTelegramInitData(user5);
    await context5.addInitScript(createTelegramMockScript(initData5, user5));
    const page5 = await context5.newPage();

    await page5.goto(BASE_URL);
    await passOnboarding(page5);
    await page5.locator('[data-testid="header-premium-btn"]').click();
    await page5.locator('[data-testid="paywall-modal"]').waitFor({ state: 'visible' });

    // Mock purchase 500 error
    await page5.route('**/api/subscription/purchase', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Simulated payment gateway crash' }),
      });
    });

    await page5.locator('[data-testid="paywall-buy-btn"]').click();
    await page5.waitForTimeout(1000);

    const errorBanner = page5.locator('.bg-red-50');
    if (await errorBanner.isVisible()) {
      const errText = await errorBanner.innerText();
      recordPass('Graceful Error Banner on Network Failure', `Banner displayed: "${errText.trim()}"`);
    } else {
      recordFail('Graceful Error Banner on Network Failure', 'Error banner not shown on 500 response');
    }

    // Test fallback demo activation even during network outage
    await page5.locator('[data-testid="paywall-demo-activate-btn"]').click();
    await page5.locator('[data-testid="paywall-modal"]').waitFor({ state: 'hidden', timeout: 5000 });
    const isBadgeActiveAfterFallback = await page5.locator('[data-testid="header-premium-badge"]').isVisible();
    if (isBadgeActiveAfterFallback) {
      recordPass('Demo Button Resilience Fallback', 'Demo activation succeeded after API error');
    } else {
      recordFail('Demo Button Resilience Fallback', 'Demo activation failed after API error');
    }

    await context5.close();

  } finally {
    await browser.close();
  }

  // -------------------------------------------------------------
  // Summary & Console Error Check
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 CHALLENGE HARNESS SUMMARY:');
  console.log(`- Tests Passed: ${results.testsPassed}`);
  console.log(`- Tests Failed: ${results.testsFailed}`);
  console.log(`- Console Errors: ${consoleErrors.length}`);
  console.log(`- Unhandled Exceptions: ${unhandledExceptions.length}`);
  console.log('===============================================================\n');

  if (consoleErrors.length > 0) {
    console.log('Console Errors Observed:');
    consoleErrors.forEach((e) => console.log('  ', e));
  }
  if (unhandledExceptions.length > 0) {
    console.log('Unhandled Exceptions Observed:');
    unhandledExceptions.forEach((e) => console.log('  ', e));
  }
  if (results.failures.length > 0) {
    console.log('Defects / Failures:');
    results.failures.forEach((f) => console.log(`  - [${f.testName}]: ${f.reason}`));
  }

  return {
    ...results,
    consoleErrors,
    unhandledExceptions,
  };
}

runEmpiricalChallenge()
  .then((res) => {
    process.exit(res.testsFailed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Fatal challenge harness error:', err);
    process.exit(2);
  });
