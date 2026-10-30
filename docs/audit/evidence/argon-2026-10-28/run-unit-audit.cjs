'use strict';
// Audit harness only: no server startup, dependency installation or network.
// Run from this repository with a separate, sanitized Argon source snapshot.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const snapshot = process.argv[2];
if (!snapshot) throw new Error('Usage: node run-unit-audit.cjs <Argon snapshot root>');
const names = ['ketoLogic.ts', 'telegramWebApp.ts', 'ketoLogic.test.ts'];
const files = Object.fromEntries(names.map(name => [
  name, fs.readFileSync(path.join(snapshot, 'src', 'utils', name), 'utf8'),
]));
const context = vm.createContext({ console });
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  if (!Object.hasOwn(files, name)) throw new Error(`Blocked module: ${name}`);
  const module = { exports: {} };
  cache.set(name, module);
  const { outputText } = ts.transpileModule(files[name], {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  const fn = vm.runInContext(
    `(function(exports, require, module) {\n${outputText}\n})`,
    context,
    { filename: name },
  );
  function safeRequire(spec) {
    if (spec === 'node:test' || spec === 'node:assert/strict') return require(spec);
    if (spec === './ketoLogic') return load('ketoLogic.ts');
    if (spec === './telegramWebApp') return load('telegramWebApp.ts');
    throw new Error(`Blocked import: ${spec}`);
  }
  fn(module.exports, safeRequire, module);
  return module.exports;
}
load('ketoLogic.test.ts');
