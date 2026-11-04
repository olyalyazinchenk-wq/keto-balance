/**
 * scripts/empirical_challenger_m2_r2.mjs
 * Targeted Deep Verification Harness for PaywallModal Accessibility & Interaction
 * Tests:
 * 1. Close button touch target (>= 44x44px bounding box & computed style)
 * 2. Backdrop click outside dialog card (closes modal)
 * 3. Dialog card click propagation (stopPropagation - modal remains open)
 * 4. Escape key dismissal (modal is open, Escape closes it; tested across multiple entry points)
 * 5. Stress cycles (rapid open/close across backdrop, escape, button without listener leaks)
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
  const gate = page.locator('[data-testid="start-gate-screen"]');
  await gate.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#gate-checkbox-age').check();
  await page.locator('#gate-checkbox-pd').check();
  await page.locator('#start-btn-continue').click();

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

  const today = page.locator('[data-testid="food-today"]');
  await today.waitFor({ state: 'visible', timeout: 15000 });
}

async function runR2Challenge() {
  console.log('===============================================================');
  console.log('🔬 EMPIRICAL CHALLENGER R2: TARGETED PAYWALL MODAL AUDIT');
  console.log('===============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const results = {
    testsPassed: 0,
    testsFailed: 0,
    failures: [],
  };

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
    const user = { id: 9901, first_name: 'ChallengerR2' };
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const initData = signTelegramInitData(user);
    await context.addInitScript(createTelegramMockScript(initData, user));
    const page = await context.newPage();

    await page.goto(BASE_URL);
    await passOnboarding(page);

    // -------------------------------------------------------------
    // Test 1: Close Button Touch Target Size (44x44px)
    // -------------------------------------------------------------
    console.log('\n--- Check 1: Close Button Touch Target Sizing (>= 44x44px) ---');
    const headerBtn = page.locator('[data-testid="header-premium-btn"]');
    await headerBtn.click();

    const paywallModal = page.locator('[data-testid="paywall-modal"]');
    await paywallModal.waitFor({ state: 'visible', timeout: 5000 });

    const closeBtn = page.locator('[data-testid="paywall-close-btn"]');
    await closeBtn.waitFor({ state: 'visible', timeout: 2000 });

    const btnBox = await closeBtn.boundingBox();
    const computedStyles = await closeBtn.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        minWidth: s.minWidth,
        minHeight: s.minHeight,
      };
    });

    console.log(`  Measured Bounding Box: width=${btnBox?.width}px, height=${btnBox?.height}px`);
    console.log(`  Computed Styles: width=${computedStyles.width}, height=${computedStyles.height}, minWidth=${computedStyles.minWidth}, minHeight=${computedStyles.minHeight}`);

    if (btnBox && btnBox.width >= 44 && btnBox.height >= 44) {
      recordPass('Close Button Touch Target Bounding Box', `Dimensions: ${btnBox.width}x${btnBox.height}px >= 44x44px`);
    } else {
      recordFail('Close Button Touch Target Bounding Box', `Dimensions ${btnBox?.width}x${btnBox?.height}px < 44x44px`);
    }

    if (computedStyles.minWidth === '44px' && computedStyles.minHeight === '44px') {
      recordPass('Close Button Min Dimensions CSS', 'minWidth and minHeight set to 44px');
    } else {
      recordFail('Close Button Min Dimensions CSS', `minWidth=${computedStyles.minWidth}, minHeight=${computedStyles.minHeight}`);
    }

    // -------------------------------------------------------------
    // Test 2: Backdrop Click Outside Dialog Card
    // -------------------------------------------------------------
    console.log('\n--- Check 2: Backdrop Click Outside Dialog Card ---');
    // Backdrop click at (15, 15)
    console.log('  Action: Clicking backdrop at coordinate (15, 15)...');
    await page.mouse.click(15, 15);
    await paywallModal.waitFor({ state: 'hidden', timeout: 3000 });
    const isModalVisibleAfterClick1 = await paywallModal.isVisible();
    if (!isModalVisibleAfterClick1) {
      recordPass('Backdrop Click at (15, 15)', 'Modal closed cleanly');
    } else {
      recordFail('Backdrop Click at (15, 15)', 'Modal remained visible');
    }

    // Reopen and click at (375, 15)
    console.log('  Action: Reopening modal and clicking backdrop at coordinate (375, 15)...');
    await headerBtn.click();
    await paywallModal.waitFor({ state: 'visible', timeout: 3000 });
    await page.mouse.click(375, 15);
    await paywallModal.waitFor({ state: 'hidden', timeout: 3000 });
    const isModalVisibleAfterClick2 = await paywallModal.isVisible();
    if (!isModalVisibleAfterClick2) {
      recordPass('Backdrop Click at (375, 15)', 'Modal closed cleanly');
    } else {
      recordFail('Backdrop Click at (375, 15)', 'Modal remained visible');
    }

    // -------------------------------------------------------------
    // Test 3: Stop Propagation Inside Dialog Card
    // -------------------------------------------------------------
    console.log('\n--- Check 3: Click Propagation Inside Dialog Card (stopPropagation) ---');
    await headerBtn.click();
    await paywallModal.waitFor({ state: 'visible', timeout: 3000 });

    // 3a. Click on Header Title inside card
    console.log('  Action: Clicking on modal title inside card...');
    const modalTitle = page.locator('#paywall-title');
    await modalTitle.click();
    await page.waitForTimeout(300);
    const isVisibleAfterTitleClick = await paywallModal.isVisible();
    if (isVisibleAfterTitleClick) {
      recordPass('Card Click (Title)', 'Click inside card did NOT dismiss modal');
    } else {
      recordFail('Card Click (Title)', 'Modal erroneously closed on title click');
    }

    // 3b. Click on Tariff Card
    console.log('  Action: Clicking on tariff card plateau_guide inside card...');
    const tariffCard = page.locator('[data-testid="tariff-card-plateau_guide"]');
    await tariffCard.click();
    await page.waitForTimeout(300);
    const isVisibleAfterTariffClick = await paywallModal.isVisible();
    if (isVisibleAfterTariffClick) {
      recordPass('Card Click (Tariff Card)', 'Click on tariff card did NOT dismiss modal');
    } else {
      recordFail('Card Click (Tariff Card)', 'Modal erroneously closed on tariff card click');
    }

    // 3c. Click on Benefits list text inside card
    console.log('  Action: Clicking on benefit item inside card...');
    const benefitItem = page.locator('text=Все 42 авторских рецепта').first();
    if (await benefitItem.isVisible()) {
      await benefitItem.click();
      await page.waitForTimeout(300);
      const isVisibleAfterBenefitClick = await paywallModal.isVisible();
      if (isVisibleAfterBenefitClick) {
        recordPass('Card Click (Benefit item)', 'Click on benefit text did NOT dismiss modal');
      } else {
        recordFail('Card Click (Benefit item)', 'Modal erroneously closed on benefit text click');
      }
    }

    // -------------------------------------------------------------
    // Test 4: Escape Key Dismissal (Verified with Open Modal)
    // -------------------------------------------------------------
    console.log('\n--- Check 4: Escape Key Dismissal Verification ---');
    // Modal is currently visible
    const isVisibleBeforeEsc = await paywallModal.isVisible();
    console.log(`  Modal visible before Escape: ${isVisibleBeforeEsc}`);
    if (!isVisibleBeforeEsc) {
      await headerBtn.click();
      await paywallModal.waitFor({ state: 'visible', timeout: 3000 });
    }

    // Test other non-dismissal keys first: Enter, Tab, ArrowDown
    console.log('  Action: Pressing Tab and ArrowDown keys (should NOT dismiss)...');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const isVisibleAfterOtherKeys = await paywallModal.isVisible();
    if (isVisibleAfterOtherKeys) {
      recordPass('Non-Escape Key Press', 'Keys other than Escape do NOT dismiss modal');
    } else {
      recordFail('Non-Escape Key Press', 'Modal closed on non-Escape key');
    }

    // Press Escape
    console.log('  Action: Pressing Escape key on open modal...');
    await page.keyboard.press('Escape');
    await paywallModal.waitFor({ state: 'hidden', timeout: 3000 });
    const isVisibleAfterEsc = await paywallModal.isVisible();
    if (!isVisibleAfterEsc) {
      recordPass('Escape Key Dismissal (Header Entry)', 'Modal closed cleanly on Escape');
    } else {
      recordFail('Escape Key Dismissal (Header Entry)', 'Modal remained open after Escape');
    }

    // Reopen modal from More Screen and test Escape key again
    console.log('  Action: Opening modal from More screen and testing Escape key...');
    await page.locator('[data-testid="bottom-nav-more"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="more-open-paywall-btn"]').click();
    await paywallModal.waitFor({ state: 'visible', timeout: 3000 });

    await page.keyboard.press('Escape');
    await paywallModal.waitFor({ state: 'hidden', timeout: 3000 });
    const isVisibleAfterMoreEsc = await paywallModal.isVisible();
    if (!isVisibleAfterMoreEsc) {
      recordPass('Escape Key Dismissal (More Screen Entry)', 'Modal closed cleanly on Escape');
    } else {
      recordFail('Escape Key Dismissal (More Screen Entry)', 'Modal remained open after Escape');
    }

    // -------------------------------------------------------------
    // Test 5: Rapid Open-Close Stress Cycle
    // -------------------------------------------------------------
    console.log('\n--- Check 5: Stress Cycle (Multiple Open/Close Patterns) ---');
    // Return to Today screen via back button
    const backBtn = page.locator('text=Назад').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(400);
    }

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Open
      await headerBtn.click();
      await paywallModal.waitFor({ state: 'visible', timeout: 3000 });

      if (cycle === 1) {
        // Dismiss via close button
        await closeBtn.click();
      } else if (cycle === 2) {
        // Dismiss via backdrop
        await page.mouse.click(20, 20);
      } else {
        // Dismiss via Escape
        await page.keyboard.press('Escape');
      }

      await paywallModal.waitFor({ state: 'hidden', timeout: 3000 });
      const stillVisible = await paywallModal.isVisible();
      if (!stillVisible) {
        recordPass(`Stress Cycle ${cycle}`, `Dismissal method ${cycle === 1 ? 'Button' : cycle === 2 ? 'Backdrop' : 'Escape'} succeeded`);
      } else {
        recordFail(`Stress Cycle ${cycle}`, `Modal remained open in cycle ${cycle}`);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log('\n===============================================================');
  console.log('📊 R2 AUDIT SUMMARY:');
  console.log(`- Tests Passed: ${results.testsPassed}`);
  console.log(`- Tests Failed: ${results.testsFailed}`);
  console.log('===============================================================\n');

  return results;
}

runR2Challenge()
  .then((res) => {
    process.exit(res.testsFailed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Fatal audit harness error:', err);
    process.exit(2);
  });
