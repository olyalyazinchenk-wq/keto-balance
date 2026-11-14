const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

function loadTs(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    const err = new Error(`Cannot find module '${relPath}' at '${fullPath}'`);
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  const source = fs.readFileSync(fullPath, 'utf8');
  const { code } = esbuild.transformSync(source, {
    loader: fullPath.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs',
    target: 'node20',
    sourcefile: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(code, fullPath);
  return mod.exports;
}

module.exports = { loadTs };
