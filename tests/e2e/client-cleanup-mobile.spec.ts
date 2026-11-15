import { test, expect, passNewUserStartGate, activateSyntheticPremium } from './pilot.fixture';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('docs/evidence/screenshots/client-cleanup-20261115');

for (const [index, options] of [
  { width: 390, theme: 'light' as const },
  { width: 320, theme: 'dark' as const },
].entries()) {
  test(`Client screens match their purpose at ${options.width}px ${options.theme}`, async ({ createSession }) => {
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
    fs.mkdirSync(output, { recursive: true });
    const settingsLink = page.getByTestId('home-open-settings-btn');
    await expect(settingsLink).toHaveText('Настройки питания→');
    await settingsLink.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `today-${suffix}.png`) });
    await settingsLink.click();
    await expect(page.getByRole('heading', { name: 'Настройки питания', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-restriction-exclude_fish')).toBeChecked();
    await page.screenshot({ path: path.join(output, `settings-${suffix}.png`), fullPage: true });
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();

    await page.getByTestId('bottom-nav-more').click();
    const more = page.getByTestId('more-screen');
    await expect(more).toBeVisible();
    await expect(page.getByTestId('more-open-settings-btn')).toHaveText('Настройки питания→');
    await expect(more).not.toContainText(/first_entry|shopping_stale|unverified_nutrition|save_conflict|localStorage|серверн.+сесси|прототип|12 русских|карнивор|синхронизац/i);
    await expect(page.getByRole('button', { name: /Очистить локальные|Проверить все 12/ })).toHaveCount(0);
    await expect(page.getByTestId('privacy-info')).toContainText('сохраняются на сервере');
    await page.screenshot({ path: path.join(output, `more-${suffix}.png`) });

    const rules = page.getByTestId('keto-rules');
    await rules.locator('summary').click();
    await expect(rules.locator('h3')).toHaveCount(4);
    await expect(rules).toContainText('Это не медицинские запреты');
    await expect(page.getByTestId('pilot-settings-form')).toHaveCount(0);
    await rules.locator('summary').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, `rules-${suffix}.png`) });
    await rules.locator('h3').last().evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, `portions-${suffix}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The same real form opens from More; source settings and exclusions are preserved.
    await page.getByTestId('more-open-settings-btn').click();
    await expect(page.getByRole('heading', { name: 'Настройки питания', exact: true })).toBeVisible();
    await expect(page.getByTestId('settings-restriction-exclude_fish')).toBeChecked();
    await expect(page.locator('body')).not.toContainText(/Правила питания|Карнивор/i);
  });
}
