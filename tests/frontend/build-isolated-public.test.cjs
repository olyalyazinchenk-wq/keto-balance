const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');

test('isolated build copies public assets into the snapshot', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'scripts/build-isolated.mjs'),
    'utf8'
  );
  assert.match(
    src,
    /copyDirectoryFiltered\(\s*['"]public['"]/,
    'build-isolated.mjs must copy public directory to snapshot'
  );
});

test('isolated build computes source hash manifest for public assets', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'scripts/build-isolated.mjs'),
    'utf8'
  );
  assert.match(
    src,
    /hashDir\(\s*['"]public['"]\s*\)/,
    'build-isolated.mjs must compute hash manifest for public directory'
  );
});

test('public media is trackable by git (unignored in .gitignore)', () => {
  const heroResult = spawnSync(
    'git',
    ['check-ignore', '-q', 'public/media/food-first/hero.webp'],
    { cwd: ROOT }
  );
  assert.equal(
    heroResult.status,
    1,
    'public/media/food-first/hero.webp must not be ignored'
  );

  const startResult = spawnSync(
    'git',
    ['check-ignore', '-q', 'public/media/start/keto_salmon_plate.png'],
    { cwd: ROOT }
  );
  assert.equal(
    startResult.status,
    1,
    'public/media/start/keto_salmon_plate.png must not be ignored'
  );

  const rootMediaResult = spawnSync(
    'git',
    ['check-ignore', '-q', 'media/test.bin'],
    { cwd: ROOT }
  );
  assert.equal(
    rootMediaResult.status,
    0,
    'root media/ must remain ignored'
  );
});
