import { test, expect } from './pilot.fixture';

test.describe('E3: Support and Olga Help Route', () => {
  test('Support page is honest, links to bot route for Olga, and does not send unauthorized tickets', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 5001, first_name: 'SupportUser' });

    // Open directly with ?screen=support
    await page.goto('/?screen=support');

    const supportSection = page.locator('[data-testid="private-support"]');
    await expect(supportSection).toBeVisible();
    await expect(supportSection.locator('h1')).toContainText('Написать Ольге');

    // Confirm that the Telegram link directs to the authorized bot route
    const botLink = supportSection.locator('a[href*="t.me"]');
    await expect(botLink).toBeVisible();
    const href = await botLink.getAttribute('href');
    expect(href).toMatch(/start=question/);

    // Verify returning back button
    const backBtn = page.locator('button', { hasText: 'Вернуться назад' });
    await expect(backBtn).toBeVisible();
  });
});
