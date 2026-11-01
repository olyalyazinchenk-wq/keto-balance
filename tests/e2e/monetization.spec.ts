import { test, expect, passNewUserStartGate } from './pilot.fixture';

test.describe('E4: Monetization, Paywall and Premium Subscription Flow', () => {
  test('Test 1: Onboarding with Start Gate -> Settings submission -> Header badge displays Free/Базовый status -> Clicking badge opens PaywallModal -> Verifying tariff options and value proposition', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 8101, first_name: 'MonetizationTest1' });

    // 1. Open app and pass Start Gate
    await page.goto('/');
    await passNewUserStartGate(page);

    // 2. Configure initial settings
    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    await expect(settingsForm).toBeVisible({ timeout: 10000 });

    const confirm18 = page.locator('[data-testid="settings-confirmed-18"]');
    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await expect(confirm18).toBeChecked();
    await expect(submitBtn).toBeEnabled();

    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();

    const [userSaveRes, shopSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      submitBtn.click(),
    ]);

    expect(userSaveRes.status()).toBe(200);
    expect(shopSaveRes.status()).toBe(200);

    // 3. Arrive at Today screen
    const todayScreen = page.locator('[data-testid="food-today"]');
    await expect(todayScreen).toBeVisible({ timeout: 10000 });

    // 4. Verify Free status in Header (no Premium badge, "⭐ Получить Premium" button is present)
    const headerPremiumBtn = page.locator('[data-testid="header-premium-btn"]');
    await expect(headerPremiumBtn).toBeVisible();
    await expect(headerPremiumBtn).toContainText('Получить Premium');
    await expect(page.locator('[data-testid="header-premium-badge"]')).not.toBeVisible();

    // 5. Click header button to open PaywallModal
    await headerPremiumBtn.click();
    const paywallModal = page.locator('[data-testid="paywall-modal"]');
    await expect(paywallModal).toBeVisible({ timeout: 5000 });

    // 6. Verify value proposition and benefits
    await expect(paywallModal).toContainText('Открой свой Кето Баланс');
    await expect(paywallModal).toContainText('Что входит в Premium:');
    await expect(paywallModal).toContainText('37+ авторских рецептов');
    await expect(paywallModal).toContainText('Персональные рационы');
    await expect(paywallModal).toContainText('Умный список покупок');
    await expect(paywallModal).toContainText('Конструктор блюд');

    // 7. Verify single approved release tariff (1 900 ₽ / month) and absence of discontinued products
    const tariffMonth = paywallModal.locator('[data-testid="tariff-card-sub_month"]');
    await expect(tariffMonth).toBeVisible();
    await expect(tariffMonth).toContainText('1 900 ₽');
    await expect(tariffMonth).toContainText('👑 Кето Баланс Premium');

    const tariffPlateau = paywallModal.locator('[data-testid="tariff-card-plateau_guide"]');
    await expect(tariffPlateau).not.toBeVisible();

    const tariffVip = paywallModal.locator('[data-testid="tariff-card-vip_care"]');
    await expect(tariffVip).not.toBeVisible();

    // Cleanly close modal
    await page.locator('[data-testid="paywall-close-btn"]').click();
    await expect(paywallModal).toBeHidden();
  });

  test('Test 2: Tariff selection -> Activating demo/test payment -> Instant transition of profile to Premium -> Header badge updates to Premium -> Paywall closes', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 8102, first_name: 'MonetizationTest2' });

    // 1. Open app and pass Start Gate
    await page.goto('/');
    await passNewUserStartGate(page);

    // 2. Configure settings
    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    await expect(settingsForm).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.locator('[data-testid="submit-settings-btn"]').click(),
    ]);

    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });

    // 3. Open PaywallModal
    await page.locator('[data-testid="header-premium-btn"]').click();
    const paywallModal = page.locator('[data-testid="paywall-modal"]');
    await expect(paywallModal).toBeVisible();

    // 4. Verify single approved tariff selection
    const monthlyCard = paywallModal.locator('[data-testid="tariff-card-sub_month"]');
    await expect(monthlyCard).toBeVisible();
    await monthlyCard.click();
    await expect(monthlyCard).toContainText('👑 Кето Баланс Premium');

    // 5. Activate payment via buy CTA button and wait for backend responses
    const [purchaseRes, confirmRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/subscription/purchase') && res.request().method() === 'POST'),
      page.waitForResponse((res) => res.url().includes('/api/subscription/confirm-demo') && res.request().method() === 'POST'),
      page.locator('[data-testid="paywall-buy-btn"]').click(),
    ]);

    expect(purchaseRes.status()).toBe(200);
    expect(confirmRes.status()).toBe(200);

    // 6. Paywall closes automatically on successful activation
    await expect(paywallModal).toBeHidden({ timeout: 5000 });

    // 7. Verify instant transition of Header badge to Premium
    const headerPremiumBadge = page.locator('[data-testid="header-premium-badge"]');
    await expect(headerPremiumBadge).toBeVisible();
    await expect(headerPremiumBadge).toContainText('👑 Premium');
    await expect(page.locator('[data-testid="header-premium-btn"]')).not.toBeVisible();

    // 8. Verify Premium status on More screen
    await page.locator('[data-testid="bottom-nav-more"]').click();
    const moreScreen = page.locator('[data-testid="more-screen"]');
    await expect(moreScreen).toBeVisible();
    await expect(page.locator('[data-testid="more-premium-badge"]')).toBeVisible();
    await expect(moreScreen).toContainText('👑 Кето Баланс Premium');
    await expect(moreScreen).toContainText('Ваша подписка активна');
  });

  test('Test 3: Modal dismissal mechanisms -> Verify closing PaywallModal via backdrop overlay click, ESC key, and close button', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 8103, first_name: 'MonetizationTest3' });

    await page.goto('/');
    await passNewUserStartGate(page);

    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    await expect(settingsForm).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.locator('[data-testid="submit-settings-btn"]').click(),
    ]);

    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });
    const paywallModal = page.locator('[data-testid="paywall-modal"]');

    // Dismissal Mechanism 1: Close button (✕)
    await page.locator('[data-testid="header-premium-btn"]').click();
    await expect(paywallModal).toBeVisible();
    await page.locator('[data-testid="paywall-close-btn"]').click();
    await expect(paywallModal).toBeHidden();

    // Dismissal Mechanism 2: Keyboard Escape key
    await page.locator('[data-testid="header-premium-btn"]').click();
    await expect(paywallModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(paywallModal).toBeHidden();

    // Dismissal Mechanism 3: Backdrop overlay click (outside modal card at x: 15, y: 15)
    await page.locator('[data-testid="header-premium-btn"]').click();
    await expect(paywallModal).toBeVisible();
    await page.mouse.click(15, 15);
    await expect(paywallModal).toBeHidden();
  });

  test('Test 4: Demo user 1084557944 pre-seeded or demo subscription verification via API and UI', async ({
    createSession,
    request,
  }) => {
    let sessionToken = '';
    const session = await createSession({
      id: 1084557944,
      first_name: 'Ольга',
      username: 'demo_owner',
    });
    const { page } = session;

    // Capture authenticated session token from backend response
    page.on('response', async (response) => {
      if (response.url().includes('/api/session') && response.request().method() === 'POST') {
        try {
          const body = await response.json();
          if (body.session_token) sessionToken = body.session_token;
        } catch {}
      }
    });

    await page.goto('/');
    await passNewUserStartGate(page);

    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    if (await settingsForm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.locator('[data-testid="settings-approach-keto"]').click();
      await page.locator('[data-testid="settings-time-30"]').click();
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
        page.locator('[data-testid="submit-settings-btn"]').click(),
      ]);
    }

    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });

    // Verify initial subscription status via API
    if (sessionToken) {
      const apiResBefore = await request.get('/api/subscription', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(apiResBefore.status()).toBe(200);
      const subJsonBefore = await apiResBefore.json();
      expect(subJsonBefore.available_products.length).toBeGreaterThan(0);
    }

    // Open Paywall and activate demo subscription
    await page.locator('[data-testid="header-premium-btn"]').click();
    const paywallModal = page.locator('[data-testid="paywall-modal"]');
    await expect(paywallModal).toBeVisible();

    // Activate subscription via instant demo activate button
    const [purchaseRes, confirmRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/subscription/purchase') && res.request().method() === 'POST'),
      page.waitForResponse((res) => res.url().includes('/api/subscription/confirm-demo') && res.request().method() === 'POST'),
      page.locator('[data-testid="paywall-demo-activate-btn"]').click(),
    ]);
    expect(purchaseRes.status()).toBe(200);
    expect(confirmRes.status()).toBe(200);

    // Paywall closes and header updates to Premium
    await expect(paywallModal).toBeHidden({ timeout: 5000 });
    await expect(page.locator('[data-testid="header-premium-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="header-premium-badge"]')).toContainText('👑 Premium');

    // Verify subscription status via API now reflects active premium
    if (sessionToken) {
      const apiResAfter = await request.get('/api/subscription', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(apiResAfter.status()).toBe(200);
      const subJsonAfter = await apiResAfter.json();
      expect(subJsonAfter.is_premium).toBe(true);
      expect(subJsonAfter.status).toBe('active');
      expect(subJsonAfter.tier).toBe('sub_month');
    }

    // Persistence check: Reloading the page retains active premium badge and bypasses onboarding
    await page.reload();
    await expect(page.locator('[data-testid="start-gate-screen"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="header-premium-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="header-premium-badge"]')).toContainText('👑 Premium');
  });
});
