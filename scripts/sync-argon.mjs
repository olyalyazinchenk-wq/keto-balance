#!/usr/bin/env node
/**
 * Синхронизация песочницы Argon (GitHub) и проверка сборки — одной командой.
 *
 *   node scripts/sync-argon.mjs            # забрать изменения и проверить сборку
 *   node scripts/sync-argon.mjs --no-build # только забрать и показать diff
 *
 * Что делает:
 *   1) клонирует/обновляет olyalyazinchenk-wq/Keto-Balance_Argon-4 в .cache/argon-repo;
 *   2) печатает новые коммиты и список изменённых файлов с прошлой синхронизации;
 *   3) подкладывает локальный postcss.config.js (иначе Vite возьмёт Tailwind 3
 *      из корня основного проекта и сборка упадёт);
 *   4) запускает tsc --noEmit и vite build, печатает реальный результат.
 *
 * Требует: gh CLI (авторизован), node/npm. Первый запуск ставит зависимости.
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const REPO = path.join(CACHE, 'argon-repo');
const MARKER = path.join(CACHE, 'argon-last-sync');
const REPO_SLUG = 'olyalyazinchenk-wq/Keto-Balance_Argon-4';
const noBuild = process.argv.includes('--no-build');

const ghPath = process.env.GH_PATH
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'gh', 'gh.exe');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

fs.mkdirSync(CACHE, { recursive: true });

if (!fs.existsSync(path.join(REPO, '.git'))) {
  console.log('клонирую песочницу…');
  run(ghPath, ['repo', 'clone', REPO_SLUG, REPO, '--', '--quiet']);
} else {
  run('git', ['-C', REPO, 'fetch', '--quiet', 'origin', 'main']);
  run('git', ['-C', REPO, 'reset', '--hard', '--quiet', 'origin/main']);
}

const head = run('git', ['-C', REPO, 'rev-parse', 'HEAD']).trim();
const headShort = head.slice(0, 8);
const subject = run('git', ['-C', REPO, 'log', '-1', '--pretty=%s']).trim();
const committed = run('git', ['-C', REPO, 'log', '-1', '--pretty=%cd', '--date=iso']).trim();

const last = fs.existsSync(MARKER) ? fs.readFileSync(MARKER, 'utf8').trim() : '';

console.log(`\nHEAD: ${headShort}  ${committed}\n  ${subject}`);

if (last === head) {
  console.log('\nновых коммитов нет — синхронизировано');
} else if (last) {
  const range = `${last}..${head}`;
  const log = run('git', ['-C', REPO, 'log', '--pretty=%h %s', range]).trim();
  const files = run('git', ['-C', REPO, 'diff', '--name-status', range]).trim();
  console.log(`\nновые коммиты (${last.slice(0, 8)}..${headShort}):\n${log}`);
  console.log(`\nизменённые файлы:\n${files}`);
} else {
  console.log('\nпервая синхронизация, сравнения нет');
}

fs.writeFileSync(MARKER, head);

// Vite поднимается вверх по дереву и находит postcss.config.js основного проекта
// (Tailwind 3), а песочница собрана на @tailwindcss/vite (Tailwind 4).
fs.writeFileSync(path.join(REPO, 'postcss.config.js'), 'export default {\n  plugins: {},\n}\n');

if (noBuild) {
  console.log('\nсборка пропущена (--no-build)');
  process.exit(0);
}

if (!fs.existsSync(path.join(REPO, 'node_modules'))) {
  console.log('\nставлю зависимости (первый раз, ~1 мин)…');
  execSync('npm install --no-audit --no-fund --legacy-peer-deps', {
    cwd: REPO, stdio: 'inherit',
    env: { ...process.env, HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:10809',
           HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:10809' },
  });
}

let ok = true;
try {
  execSync('npx tsc --noEmit', { cwd: REPO, stdio: 'inherit' });
  console.log('\n✔ типы: 0 ошибок');
} catch {
  console.log('\n✖ типы: есть ошибки (см. вывод выше)');
  ok = false;
}
try {
  const out = execSync('npm run build', { cwd: REPO, encoding: 'utf8' });
  const tail = out.split('\n').filter((l) => /dist\/|built in/.test(l)).join('\n');
  console.log(`\n✔ сборка ok\n${tail}`);
} catch (e) {
  console.log(`\n✖ сборка упала\n${(e.stdout || '') + (e.stderr || '')}`.slice(0, 2000));
  ok = false;
}

process.exit(ok ? 0 : 1);
