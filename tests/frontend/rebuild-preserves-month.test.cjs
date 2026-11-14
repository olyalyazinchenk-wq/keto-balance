/**
 * tests/frontend/rebuild-preserves-month.test.cjs
 *
 * Verifies that rebuilding a menu preserves the selected month (December 31 days remains December 31 days),
 * and resolveSelectedDate selects today if in the month or preserves current selection.
 * Addresses Codex Audit 2026-11-08: P1 «Пересобрать» теряет выбранный месяц.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const { RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));
const { RELEASED_RECIPE_IDS } = loadTs(path.join(ROOT, 'src/data/releasedRecipeIds.ts'));
const { createMenuController } = loadTs(path.join(ROOT, 'src/adapters/menuController.ts'));
const { resolveSelectedDate, formatLocalDateISO } = loadTs(path.join(ROOT, 'src/domain/menu.ts'));

describe('Rebuild Menu Preserves Month & Selected Date (Codex Proof)', () => {
  const controller = createMenuController(RECIPES, RELEASED_RECIPE_IDS);

  test('Codex probe: rebuilding December month preserves 2026-12 and exactly 31 days', () => {
    const profile = {
      approach: 'keto',
      mealsPerDay: 3,
      planDays: 31,
      month: '2026-12',
    };

    // Initial December menu
    const decMenu = controller.createUserMenu({
      numDays: 31,
      month: '2026-12',
      meals: 3,
      mode: 'keto',
    });

    assert.equal(decMenu.month, '2026-12');
    assert.equal(decMenu.days.length, 31);
    assert.equal(decMenu.days[0].date, '2026-12-01');
    assert.equal(decMenu.days[30].date, '2026-12-31');

    // Emulate handleRebuildMenu passing targetMonth
    const targetMonth = decMenu.month || profile.month;
    const daysCount = profile.planDays || decMenu.days.length;
    const isCalendarMonth = daysCount >= 28 || Boolean(targetMonth && profile.planDays >= 28);

    const rebuiltMenu = controller.createUserMenu({
      numDays: daysCount,
      month: isCalendarMonth ? targetMonth : undefined,
      meals: profile.mealsPerDay,
      mode: 'keto',
    });

    // BEFORE FIX: month became 2026-11, days ran from 2026-11-01 to 2026-12-01.
    // AFTER FIX: must strictly remain 2026-12 with 31 days from 2026-12-01 to 2026-12-31.
    assert.equal(rebuiltMenu.month, '2026-12', 'Rebuilt menu must preserve December month');
    assert.equal(rebuiltMenu.days.length, 31, 'Rebuilt menu must have 31 days');
    assert.equal(rebuiltMenu.days[0].date, '2026-12-01', 'First day must be 2026-12-01');
    assert.equal(rebuiltMenu.days[30].date, '2026-12-31', 'Last day must be 2026-12-31');
  });

  test('resolveSelectedDate preserves user selection when valid for menu', () => {
    const menu = {
      days: [
        { date: '2026-12-01' },
        { date: '2026-12-15' },
        { date: '2026-12-31' },
      ],
    };

    const selected = resolveSelectedDate(menu, '2026-12-15', new Date(2026, 10, 8));
    assert.equal(selected, '2026-12-15', 'Must preserve 2026-12-15 when present');
  });

  test('resolveSelectedDate selects today when today is inside the calendar month', () => {
    const today = new Date(2026, 10, 8); // 8 Nov 2026
    const todayStr = formatLocalDateISO(today); // "2026-11-08"

    const novMenu = {
      days: Array.from({ length: 30 }).map((_, i) => ({
        date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      })),
    };

    // User had no preferredDate (or was on 2026-11-01), but today is 2026-11-08
    const selected = resolveSelectedDate(novMenu, null, today);
    assert.equal(selected, todayStr, 'Must select today (2026-11-08) instead of 1st November');
  });

  test('resolveSelectedDate defaults to first day when today is outside the menu month', () => {
    const today = new Date(2026, 10, 8); // 8 Nov 2026

    const decMenu = {
      days: Array.from({ length: 31 }).map((_, i) => ({
        date: `2026-12-${String(i + 1).padStart(2, '0')}`,
      })),
    };

    const selected = resolveSelectedDate(decMenu, null, today);
    assert.equal(selected, '2026-12-01', 'Must select first day of December when today is November');
  });
});
