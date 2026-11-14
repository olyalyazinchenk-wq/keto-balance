/**
 * tests/frontend/isolated-build-archive-immutability.test.cjs
 *
 * Verifies that build-isolated.mjs strictly enforces catalog immutability by copying
 * catalogs/archive into the isolated snapshot, tracking catalogs in source manifest,
 * and failing with non-zero exit code if a recipe is modified under the same catalog ID.
 * Addresses Codex Audit 2026-11-08: Group 2 (P1).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { loadTs } = require('../helpers/load-ts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const { computeRecipeHash } = require('../../scripts/export-release-catalog.mjs');

describe('Isolated Build Archive Immutability & Manifest (Codex Group 2)', () => {
  test('Modifying recipe content under same catalog ID causes isolated build to fail with exit code 1', () => {
    // 1. Prepare temporary fixture mirroring minimal build workspace
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-archive-immutability-'));

    try {
      for (const name of ['src', 'public', 'scripts', 'bot', 'docs/release', 'tests/helpers', 'tests/fixtures', 'catalogs']) {
        const src = path.join(ROOT, name);
        if (fs.existsSync(src)) {
          fs.cpSync(src, path.join(fixtureDir, name), { recursive: true });
        }
      }

      for (const name of [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'tailwind.config.js',
        'postcss.config.js',
        'index.html',
      ]) {
        fs.copyFileSync(path.join(ROOT, name), path.join(fixtureDir, name));
      }

      // Junction node_modules to run build tools
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(fixtureDir, 'node_modules'), 'junction');

      // 2. Introduce mutation: change k1 egg count from 4 to 6 pcs, update sourceHash in approvals, but KEEP catalog_id
      const recipesFile = path.join(fixtureDir, 'src/data/recipes.ts');
      fs.appendFileSync(recipesFile, '\nRECIPES.find(r => r.id === "k1")!.ing[0][1] = "6 шт";\n');
      const changedRecipe = loadTs(recipesFile).RECIPES.find((r) => r.id === 'k1');
      const newHash = computeRecipeHash(changedRecipe);
      fs.appendFileSync(
        path.join(fixtureDir, 'src/data/releasedRecipeIds.ts'),
        `\n(RELEASED_RECIPE_APPROVALS.find(r => r.id === "k1") as any).sourceHash = "${newHash}";\n`
      );

      // 3. Run isolated build — MUST FAIL with non-zero exit code due to archive conflict!
      let buildFailed = false;
      let buildOutput = '';
      try {
        execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-isolated.mjs'), '--json'], {
          cwd: fixtureDir,
          encoding: 'utf8',
          timeout: 180000,
          env: { ...process.env, KETO_LOAD_DOTENV: '0' },
        });
      } catch (err) {
        buildFailed = true;
        buildOutput = (err.stdout || '') + (err.stderr || '');
      }

      assert.equal(buildFailed, true, 'Isolated build must fail when a recipe is modified under the same catalog ID');
      assert.ok(
        buildOutput.includes('Immutability violation'),
        `Build error must state Immutability violation, got: ${buildOutput}`
      );
    } finally {
      // Clean up junction and temp dir
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch {}
    }
  });

  test('Valid historical catalog in archive is manifested and copied to dist', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-archive-valid-'));

    try {
      for (const name of ['src', 'public', 'scripts', 'bot', 'docs/release', 'tests/helpers', 'tests/fixtures', 'catalogs']) {
        const src = path.join(ROOT, name);
        if (fs.existsSync(src)) {
          fs.cpSync(src, path.join(fixtureDir, name), { recursive: true });
        }
      }

      for (const name of [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'tailwind.config.js',
        'postcss.config.js',
        'index.html',
      ]) {
        fs.copyFileSync(path.join(ROOT, name), path.join(fixtureDir, name));
      }

      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(fixtureDir, 'node_modules'), 'junction');

      // Place a historical catalog in catalogs/archive/
      const historicalId = 'released-catalog-202610-audit';
      const historicalPath = path.join(fixtureDir, `catalogs/archive/${historicalId}.json`);
      fs.writeFileSync(
        historicalPath,
        JSON.stringify({
          schema_version: 1,
          catalog_id: historicalId,
          catalog_month: '2026-10',
          recipes: [],
        })
      );

      // Run isolated build
      const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-isolated.mjs'), '--json'], {
        cwd: fixtureDir,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, KETO_LOAD_DOTENV: '0' },
      });

      const receipt = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
      assert.ok(receipt.dist_dir);

      // 1. Verify manifest tracks catalogs/archive
      const manifest = JSON.parse(fs.readFileSync(receipt.source_manifest_path, 'utf8'));
      const manifestEntries = Object.keys(manifest).filter((k) => k.startsWith('catalogs/'));
      assert.ok(
        manifestEntries.includes(`catalogs/archive/${historicalId}.json`),
        'Source manifest must track historical catalog in archive'
      );

      // 2. Verify historical catalog is delivered in dist
      const distHistoricalPath = path.join(receipt.dist_dir, `${historicalId}.json`);
      assert.ok(
        fs.existsSync(distHistoricalPath),
        'Historical catalog must be copied to delivered dist/'
      );
    } finally {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
