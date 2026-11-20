import { test, expect, passNewUserStartGate, activateSyntheticPremium } from './pilot.fixture';

for (const [index, options] of [
  { width: 390, theme: 'light' as const },
  { width: 320, theme: 'dark' as const },
].entries()) {
  test(`Client screens match their purpose at ${options.width}px ${options.theme}`, async ({ createSession }, testInfo) => {
    const session = await createSession({ id: 9700 + index, first_name: 'ClientCopy' }, {
      theme: options.theme, viewport: { width: options.width, height: 844 },
    });
    const { page } = session;
    await activateSyntheticPremium(session);
    await page.goto('/');
    await passNewUserStartGate(page);
    await expect(page.getByRole('heading', { name: 'Настройки питания', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-approach-carnivore')).toHaveCount(0);
    await page.getByTestId('settings-days-1').click();
    await page.getByTestId('settings-meals-2').click();
    await page.getByTestId('settings-restriction-exclude_fish').check();
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();

    const suffix = `${options.width}-${options.theme}`;
    const settingsLink = page.getByTestId('home-open-settings-btn');
    await expect(settingsLink).toHaveText('Настройки питания→');
    await settingsLink.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`today-${suffix}.png`) });
    await settingsLink.click();
    await expect(page.getByRole('heading', { name: 'Настройки питания', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-restriction-exclude_fish')).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath(`settings-${suffix}.png`), fullPage: true });
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();

    await page.getByTestId('bottom-nav-more').click();
    const more = page.getByTestId('more-screen');
    await expect(more).toBeVisible();
    await expect(page.getByTestId('more-open-settings-btn')).toHaveText('Настройки питания→');
    await expect(more).not.toContainText(/first_entry|shopping_stale|unverified_nutrition|save_conflict|localStorage|серверн.+сесси|прототип|12 русских|карнивор|синхронизац/i);
    await expect(page.getByRole('button', { name: /Очистить локальные|Проверить все 12/ })).toHaveCount(0);
    await expect(page.getByTestId('privacy-info')).toContainText('сохраняются на сервере');
    await page.screenshot({ path: testInfo.outputPath(`more-${suffix}.png`) });

    const rules = page.getByTestId('keto-rules');
    await rules.locator('summary').click();
    await expect(rules.getByRole('heading', { name: 'Что можно есть' })).toBeVisible();
    await expect(rules.getByRole('heading', { name: 'Что мы ограничиваем в кето-меню' })).toBeVisible();
    await expect(rules.getByRole('heading', { name: 'Что исключаем из стандартного меню приложения' })).toBeVisible();
    await expect(rules).toContainText('50 г чистых углеводов');
    await expect(page.getByTestId('pilot-settings-form')).toHaveCount(0);
    await rules.locator('summary').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath(`rules-${suffix}.png`) });
    await rules.getByRole('heading', { name: 'Как учитывать углеводы и порцию' }).evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: testInfo.outputPath(`portions-${suffix}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The same real form opens from More; source settings and exclusions are preserved.
    await page.getByTestId('more-open-settings-btn').click();
    await expect(page.getByRole('heading', { name: 'Настройки питания', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-restriction-exclude_fish')).toBeChecked();
    await expect(page.locator('body')).not.toContainText(/Правила питания|Карнивор/i);
  });
}
