const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('src/ui/food-first/dailyTips.ts', 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const ctx = {exports: {}, Date}; vm.runInNewContext(js, ctx);
const {TIPS, tipForDate, dayKey} = ctx.exports;
test('at least 30 distinct tips and a complete cycle', () => {
  assert.ok(TIPS.length >= 30); assert.equal(new Set(TIPS).size, TIPS.length);
  const days = Array.from({length: TIPS.length}, (_, i) => tipForDate(new Date(2026, 0, 1+i)));
  assert.equal(new Set(days).size, TIPS.length);
  assert.equal(days[0], tipForDate(new Date(2026, 0, 1+TIPS.length)));
});
test('local calendar changes over month, leap day and year', () => {
  for (const [a,b] of [[new Date(2026,0,31),new Date(2026,1,1)],[new Date(2024,1,29),new Date(2024,2,1)],[new Date(2026,11,31),new Date(2027,0,1)]]) {
    assert.notEqual(dayKey(a), dayKey(b)); assert.notEqual(tipForDate(a), tipForDate(b));
  }
  assert.equal(tipForDate(new Date(2026,10,3,0)),tipForDate(new Date(2026,10,3,23,59)));
});
