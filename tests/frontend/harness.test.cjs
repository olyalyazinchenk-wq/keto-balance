const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');

test('test harness loads and runs node:test', () => {
  assert.strictEqual(1 + 1, 2);
});

test('loadTs can load a typescript fixture', () => {
  const tmpFile = path.resolve(__dirname, '../helpers/test-fixture.ts');
  fs.writeFileSync(tmpFile, 'export const answer: number = 42; export function add(a: number, b: number): number { return a + b; }');
  try {
    const mod = loadTs(tmpFile);
    assert.strictEqual(mod.answer, 42);
    assert.strictEqual(mod.add(10, 5), 15);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
