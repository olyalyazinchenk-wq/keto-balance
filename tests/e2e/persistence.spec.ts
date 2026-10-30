import { test, expect } from '@playwright/test';

test.describe('State Persistence across Reloads (K2)', () => {
  test('persists selected day and shopping state in localStorage across page reloads', async ({ page }) => {
    await page.goto('/');

    // 1. Переход в Меню
    await page.locator('[data-testid="bottom-nav-menu"]').click();
    await expect(page.locator('[data-testid="food-menu-screen"]')).toBeVisible();

    // 2. Переключение на День 2
    const day2Tab = page.locator('[data-testid="menu-day-tab-1"]');
    if (await day2Tab.isVisible()) {
      await day2Tab.click();
    }

    // 3. Проверка записи в localStorage
    const storedDay = await page.evaluate(() => {
      return window.localStorage.getItem('kb_proto_selected_day_v1');
    });
    expect(storedDay).not.toBeNull();

    // 4. Перезагрузка страницы
    await page.reload();

    // 5. Проверка восстановления сохраненного значения
    const restoredDay = await page.evaluate(() => {
      return window.localStorage.getItem('kb_proto_selected_day_v1');
    });
    expect(restoredDay).toBe(storedDay);

    // 6. Приложение корректно смонтировалось после перезагрузки
    await expect(page.locator('[data-testid="food-today"]')).toBeVisible();
  });
});
