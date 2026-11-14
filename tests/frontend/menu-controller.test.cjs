const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createMenuController } = loadTs(
  path.resolve(__dirname, '../../src/adapters/menuController.ts')
);

function fixtureRecipe(id) {
  return {
    id, title: `Synthetic ${id}`, mode: 'keto', cat: 'breakfast',
    emoji: '', g: ['#fff', '#eee'], time: 12, serv: 2, diff: 'test',
    kcal: 123, p: 1, f: 2, nc: 3, cost: 1,
    make: false, freeze: false, fam: false, batch: false,
    tags: [], ing: [['Synthetic item', '4 шт']], steps: ['Test step'],
    subs: {}, store: 'Test storage',
  };
}
const catalog = ['not-released', 'r1', 'r2', 'r3'].map(fixtureRecipe);
const options = {
  mode: 'keto', numDays: 1, meals: 2,
  today: new Date('2026-10-30T09:00:00Z'), random: () => 0,
};

test('empty release manifest blocks generation', () => {
  const controller = createMenuController(catalog, []);
  assert.throws(() => controller.createUserMenu(options));
});

test('existing but unreleased recipe is never generated', () => {
  const controller = createMenuController(catalog, ['r1', 'r2', 'r3']);
  const menu = controller.createUserMenu(options);
  assert.equal(typeof menu.created, 'number');
  assert.equal(menu.days.length, 1);
  assert.deepEqual(Object.keys(menu.days[0].slots), ['breakfast', 'dinner']);
  for (const id of Object.values(menu.days[0].slots)) {
    assert.ok(['r1', 'r2', 'r3'].includes(id));
    assert.notEqual(id, 'not-released');
  }
});

test('replacement and displayed catalog use the same release set', () => {
  const controller = createMenuController(catalog, ['r1', 'r2', 'r3']);
  const candidates = controller.createUserReplacementCandidates({
    currentId: 'r1', dayIds: ['r1', 'r2'], mode: 'keto',
  });
  assert.deepEqual(candidates.map((item) => item.id), ['r3']);
  assert.deepEqual(controller.getReleasedRecipes().map((item) => item.id),
    ['r1', 'r2', 'r3']);
});

test('unknown approved reference blocks instead of being ignored', () => {
  const controller = createMenuController(catalog, ['missing']);
  assert.throws(() => controller.createUserMenu(options));
});

test('revoked current recipe does not silently receive a replacement', () => {
  const controller = createMenuController(catalog, ['r1', 'r2']);
  assert.throws(() => controller.createUserReplacementCandidates({
    currentId: 'not-released', dayIds: [], mode: 'keto',
  }));
});

test('explore is not coerced into personal menu generation', () => {
  const controller = createMenuController(catalog, ['r1', 'r2']);
  assert.throws(() => controller.createUserMenu({ ...options, mode: 'explore' }));
});

test('preview mode activates demo pool when release manifest is empty', () => {
  const previewCatalog = ['k1', 'k2', 'k3'].map(fixtureRecipe);
  const previewCtrl = createMenuController(previewCatalog, [], { isPreview: true });
  const menu = previewCtrl.createUserMenu(options);
  assert.equal(menu.days.length, 1);
});
