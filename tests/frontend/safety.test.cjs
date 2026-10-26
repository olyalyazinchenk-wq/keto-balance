const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('Emergency safety stop-protocol and hold state (P09)', async (t) => {
  const {
    detectEmergency,
    createDefaultSafetyHold,
    activateSafetyHold,
    clearSafetyHold,
  } = loadTs('src/domain/safety.ts');

  await t.test('detects explicit emergency symptoms', () => {
    assert.equal(detectEmergency('У меня резкая боль в груди'), true);
    assert.equal(detectEmergency('Давит в груди уже полчаса'), true);
    assert.equal(detectEmergency('Жжение в груди, что делать?'), true);
    assert.equal(detectEmergency('Сердце болит очень сильно'), true);
    assert.equal(detectEmergency('Я задыхаюсь помогите'), true);
    assert.equal(detectEmergency('Начался приступ удушья'), true);
    assert.equal(detectEmergency('Трудно дышать и слабость'), true);
    assert.equal(detectEmergency('Не могу дышать нормально'), true);
    assert.equal(detectEmergency('Острая нехватка воздуха'), true);
    assert.equal(detectEmergency('Случилась потеря сознания'), true);
    assert.equal(detectEmergency('Падаю в обморок прямо сейчас'), true);
    assert.equal(detectEmergency('Потемнело в глазах и кружится'), true);
  });

  await t.test('detects mixed symptom + diet queries', () => {
    assert.equal(detectEmergency('Второй день на кето, но появилась боль в груди'), true);
    assert.equal(detectEmergency('После карнивор обеда задыхаюсь и тошнит'), true);
  });

  await t.test('respects explicit negations without false alarms', () => {
    assert.equal(detectEmergency('Самочувствие отличное, нет боли в груди'), false);
    assert.equal(detectEmergency('Не болит грудь, все в порядке'), false);
    assert.equal(detectEmergency('Не задыхаюсь, пульс ровный'), false);
    assert.equal(detectEmergency('Без потери сознания, просто устал'), false);
  });

  await t.test('does not trigger on standard diet questions', () => {
    assert.equal(detectEmergency('Какой рецепт омлета посоветуешь?'), false);
    assert.equal(detectEmergency('Сколько воды пить на кето?'), false);
    assert.equal(detectEmergency(''), false);
  });

  await t.test('manages safety hold lifecycle', () => {
    const defaultHold = createDefaultSafetyHold();
    assert.equal(defaultHold.active, false);
    assert.equal(defaultHold.reason, '');

    const activeHold = activateSafetyHold('chest_pain');
    assert.equal(activeHold.active, true);
    assert.equal(activeHold.reason, 'chest_pain');
    assert.ok(activeHold.timestamp > 0);

    const cleared = clearSafetyHold();
    assert.equal(cleared.active, false);
  });
});
