import { test, expect } from './pilot.fixture';

test.describe('E0: Start Gate Screen and Consent Flow', () => {
  test('Start Gate enforces age and PD consent checkboxes (0/2, 1/2, 2/2, uncheck)', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 6101, first_name: 'GateUserChecks' });
    await page.goto('/');

    // 1. New user sees Start Gate on launch
    const gate = page.locator('[data-testid="start-gate-screen"]');
    await expect(gate).toBeVisible({ timeout: 10000 });
    await expect(gate.locator('h1')).toContainText('Знакомство с кето и карнивор');

    // Verify verified Argon photos are loaded
    const ketoImage = page.locator('img[src*="keto_salmon_plate.png"]');
    await expect(ketoImage).toBeVisible();
    await expect
      .poll(async () => ketoImage.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const carnivoreImage = page.locator('img[src*="carnivore_steak_plate.png"]');
    await expect(carnivoreImage).toBeVisible();
    await expect
      .poll(async () => carnivoreImage.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const continueBtn = page.locator('#start-btn-continue');
    const statusLabel = page.locator('#gate-status');
    const ageCheckbox = page.locator('#gate-checkbox-age');
    const pdCheckbox = page.locator('#gate-checkbox-pd');

    // 2. With 0 checkboxes checked: continue button is disabled, status shows 0 из 2
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('0 из 2');

    // 3a. Check age only (1 of 2): continue button remains disabled
    await ageCheckbox.check();
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('1 из 2');

    // Uncheck age back to 0 of 2
    await ageCheckbox.uncheck();
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('0 из 2');

    // 3b. Check PD only (1 of 2): continue button remains disabled
    await pdCheckbox.check();
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('1 из 2');

    // 4. Check age as well (2 of 2): continue button is enabled
    await ageCheckbox.check();
    await expect(continueBtn).toBeEnabled();
    await expect(statusLabel).toContainText('2 из 2');

    // 5a. Unchecking age immediately disables continue button
    await ageCheckbox.uncheck();
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('1 из 2');

    // Re-check age: button enabled again
    await ageCheckbox.check();
    await expect(continueBtn).toBeEnabled();
    await expect(statusLabel).toContainText('2 из 2');

    // 5b. Unchecking PD immediately disables continue button
    await pdCheckbox.uncheck();
    await expect(continueBtn).toBeDisabled();
    await expect(statusLabel).toContainText('1 из 2');

    // Re-check PD: button enabled again
    await pdCheckbox.check();
    await expect(continueBtn).toBeEnabled();
    await expect(statusLabel).toContainText('2 из 2');

    // Clicking continue advances to settings form
    await continueBtn.click();
    await expect(page.locator('[data-testid="pilot-settings-form"]')).toBeVisible({ timeout: 10000 });
  });

  test('Choosing carnivore approach carries over to settings form and returning user bypasses gate', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 6102, first_name: 'GateUserCarnivore' });
    await page.goto('/');

    const gate = page.locator('[data-testid="start-gate-screen"]');
    await expect(gate).toBeVisible({ timeout: 10000 });

    // 6. Choosing an approach (carnivore)
    const carnivoreBtn = page.locator('#start-choose-carnivore');
    const ketoBtn = page.locator('#start-choose-keto');

    // Default approach is keto
    await expect(ketoBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(carnivoreBtn).toHaveAttribute('aria-pressed', 'false');

    // Select carnivore
    await carnivoreBtn.click();
    await expect(carnivoreBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(ketoBtn).toHaveAttribute('aria-pressed', 'false');

    // Complete gate conditions
    await page.locator('#gate-checkbox-age').check();
    await page.locator('#gate-checkbox-pd').check();

    const continueBtn = page.locator('#start-btn-continue');
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Verify settings form receives chosen approach and pre-checked 18+
    const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
    await expect(settingsForm).toBeVisible({ timeout: 10000 });

    const carnivoreApproach = page.locator('[data-testid="settings-approach-carnivore"]');
    await expect(carnivoreApproach).toHaveClass(/bg-\[#EDF1E6\]/);

    const confirm18 = page.locator('[data-testid="settings-confirmed-18"]');
    await expect(confirm18).toBeChecked();

    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await expect(submitBtn).toBeEnabled();

    // Switch to keto so menu can be generated from synthetic test catalog
    await page.locator('[data-testid="settings-approach-keto"]').click();

    // Submit settings to save profile to server with confirmed18Plus: true
    const [userSaveRes, shopSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      submitBtn.click(),
    ]);
    expect(userSaveRes.status()).toBe(200);
    expect(shopSaveRes.status()).toBe(200);

    await expect(page.locator('[data-testid="food-today"]')).toBeVisible();

    // 8. Returning user (profile loaded with confirmed18Plus: true) bypasses Start Gate on reload
    await page.reload();
    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="start-gate-screen"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="pilot-settings-form"]')).not.toBeVisible();
  });

  test('Support button opens support screen; clicking "← Вернуться назад" returns to Start Gate with button disabled', async ({
    createSession,
  }) => {
    const { page } = await createSession({ id: 6103, first_name: 'GateUserSupport' });
    await page.goto('/');

    const gate = page.locator('[data-testid="start-gate-screen"]');
    await expect(gate).toBeVisible({ timeout: 10000 });

    // Mark age checkbox prior to opening support
    await page.locator('#gate-checkbox-age').check();

    // 7. Click support button from Start Gate
    const openSupportBtn = page.locator('#start-open-support-btn');
    await expect(openSupportBtn).toBeVisible();
    await openSupportBtn.click();

    // Support screen is displayed
    const supportSection = page.locator('[data-testid="private-support"]');
    await expect(supportSection).toBeVisible({ timeout: 10000 });
    await expect(supportSection.locator('h1')).toContainText('Написать Ольге');

    // Click "← Вернуться назад"
    const backBtn = page.getByRole('button', { name: '← Вернуться назад' });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // User is returned to Start Gate
    await expect(gate).toBeVisible({ timeout: 10000 });

    // Continue button must be disabled and status reset
    const continueBtn = page.locator('#start-btn-continue');
    await expect(continueBtn).toBeDisabled();
    await expect(page.locator('#gate-status')).toContainText('0 из 2');
  });
});
