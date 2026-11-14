// tests/frontend/milestone1-carnivore-catalog.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Milestone 1 — Frontend Catalog ID Alignment, Editorial Status, and Bundle Isolation', async (t) => {
  const { createMenuController } = loadTs('src/adapters/menuController.ts');
  const { toRecipeViewModel } = loadTs('src/ui/food-first/recipesAdapter.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');

  await t.test('1. createMenuController preserves and propagates released-catalog-202611-v1', () => {
    const controller = createMenuController(RECIPES, ['k1', 'k2', 'k3'], {
      catalogId: 'released-catalog-202611-v1',
    });

    const menu = controller.createUserMenu({
      numDays: 3,
      meals: 2,
      profile: {
        dailyCalories: 2000,
        macrosRatio: { protein: 20, fat: 75, carbs: 5 },
        restrictions: [],
        excludedIngredients: [],
        maxCookingTimeMinutes: 60,
      },
      mode: 'keto',
      catalogId: 'released-catalog-202611-v1',
    });

    assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
  });

  await t.test('2. toRecipeViewModel maps server editorial_status accurately without hardcoded strings', () => {
    const mockApprovedRecipe = {
      ...RECIPES[0],
      editorial_status: 'approved',
    };
    const vmApproved = toRecipeViewModel(mockApprovedRecipe);
    assert.equal(vmApproved.sourceStatus, 'approved');
    assert.equal(vmApproved.editorial_status, 'approved');

    const mockReviewRecipe = {
      ...RECIPES[0],
      editorial_status: 'review',
    };
    const vmReview = toRecipeViewModel(mockReviewRecipe);
    assert.equal(vmReview.sourceStatus, 'review');
    assert.equal(vmReview.editorial_status, 'review');
  });

  await t.test('3. Client static bundles in dist/assets/*.js do not leak unreleased carnivore drafts', () => {
    const distAssetsDir = path.resolve('dist/assets');
    assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory must exist after build');

    const files = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.js'));
    assert.ok(files.length > 0, 'At least one JavaScript bundle must exist in dist/assets');

    // Title of draft recipe c12
    const draftTitle = 'Костный бульон длительного томления';
    // Title of draft recipe c7
    const draftTitle2 = 'Говядина долгого тушения «рваное мясо»';

    for (const file of files) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      assert.ok(!content.includes(draftTitle), `Bundle ${file} must not contain draft recipe title: ${draftTitle}`);
      assert.ok(!content.includes(draftTitle2), `Bundle ${file} must not contain draft recipe title: ${draftTitle2}`);
      // Also ensure draft carnivore recipe definitions c1..c16 are not embedded in static bundle
      for (let i = 1; i <= 16; i++) {
        const idDefPattern = `"id":"c${i}"`;
        assert.ok(!content.includes(idDefPattern), `Bundle ${file} must not bundle carnivore draft recipe definition for c${i}`);
      }
    }
  });

  await t.test('4. Offal restriction correctly excludes chicken hearts c4 ("Куриные сердечки") and all offal dishes', () => {
    const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
    const { CARNIVORE_DRAFT_RECIPES } = loadTs('src/data/carnivoreDraftRecipes.ts');

    const c4 = CARNIVORE_DRAFT_RECIPES.find(r => r.id === 'c4');
    assert.ok(c4, 'Recipe c4 must exist');
    assert.equal(c4.title, 'Куриные сердечки на сковороде');

    // c4 MUST be excluded when offal ("Печень и субпродукты") is restricted
    const allowed = isRecipeAllowed(c4, { disliked: ['Печень и субпродукты'] });
    assert.equal(allowed, false, 'Recipe c4 (Куриные сердечки) must be excluded by offal restriction');

    // Check all 16 candidate recipes:
    // Offal dishes: c4 (Куриные сердечки), c5 (Говяжья печень), c7 (Костный бульон), c12 (Костный бульон), c14 (Говяжьи сердца)
    const expectedOffal = ['c4', 'c5', 'c7', 'c12', 'c14'];
    for (const r of CARNIVORE_DRAFT_RECIPES) {
      const isAllowed = isRecipeAllowed(r, { disliked: ['Печень и субпродукты'] });
      if (expectedOffal.includes(r.id)) {
        assert.equal(isAllowed, false, `Offal recipe ${r.id} (${r.title}) must be excluded`);
      } else {
        assert.equal(isAllowed, true, `Non-offal recipe ${r.id} (${r.title}) must remain allowed`);
      }
    }
  });

  await t.test('5. Candidate carnivore recipes are excluded by allergen rules (dairy, eggs, fish)', () => {
    const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
    const { CARNIVORE_DRAFT_RECIPES } = loadTs('src/data/carnivoreDraftRecipes.ts');

    // Dairy: excludes recipes with ghee/butter/sour cream/cheese
    const dairyAllowed = CARNIVORE_DRAFT_RECIPES.filter(r => isRecipeAllowed(r, { allergies: ['Молочные продукты'] })).map(r => r.id);
    assert.deepEqual(dairyAllowed.sort(), ['c12', 'c15', 'c7', 'c8', 'c9']);

    // Eggs: excludes c2, c8, c11, c13, c16
    const eggsAllowed = CARNIVORE_DRAFT_RECIPES.filter(r => isRecipeAllowed(r, { allergies: ['Яйца'] })).map(r => r.id);
    assert.deepEqual(eggsAllowed.sort(), ['c1', 'c10', 'c12', 'c14', 'c15', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9']);

    // Fish: excludes c6, c9, c13
    const fishAllowed = CARNIVORE_DRAFT_RECIPES.filter(r => isRecipeAllowed(r, { allergies: ['Рыба'] })).map(r => r.id);
    assert.deepEqual(fishAllowed.sort(), ['c1', 'c10', 'c11', 'c12', 'c14', 'c15', 'c16', 'c2', 'c3', 'c4', 'c5', 'c7', 'c8']);
  });
});
