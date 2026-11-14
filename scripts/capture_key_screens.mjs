import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function captureAll() {
  const targetDir = path.join(ROOT, 'docs', 'evidence', 'screenshots');
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`[CAPTURE] Target directory: ${targetDir}`);
  console.log(`[CAPTURE] Launching Chromium mobile viewport 390x844...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:18080/?demo_user=1084557944';

  console.log(`[CAPTURE] Navigating to: ${previewUrl}`);
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // 1. Screen 1: 01_start_gate.png
  console.log('[CAPTURE] 1/6: Capturing 01_start_gate.png...');
  const startGate = page.locator('[data-testid="start-gate-screen"]');
  await startGate.waitFor({ state: 'visible', timeout: 15000 });

  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 15000 }).catch(() => {});

  const file01 = path.join(targetDir, '01_start_gate.png');
  await page.screenshot({ path: file01 });
  console.log(`[CAPTURE] Saved: ${file01}`);

  // Pass Start Gate
  console.log('[CAPTURE] Passing Start Gate...');
  await page.locator('#gate-checkbox-age').check();
  await page.locator('#gate-checkbox-pd').check();
  await page.locator('#start-btn-continue').click();

  // Settings form
  const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
  if (await settingsForm.isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log('[CAPTURE] Submitting initial preferences...');
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/user') && r.request().method() === 'PUT'),
      page.locator('[data-testid="submit-settings-btn"]').click(),
    ]);
  }

  // 2. Screen 2: 02_today.png
  console.log('[CAPTURE] 2/6: Capturing 02_today.png...');
  const todayScreen = page.locator('[data-testid="food-today"]');
  await todayScreen.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500); // allow layout/images settle

  const file02 = path.join(targetDir, '02_today.png');
  await page.screenshot({ path: file02 });
  console.log(`[CAPTURE] Saved: ${file02}`);

  // 3. Screen 3: 03_menu.png
  console.log('[CAPTURE] 3/6: Capturing 03_menu.png...');
  await page.locator('[data-testid="bottom-nav-menu"]').click();
  const menuScreen = page.locator('[data-testid="food-menu-screen"]');
  await menuScreen.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);

  const file03 = path.join(targetDir, '03_menu.png');
  await page.screenshot({ path: file03 });
  console.log(`[CAPTURE] Saved: ${file03}`);

  // 4. Screen 4: 04_recipe.png
  console.log('[CAPTURE] 4/6: Capturing 04_recipe.png...');
  const openRecipeBtn = page.locator('[data-testid^="open-recipe-btn-"]').first();
  await openRecipeBtn.click();
  const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
  await recipeScreen.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);

  const file04 = path.join(targetDir, '04_recipe.png');
  await page.screenshot({ path: file04 });
  console.log(`[CAPTURE] Saved: ${file04}`);

  // 5. Screen 5: 05_shopping.png
  console.log('[CAPTURE] 5/6: Capturing 05_shopping.png...');
  await page.locator('[data-testid="bottom-nav-shopping"]').click();
  const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
  await shoppingScreen.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);

  const file05 = path.join(targetDir, '05_shopping.png');
  await page.screenshot({ path: file05 });
  console.log(`[CAPTURE] Saved: ${file05}`);

  // 6. Screen 6: 06_paywall.png
  console.log('[CAPTURE] 6/6: Capturing 06_paywall.png...');
  const headerPremiumBtn = page.locator('[data-testid="header-premium-btn"]');
  await headerPremiumBtn.waitFor({ state: 'visible', timeout: 10000 });
  await headerPremiumBtn.click();

  const paywallModal = page.locator('[data-testid="paywall-modal"]');
  await paywallModal.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  const file06 = path.join(targetDir, '06_paywall.png');
  await page.screenshot({ path: file06 });
  console.log(`[CAPTURE] Saved: ${file06}`);

  await browser.close();
  console.log('[CAPTURE] All 6 reference screenshots captured successfully!');
}

captureAll().catch((err) => {
  console.error('[CAPTURE_ERROR]', err);
  process.exit(1);
});
