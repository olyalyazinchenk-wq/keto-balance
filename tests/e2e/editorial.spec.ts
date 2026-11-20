import { activateSyntheticPremium, expect, passNewUserStartGate, test } from './pilot.fixture';

for (const width of [320, 375, 390, 430, 768]) {
  test(`Editorial home, Compass, catalog and recipe at ${width}px`, async ({ createSession }, testInfo) => {
    const { page } = await createSession(
      { id: 970000 + width, first_name: 'Editorial' },
      { viewport: { width, height: width === 320 ? 440 : 844 }, theme: width === 375 ? 'dark' : 'light' },
    );
    await page.goto('/');
    await passNewUserStartGate(page);
    await page.getByTestId('submit-settings-btn').click();

    const home = page.getByTestId('food-today');
    const compassButton = home.getByRole('button', { name: 'Подобрать блюдо' });
    await expect(compassButton).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button')).toHaveText(['Главная','Рецепты','Меню','Ещё']);
    if (width === 320) {
      const cta = await compassButton.boundingBox();
      const nav = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox();
      expect(cta!.y + cta!.height).toBeLessThanOrEqual(nav!.y);
      expect(await compassButton.evaluate(button => {
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
    }
    if (width === 320 || width === 390) await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: width === 390 });
    await compassButton.click();
    const compass = page.getByTestId('editorial-compass');
    await compass.getByRole('button', { name: 'Хочется уютного завтрака' }).click();
    const firstResult = compass.locator('.editorial-recipe-row').first();
    const changeOccasion = compass.getByRole('button', { name: 'Изменить' });
    await expect(changeOccasion).toHaveAttribute('aria-expanded', 'false');
    if (width === 320) {
      const result = await firstResult.boundingBox();
      const nav = await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox();
      expect(result!.y + result!.height).toBeLessThanOrEqual(nav!.y);
    }
    if (width === 390) {
      await page.screenshot({ path: testInfo.outputPath('compass.png') });
      await changeOccasion.click();
      await compass.getByRole('button', { name: 'Хочу красивый ужин' }).click();
      await expect(compass.getByRole('status')).toContainText('Среди доступных вам рецептов');
      await changeOccasion.click();
      await compass.getByRole('button', { name: 'Хочется уютного завтрака' }).click();
    }
    await firstResult.click();
    await expect(page.getByTestId('food-recipe-screen')).toBeVisible();
    await page.getByTestId('app-back-button').click();
    await expect(compass.getByText('Уютный завтрак', { exact: true })).toBeVisible();
    await expect(changeOccasion).toHaveAttribute('aria-expanded', 'false');
    await changeOccasion.click();
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

test('Short dinner journey keeps focus, ingredient checks and recipe shopping in sync', async ({ createSession }, testInfo) => {
  const session = await createSession(
    { id: 970840, first_name: 'Editorial' },
    { viewport: { width: 390, height: 600 } },
  );
  await activateSyntheticPremium(session);
  const { page } = session;
  await page.goto('/');
  await passNewUserStartGate(page);
  await page.getByTestId('submit-settings-btn').click();

  const cta = page.getByRole('button', { name: 'Подобрать блюдо' });
  await expect(cta).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-home.png') });
  await cta.focus();
  await page.keyboard.press('Enter');

  const compass = page.getByTestId('editorial-compass');
  const dinner = compass.getByRole('button', { name: 'Хочу красивый ужин' });
  await dinner.focus();
  await page.keyboard.press('Enter');
  const change = compass.getByRole('button', { name: 'Изменить' });
  await expect(change).toBeFocused();
  await expect(change).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: testInfo.outputPath('02-compass.png') });
  const salad = compass.getByRole('button', { name: /Салат с тунцом, яйцом и огурцом/ });
  await salad.click();

  const recipe = page.getByTestId('food-recipe-screen');
  const photo = recipe.locator('.editorial-detail-photo');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const quantities = new Set<string>();
  const firstIngredient = recipe.getByTestId('recipe-ingredient-row-0');
  for (const portion of [1, 4, 2]) {
    const option = recipe.getByTestId(`recipe-portions-${portion}x`);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    quantities.add(await firstIngredient.locator('span').first().innerText());
  }
  expect(quantities.size).toBe(3);
  await firstIngredient.click();
  const plate = recipe.getByTestId('recipe-plate');
  const firstIngredientBox = await firstIngredient.boundingBox();
  const plateBox = await plate.boundingBox();
  expect(firstIngredientBox!.y + firstIngredientBox!.height).toBeLessThan(plateBox!.y);
  await expect(plate.getByRole('button', { name: /подготовлено/i }).first()).toBeVisible();
  await recipe.locator('#editorial-ingredients').evaluate(node => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('03-recipe.png') });

  const shoppingButton = recipe.getByTestId('recipe-to-shopping');
  await expect(shoppingButton).toContainText('2 порции');
  const [save] = await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/shopping') && response.request().method() === 'PUT'),
    shoppingButton.click(),
  ]);
  expect(save.status()).toBe(200);
  const shopping = page.getByTestId('food-shopping-screen').filter({ visible: true });
  await expect(shopping.getByRole('status').filter({ hasText: 'Добавлено в покупки' })).toContainText('2 порции');
  await page.screenshot({ path: testInfo.outputPath('04-shopping.png') });

  await page.getByTestId('app-back-button').click();
  await expect(recipe.getByTestId('recipe-portions-2x')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('app-back-button').click();
  await expect(compass.getByText('Красивый ужин', { exact: true })).toBeVisible();
  await expect(change).toHaveAttribute('aria-expanded', 'false');

  // Browser zoom also tests wrapping when available space is reduced.
  await page.getByTestId('food-app-shell').evaluate(shell => { shell.style.zoom = '1.25'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByTestId('food-app-shell').evaluate(shell => { shell.style.zoom = ''; });

  await page.route('**/api/shopping', route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await salad.click();
  await shoppingButton.click();
  await expect(page.getByTestId('pilot-sync-banner')).toContainText('Не удалось сохранить');
  await expect(shopping.getByText(/Добавлено в покупки/)).toHaveCount(0);

  // In a fresh context the browser cannot display the previously decoded image.
  const { page: reopened } = await createSession({ id: 970840, first_name: 'Editorial' });
  await reopened.route('**/tuna-egg-cucumber-salad.webp', route => route.fulfill({ status: 404 }));
  await reopened.goto('/');
  await reopened.getByRole('button', { name: 'Подобрать блюдо' }).click();
  await reopened.getByRole('button', { name: 'Хочу красивый ужин' }).click();
  await reopened.getByRole('button', { name: /Салат с тунцом, яйцом и огурцом/ }).click();
  await expect(reopened.getByTestId('food-recipe-screen').getByText('Фото блюда готовится')).toBeVisible();
});
