import { test, expect, passNewUserStartGate } from './pilot.fixture';

test('nutrient related navigation preserves search on mobile', async ({createSession}) => {
  const {page} = await createSession({id: 318765, first_name: 'Test'});
  await page.setViewportSize({width:375,height:812});
  await page.goto('/');
  await passNewUserStartGate(page);
  const form = page.locator('[data-testid="pilot-settings-form"]');
  if (await form.isVisible()) {
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();
    await page.locator('[data-testid="submit-settings-btn"]').click();
  }
  const nav=page.getByTestId('nutrient-navigator');
  await nav.locator(':scope > summary').click();
  await nav.getByLabel('Поиск нутриента').fill('калий');
  await nav.getByRole('button',{name:'Правила кето'}).click();
  await expect(page.getByTestId('keto-rules')).toHaveAttribute('open','');
  await expect(page.getByTestId('keto-rules').locator('summary')).toBeFocused();
  await expect(nav.getByLabel('Поиск нутриента')).toHaveValue('калий');
  await nav.getByRole('button',{name:'Обучение и микрогайды'}).click();
  await expect(page.locator('.ff-home-guides')).toBeFocused();
  await nav.getByRole('button',{name:'Назад'}).click();
  await expect(nav).not.toHaveAttribute('open','');
  await nav.locator(':scope > summary').click();
  await expect(nav.getByLabel('Поиск нутриента')).toHaveValue('калий');
});
