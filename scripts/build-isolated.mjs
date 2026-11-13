import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const isJson = args.includes('--json');
const isServeTest = args.includes('--serve-test');

function log(...msgs) {
  if (isJson) {
    console.error(...msgs);
  } else {
    console.log(...msgs);
  }
}

// 1. Determine Hermes Scratch Root
const localAppData = process.env.LOCALAPPDATA;
const scratchBase = localAppData
  ? path.join(localAppData, 'hermes', 'cache', 'scratch')
  : path.join(os.tmpdir(), 'hermes', 'cache', 'scratch');

mkdirSync(scratchBase, { recursive: true });
const runId = `build-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runDir = path.join(scratchBase, runId);
const snapshotDir = path.join(runDir, 'workspace');
mkdirSync(snapshotDir, { recursive: true });

log(`[ISOLATED_BUILD] Scratch run root: ${runDir}`);

// 2. Allowlisted copy of source files
const ALLOWLIST_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  'requirements.txt',
  'requirements-p0.txt',
  '.dockerignore',
];

function isSafeSourceFile(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(norm);
  if (base.endsWith('.db') || base.endsWith('.sqlite') || base.endsWith('.sqlite3')) return false;
  if (base.startsWith('.env')) return false;
  if (base === 'bot_data.json' || base === 'current_tunnel_url.txt' || base === '.tunnel_cache.json') return false;
  if (base === 'catalog-validation-report.json') return false; // Generated during validation.
  if (norm.includes('__pycache__') || norm.includes('.git/') || norm.includes('dist/')) return false;
  return true;
}

function copyDirectoryFiltered(srcDir, destDir, allowedExtensions = null) {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (!isSafeSourceFile(srcPath)) continue;
    if (entry.isDirectory()) {
      if (entry.name !== '__pycache__' && entry.name !== 'node_modules' && entry.name !== 'dist') {
        copyDirectoryFiltered(srcPath, destPath, allowedExtensions);
      }
    } else if (entry.isFile()) {
      if (allowedExtensions && !allowedExtensions.some((ext) => entry.name.endsWith(ext))) {
        continue;
      }
      cpSync(srcPath, destPath);
    }
  }
}

for (const file of ALLOWLIST_FILES) {
  if (existsSync(file) && isSafeSourceFile(file)) {
    cpSync(file, path.join(snapshotDir, file));
  }
}

copyDirectoryFiltered('src', path.join(snapshotDir, 'src'));
copyDirectoryFiltered('public', path.join(snapshotDir, 'public'));
copyDirectoryFiltered('scripts', path.join(snapshotDir, 'scripts'), ['.mjs', '.js', '.py']);
copyDirectoryFiltered('docs/release', path.join(snapshotDir, 'docs/release'), ['.md', '.json']);
copyDirectoryFiltered('docs/content', path.join(snapshotDir, 'docs/content'), ['.md', '.json']);
copyDirectoryFiltered('tests/fixtures', path.join(snapshotDir, 'tests/fixtures'), ['.json']);
copyDirectoryFiltered('tests/helpers', path.join(snapshotDir, 'tests/helpers'), ['.cjs', '.js', '.py']);
if (existsSync('catalogs')) {
  copyDirectoryFiltered('catalogs', path.join(snapshotDir, 'catalogs'), ['.json']);
}

// Copy only .py source files from bot/ (strictly forbidding .db and runtime data)
if (existsSync('bot')) {
  copyDirectoryFiltered('bot', path.join(snapshotDir, 'bot'), ['.py']);
}

// Link node_modules via NTFS junction
const nodeModulesSrc = path.resolve('node_modules');
const nodeModulesDest = path.join(snapshotDir, 'node_modules');
if (existsSync(nodeModulesSrc)) {
  try {
    symlinkSync(nodeModulesSrc, nodeModulesDest, 'junction');
  } catch (err) {
    log(`[WARN] Failed to create node_modules junction: ${err.message}. Trying copy fallback.`);
  }
}

// 3. Sidecar synthetic test catalog (placed outside production dist)
const testCatalogPath = path.join(runDir, 'synthetic-test-catalog.json');
const fixtureCatalogSrc = path.resolve('tests/fixtures/pilot/catalog.json');
if (existsSync(fixtureCatalogSrc)) {
  cpSync(fixtureCatalogSrc, testCatalogPath);
} else {
  writeFileSync(testCatalogPath, JSON.stringify({ schema_version: 1, test_only: true, released_ids: [], recipes: [] }));
}

// 4. Source hash manifest
const sourceManifest = {};
function hashDir(dirRel) {
  const full = path.join(snapshotDir, dirRel);
  if (!existsSync(full)) return;
  const entries = readdirSync(full, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dirRel, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        hashDir(rel);
      }
    } else if (entry.isFile()) {
      const content = readFileSync(path.join(snapshotDir, rel));
      sourceManifest[rel] = createHash('sha256').update(content).digest('hex');
    }
  }
}
hashDir('src');
hashDir('public');
hashDir('scripts');
hashDir('bot');
hashDir('catalogs');
hashDir('docs');
hashDir('tests');
for (const file of ALLOWLIST_FILES) {
  if (existsSync(path.join(snapshotDir, file))) {
    sourceManifest[file] = createHash('sha256').update(readFileSync(path.join(snapshotDir, file))).digest('hex');
  }
}
const sourceFingerprint = createHash('sha256').update(JSON.stringify(
  Object.fromEntries(Object.entries(sourceManifest).sort(([a], [b]) => a.localeCompare(b)))
)).digest('hex');

// Save complete source manifest to disk
const sourceManifestPath = path.join(runDir, 'source-manifest.json');
writeFileSync(sourceManifestPath, JSON.stringify(sourceManifest, null, 2));

// 5. Detect git status
let gitSha = 'unknown';
let dirty = false;
try {
  gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (status.length > 0) dirty = true;
} catch {}

const ALLOWED_ENV_VARS = [
  'PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'TMPDIR', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE',
  'HOME', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  'NODE_ENV', 'CI'
];

function getCleanEnv(extra = {}) {
  const clean = {};
  for (const key of ALLOWED_ENV_VARS) {
    if (process.env[key] !== undefined) {
      clean[key] = process.env[key];
    }
  }
  return {
    ...clean,
    KETO_LOAD_DOTENV: '0',
    APP_STAGE: 'test',
    GIT_SHA: gitSha,
    GIT_DIRTY: dirty ? '1' : '0',
    SOURCE_FINGERPRINT: sourceFingerprint,
    ...extra,
  };
}

// 6. Execute build lifecycle inside snapshot directory
const executedCommands = [];
function runStep(cmd, stepArgs) {
  log(`[BUILD_STEP] ${cmd} ${stepArgs.join(' ')}`);
  const t0 = Date.now();
  try {
    const stdout = execFileSync(cmd, stepArgs, {
      cwd: snapshotDir,
      encoding: 'utf8',
      env: getCleanEnv(),
    });
    executedCommands.push({ cmd: `${cmd} ${stepArgs.join(' ')}`, exitCode: 0, durationMs: Date.now() - t0 });
    return stdout;
  } catch (err) {
    log(`[BUILD_ERROR] Step failed: ${err.message}`);
    if (err.stdout) log(err.stdout);
    if (err.stderr) log(err.stderr);
    process.exit(1);
  }
}

// Validation -> Typecheck -> Vite Build -> Catalog Export -> Release Stamp
runStep(process.execPath, ['scripts/validate-catalog.mjs']);
runStep(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '--pretty', 'false']);
runStep(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist']);
runStep(process.execPath, ['scripts/export-release-catalog.mjs']);
runStep(process.execPath, ['scripts/stamp-release.mjs']);

const distDir = path.join(snapshotDir, 'dist');
if (!existsSync(path.join(distDir, 'index.html')) || !existsSync(path.join(distDir, 'release.json'))) {
  log('[ERROR] Dist build incomplete.');
  process.exit(1);
}

// 7. Read release metadata and compute hashes
const releaseData = JSON.parse(readFileSync(path.join(distDir, 'release.json'), 'utf8'));
const receiptPath = path.join(runDir, 'build-receipt.json');

const receipt = {
  dist_dir: distDir,
  test_catalog_path: testCatalogPath,
  receipt_path: receiptPath,
  source_manifest_path: sourceManifestPath,
  build_id: releaseData.buildId,
  git_sha: gitSha,
  dirty,
  catalog_hash: releaseData.catalogHash || 'unknown',
  backend_fingerprint: releaseData.backendFingerprint || 'unknown',
  source_manifest_count: Object.keys(sourceManifest).length,
  source_fingerprint: sourceFingerprint,
  workspace_dir: snapshotDir,
  commands: executedCommands,
  built_at: new Date().toISOString(),
};

writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
const latestReceiptPath = path.join(scratchBase, 'latest-build-receipt.json');
writeFileSync(latestReceiptPath, JSON.stringify(receipt, null, 2));

log(`[ISOLATED_BUILD] Success! Build ID: ${receipt.build_id}, Receipt: ${receiptPath}`);

if (isJson) {
  process.stdout.write(
    JSON.stringify({
      dist_dir: distDir,
      test_catalog_path: testCatalogPath,
      receipt_path: receiptPath,
      source_manifest_path: sourceManifestPath,
      source_fingerprint: sourceFingerprint,
      workspace_dir: snapshotDir,
      build_id: receipt.build_id,
      catalog_hash: receipt.catalog_hash,
      backend_fingerprint: receipt.backend_fingerprint,
    }) + '\n'
  );
}

// 7. Handle CLI modes
if (isServeTest) {
  const pythonExe = existsSync(path.resolve('.venv-p0/Scripts/python.exe'))
    ? path.resolve('.venv-p0/Scripts/python.exe')
    : 'python';

  log(`[SERVE_TEST] Starting pilot test server on 18080 using ${pythonExe}...`);
  const serverProc = spawn(
    pythonExe,
    [
      '-B',
      path.join(snapshotDir, 'scripts/pilot_test_server.py'),
      '--port',
      '18080',
      '--dist',
      distDir,
      '--catalog',
      testCatalogPath,
    ],
    {
      stdio: isJson ? ['ignore', 'ignore', 'inherit'] : 'inherit',
      env: getCleanEnv({
        PYTHONPATH: snapshotDir,
      }),
      cwd: snapshotDir,
    }
  );

  const cleanShutdown = () => {
    log('[SERVE_TEST] Stopping test server...');
    try {
      serverProc.kill();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanShutdown);
  process.on('SIGTERM', cleanShutdown);
  serverProc.on('exit', (code) => {
    process.exit(code || 0);
  });
} else if (!isJson) {
  console.log(`\nIsolated Build Summary:`);
  console.log(`- Dist Directory:      ${distDir}`);
  console.log(`- Test Catalog Path:   ${testCatalogPath}`);
  console.log(`- Receipt Path:        ${receiptPath}`);
  console.log(`- Frontend Build ID:   ${receipt.build_id}`);
  console.log(`- Git SHA / Dirty:     ${receipt.git_sha} (${receipt.dirty ? 'DIRTY' : 'CLEAN'})`);
  console.log(`- Catalog Hash:        ${receipt.catalog_hash}`);
  console.log(`- Backend Fingerprint: ${receipt.backend_fingerprint}`);
}
