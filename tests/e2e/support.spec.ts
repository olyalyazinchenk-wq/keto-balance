import { test, expect } from '@playwright/test';

test.describe('Support & Emergency Hotline (K2)', () => {
  test('opens support modal and verifies private support view', async ({ page }) => {
    await page.goto('/');

    // Кнопка помощи в шапке
    const helpBtn = page.locator('button.ff-proof__help-btn');
    await expect(helpBtn).toBeVisible();
    await helpBtn.click();

    // Экран поддержки открыт
    const supportSection = page.locator('[data-testid="private-support"]');
    await expect(supportSection).toBeVisible();
    await expect(supportSection.locator('h1')).toContainText('Написать Ольге');
  });
});
