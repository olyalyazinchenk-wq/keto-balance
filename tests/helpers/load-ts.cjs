// tests/helpers/load-ts.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

function loadTs(file, cache = new Map()) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const nativeRequire = createRequire(absolute);
  const localRequire = name => {
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(absolute), name);
      for (const candidate of [base, `${base}.ts`]) {
        if (candidate.endsWith('.ts') && fs.existsSync(candidate)) return loadTs(candidate, cache);
      }
    }
    return nativeRequire(name);
  };
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {\n${output}\n})`,
    { filename: absolute }
  );
  wrapper(module.exports, localRequire, module, absolute, path.dirname(absolute));
  return module.exports;
}

module.exports = { loadTs };
