import { test, expect, passNewUserStartGate } from './pilot.fixture';

test('A rejected menu write never replaces shopping (403 regression)', async ({ createSession }) => {
  const { page } = await createSession({ id: 5053, first_name: 'DeniedPlanTest' });
  let shoppingWrites = 0;
  let menuWrites = 0;
  await page.route('**/api/user', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    menuWrites++;
    return route.fulfill({ status: 403, json: { detail: 'Access denied for this plan' } });
  });
  await page.route('**/api/shopping', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    shoppingWrites++;
    return route.fulfill({ json: { revision: 1, items: [] } });
  });
  await page.goto('/');
  await passNewUserStartGate(page);
  await page.getByTestId('settings-days-1').click();
  await page.getByTestId('settings-meals-2').click();
  await page.getByTestId('submit-settings-btn').click();
  await expect(page.getByTestId('pilot-settings-form')).toBeVisible();
  await expect(page.getByTestId('pilot-settings-form')).toContainText('Не удалось подтвердить доступ');
  expect(menuWrites).toBe(1);
  expect(shoppingWrites).toBe(0);
});

test('Kitchen timer pause and deadline catch up on foreground return (clock jump regression)', async ({ createSession }) => {
  const { page } = await createSession({ id: 5054, first_name: 'TimerTest' });
  await page.goto('/');
  await passNewUserStartGate(page);
  await page.getByTestId('settings-days-1').click();
  await page.getByTestId('settings-meals-2').click();
  await page.getByTestId('submit-settings-btn').click();
  await expect(page.getByTestId('food-today')).toBeVisible();
  await page.goto('/?screen=recipe&recipe=k1');
  await page.getByTestId('start-step-timer-btn-0').click();
  const timer = page.getByTestId('kitchen-timer-display');
  await expect(timer).toBeVisible();
  await timer.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(timer.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible();
  const pausedTime = await timer.locator('.font-mono').innerText();
  await page.evaluate(() => {
    const actualNow = Date.now;
    Date.now = () => actualNow() + 600000;
    window.dispatchEvent(new Event('pageshow'));
  });
  await expect(timer.locator('.font-mono')).toHaveText(pausedTime);
  await timer.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(timer.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const resumedNow = Date.now();
    Date.now = () => resumedNow + 600000;
    window.dispatchEvent(new Event('pageshow'));
  });
  await expect(timer).toContainText('Время вышло — проверьте блюдо');
  await expect(timer.locator('.font-mono')).toHaveText('00:00');
  await expect(timer.getByRole('button', { name: 'Продолжить', exact: true })).toHaveCount(0);
  await timer.getByRole('button', { name: 'Сброс', exact: true }).click();
  await expect(timer).toHaveCount(0);
});
