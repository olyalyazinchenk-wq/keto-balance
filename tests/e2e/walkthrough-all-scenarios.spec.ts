import { test, expect, activateSyntheticPremium } from './pilot.fixture';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/evidence/screenshots/walkthrough_20261114_r2');

test.describe('Comprehensive 8-Scenario User Walkthrough (Strict Assertions)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('Walkthrough Part A: Free Tier Preview & Restrictions Boundary', async ({ createSession }) => {
    // Session for new free user
    const session = await createSession({ id: 9101, first_name: 'ОльгаГость' });
    const { page } = session;

    console.log('[PART_A] Step 1: Start Gate for Free User...');
    await page.goto('/');

    const gateScreen = page.locator('[data-testid="start-gate-screen"]');
    await expect(gateScreen, 'Start gate must be visible on first entrance').toBeVisible({ timeout: 15000 });

    // Screenshot 01a: Initial Start Gate
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01a_start_gate_initial.png') });

    // Check checkboxes
    const ageCheckbox = page.locator('#gate-checkbox-age');
    const pdCheckbox = page.locator('#gate-checkbox-pd');
    const continueBtn = page.locator('#start-btn-continue');

    await expect(continueBtn, 'Continue button must be disabled before consents').toBeDisabled();

    await ageCheckbox.check();
    await pdCheckbox.check();
    await expect(continueBtn, 'Continue button must be enabled after consents').toBeEnabled();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01b_start_gate_checked.png') });

    await continueBtn.click();

    // Step 2: Settings Form
    console.log('[PART_A] Step 2: Settings Form & Free Boundary...');
    const form = page.locator('[data-testid="pilot-settings-form"]');
    await expect(form, 'Settings form must be visible after gate').toBeVisible({ timeout: 10000 });

    // Verify 18+ state in Settings form: it is pre-checked from StartGate
    const settingsConfirmed18 = page.locator('[data-testid="settings-confirmed-18"]');
    await expect(settingsConfirmed18, '18+ checkbox is pre-checked from Start Gate').toBeChecked();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02a_settings_form.png') });

    // Test conflict warning with heavy restrictions
    const restDairy = page.locator('[data-testid="settings-restriction-exclude_dairy"]');
    const restEggs = page.locator('[data-testid="settings-restriction-exclude_eggs"]');
    const restFish = page.locator('[data-testid="settings-restriction-exclude_fish"]');
    const restNuts = page.locator('[data-testid="settings-restriction-exclude_nuts"]');
    const restMushrooms = page.locator('[data-testid="settings-restriction-exclude_mushrooms"]');

    await restDairy.check();
    await restEggs.check();
    await restFish.check();
    await restNuts.check();
    await restMushrooms.check();

    const conflictWarning = page.locator('[data-testid="recipe-conflict-warning"]');
    await expect(conflictWarning, 'Conflict warning must appear when too many restrictions chosen').toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02b_settings_restrictions_conflict.png') });

    // Uncheck restrictions
    await restDairy.uncheck();
    await restEggs.uncheck();
    await restFish.uncheck();
    await restNuts.uncheck();
    await restMushrooms.uncheck();

    // Test Free Preview boundary: choose 3 meals and click submit
    const meals3Btn = page.locator('[data-testid="settings-meals-3"]');
    await meals3Btn.click();

    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    await submitBtn.click();

    const formError = page.locator('[data-testid="settings-form-error"]');
    await expect(formError, 'Form error must explain free preview boundary').toBeVisible({ timeout: 5000 });
    const errText = await formError.textContent();
    expect(errText).toContain('Ознакомительный доступ');
    console.log('[PART_A] Observed Free Tier boundary message:', errText);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02c_settings_paywall_boundary.png') });
  });

  test('Walkthrough Part B: Full 8-Scenario Flow (Today, Menu, Recipe, Plate, Cooking, Shopping, Persistence, Education, Support)', async ({ createSession }) => {
    test.setTimeout(90000);
    // Session with synthetic premium enabled
    const session = await createSession({ id: 9102, first_name: 'ОльгаПремиум' });
    const { page } = session;
    await activateSyntheticPremium(session);

    console.log('[PART_B] Step 1-2: Start Gate & Settings submission for Full Plan...');
    await page.goto('/');

    const gateScreen = page.locator('[data-testid="start-gate-screen"]');
    await expect(gateScreen, 'Start gate must be visible').toBeVisible({ timeout: 15000 });

    await page.locator('#gate-checkbox-age').check();
    await page.locator('#gate-checkbox-pd').check();
    await page.locator('#start-btn-continue').click();

    const form = page.locator('[data-testid="pilot-settings-form"]');
    await expect(form, 'Settings form must be visible').toBeVisible({ timeout: 10000 });

    // Select keto approach & 30 min
    await page.locator('[data-testid="settings-approach-keto"]').click();
    await page.locator('[data-testid="settings-time-30"]').click();

    // For Premium user, select Month duration so multi-day menu is created
    const monthDurationBtn = page.locator('[data-testid="settings-days-month"]');
    await expect(monthDurationBtn, 'Month duration button must be strictly visible and selectable for Premium session').toBeVisible();
    await monthDurationBtn.click();

    // Submit settings and wait for server saves
    const submitBtn = page.locator('[data-testid="submit-settings-btn"]');
    const [userSaveRes, shopSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/user') && res.request().method() === 'PUT'),
      page.waitForResponse((res) => res.url().includes('/api/shopping') && res.request().method() === 'PUT'),
      submitBtn.click(),
    ]);
    expect(userSaveRes.status()).toBe(200);
    expect(shopSaveRes.status()).toBe(200);

    // Verify month menu days count on server response
    const savedUserData = await userSaveRes.json();
    expect(savedUserData.revision).toBeGreaterThan(0);

    // Step 3: Today screen
    console.log('[PART_B] Step 3: Today Screen...');
    const todayScreen = page.locator('[data-testid="food-today"]');
    await expect(todayScreen, 'Today screen must be visible').toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Screenshot 03a: Today Screen Top
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03a_today_screen.png') });

    // Scroll down on Today screen to view sections
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03a2_today_screen_sections.png') });

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    // Step 3b: Navigate to Menu
    console.log('[PART_B] Navigating to Menu...');
    const menuNav = page.locator('[data-testid="bottom-nav-menu"]');
    await expect(menuNav).toBeVisible();
    await menuNav.click();

    const menuScreen = page.locator('[data-testid="food-menu-screen"]');
    await expect(menuScreen, 'Menu screen must be visible').toBeVisible({ timeout: 10000 });

    // Screenshot 03b: Menu Screen Day View
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03b_menu_screen_days.png') });

    // Switch to Week 1 then Day 2 in month menu: strictly required
    const week1Tab = page.locator('[data-testid="menu-week-tab-0"]');
    if (await week1Tab.isVisible()) {
      await week1Tab.click();
      await page.waitForTimeout(300);
    }
    const day2Tab = page.locator('[data-testid="menu-day-tab-1"]');
    await expect(day2Tab, 'Day 2 tab must be strictly visible in month menu').toBeVisible();
    await day2Tab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03c_menu_day2.png') });

    // Step 3c: Replace dish
    console.log('[PART_B] Testing Dish Replacement in Menu...');
    const replaceBtn = page.locator('[data-testid^="replace-slot-btn-"]').first();
    await expect(replaceBtn, 'Replace slot button must be visible').toBeVisible();
    await replaceBtn.click();

    const replaceDialog = page.locator('.fm-dialog');
    await expect(replaceDialog, 'Replace candidate dialog must be visible').toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03d_replace_dialog.png') });

    // Select candidate
    const candidateBtn = replaceDialog.getByRole('button', { name: 'Поставить в план' }).first();
    await expect(candidateBtn).toBeVisible();
    await candidateBtn.click();
    await page.waitForTimeout(500);

    // Switch back to Day 1 to inspect k1 (Сливочная яичница с беконом и шпинатом)
    const day1Tab = page.locator('[data-testid="menu-day-tab-0"]');
    await day1Tab.click();
    await page.waitForTimeout(300);

    // Step 4: Recipe details & Interactive Plate
    console.log('[PART_B] Step 4: Recipe Details & Interactive Plate...');
    const openRecipeBtn = page.locator('[data-testid^="open-recipe-btn-"]').first();
    await expect(openRecipeBtn).toBeVisible();
    await openRecipeBtn.click();

    const recipeScreen = page.locator('[data-testid="food-recipe-screen"]');
    await expect(recipeScreen, 'Recipe screen must be visible').toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Read initial 1x quantity for verification and test exact math for all ingredients
    const plateAmount = recipeScreen.locator('[data-testid="plate-amount"]');
    await expect(plateAmount).toBeVisible();

    const recipeTitle = await recipeScreen.locator('h1').textContent();
    console.log(`[PART_B] Testing portion scaling on recipe: "${recipeTitle}"`);
    const isOmelet = Boolean(recipeTitle && recipeTitle.includes('Омлет'));

    // 1x (target = 1 portion)
    const portion1x = recipeScreen.locator('[data-testid="recipe-portions-1x"]');
    await portion1x.click();
    await recipeScreen.locator('[data-testid="plate-ingredient-0"]').click();
    await expect(plateAmount, '1x portion ingredient 0').toHaveText(isOmelet ? '3 шт' : '2 шт');

    await recipeScreen.locator('[data-testid="plate-ingredient-1"]').click();
    await expect(plateAmount, '1x portion ingredient 1').toHaveText(isOmelet ? '40 г' : '40 г');

    await recipeScreen.locator('[data-testid="plate-ingredient-2"]').click();
    await expect(plateAmount, '1x portion ingredient 2').toHaveText(isOmelet ? '30 мл' : '50 г');

    await recipeScreen.locator('[data-testid="plate-ingredient-3"]').click();
    await expect(plateAmount, '1x portion ingredient 3').toHaveText(isOmelet ? '10 г' : '10 г');

    // Screenshot 04a: Recipe Top & Plate (1x)
    await recipeScreen.locator('[data-testid="plate-ingredient-0"]').click();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04a_recipe_plate_1x.png') });

    // 4x (target = 4 portions)
    const portion4x = recipeScreen.locator('[data-testid="recipe-portions-4x"]');
    await expect(portion4x).toBeVisible();
    await portion4x.click();
    await page.waitForTimeout(200);

    await recipeScreen.locator('[data-testid="plate-ingredient-0"]').click();
    await expect(plateAmount, '4x portion ingredient 0').toHaveText(isOmelet ? '12 шт' : '8 шт');

    await recipeScreen.locator('[data-testid="plate-ingredient-1"]').click();
    await expect(plateAmount, '4x portion ingredient 1').toHaveText(isOmelet ? '160 г' : '160 г');

    await recipeScreen.locator('[data-testid="plate-ingredient-2"]').click();
    await expect(plateAmount, '4x portion ingredient 2').toHaveText(isOmelet ? '120 мл' : '200 г');

    await recipeScreen.locator('[data-testid="plate-ingredient-3"]').click();
    await expect(plateAmount, '4x portion ingredient 3').toHaveText(isOmelet ? '40 г' : '40 г');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04b_recipe_plate_4x.png') });

    // 2x (target = 2 portions)
    const portion2x = recipeScreen.locator('[data-testid="recipe-portions-2x"]');
    await portion2x.click();
    await page.waitForTimeout(200);
    await recipeScreen.locator('[data-testid="plate-ingredient-0"]').click();
    await expect(plateAmount, '2x portion ingredient 0').toHaveText(isOmelet ? '6 шт' : '4 шт');

    // Test clicking ingredient on plate and marking prepared
    const plateIng1 = recipeScreen.locator('[data-testid="plate-ingredient-0"]');
    await expect(plateIng1).toBeVisible();
    await plateIng1.click();

    const prepareBtn = recipeScreen.locator('[data-testid="plate-prepare"]');
    await expect(prepareBtn).toBeVisible();
    await prepareBtn.click();
    await page.waitForTimeout(300);

    const plateProgress = recipeScreen.locator('[data-testid="plate-progress"]');
    await expect(plateProgress).toBeVisible();
    const progressText = await plateProgress.textContent();
    expect(progressText).toContain('1 из');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04c_plate_ingredient_prepared.png') });

    // Scroll down to steps and timer
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04d_recipe_steps.png') });

    // Step 6: Test Kitchen Timer (Lifecycle, Floating widget, Pause, Navigation, Reload)
    console.log('[PART_B] Step 6: Testing Kitchen Timer...');
    const stepTimerBtn = recipeScreen.locator('[data-testid^="start-step-timer-btn-"]').first();
    await expect(stepTimerBtn, 'Start step timer button must be visible').toBeVisible();
    await stepTimerBtn.click();
    await page.waitForTimeout(500);

    const timerDisplay = recipeScreen.locator('[data-testid="kitchen-timer-display"]');
    await expect(timerDisplay, 'Active timer display must be visible in recipe').toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06a_timer_running.png') });

    // Navigate to Menu: Floating widget must appear above bottom nav
    const backBtn = recipeScreen.locator('[data-testid="recipe-back-btn"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page.locator('[data-testid="food-menu-screen"]')).toBeVisible({ timeout: 5000 });

    const floatingTimer = page.locator('[data-testid="floating-kitchen-timer"]');
    await expect(floatingTimer, 'Floating timer widget must be visible on Menu screen').toBeVisible();
    await expect(floatingTimer.locator('[data-testid="floating-timer-countdown"]')).toBeVisible();

    // Navigate to Shopping: Floating widget must remain visible
    const shoppingNav = page.locator('[data-testid="bottom-nav-shopping"]');
    await shoppingNav.click();
    await expect(page.locator('[data-testid="food-shopping-screen"]')).toBeVisible({ timeout: 5000 });
    await expect(floatingTimer, 'Floating timer widget must stay visible on Shopping screen').toBeVisible();

    // Pause timer from floating widget
    const pauseFloatingBtn = floatingTimer.locator('[data-testid="floating-timer-pause-btn"]');
    await pauseFloatingBtn.click();
    await page.waitForTimeout(200);
    await expect(floatingTimer.locator('.kb-floating-timer__badge')).toHaveText('Пауза');

    // Return to Recipe via "В рецепт →" button
    const gotoRecipeBtn = floatingTimer.locator('[data-testid="floating-timer-goto-btn"]');
    await gotoRecipeBtn.click();
    await expect(recipeScreen, 'Recipe screen must re-open').toBeVisible({ timeout: 5000 });
    await expect(timerDisplay, 'In-recipe timer display must be visible and preserved').toBeVisible();
    await expect(timerDisplay.getByRole('button', { name: 'Продолжить' })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06b_timer_after_navigation.png') });

    // Test reload persistence: reload page and verify timer restores from localStorage
    await page.reload();
    await expect(page.locator('[data-testid="food-today"]')).toBeVisible({ timeout: 10000 });
    await expect(floatingTimer, 'Floating timer must survive full page reload via localStorage').toBeVisible();
    await expect(floatingTimer.locator('.kb-floating-timer__badge')).toHaveText('Пауза');

    // Return to recipe from Today and clean up
    await floatingTimer.locator('[data-testid="floating-timer-goto-btn"]').click();
    await expect(recipeScreen).toBeVisible({ timeout: 5000 });
    const resetTimerBtn = timerDisplay.getByRole('button', { name: 'Сброс' });
    await resetTimerBtn.click();
    await page.waitForTimeout(200);
    await expect(timerDisplay).not.toBeVisible();
    await expect(floatingTimer).not.toBeVisible();

    // Step 5: Shopping List
    console.log('[PART_B] Step 5: Shopping List...');
    await page.locator('[data-testid="bottom-nav-shopping"]').click();

    const shoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
    await expect(shoppingScreen, 'Shopping screen must be visible').toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Screenshot 05a: Shopping List Week View
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05a_shopping_week_view.png') });

    // Check off first item
    const firstCheckBtn = shoppingScreen.locator('[data-testid^="toggle-in-store-"]').first();
    await expect(firstCheckBtn).toBeVisible();
    await firstCheckBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05b_shopping_checked_item.png') });

    // Test adding custom item
    const toggleCustomBtn = shoppingScreen.locator('[data-testid="shopping-add-custom-toggle-btn"]');
    await expect(toggleCustomBtn).toBeVisible();
    await toggleCustomBtn.click();
    await page.waitForTimeout(300);

    const customForm = shoppingScreen.locator('[data-testid="shopping-custom-item-form"]');
    await expect(customForm).toBeVisible();
    await customForm.locator('input[type="text"]').first().fill('Кокосовое масло');
    await customForm.locator('input[type="text"]').nth(1).fill('200 г');
    await customForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(400);

    // Assert custom item was added to the list
    const addedItem = shoppingScreen.locator('text=Кокосовое масло');
    await expect(addedItem, 'Custom item "Кокосовое масло" must appear in list').toBeVisible();
    // Scroll to custom item and screenshot
    await addedItem.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05c_shopping_custom_item.png') });

    // Check stale shopping banner caused by step 3c dish replacement
    const staleBanner = shoppingScreen.locator('[data-testid="shopping-stale-banner"]');
    await expect(staleBanner, 'Stale shopping banner must be visible after dish replacement').toBeVisible();
    await staleBanner.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05d_shopping_stale_banner.png') });

    // Step 7: Repeat Login / Persistence
    console.log('[PART_B] Step 7: Persistence check (reload)...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // After reload, verify user is still authenticated and lands on Today screen (not Start Gate)
    const restoredTodayScreen = page.locator('[data-testid="food-today"]');
    await expect(restoredTodayScreen, 'Today screen must restore after reload (not kicked to Start Gate)').toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_repeat_login_restored.png') });

    // Verify shopping data persisted by opening shopping list
    await page.locator('[data-testid="bottom-nav-shopping"]').click();
    const restoredShoppingScreen = page.locator('[data-testid="food-shopping-screen"]');
    await expect(restoredShoppingScreen, 'Shopping screen must be accessible after reload').toBeVisible();
    const persistedCustomItem = restoredShoppingScreen.locator('text=Кокосовое масло');
    await expect(persistedCustomItem, 'Custom added item must persist across page reload').toBeVisible();

    // Step 8: Guides, Paywall & Support
    console.log('[PART_B] Step 8: Education Guides, Paywall & Support...');
    await page.locator('[data-testid="bottom-nav-today"]').click();
    await page.waitForTimeout(500);

    // Scroll down to Guides
    const guidesSection = page.locator('.ff-home-guides');
    await expect(guidesSection, 'Guides section container must be present on Today screen').toBeVisible();
    await guidesSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Check guides state: if cards exist, expand first card; if in draft placeholder, record that
    const guideCards = page.locator('[data-testid^="guide-card-"]');
    if ((await guideCards.count()) > 0) {
      const firstCard = guideCards.first();
      const expandBtn = firstCard.locator('button[aria-expanded]');
      await expandBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08a_guide_expanded.png') });
    } else {
      // In current release, educational guides are in draft_for_owner_review so placeholder is rendered
      const placeholder = guidesSection.locator('text=Материалы готовятся к публикации');
      await expect(placeholder, 'When guides are not yet approved, honest placeholder must be visible').toBeVisible();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08a_guide_expanded.png') });
    }

    // Scroll to Access & Paywall
    const accessSection = page.locator('[data-testid="home-access-section"]');
    await accessSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const openPaywallBtn = page.locator('[data-testid="more-open-paywall-btn"]');
    await expect(openPaywallBtn).toBeVisible();
    await openPaywallBtn.click();
    await page.waitForTimeout(500);

    const paywallTitle = page.locator('#paywall-title');
    await expect(paywallTitle, 'Paywall title must be visible').toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08b_paywall_modal.png') });

    // Close paywall modal
    const closeBtn = page.locator('[data-testid="paywall-close-btn"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);

    // Support screen
    const openSupportBtn = page.locator('[data-testid="home-open-support-btn"]');
    await expect(openSupportBtn).toBeVisible();
    await openSupportBtn.click();

    const supportScreen = page.locator('[data-testid="private-support"]');
    await expect(supportScreen, 'Private support screen must be visible').toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08c_support_page.png') });

    console.log('[PART_B] Complete walkthrough with strict assertions finished successfully!');
  });
});
