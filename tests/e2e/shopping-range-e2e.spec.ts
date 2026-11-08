import { test, expect, passNewUserStartGate } from './pilot.fixture';

test.describe('E4: Shopping Range Selection & Isolated Checkmarks Persistence', () => {
  test('selects week 1, checks item, switches to week 2, tests custom range, restores in fresh context', async ({
    createSession,
  }) => {
    // === PHASE 1: Session 1 for User 5001 ===
    const session1 = await createSession({ id: 5001, first_name: 'RangeUser' });
    const page1 = session1.page;

    await page1.goto('/');
    await passNewUserStartGate(page1);

    // Complete settings form with 30-day plan
    await page1.locator('[data-testid="settings-approach-keto"]').click();
    await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page1.locator('[data-testid="submit-settings-btn"]').click(),
    ]);

    await expect(page1.locator('[data-testid="food-today"]')).toBeVisible();

    // Navigate to Shopping
    await page1.locator('[data-testid="bottom-nav-shopping"]').click();
    await expect(page1.locator('[data-testid="food-shopping-screen"]')).toBeVisible();

    // Verify range selector is available for 30-day plan
    const rangeSelector = page1.locator('[data-testid="shopping-range-selector"]');
    await expect(rangeSelector).toBeVisible();

    // Select Week 1
    const week0Btn = page1.locator('[data-testid="shopping-range-week-0"]');
    await expect(week0Btn).toBeVisible();
    await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      week0Btn.click(),
    ]);

    // Check first item in store for Week 1
    const firstCheckBtn = page1.locator('[data-testid^="toggle-in-store-"]').first();
    await expect(firstCheckBtn).toBeVisible();
    const [checkSaveRes] = await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      firstCheckBtn.click(),
    ]);
    expect(checkSaveRes.status()).toBe(200);
    await expect(firstCheckBtn).toHaveAttribute('aria-pressed', 'true');

    // Switch to Week 2
    const week1Btn = page1.locator('[data-testid="shopping-range-week-1"]');
    await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      week1Btn.click(),
    ]);

    // In Week 2, checkmarks from Week 1 must NOT be smeared
    const week2FirstCheckBtn = page1.locator('[data-testid^="toggle-in-store-"]').first();
    await expect(week2FirstCheckBtn).toBeVisible();
    await expect(week2FirstCheckBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to Custom Range
    const customBtn = page1.locator('[data-testid="shopping-range-custom"]');
    await customBtn.click();

    const startInput = page1.locator('[data-testid="custom-range-start"]');
    const endInput = page1.locator('[data-testid="custom-range-end"]');
    const applyBtn = page1.locator('[data-testid="custom-range-apply"]');

    await startInput.fill('2026-11-01');
    await endInput.fill('2026-11-03');

    const [customRangeSaveRes] = await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      applyBtn.click(),
    ]);
    expect(customRangeSaveRes.status()).toBe(200);

    // Close session 1 context completely
    await session1.context.close();

    // === PHASE 2: Fresh Context Session 2 for Same User ===
    const session2 = await createSession({ id: 5001, first_name: 'RangeUser' });
    const page2 = session2.page;

    await page2.goto('/');
    await expect(page2.locator('[data-testid="food-today"]')).toBeVisible();

    // Open Shopping
    await page2.locator('[data-testid="bottom-nav-shopping"]').click();
    await expect(page2.locator('[data-testid="food-shopping-screen"]')).toBeVisible();

    // Custom range should be restored
    await expect(page2.locator('[data-testid="shopping-range-custom"]')).toBeVisible();
    await expect(page2.locator('[data-testid="custom-range-start"]')).toHaveValue('2026-11-01');
    await expect(page2.locator('[data-testid="custom-range-end"]')).toHaveValue('2026-11-03');

    // Switch back to Week 1 to verify checkmark restored
    const week0RestoreBtn = page2.locator('[data-testid="shopping-range-week-0"]');
    await Promise.all([
      page2.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      week0RestoreBtn.click(),
    ]);

    const restoredCheckBtn = page2.locator('[data-testid^="toggle-in-store-"]').first();
    await expect(restoredCheckBtn).toHaveAttribute('aria-pressed', 'true');

    // Test 409 conflict handling directly via API on this user
    const token = await page2.evaluate(() => {
      return (window as any).__ketoClient?.getToken() || localStorage.getItem('kb_session_token');
    });

    if (token) {
      const conflictResp = await page2.request.put('http://127.0.0.1:18080/api/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          schema_version: 1,
          expected_revision: 0, // Stale revision, server is at 4+
          profile: { settings: { confirmed18Plus: true, approach: 'keto' } },
        },
      });
      expect(conflictResp.status()).toBe(409);
    }

    await session2.context.close();
  });
});
