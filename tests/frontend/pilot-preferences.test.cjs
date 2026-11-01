const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

const { preferencesToUserProfile, isMenuCompatibleWithProfile } = loadTs(
  path.join(ROOT, 'src/adapters/pilotState.ts')
);
const { isRecipeAllowed } = loadTs(path.join(ROOT, 'src/domain/eligibility.ts'));
const { RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));

test('Pilot Preferences and Eligibility Behavior Tests', async (t) => {
  await t.test('maps restriction tokens correctly to canonical UserProfile', () => {
    const prefs = {
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [
        'exclude_eggs',
        'exclude_dairy',
        'exclude_fish',
        'exclude_nuts',
        'exclude_offal',
        'exclude_mushrooms'
      ],
      prepTimeMax: 30,
      mealsPerDay: 3,
      preferenceNote: ''
    };

    const profile = preferencesToUserProfile(prefs);
    assert.equal(profile.confirmed, true);
    assert.equal(profile.cookTime, 30);
    assert.deepEqual(profile.allergies, ['яйца', 'молочные продукты', 'рыба', 'орехи']);
    assert.deepEqual(profile.disliked, ['субпродукты', 'грибы']);
  });

  await t.test('rejects unknown restriction token', () => {
    assert.throws(
      () => {
        preferencesToUserProfile({
          confirmed18Plus: true,
          approach: 'keto',
          restrictions: ['invalid_token_xyz'],
          prepTimeMax: 30,
          mealsPerDay: 3,
          preferenceNote: ''
        });
      },
      /Unknown restriction token/
    );
  });

  await t.test('rejects out of range prepTimeMax', () => {
    assert.throws(
      () => {
        preferencesToUserProfile({
          confirmed18Plus: true,
          approach: 'keto',
          restrictions: [],
          prepTimeMax: -5,
          mealsPerDay: 3,
          preferenceNote: ''
        });
      },
      /prepTimeMax must be an integer between 0 and 240/
    );

    assert.throws(
      () => {
        preferencesToUserProfile({
          confirmed18Plus: true,
          approach: 'keto',
          restrictions: [],
          prepTimeMax: 300,
          mealsPerDay: 3,
          preferenceNote: ''
        });
      },
      /prepTimeMax must be an integer between 0 and 240/
    );
  });

  await t.test('eligibility guard enforces prepTimeMax limit (cookTime)', () => {
    // k1 time is 12 minutes
    const k1 = RECIPES.find(r => r.id === 'k1');
    assert.ok(k1, 'k1 must exist');
    assert.equal(k1.time, 12);

    // No limit (cookTime = 0) -> allowed
    const profileNoLimit = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 0,
      mealsPerDay: 2,
      preferenceNote: ''
    });
    assert.equal(isRecipeAllowed(k1, profileNoLimit), true);

    // Limit 15 min (12 <= 15) -> allowed
    const profile15 = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 15,
      mealsPerDay: 2,
      preferenceNote: ''
    });
    assert.equal(isRecipeAllowed(k1, profile15), true);

    // Limit 10 min (12 > 10) -> rejected!
    const profile10 = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 10,
      mealsPerDay: 2,
      preferenceNote: ''
    });
    assert.equal(isRecipeAllowed(k1, profile10), false);
  });

  await t.test('eligibility guard blocks recipes with restricted ingredients', () => {
    // k1 has eggs ("Яйца")
    const k1 = RECIPES.find(r => r.id === 'k1');
    const profileNoEggs = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_eggs'],
      prepTimeMax: 0,
      mealsPerDay: 2,
      preferenceNote: ''
    });
    assert.equal(isRecipeAllowed(k1, profileNoEggs), false);
  });

  await t.test('isMenuCompatibleWithProfile detects incompatible menu when limits change', () => {
    const k1 = RECIPES.find(r => r.id === 'k1'); // time 12, eggs
    const menu = {
      mode: 'keto',
      numDays: 1,
      meals: 1,
      portion: 1,
      saved: true,
      created: 1700000000,
      days: [{ date: '2026-10-31', slots: { m1: 'k1' } }]
    };

    // Compatible when no eggs restriction and limit is 15
    const profileOk = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 15,
      mealsPerDay: 1,
      preferenceNote: ''
    });
    assert.equal(isMenuCompatibleWithProfile(menu, profileOk, RECIPES), true);

    // Incompatible when prepTimeMax drops to 10
    const profileStrictTime = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 10,
      mealsPerDay: 1,
      preferenceNote: ''
    });
    assert.equal(isMenuCompatibleWithProfile(menu, profileStrictTime, RECIPES), false);

    // Incompatible when eggs are excluded
    const profileNoEggs = preferencesToUserProfile({
      confirmed18Plus: true,
      approach: 'keto',
      restrictions: ['exclude_eggs'],
      prepTimeMax: 30,
      mealsPerDay: 1,
      preferenceNote: ''
    });
    assert.equal(isMenuCompatibleWithProfile(menu, profileNoEggs, RECIPES), false);
  });

  await t.test('filterRecipesBySettings matches canonical eligibility and handles prepTimeMax=0', () => {
    const { filterRecipesBySettings } = loadTs(path.join(ROOT, 'src/ui/food-first/state.ts'));
    const { toRecipeViewModel } = loadTs(path.join(ROOT, 'src/ui/food-first/recipesAdapter.ts'));
    const k1 = RECIPES.find(r => r.id === 'k1');
    const vm = toRecipeViewModel(k1);

    // prepTimeMax = 0 means NO LIMIT
    const settingsNoLimit = {
      approach: 'keto',
      restrictions: [],
      prepTimeMax: 0
    };
    const resNoLimit = filterRecipesBySettings([vm], settingsNoLimit);
    assert.equal(resNoLimit.length, 1, 'prepTimeMax=0 must not exclude recipe');

    // k1 does not contain mushrooms, so exclude_mushrooms must allow k1!
    const settingsNoMushrooms = {
      approach: 'keto',
      restrictions: ['exclude_mushrooms'],
      prepTimeMax: 30
    };
    const resNoMushrooms = filterRecipesBySettings([vm], settingsNoMushrooms);
    assert.equal(resNoMushrooms.length, 1, 'exclude_mushrooms must allow k1 (no mushrooms in k1)');
  });
});
