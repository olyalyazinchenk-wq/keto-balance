import { expect, passNewUserStartGate, test } from './pilot.fixture';

for (const width of [320, 375, 390, 430, 768]) {
  test(`Editorial home, Compass, catalog and recipe at ${width}px`, async ({ createSession }, testInfo) => {
    const { page } = await createSession(
      { id: 970000 + width, first_name: 'Editorial' },
      { viewport: { width, height: 844 }, theme: width === 375 ? 'dark' : 'light' },
    );
    await page.goto('/');
    await passNewUserStartGate(page);
    await page.getByTestId('submit-settings-btn').click();

    const home = page.getByTestId('food-today');
    const compassButton = home.getByRole('button', { name: 'Подобрать блюдо' });
    await expect(compassButton).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button')).toHaveText(['Главная','Рецепты','Меню','Ещё']);
    if (width === 320 || width === 390) await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: width === 390 });
    await compassButton.click();
    const compass = page.getByTestId('editorial-compass');
    await compass.getByRole('button', { name: 'Хочется уютного завтрака' }).click();
    await compass.locator('.editorial-recipe-row').first().click();
    await expect(page.getByTestId('food-recipe-screen')).toBeVisible();
    await page.getByTestId('app-back-button').click();
    await expect(compass.getByRole('button', { name: 'Хочется уютного завтрака' })).toHaveAttribute('aria-pressed','true');

    await page.getByTestId('bottom-nav-catalog').click();
    const catalog = page.getByTestId('editorial-catalog');
    const search = catalog.getByRole('searchbox', { name: 'Поиск по рецептам' });
    await search.fill('несуществующее блюдо');
    await expect(catalog.getByRole('status')).toContainText('ничего не найдено');
    await search.fill('');
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true });
    const title = await catalog.locator('.editorial-recipe-row strong').first().textContent();
    await search.fill(title ?? '');
    await catalog.locator('.editorial-recipe-row').first().click();
    const recipe = page.getByTestId('food-recipe-screen');
    await expect(recipe.getByRole('heading', { name: title ?? '', exact: true })).toBeVisible();
    if (width === 390) await page.screenshot({ path: testInfo.outputPath('recipe.png'), fullPage: true });
    await recipe.getByTestId('recipe-portions-4x').click();
    const cooking = recipe.getByRole('button', { name: 'Приготовление', exact: true });
    await cooking.click();
    await expect(recipe.getByTestId('recipe-step-item-0')).toBeVisible();
    await recipe.getByRole('button', { name: 'Ингредиенты', exact: true }).click();
    await expect(recipe.getByTestId('recipe-step-item-0')).toBeHidden();
    await page.getByTestId('app-back-button').click();
    await expect(search).toHaveValue(title ?? '');
    await catalog.locator('.editorial-recipe-row').first().click();
    await expect(recipe.getByTestId('recipe-portions-4x')).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
