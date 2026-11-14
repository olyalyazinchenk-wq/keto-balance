import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildShoppingFromMenu } from './shoppingFromMenu';
import { DEMO_RECIPES_BY_ID } from '../data/ketoBalanceFixtures';

const menu = (id: string) => ({ id: 'menu', created: 0, title: 'test', days: [{ dayIndex: 0, label: '1', slots: { breakfast: id } }] });

test('replacement rebuilds ingredients without inventing conversions', () => {
  const before = rebuildShoppingFromMenu(menu('kb-rec-eggs-avocado'), DEMO_RECIPES_BY_ID, []);
  const after = rebuildShoppingFromMenu(menu('kb-rec-cottage-scramble'), DEMO_RECIPES_BY_ID, before);
  assert.ok(before.some(item => item.name === 'Авокадо спелое'));
  assert.ok(!after.some(item => item.name === 'Авокадо спелое'));
  assert.ok(after.some(item => item.name === 'Творог фермерский 9%' && item.amountLabel === '80 г'));
});

test('keeps custom items and exact matching checkmarks; rejects missing recipes', () => {
  const m = menu('kb-rec-eggs-avocado');
  const first = rebuildShoppingFromMenu(m, DEMO_RECIPES_BY_ID, []);
  first[0].alreadyHave = true;
  const custom = { ...first[0], id: 'shop-custom-123', name: 'Свой продукт', alreadyHave: false };
  const next = rebuildShoppingFromMenu(m, DEMO_RECIPES_BY_ID, [...first, custom]);
  assert.equal(next[0].alreadyHave, true);
  assert.ok(next.some(item => item.id === custom.id));
  assert.throws(() => rebuildShoppingFromMenu(menu('unknown'), DEMO_RECIPES_BY_ID, next));
});
