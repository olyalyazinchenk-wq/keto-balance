import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function capture() {
  const targetDir = path.join(ROOT, 'docs', 'audit', 'evidence', '2026-11-01-start-gate');
  fs.mkdirSync(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, 'start-gate-390x844.png');

  console.log(`[CAPTURE] Launching Chromium mobile viewport 390x844...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  // Navigate to local preview with demo_user parameter for instant bootstrap
  const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:18080/?demo_user=1084557944';
  console.log(`[CAPTURE] Navigating to: ${previewUrl}`);
  await page.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for Start Gate screen container
  const startGate = page.locator('[data-testid="start-gate-screen"]');
  await startGate.waitFor({ state: 'visible', timeout: 15000 });
  console.log('[CAPTURE] Start Gate screen visible.');

  // Ensure all photos and media images are decoded and visible
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.length >= 4 && images.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 15000 });
  console.log('[CAPTURE] All images loaded.');

  // Audit for unintended horizontal overflow
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  if (isOverflowing) {
    console.warn('[WARN] Horizontal overflow detected on Start Gate screen.');
  } else {
    console.log('[CAPTURE] No horizontal overflow detected.');
  }

  // Capture full-page screenshot
  await page.screenshot({ path: targetFile, fullPage: true });
  console.log(`[CAPTURE] Full-page screenshot saved to: ${targetFile}`);

  await browser.close();
}

capture().catch((err) => {
  console.error('[CAPTURE_ERROR]', err);
  process.exit(1);
});
