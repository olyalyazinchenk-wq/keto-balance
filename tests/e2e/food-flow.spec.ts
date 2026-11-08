import { test, expect, passNewUserStartGate } from './pilot.fixture';

test.describe('E1: Food-First End-to-End User Flow', () => {
  test('New user configures preferences, reviews menu, replaces recipe, opens detail, and reviews shopping', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 3001, first_name: 'OlgaTester' });

    // 1. Open app
    await page.goto('/');
    await passNewUserStartGate(page);

    // 2. Settings form is presented for new user
    const form = page.locator('[data-testid="pilot-settings-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    // 18+ checkbox is pre-confirmed on Start Gate; submit button is enabled
    const confirm18 = page.locator('[data-testid="settings-confirmed-18"]');
    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await expect(confirm18).toBeChecked();
    await expect(submitBtn).toBeEnabled();

    // Select approach and restrictions
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();

    // Submit settings and wait for server saves
    const [userSaveRes, shopSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      submitBtn.click(),
    ]);

    expect(userSaveRes.status()).toBe(200);
    expect(shopSaveRes.status()).toBe(200);

    // 3. Today screen appears
    const todayScreen = page.locator('[data-testid="food-today"]');
    await expect(todayScreen).toBeVisible();

    // 4. Navigate to Menu
    await page.locator('[data-testid="bottom-nav-menu"]').click();
    const menuScreen = page.locator('[data-testid="food-menu-screen"]');
    await expect(menuScreen).toBeVisible();

    // 5. Select Day 2 (switch to Week 1 if week selector is visible)
    const week1Tab = page.locator('[data-testid="menu-week-tab-0"]');
    if (await week1Tab.isVisible()) {
      await week1Tab.click();
    }
    const day2Tab = page.locator('[data-testid="menu-day-tab-1"]');
    await expect(day2Tab).toBeVisible();
    await day2Tab.click();

    // 6. Replace breakfast slot
    const replaceBtn = page.locator('[data-testid="replace-slot-btn-breakfast"]');
    await expect(replaceBtn).toBeVisible();
    await replaceBtn.click();

    // Modal dialog appears
    const replaceModal = page.locator('.fm-dialog');
    await expect(replaceModal).toBeVisible();

    // Choose replacement candidate recipe (button "Поставить в план")
    const candidateBtn = replaceModal.getByRole('button', { name: 'Поставить в план' }).first();
    await candidateBtn.click();

    // 7. Open recipe details
    const openBtn = page.locator('[data-testid="open-recipe-btn-breakfast"]');
    await openBtn.click();

    const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
    await expect(recipeScreen).toBeVisible();
    await expect(recipeScreen.locator('h1')).not.toBeEmpty();

    // Verify unverified nutrient status
    await expect(recipeScreen).toContainText('КБЖУ');

    // Test 4-portion scaling in recipe
    const portion4Btn = recipeScreen.locator('[data-testid="recipe-portions-4x"]');
    await expect(portion4Btn).toBeVisible();
    await portion4Btn.click();
    await expect(recipeScreen).toContainText('4');

    // 8. Navigate to Shopping
    await page.locator('[data-testid="bottom-nav-shopping"]').click();
    const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
    await expect(shoppingScreen).toBeVisible();

    // Scale shopping to 4 portions
    const shop4Btn = shoppingScreen.locator('[data-testid="shopping-portions-4x"]');
    await expect(shop4Btn).toBeVisible();
    await shop4Btn.click();

    // Shopping items are displayed
    const items = shoppingScreen.locator('[data-testid^="shopping-item-row-"]');
    await expect(items.first()).toBeVisible();
  });
});
