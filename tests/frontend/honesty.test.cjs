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

  await t.test('NutritionistPage delegates to honest private support without simulated sending', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '../../src/pages/PrivateSupportPage.tsx'), 'utf-8');
    const pageBody = appContent.match(/function NutritionistPage\([^]*?(?=\nfunction |\n\/\*)/);
    assert.ok(pageBody && pageBody[0].includes('<PrivateSupportPage />'));
    assert.ok(page.includes('ничего не отправлено'));
    assert.ok(page.includes('keto_balance_userbot?start=question'));
    for (const forbidden of ['setTimeout', 'msgs.push', 'type="file"', 'Мария ответит']) {
      assert.ok(!page.includes(forbidden) && !pageBody[0].includes(forbidden));
    }
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
