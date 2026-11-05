import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px_iphone_se' },
  { width: 375, height: 667, label: '375px_iphone_standard' },
  { width: 430, height: 932, label: '430px_iphone_pro_max' },
];

const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\c0da0812-c610-4204-be87-e95f1c90883f';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence', 'screenshots');

async function runMobileCapture() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const previewPort = process.env.PORT || 18080;
  const baseUrl = `http://127.0.0.1:${previewPort}`;
  console.log(`[MOBILE-CAPTURE] Connecting to local preview server at ${baseUrl}...`);

  const browser = await chromium.launch({ headless: true });

  const capturedFiles = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n======================================================`);
    console.log(`[MOBILE-CAPTURE] Starting capture for ${vp.label} (${vp.width}x${vp.height})...`);
    console.log(`======================================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    const demoUser = 1084557944;
    const testUrl = `${baseUrl}/?demo_user=${demoUser}`;
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Navigating to: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Step A: Handle Start Gate if visible
    const startGate = page.locator('[data-testid="start-gate-screen"]');
    if (await startGate.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log(`[MOBILE-CAPTURE][${vp.width}px] Passing Start Gate...`);
      await page.locator('#gate-checkbox-age').check();
      await page.locator('#gate-checkbox-pd').check();
      await page.locator('#start-btn-continue').click();
    }

    // Step B: Set settings if visible (Keto, 30 min, submit)
    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    if (await settingsForm.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log(`[MOBILE-CAPTURE][${vp.width}px] Configuring test user settings...`);
      await page.locator('[data-testid="settings-approach-keto"]').click();
      await page.locator('[data-testid="settings-time-30"]').click();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/user') && r.request().method() === 'PUT'),
        page.locator('[data-testid="submit-settings-btn"]').click(),
      ]);
    }

    // Wait for Today screen to be visible
    const todayScreen = page.locator('[data-testid="food-today"]');
    await todayScreen.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Today screen ready.`);

    // Step C: Dismiss Daily Tip modal if open
    const tipCloseBtn = page.locator('button:has-text("Понятно, закрыть")');
    if (await tipCloseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[MOBILE-CAPTURE][${vp.width}px] Dismissing Daily Tip dialog...`);
      await tipCloseBtn.click();
      await page.waitForTimeout(300);
    }

    // 1. Menu Screen + Replacement modal
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Navigating to Menu...`);
    const menuTab = page.locator('[data-testid="bottom-nav-menu"]');
    await menuTab.waitFor({ state: 'visible', timeout: 10000 });
    await menuTab.click();
    await page.locator('[data-testid="food-menu-screen"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);

    // Check horizontal overflow
    const overflowMenu = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Menu screen horizontal overflow: ${overflowMenu ? 'YES (FAIL)' : 'NO (CLEAN PASS)'}`);

    // Capture standard Menu screen
    const menuFile = `mobile_${vp.label}_menu.png`;
    await page.screenshot({ path: path.join(EVIDENCE_DIR, menuFile) });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, menuFile) });
    capturedFiles.push(menuFile);
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Captured: ${menuFile}`);

    // Open Replacement Modal on breakfast slot
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Opening Replacement Dialog...`);
    const replaceBtn = page.locator('[data-testid^="replace-slot-btn-"]').first();
    if (await replaceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await replaceBtn.click();
      const replaceDialog = page.locator('[role="dialog"]');
      await replaceDialog.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(400);

      const replaceModalFile = `mobile_${vp.label}_replace_modal.png`;
      await page.screenshot({ path: path.join(EVIDENCE_DIR, replaceModalFile) });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, replaceModalFile) });
      capturedFiles.push(replaceModalFile);
      console.log(`[MOBILE-CAPTURE][${vp.width}px] Captured: ${replaceModalFile}`);

      // Close modal
      const closeBtn = page.locator('.fm-close');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    }

    // 2. Recipe Screen
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Opening Recipe Screen...`);
    const openRecipeBtn = page.locator('[data-testid^="open-recipe-btn-"]').first();
    await openRecipeBtn.click();
    const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
    await recipeScreen.waitFor({ state: 'visible', timeout: 10000 });

    // Check step 0
    const stepToggle0 = page.locator('[data-testid="recipe-step-toggle-0"]');
    if (await stepToggle0.isVisible().catch(() => false)) {
      await stepToggle0.click();
    }
    // Switch to 2 portions to verify scaling
    const portionsBtn = page.locator('button:has-text("2× порции")');
    if (await portionsBtn.isVisible().catch(() => false)) {
      await portionsBtn.click();
    }
    await page.waitForTimeout(500);

    const recipeFile = `mobile_${vp.label}_recipe.png`;
    await page.screenshot({ path: path.join(EVIDENCE_DIR, recipeFile) });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, recipeFile) });
    capturedFiles.push(recipeFile);
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Captured: ${recipeFile}`);

    // 3. Shopping Screen
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Opening Shopping Screen...`);
    const shoppingTab = page.locator('[data-testid="bottom-nav-shopping"]');
    await shoppingTab.click();
    const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
    await shoppingScreen.waitFor({ state: 'visible', timeout: 10000 });

    // If shopping needs refresh, click refresh
    const refreshBtn = page.locator('[data-testid="shopping-refresh-btn"]');
    if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(400);
    }

    // Toggle 1st item as in-store bought
    const inStoreToggle = page.locator('[data-testid^="toggle-in-store-"]').first();
    if (await inStoreToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inStoreToggle.click();
    }

    // Switch shopping portions to 2x
    const shopPortion2x = page.locator('[data-testid="shopping-portions-2x"]');
    if (await shopPortion2x.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shopPortion2x.click();
      await page.waitForTimeout(400);
    }

    const shoppingFile = `mobile_${vp.label}_shopping.png`;
    await page.screenshot({ path: path.join(EVIDENCE_DIR, shoppingFile) });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, shoppingFile) });
    capturedFiles.push(shoppingFile);
    console.log(`[MOBILE-CAPTURE][${vp.width}px] Captured: ${shoppingFile}`);

    await context.close();
  }

  await browser.close();

  console.log(`\n[MOBILE-CAPTURE] SUCCESS! Total captured screenshots: ${capturedFiles.length}`);
  console.log(`[MOBILE-CAPTURE] Files: ${capturedFiles.join(', ')}`);
}

runMobileCapture().catch((err) => {
  console.error('[MOBILE-CAPTURE ERROR]', err);
  process.exit(1);
});
