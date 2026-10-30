import { test, expect } from '@playwright/test';

test.describe('Food-First Core User Journey (K2)', () => {
  test('navigates seamlessly across Today -> Menu -> Recipe -> Shopping', async ({ page }) => {
    // 1. Открытие главного экрана
    await page.goto('/');
    await expect(page).toHaveTitle(/Кето Баланс/);

    // 2. Экран Сегодня отображается
    const todayScreen = page.locator('[data-testid="food-today"]');
    await expect(todayScreen).toBeVisible();

    // 3. Переход в Меню через нижнюю навигацию
    const menuNav = page.locator('[data-testid="bottom-nav-menu"]');
    await menuNav.click();

    const menuScreen = page.locator('[data-testid="food-menu-screen"]');
    await expect(menuScreen).toBeVisible();

    // 4. Открытие первого рецепта (завтрак)
    const openRecipeBtn = page.locator('[data-testid="open-recipe-btn-breakfast"]');
    await expect(openRecipeBtn).toBeVisible();
    await openRecipeBtn.click();

    // 5. Экран рецепта открыт и отображает ингредиенты
    const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
    await expect(recipeScreen).toBeVisible();
    await expect(page.locator('[data-testid="recipe-back-btn"]')).toBeVisible();

    // 6. Переход в Покупки через нижнюю навигацию
    const shoppingNav = page.locator('[data-testid="bottom-nav-shopping"]');
    await shoppingNav.click();

    // 7. Экран покупок открыт и отображает агрегированные позиции
    const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
    await expect(shoppingScreen).toBeVisible();
  });
});
