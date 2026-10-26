const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Recipe eligibility and safety filtering (P05)', async (t) => {
  const { isRecipeAllowed } = loadTs('src/domain/eligibility.ts');
  const { RECIPES } = loadTs('src/data/recipes.ts');

  const byId = id => RECIPES.find(r => r.id === id);
  const k2 = byId('k2');
  const k11 = byId('k11');
  const k14 = byId('k14');
  const c6 = byId('c6');

  await t.test('k2 (omlet) is blocked for egg allergy', () => {
    assert.ok(k2);
    const allowed = isRecipeAllowed(k2, { allergies: ['Яйца'] });
    assert.equal(allowed, false, 'k2 contains eggs and must be blocked');
  });

  await t.test('k14 (beef with cabbage) is blocked for dairy allergy due to ghee (топлёное масло)', () => {
    assert.ok(k14);
    const allowed = isRecipeAllowed(k14, { allergies: ['Молочные продукты'] });
    assert.equal(allowed, false, 'k14 contains ghee and must be blocked for dairy allergy');
  });

  await t.test('c6 (steamed salmon) is blocked for fish allergy', () => {
    assert.ok(c6);
    const allowed = isRecipeAllowed(c6, { allergies: ['Рыба'] });
    assert.equal(allowed, false, 'c6 contains salmon and must be blocked for fish allergy');
  });

  await t.test('k11 (mushroom cream soup) is blocked for disliked mushrooms', () => {
    assert.ok(k11);
    const allowed = isRecipeAllowed(k11, { disliked: ['Грибы'] });
    assert.equal(allowed, false, 'k11 contains champignons and must be blocked for disliked mushrooms');
  });

  await t.test('non-empty allergyNote safely refuses automatic matching', () => {
    const allowed = isRecipeAllowed(k2, { allergyNote: 'Аллергия на цитрусовые и сою' });
    assert.equal(allowed, false, 'Unclarified allergyNote must refuse all recipes');
  });

  await t.test('unknown allergy category safely refuses automatic matching', () => {
    const allowed = isRecipeAllowed(k2, { allergies: ['Глютен'] });
    assert.equal(allowed, false, 'Unknown allergy category must refuse all recipes');
  });

  await t.test('profile without restrictions does not zero out the catalog', () => {
    const allowedRecipes = RECIPES.filter(r => isRecipeAllowed(r, { allergies: [], disliked: [] }));
    assert.equal(allowedRecipes.length, RECIPES.length, 'Empty profile should allow all recipes');
  });

  await t.test('synthetic recipe fixtures for variations and edge cases', () => {
    const syntheticDairy = {
      id: 'syn1',
      title: 'Сырное блюдо',
      mode: 'keto',
      cat: 'dinner',
      ing: [['Сыр чеддер', '50 г'], ['Говядина', '200 г']]
    };
    assert.equal(isRecipeAllowed(syntheticDairy, { allergies: ['Молочные продукты'] }), false);
    assert.equal(isRecipeAllowed(syntheticDairy, { allergies: ['Рыба'] }), true);

    const syntheticFish = {
      id: 'syn2',
      title: 'Рыбный микс',
      mode: 'keto',
      cat: 'lunch',
      ing: [['Форель запеченная', '150 г']]
    };
    assert.equal(isRecipeAllowed(syntheticFish, { allergies: ['Рыба'] }), false);
    assert.equal(isRecipeAllowed(syntheticFish, { disliked: ['Морепродукты'] }), true, 'Fish should not be mixed with seafood without reason');

    const syntheticNuts = {
      id: 'syn3',
      title: 'Кето-перекус с орехами',
      mode: 'keto',
      cat: 'snack',
      ing: [['Грецкие орехи', '30 г']]
    };
    assert.equal(isRecipeAllowed(syntheticNuts, { allergies: ['Орехи'] }), false);
    assert.equal(isRecipeAllowed(syntheticNuts, { allergies: ['Яйца'] }), true);
  });

  await t.test('unverified composition and damaged restrictions refuse automatic matching', () => {
    // Unverified composition with [УТОЧНИТЬ]
    const unverifiedRecipe = {
      id: 'syn_unverified',
      title: 'Непроверенный рецепт',
      mode: 'keto',
      cat: 'dinner',
      ing: [['Секретный соус [УТОЧНИТЬ]', '50 г'], ['Говядина', '200 г']]
    };
    assert.equal(isRecipeAllowed(unverifiedRecipe, null), false, 'Recipe with unverified ingredients must be refused');

    // Damaged restrictions in profile
    const validRecipe = {
      id: 'syn_valid',
      title: 'Чистое блюдо',
      mode: 'keto',
      cat: 'dinner',
      ing: [['Говядина', '200 г']]
    };
    assert.equal(isRecipeAllowed(validRecipe, { allergies: 'not_an_array' }), false, 'Non-array allergies must refuse');
    assert.equal(isRecipeAllowed(validRecipe, { disliked: 12345 }), false, 'Non-array disliked must refuse');
    assert.equal(isRecipeAllowed(validRecipe, { allergies: [123] }), false, 'Non-string item in allergies must refuse');

    // Invalid nutrients
    const negativeKcalRecipe = {
      id: 'syn_neg',
      title: 'Отрицательные калории',
      mode: 'keto',
      cat: 'dinner',
      kcal: -100,
      ing: [['Говядина', '200 г']]
    };
    assert.equal(isRecipeAllowed(negativeKcalRecipe, null), false, 'Negative calories must be refused');
  });
});
