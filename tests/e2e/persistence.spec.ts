import { test, expect, passNewUserStartGate } from './pilot.fixture';

test.describe('E2: Server-Side State Persistence Across Contexts', () => {
  test('persists state on server and restores accurately in fresh browser context without local cache', async ({
    createSession,
  }) => {
    // === PHASE 1: User A Session 1 ===
    const session1 = await createSession({ id: 4001, first_name: 'PersistUser' });
    const page1 = session1.page;

    await page1.goto('/');
    await passNewUserStartGate(page1);

    // Complete settings form
    await page1.locator('[data-testid="settings-approach-keto"]').click();
    await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page1.locator('[data-testid="submit-settings-btn"]').click(),
    ]);

    await expect(page1.locator('[data-testid="food-today"]')).toBeVisible();
    await page1.getByRole('dialog', { name: 'Совет дня' }).getByRole('button', { name: 'Понятно, закрыть' }).click();

    // Select Day 2 in Menu
    await page1.locator('[data-testid="bottom-nav-menu"]').click();
    await expect(page1.locator('[data-testid="food-menu-screen"]')).toBeVisible();

    const [daySelectRes] = await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page1.locator('[data-testid="menu-day-tab-1"]').click(),
    ]);
    expect(daySelectRes.status()).toBe(200);

    // Open Recipe and check step 1
    await page1.locator('[data-testid="open-recipe-btn-breakfast"]').click();
    await expect(page1.locator('[data-testid="food-recipe-screen"]')).toBeVisible();

    const [stepCheckRes] = await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page1.locator('[data-testid="recipe-start-step-btn"]').click(),
    ]);
    expect(stepCheckRes.status()).toBe(200);

    // Go to Shopping and add custom item
    await page1.locator('[data-testid="bottom-nav-shopping"]').click();
    await expect(page1.locator('[data-testid="food-shopping-screen"]')).toBeVisible();

    await page1.locator('[data-testid="shopping-add-custom-toggle-btn"]').click();
    await page1.getByPlaceholder(/Кокосовые сливки/i).fill('Оливковое масло Extra Virgin');
    await page1.getByPlaceholder(/200 мл/i).fill('500 мл');

    const [customSaveRes] = await Promise.all([
      page1.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      page1.getByRole('button', { name: 'Сохранить в список' }).click(),
    ]);
    expect(customSaveRes.status()).toBe(200);

    // Verify item is visible
    await expect(page1.locator('[data-testid="food-shopping-screen"]')).toContainText('Оливковое масло Extra Virgin');

    // Close session 1 context completely
    await session1.context.close();

    // === PHASE 2: Fresh Context A2 for Same User ===
    const session2 = await createSession({ id: 4001, first_name: 'PersistUser' });
    const page2 = session2.page;

    // Verify local storage is completely empty before navigation
    await page2.goto('/');

    // Should NOT show Start Gate or settings form because server restored profile
    await expect(page2.locator('[data-testid="start-gate-screen"]')).not.toBeVisible();
    await expect(page2.locator('[data-testid="pilot-settings-form"]')).not.toBeVisible();
    await expect(page2.locator('[data-testid="food-today"]')).toBeVisible();
    await page2.getByRole('dialog', { name: 'Совет дня' }).getByRole('button', { name: 'Понятно, закрыть' }).click();

    // Verify selected day restored
    await page2.locator('[data-testid="bottom-nav-menu"]').click();
    await expect(page2.locator('[data-testid="menu-day-tab-1"]')).toHaveAttribute('aria-selected', 'true');

    // Verify custom item restored in Shopping
    await page2.locator('[data-testid="bottom-nav-shopping"]').click();
    await expect(page2.locator('[data-testid="food-shopping-screen"]')).toContainText('Оливковое масло Extra Virgin');

    await session2.context.close();

    // === PHASE 3: User B Isolation ===
    const sessionB = await createSession({ id: 4002, first_name: 'DifferentUser' });
    const pageB = sessionB.page;

    await pageB.goto('/');
    // User B is fresh, must pass Start Gate before settings form appears
    await passNewUserStartGate(pageB);
    await expect(pageB.locator('[data-testid="pilot-settings-form"]')).toBeVisible();

    await sessionB.context.close();
  });
});
