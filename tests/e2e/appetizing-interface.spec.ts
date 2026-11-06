import { test, expect, passNewUserStartGate } from './pilot.fixture';

for (const width of [320, 390, 768, 1440]) {
  test('food journey remains usable at ' + width + 'px', async ({ createSession }) => {
    const { page } = await createSession({ id: 960000 + width, first_name: 'LayoutTest' });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    await passNewUserStartGate(page);
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const action = page.getByTestId('food-main-action');
    await expect(action).toBeInViewport();
    for (const [tab, screen] of [
      ['menu', 'food-menu-screen'],
      ['shopping', 'food-shopping-screen'],
      ['more', 'more-screen'],
      ['today', 'food-today'],
    ]) {
      await page.getByTestId('bottom-nav-' + tab).click();
      await expect(page.getByTestId(screen)).toBeVisible();
      if (tab === 'shopping') {
        const shop4x = page.getByTestId('shopping-portions-4x');
        await expect(shop4x).toBeVisible();
        await shop4x.click();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBeTruthy();
      await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(4);
    }
    await action.click();
    await expect(page.getByTestId('food-recipe-screen')).toBeVisible();
    const recipe4x = page.getByTestId('recipe-portions-4x');
    await expect(recipe4x).toBeVisible();
    await recipe4x.click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBeTruthy();
    await page.getByTestId('bottom-nav-more').click();
    await expect(page.getByText('Дневник появится позже')).toBeVisible();
  });
}
