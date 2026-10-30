const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const originalRead = fs.readFileSync;
const originalExists = fs.existsSync;
let runtimeReadAttempts = 0;
const isRuntimeData = (file) =>
  path.basename(String(file).replaceAll('\\', '/')) === 'bot_data.json';

beforeEach(() => {
  runtimeReadAttempts = 0;
  // Synthetic existence sentinel: no metadata/content read of the real file.
  fs.existsSync = (file) => isRuntimeData(file) || originalExists(file);
  fs.readFileSync = (file, ...args) => {
    if (isRuntimeData(file)) {
      runtimeReadAttempts += 1;
      throw new Error('Synthetic trap: runtime data read is forbidden');
    }
    return originalRead(file, ...args);
  };
});

afterEach(() => {
  fs.readFileSync = originalRead;
  fs.existsSync = originalExists;
  assert.equal(runtimeReadAttempts, 0, 'validator attempted runtime data access');
});

async function validator() {
  const url = pathToFileURL(
    path.resolve(__dirname, '../../scripts/validate-catalog.mjs')
  ).href;
  return (await import(url)).runCatalogValidation;
}

test('default validation never reads implicit runtime bot data', async () => {
  const run = await validator();
  const report = run();
  assert.equal(report.botSync.status, 'NOT_RUN');
  assert.equal(report.botDataPath, null);
});

test('required sync fails when no explicit fixture is supplied', async () => {
  const run = await validator();
  assert.throws(() => run({ requireBotSync: true }), /explicit/i);
});

test('malformed explicit bot fixture is rejected', async () => {
  const run = await validator();
  assert.throws(() => run({ botRecipes: null }), TypeError);
  assert.throws(() => run({ botRecipes: [{}] }), TypeError);
});

test('an explicit empty fixture cannot pass bot synchronization', async () => {
  const run = await validator();
  const report = run({ botRecipes: [], requireBotSync: true });
  assert.equal(report.botSync.status, 'FAILED');
  assert.ok(report.summary.botSyncErrors > 0);
  assert.equal(report.summary.status, 'FAILED');
});

test('missing static catalog fails rather than returning an empty success', async () => {
  const run = await validator();
  const guardedRead = fs.readFileSync;
  fs.readFileSync = (file, ...args) => {
    const normalized = String(file).replaceAll('\\', '/');
    if (normalized.endsWith('/src/data/recipes.ts')) {
      throw new Error('Synthetic missing static catalog');
    }
    return guardedRead(file, ...args);
  };
  assert.throws(() => run(), /Synthetic missing static catalog/);
});

test('vite config isolates envDir from root backend env', () => {
  const configFile = path.resolve(__dirname, '../../vite.config.ts');
  const content = fs.readFileSync(configFile, 'utf-8');
  assert.match(content, /envDir:\s*['"]\.\/src\/core\/env['"]/);
});

test('vite loadEnv respects isolated envDir without accessing root .env', () => {
  const { loadEnv } = require('vite');
  const isolatedDir = path.resolve(__dirname, '../../src/core/env');
  let rootEnvAttempts = 0;
  const guardedRead = fs.readFileSync;
  fs.readFileSync = (file, ...args) => {
    const norm = String(file).replaceAll('\\', '/');
    if (norm.endsWith('/.env') && !norm.includes('src/core/env')) {
      rootEnvAttempts += 1;
      throw new Error('Synthetic trap: root .env read is forbidden');
    }
    return guardedRead(file, ...args);
  };
  try {
    const loaded = loadEnv('production', isolatedDir);
    assert.deepEqual(loaded, {});
    assert.equal(rootEnvAttempts, 0);
  } finally {
    fs.readFileSync = guardedRead;
  }
});

