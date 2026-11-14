const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UI_DIR = path.resolve(__dirname, '../../src/ui/food-first');

test('food-first ui components have clean import boundary without demo fixtures or express', () => {
  const files = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  assert.ok(files.length >= 4, 'Expected at least 4 food-first components');

  for (const file of files) {
    const content = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
    assert.doesNotMatch(
      content,
      /DEMO_/,
      `${file} must not import DEMO_* fixtures`
    );
    assert.doesNotMatch(
      content,
      /['"]express['"]/,
      `${file} must not import express`
    );
    assert.doesNotMatch(
      content,
      /design\/argon/,
      `${file} must not import from design/ donor workspace`
    );
  }
});

test('main.tsx and PilotApp.tsx do not import or execute legacy global loadStore', () => {
  const mainContent = fs.readFileSync(path.resolve(__dirname, '../../src/main.tsx'), 'utf8');
  assert.match(mainContent, /PilotApp/, 'main.tsx must import PilotApp');
  assert.doesNotMatch(mainContent, /import\s+App\s+from\s+['"]\.\/App['"]/, 'main.tsx must not import legacy App');

  const pilotAppPath = path.resolve(__dirname, '../../src/PilotApp.tsx');
  assert.ok(fs.existsSync(pilotAppPath), 'PilotApp.tsx must exist');
  const pilotContent = fs.readFileSync(pilotAppPath, 'utf8');
  assert.doesNotMatch(pilotContent, /loadStore/, 'PilotApp must not import or use loadStore');
  assert.doesNotMatch(pilotContent, /useStore/, 'PilotApp must not import or use useStore');
  assert.doesNotMatch(pilotContent, /['"]\.\/App['"]/, 'PilotApp must not import legacy App');
});

test('legacy App.tsx returns PilotApp without breaking typecheck', () => {
  const appContent = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf8');
  assert.match(appContent, /PilotApp/, 'App.tsx must reference PilotApp');
  assert.doesNotMatch(appContent, /return\s+<FoodFirstApp\s*\/>;/, 'App.tsx must not render unconfigured FoodFirstApp');
});
