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
