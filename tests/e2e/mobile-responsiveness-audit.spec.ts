import { test, expect, activateSyntheticPremium } from './pilot.fixture';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_DIR = path.resolve(__dirname, '../../docs/evidence/screenshots/mobile_audit_20261114_r2');

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '320x640', width: 320, height: 640 },
];

const THEMES: Array<'light' | 'dark'> = ['light', 'dark'];

test.describe('Mobile Responsiveness Audit (390px & 320px, Light & Dark)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(MOBILE_DIR, { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`Audit 4 Core Screens on ${vp.name} [${theme.toUpperCase()}]`, async ({ browser }) => {
        test.setTimeout(60000);
        const user = { id: 9200 + (vp.width === 390 ? 10 : 20) + (theme === 'light' ? 1 : 2), first_name: `MobUser_${vp.width}_${theme}` };
        
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
          colorScheme: theme,
        });

        const initData = (await import('./pilot.fixture')).signTelegramInitData(user);
        await context.addInitScript((await import('./pilot.fixture')).createTelegramMockScript(initData, user, theme));

        const page = await context.newPage();
        const session = { page, context, initData, user };
        await activateSyntheticPremium(session);

        // 1. Pass Start Gate and Submit Settings
        await page.goto('/');
        const gate = page.locator('[data-testid="start-gate-screen"]');
        await expect(gate).toBeVisible({ timeout: 15000 });
        await page.locator('#gate-checkbox-age').check();
        await page.locator('#gate-checkbox-pd').check();
        await page.locator('#start-btn-continue').click();

        const form = page.locator('[data-testid="pilot-settings-form"]');
        await expect(form).toBeVisible({ timeout: 10000 });

        await Promise.all([
          page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
          page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
          page.locator('[data-testid="submit-settings-btn"]').click(),
        ]);

        // Screen 1: Today
        const todayScreen = page.locator('[data-testid="food-today"]');
        await expect(todayScreen).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(400);

        // Strict assertion: theme data attributes and classes must match requested theme before taking screenshots
        const html = page.locator('html');
        await expect(html, `HTML tag must have data-kb-theme="${theme}"`).toHaveAttribute('data-kb-theme', theme);
        if (theme === 'dark') {
          await expect(html, 'HTML tag must have "dark" class').toHaveClass(/dark/);
          const computedBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
          expect(computedBg, 'Dark theme body background must be dark green/black').toMatch(/rgb\(11,\s*20,\s*16\)|#0b1410/i);
        } else {
          await expect(html, 'HTML tag must have "light" class').toHaveClass(/light/);
          const computedBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
          expect(computedBg, 'Light theme body background must be light sage').toMatch(/rgb\(24[45],\s*24[78],\s*24[35]\)|#f[45]f[78]f[35]/i);
        }

        // Check horizontal overflow: content should fit within window
        const scrollWidthToday = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidthToday, `Today screen on ${vp.name} must not overflow horizontally`).toBeLessThanOrEqual(vp.width + 1);

        await page.screenshot({ path: path.join(MOBILE_DIR, `01_today_${vp.width}_${theme}.png`) });

        // Screen 2: Menu (Weeks & Days)
        await page.locator('[data-testid="bottom-nav-menu"]').click();
        const menuScreen = page.locator('[data-testid="food-menu-screen"]');
        await expect(menuScreen).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(400);

        const scrollWidthMenu = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidthMenu, `Menu screen on ${vp.name} must not overflow horizontally`).toBeLessThanOrEqual(vp.width + 1);

        await page.screenshot({ path: path.join(MOBILE_DIR, `02_menu_${vp.width}_${theme}.png`) });

        // Screen 3: Recipe with Interactive Plate
        await page.locator('[data-testid^="open-recipe-btn-"]').first().click();
        const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
        await expect(recipeScreen).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(400);

        const scrollWidthRecipe = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidthRecipe, `Recipe screen on ${vp.name} must not overflow horizontally`).toBeLessThanOrEqual(vp.width + 1);

        await page.screenshot({ path: path.join(MOBILE_DIR, `03_recipe_${vp.width}_${theme}.png`) });

        // Screen 4: Shopping List
        await page.locator('[data-testid="recipe-back-btn"]').click();
        await page.locator('[data-testid="bottom-nav-shopping"]').click();
        const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
        await expect(shoppingScreen).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(400);

        const scrollWidthShopping = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidthShopping, `Shopping screen on ${vp.name} must not overflow horizontally`).toBeLessThanOrEqual(vp.width + 1);

        await page.screenshot({ path: path.join(MOBILE_DIR, `04_shopping_${vp.width}_${theme}.png`) });

        await context.close();
      });
    }
  }

  test('Dynamic themeChanged Telegram event switches theme live', async ({ browser }) => {
    test.setTimeout(60000);
    const user = { id: 9299, first_name: 'ThemeListenerUser' };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    const initData = (await import('./pilot.fixture')).signTelegramInitData(user);
    await context.addInitScript((await import('./pilot.fixture')).createTelegramMockScript(initData, user, 'light'));
    const page = await context.newPage();
    await (await import('./pilot.fixture')).activateSyntheticPremium({ page, context, initData, user });

    await page.goto('/');
    const gate = page.locator('[data-testid="start-gate-screen"]');
    await expect(gate).toBeVisible({ timeout: 15000 });
    await page.locator('#gate-checkbox-age').check();
    await page.locator('#gate-checkbox-pd').check();
    await page.locator('#start-btn-continue').click();

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      page.locator('[data-testid="submit-settings-btn"]').click(),
    ]);
    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });

    // Verify initially light
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-kb-theme', 'light');

    // Trigger Telegram themeChanged event to 'dark'
    await page.evaluate(() => (window as any).__mockTgThemeChange('dark'));
    await page.waitForTimeout(200);

    // Verify live update to dark
    await expect(html).toHaveAttribute('data-kb-theme', 'dark');
    await expect(html).toHaveClass(/dark/);

    // Trigger Telegram themeChanged event back to 'light'
    await page.evaluate(() => (window as any).__mockTgThemeChange('light'));
    await page.waitForTimeout(200);

    // Verify live update to light
    await expect(html).toHaveAttribute('data-kb-theme', 'light');

    await context.close();
  });
});
