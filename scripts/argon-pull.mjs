#!/usr/bin/env node
/**
 * Синхронизация песочницы Argon и проверка сборки — без git (через API GitHub).
 *
 *   node scripts/argon-pull.mjs             # забрать свежий коммит и проверить сборку
 *   node scripts/argon-pull.mjs --no-build  # только забрать и показать diff
 *
 * Почему не git: в этой сети `git fetch` по https к GitHub отдаёт
 * «fatal: expected flush after ref listing» — и напрямую, и через Happ-прокси.
 * `gh api` при этом работает, поэтому берём tarball коммита и распаковываем.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const SRC = path.join(CACHE, 'argon-src');
const PREV = path.join(CACHE, 'argon-prev');
const MARKER = path.join(CACHE, 'argon-last-sync');
const REPO_SLUG = 'olyalyazinchenk-wq/Keto-Balance_Argon-4';
const noBuild = process.argv.includes('--no-build');

const ghPath = process.env.GH_PATH
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'gh', 'gh.exe');
const PROXY_ENV = {
  ...process.env,
  HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:10809',
  HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:10809',
};
const gh = (args) => execFileSync(ghPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: PROXY_ENV });

const IGNORE = new Set(['node_modules', '.git', '.aistudio', 'dist',
  'package-lock.json', 'postcss.config.js']);

fs.mkdirSync(CACHE, { recursive: true });

const sha = gh(['api', `repos/${REPO_SLUG}/commits/main`, '--jq', '.sha']).trim();
let meta = { message: '', date: '' };
try {
  meta = JSON.parse(gh(['api', `repos/${REPO_SLUG}/commits?per_page=1`, '--jq', '.[0] | {message: .commit.message, date: .commit.author.date}']));
} catch (e) {
  meta = { message: 'syncing HEAD', date: new Date().toISOString() };
}
console.log(`\nHEAD: ${sha.slice(0, 8)}  ${meta.date}\n  ${meta.message.split('\n')[0]}`);

const last = fs.existsSync(MARKER) ? fs.readFileSync(MARKER, 'utf8').trim() : '';

if (last === sha && fs.existsSync(SRC)) {
  console.log('\nновых коммитов нет — синхронизировано');
} else {
  const tgz = path.join(CACHE, 'argon-head.tgz');
  fs.mkdirSync(SRC, { recursive: true });
  for (const item of fs.readdirSync(SRC)) {
    if (item === 'node_modules') continue;
    try {
      fs.rmSync(path.join(SRC, item), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      console.warn(`warning: could not remove ${item}:`, e.message);
    }
  }
  const fd = fs.openSync(tgz, 'w');
  try {
    execFileSync(ghPath, ['api', `repos/${REPO_SLUG}/tarball/${sha}`],
      { stdio: ['ignore', fd, 'inherit'], maxBuffer: 128 * 1024 * 1024, env: PROXY_ENV });
  } finally {
    fs.closeSync(fd);
  }
  // tar на Windows принимает «C:\...» за удалённый хост — запускаем из CACHE с относительными путями
  execFileSync('tar', ['-xzf', path.basename(tgz), '-C', path.basename(SRC), '--strip-components=1'],
    { cwd: CACHE, stdio: 'inherit' });
  fs.rmSync(tgz, { force: true });
  console.log('\nархив распакован');
}

function snapshot(dir) {
  const map = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        map.set(path.relative(dir, full).split(path.sep).join('/'),
          createHash('sha1').update(fs.readFileSync(full)).digest('hex'));
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return map;
}

const next = snapshot(SRC);
if (!last || !fs.existsSync(PREV)) {
  console.log(`\nпервая синхронизация: файлов ${next.size}`);
} else {
  const before = snapshot(PREV);
  const added = [...next.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !next.has(k));
  const changed = [...next.keys()].filter((k) => before.has(k) && before.get(k) !== next.get(k));
  const show = (label, list) => {
    console.log(`${label}: ${list.length}${list.length ? '\n  ' + list.slice(0, 30).join('\n  ') : ''}`);
  };
  show('добавлено', added);
  show('изменено ', changed);
  show('удалено  ', removed);
}

// Vite поднимается вверх по дереву и находит postcss.config.js основного проекта
// (Tailwind 3), а песочница собрана на @tailwindcss/vite (Tailwind 4).
fs.writeFileSync(path.join(SRC, 'postcss.config.js'), 'export default {\n  plugins: {},\n}\n');

const remember = () => {
  fs.writeFileSync(MARKER, sha);
  fs.rmSync(PREV, { recursive: true, force: true });
  fs.cpSync(SRC, PREV, { recursive: true, filter: (p) => !p.includes('node_modules') });
};

if (noBuild) {
  remember();
  console.log('\nсборка пропущена (--no-build)');
  process.exit(0);
}

if (!fs.existsSync(path.join(SRC, 'node_modules'))) {
  console.log('\nставлю зависимости (для этой папки первый раз, ~1–2 мин)…');
  execSync('npm install --no-audit --no-fund --legacy-peer-deps', {
    cwd: SRC, stdio: 'inherit',
    env: { ...process.env,
      HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:10809',
      HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:10809' },
  });
}

let ok = true;
try {
  execSync('npx tsc --noEmit', { cwd: SRC, stdio: 'inherit' });
  console.log('\n✔ типы: 0 ошибок');
} catch {
  console.log('\n✖ типы: есть ошибки (см. вывод выше)');
  ok = false;
}
try {
  const out = execSync('npm run build', { cwd: SRC, encoding: 'utf8' });
  console.log('\n✔ сборка ok\n' +
    out.split('\n').filter((l) => /dist\/|built in/.test(l)).join('\n'));
} catch (e) {
  console.log(`\n✖ сборка упала\n${(e.stdout || '') + (e.stderr || '')}`.slice(0, 2000));
  ok = false;
}

remember();
process.exit(ok ? 0 : 1);
