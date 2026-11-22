import { test, expect, passNewUserStartGate, activateSyntheticPremium } from './pilot.fixture';
import fs from 'node:fs';

// Synthetic authorized session; never calls the deployed service.
test('learning and microguides recover a transient failure and render slow responses', async ({ createSession }) => {
  test.setTimeout(60000);
  const session = await createSession({ id: 9971, first_name: 'Learning' }, { viewport: { width: 390, height: 844 } });
  await activateSyntheticPremium(session);
  const { page } = session;
  const guides = JSON.parse(fs.readFileSync('docs/content/educational-guides.json', 'utf8'));
  let calls = 0;
  await page.route('**/api/education/guides', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, json: {} });
    await new Promise(resolve => setTimeout(resolve, 5200));
    await route.fulfill({ json: { guides } });
  });
  await page.goto('/');
  await passNewUserStartGate(page);
  await page.getByTestId('settings-days-7').click();
  await page.getByTestId('submit-settings-btn').click();
  for (const kind of ['education', 'guides']) {
    await page.getByTestId(`home-open-${kind}`).click();
    const screen = page.getByTestId(`${kind}-screen`);
    await expect(screen.getByTestId('education-guides-container')).toBeVisible({ timeout: 12000 });
    if (kind === 'education') {
      await expect(screen.locator('[data-testid^="guide-card-"]')).toHaveCount(4);
      await screen.getByTestId('guide-card-weeks_1_2_hydration').getByRole('button').first().click();
      await expect(screen.getByText(/1800 мл — это 1,8 л/)).toBeVisible();
      await page.getByTestId('app-back-button').click();
    } else {
      await expect(screen.getByTestId('guide-card-apple_vinegar_questions')).toBeVisible();
    }
    await page.getByTestId('app-back-button').click();
  }
  expect(calls).toBe(2);
  await page.goto('/?screen=recipe&recipe=k9');
  const photo = page.getByTestId('food-recipe-screen').locator('img').first();
  await expect(photo).toHaveAttribute('src', '/media/food-first/turkey-zucchini-patties.webp');
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Иллюстрация создана по рецепту')).toBeVisible();
});
