const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('support is reachable before onboarding without opening other sections', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const router = app.match(/function Router\(\)[^]*?(?=\nexport default function App)/)[0];
  const onboarding = app.match(/function Onboarding\(\)[^]*?(?=\n\/\*)/)[0];
  assert.match(router, /r\.path === "\/nutritionist"/);
  assert.match(router, /r\.parts\.length === 1/);
  assert.match(router, /<Onboarding\s*\/>/);
  assert.match(router, /hidden=\{[^}]+\}/);
  assert.match(router, /Вернуться к анкете/);
  assert.match(onboarding, /Помощь/);
  assert.match(onboarding, /go\("#\/nutritionist"\)/);
});
