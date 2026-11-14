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
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(absolute), name);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]) {
        if ((candidate.endsWith('.ts') || candidate.endsWith('.tsx') || candidate.endsWith('.js')) && fs.existsSync(candidate)) {
          return loadTs(candidate, cache);
        }
      }
    }
    return nativeRequire(name);
  };
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname, React) {\nconst React_1 = React;\n${output}\n})`,
    { filename: absolute }
  );
  const React = nativeRequire('react');
  wrapper(module.exports, localRequire, module, absolute, path.dirname(absolute), React);
  return module.exports;
}

module.exports = { loadTs };
