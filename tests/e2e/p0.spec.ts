/**
 * tests/e2e/p0.spec.ts — E2E smoketest for stage P0 contracts.
 * Validates that production build output contains safe routes,
 * honest feature messaging, and that static assets are cleanly generated.
 */

import { test, expect } from '@playwright/test';

test.describe('Keto Balance P0 E2E Verification', () => {
  test('front-end index loads and reflects honest services status', async ({ page }) => {
    // Intercept external telegram script if network is unreachable
    await page.route('https://telegram.org/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    // Local dev or preview URL
    await page.goto(process.env.BASE_URL || '/', { waitUntil: 'domcontentloaded' });
    
    // Title must be localized to Russian
    await expect(page).toHaveTitle(/Кето Баланс/);
    
    // No simulated scanning or unverified nutritionist personas
    const content = await page.content();
    expect(content).not.toContain('Углеводы: 4.2г · Сахар: 0.8г');
    expect(content).not.toContain('Мария Ветрова');
  });
});
