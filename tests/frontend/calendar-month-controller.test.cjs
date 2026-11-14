const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require('../helpers/load-ts.cjs');

const { generateMenu } = loadTs(path.join(ROOT, 'src/domain/menu.ts'));
const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));

test('Calendar Month & Controller Verification (Codex Proof)', async (t) => {
  // Simple keto test recipes
  const testRecipes = [
    {
      id: 'k1',
      title: 'Яичница',
      mode: 'keto',
      cat: 'breakfast',
      kcal: 300,
      p: 15,
      f: 25,
      nc: 2,
      serv: 1,
      ing: [['Яйца', '2 шт']],
      steps: ['Приготовить'],
      tags: [],
    },
    {
      id: 'k2',
      title: 'Салат с тунцом',
      mode: 'keto',
      cat: 'lunch',
      kcal: 400,
      p: 30,
      f: 20,
      nc: 4,
      serv: 1,
      ing: [['Тунец', '100 г']],
      steps: ['Смешать'],
      tags: [],
    },
    {
      id: 'k3',
      title: 'Стейк из лосося',
      mode: 'keto',
      cat: 'dinner',
      kcal: 500,
      p: 35,
      f: 30,
      nc: 1,
      serv: 1,
      ing: [['Лосось', '150 г']],
      steps: ['Запечь'],
      tags: [],
    },
  ];

  const controller = createMenuController(testRecipes, ['k1', 'k2', 'k3'], {
    catalogId: 'released-catalog-202611-v1',
  });

  await t.test('Codex proof: today=7 Nov 2026 with numDays=30 yields calendar Nov (1 Nov to 30 Nov), NOT 7 Nov to 6 Dec', () => {
    const todayNov7 = new Date(2026, 10, 7); // 7 Nov 2026
    const menu = controller.createUserMenu({
      mode: 'keto',
      meals: 3,
      numDays: 30,
      today: todayNov7,
    });

    assert.equal(menu.days.length, 30);
    assert.equal(menu.days[0].date, '2026-11-01', 'First day of month must be 1st of month');
    assert.equal(menu.days[menu.days.length - 1].date, '2026-11-30', 'Last day of month must be 30th of November');
    assert.equal(menu.month, '2026-11');
    assert.equal(menu.catalog_id, 'released-catalog-202611-v1');
  });

  await t.test('Next month: month="2026-12" yields 31 days (1 Dec to 31 Dec)', () => {
    const menuDec = controller.createUserMenu({
      mode: 'keto',
      meals: 3,
      numDays: 30, // Requesting month
      month: '2026-12',
    });

    assert.equal(menuDec.days.length, 31, 'December must have 31 days');
    assert.equal(menuDec.days[0].date, '2026-12-01');
    assert.equal(menuDec.days[30].date, '2026-12-31');
    assert.equal(menuDec.month, '2026-12');
  });

  await t.test('Leap year: February 2028 yields 29 days (1 Feb to 29 Feb)', () => {
    const menuFebLeap = controller.createUserMenu({
      mode: 'keto',
      meals: 3,
      numDays: 30,
      month: '2028-02',
    });

    assert.equal(menuFebLeap.days.length, 29, 'Leap Feb must have 29 days');
    assert.equal(menuFebLeap.days[0].date, '2028-02-01');
    assert.equal(menuFebLeap.days[28].date, '2028-02-29');
    assert.equal(menuFebLeap.month, '2028-02');
  });

  await t.test('Non-leap year: February 2027 yields 28 days (1 Feb to 28 Feb)', () => {
    const menuFebNonLeap = controller.createUserMenu({
      mode: 'keto',
      meals: 3,
      numDays: 30,
      month: '2027-02',
    });

    assert.equal(menuFebNonLeap.days.length, 28, 'Non-leap Feb must have 28 days');
    assert.equal(menuFebNonLeap.days[0].date, '2027-02-01');
    assert.equal(menuFebNonLeap.days[27].date, '2027-02-28');
    assert.equal(menuFebNonLeap.month, '2027-02');
  });

  await t.test('Preserves 1, 3, 7 days plans starting from today without forced month shift', () => {
    const todayNov7 = new Date(2026, 10, 7);
    const menu3Days = controller.createUserMenu({
      mode: 'keto',
      meals: 3,
      numDays: 3,
      today: todayNov7,
    });

    assert.equal(menu3Days.days.length, 3);
    assert.equal(menu3Days.days[0].date, '2026-11-07');
    assert.equal(menu3Days.days[1].date, '2026-11-08');
    assert.equal(menu3Days.days[2].date, '2026-11-09');
  });
});
