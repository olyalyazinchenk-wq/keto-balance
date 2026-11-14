import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/evidence/screenshots/walkthrough_20261114_r2');

test.describe('Direct Browser Live Check (without Telegram auth)', () => {
  test('Direct visit to live https://84.54.56.73.nip.io/', async ({ browser }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    // Standard context with full TLS verification enabled
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    console.log('[LIVE_DIRECT] Navigating to https://84.54.56.73.nip.io/...');
    const response = await page.goto('https://84.54.56.73.nip.io/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Strict assertion: response must exist and return 200 OK
    expect(response, 'Direct navigation response must not be null').not.toBeNull();
    expect(response?.status(), 'Direct navigation response must be HTTP 200').toBe(200);

    // Strict assertion: unauthenticated gate elements must be displayed
    const authReqHeading = page.getByRole('heading', { name: 'Требуется авторизация' });
    await expect(authReqHeading, 'Heading "Требуется авторизация" must be visible').toBeVisible({ timeout: 10000 });

    const openViaBotText = page.locator('text=Откройте приложение через кнопку в боте');
    await expect(openViaBotText, 'Instructions "Откройте приложение через кнопку в боте" must be visible').toBeVisible();

    const openTgLink = page.getByRole('link', { name: 'Открыть в Telegram' });
    await expect(openTgLink, 'Link "Открыть в Telegram" must be visible').toBeVisible();

    const writeOlgaHeading = page.getByRole('heading', { name: 'Написать Ольге' });
    await expect(writeOlgaHeading, 'Heading "Написать Ольге" must be visible').toBeVisible();

    const openQuestionChatLink = page.getByRole('link', { name: 'Открыть чат для вопроса' });
    await expect(openQuestionChatLink, 'Link "Открыть чат для вопроса" must be visible').toBeVisible();

    // Take screenshot after assertions pass
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_live_direct_browser_unauthorized.png') });
    console.log('[LIVE_DIRECT] Assertion PASS: Unauthorized gate confirmed. Screenshot saved: 00_live_direct_browser_unauthorized.png');

    await context.close();
  });
});
