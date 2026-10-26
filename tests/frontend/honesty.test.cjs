const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Honesty baseline and removal of simulated services (P08)', async (t) => {
  const appPath = path.resolve(__dirname, '../../src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  await t.test('NavigatorPage does not simulate OCR or hardcode carbs/sugar responses', () => {
    assert.ok(!appContent.includes('carbs: 6.4, sugar: 4.2'), 'Must not contain hardcoded scan simulation numbers');
    assert.ok(!appContent.includes('setTimeout(() => setRes({ loading: false'), 'Must not have fake setTimeout OCR scan');
    assert.ok(
      appContent.includes('Распознавание этикеток и поиск по проверенной базе пока не подключены'),
      'Must contain honest notice about label recognition'
    );
  });

  await t.test('NutritionistPage does not contain fake auto-replies, diplomas or booking simulation', () => {
    assert.ok(!appContent.includes('Мария Ветрова'), 'Must not contain unverified nutritionist persona');
    assert.ok(!appContent.includes('Диплом нутрициолога-консультанта'), 'Must not contain fake diplomas');
    assert.ok(!appContent.includes('Мария ответит в течение рабочего дня'), 'Must not contain fake auto-reply promises');
    assert.ok(
      appContent.includes('Отправка сообщений и документов из приложения пока не подключена'),
      'Must contain honest notice about messages and docs'
    );
  });

  await t.test('AdminPage states that server administration is disconnected and is out of standard navigation', () => {
    assert.ok(
      appContent.includes('Серверное администрирование не подключено'),
      'Must state that server administration is not connected'
    );
    assert.ok(!appContent.includes('Отправить всем'), 'Must not contain fake broadcast button');
  });

  await t.test('RemindersPage states that notifications are not sent', () => {
    assert.ok(
      appContent.includes('Уведомления не отправляются'),
      'Must explicitly state that notifications are not sent'
    );
  });

  await t.test('Privacy policy distinguishes localStorage and SQLite', () => {
    assert.ok(appContent.includes('localStorage'), 'Must mention localStorage for browser data');
    assert.ok(appContent.includes('SQLite'), 'Must distinguish SQLite for bot data');
  });
});
