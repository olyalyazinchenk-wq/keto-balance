import { test, expect, passNewUserStartGate, activateSyntheticPremium } from './pilot.fixture';

for (const width of [320, 390]) {
  test(`Home learning cards, Back and settings return at ${width}px`, async ({ createSession }) => {
    const session = await createSession({ id: 9800 + width, first_name: 'Navigation' }, { viewport: { width, height: 844 } });
    const { page } = session;
    await activateSyntheticPremium(session);
    // The public API currently withholds drafts. Exercise detail navigation with synthetic guides.
    await page.route('**/api/education/guides', route => route.fulfill({
      json: {
        guides: [
          { id: 'reading_labels', title: 'Упаковка', category: 'Тест', summary: 'Тест урока', content: 'Пример урока', sources: [] },
          { id: 'portion_control', title: 'Одна, две', category: 'Тест', summary: 'Тест гайда', content: 'Пример гайда', sources: [] },
        ],
      },
    }));
    await page.goto('/');
    await passNewUserStartGate(page);
    await page.getByTestId('settings-days-7').click();
    await page.getByTestId('submit-settings-btn').click();
    for (const name of ['rules', 'education', 'guides']) {
      const link = page.getByTestId(`home-open-${name}`);
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
      await link.click();
      const screen = page.getByTestId(`${name}-screen`);
      await expect(screen).toBeVisible();
      if (name === 'rules') await expect(screen.getByRole('heading', { name: 'Что можно есть' })).toBeVisible();
      else {
        await expect(screen.getByTestId('education-guides-container')).toBeVisible();
        const search = screen.getByTestId('guides-search-input');
        await search.fill(name === 'education' ? 'Упаковка' : 'Одна, две');
        const cards = screen.locator('[data-testid^="guide-card-"]');
        await expect(cards).toHaveCount(1);
        await cards.first().getByRole('button').first().click();
        await expect(screen.getByText('← Назад к списку', { exact: true })).toBeVisible();
        await page.getByTestId('app-back-button').click();
        await expect(screen).toBeVisible();
        await expect(screen.getByText('← Назад к списку', { exact: true })).toHaveCount(0);
        await expect(search).toHaveValue(name === 'education' ? 'Упаковка' : 'Одна, две');
      }
      await page.getByTestId('app-back-button').click();
      await expect(page.getByTestId('food-today')).toBeVisible();
    }
    await page.getByTestId('home-open-lifehacks').click();
    const lifehacks = page.getByTestId('lifehacks-screen');
    await expect(lifehacks.locator('[data-testid^="lifehack-"]')).toHaveCount(13);
    await lifehacks.getByTestId('lifehacks-search').fill('биотин');
    const biotin = lifehacks.getByTestId('lifehack-biotin');
    await biotin.getByRole('button').click();
    await expect(biotin.getByText(/тропонина/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId('app-back-button').click();
    await expect(page.getByTestId('food-today')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`home-${width}.png`) });
    await page.getByTestId('bottom-nav-menu').click();
    const menu = page.getByTestId('food-menu-screen');
    await expect(menu).toBeVisible();
    const recipeButton = menu.getByRole('button', { name: /Открыть рецепт|Смотреть рецепт/ }).first();
    await recipeButton.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await recipeButton.click();
    await page.getByTestId('app-back-button').click();
    await expect(menu).toBeVisible();
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(8);
    await menu.getByRole('button', { name: 'Настройки питания' }).click();
    await page.getByTestId('settings-back-to-home').click();
    await expect(page.getByTestId('food-menu-screen')).toBeVisible();
    // A recipe opened directly still has a working in-app Back fallback.
    await page.goto('/?screen=recipe&recipe=k1');
    await expect(page.getByTestId('app-back-button')).toBeVisible();
    await page.getByTestId('app-back-button').click();
    await expect(page.getByTestId('food-menu-screen')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
