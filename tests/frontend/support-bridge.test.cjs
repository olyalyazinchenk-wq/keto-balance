const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('private support bridge is honest and wired to the real route', () => {
  const page = fs.readFileSync('src/pages/PrivateSupportPage.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(page.includes('keto_balance_userbot?start=question'));
  assert.ok(page.includes('ничего не отправлено'));
  assert.ok(!page.includes('olga_nutri_med'));
  assert.ok(app.includes('<PrivateSupportPage />'));
  const nutri = app.match(/function NutritionistPage\([^]*?(?=\nfunction |\n\/\*)/);
  const widget = app.match(/function ChatWidget\([^]*?(?=\nfunction |\n\/\*)/);
  assert.ok(nutri && widget);
  for (const body of [nutri[0], widget[0]]) {
    assert.ok(!body.includes('setTimeout'));
    assert.ok(!body.includes('msgs.push'));
    assert.ok(!body.includes('type="file"'));
  }
  assert.ok(app.includes('<TechnicalNotice />'));
});
