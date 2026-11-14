#!/usr/bin/env node
/**
 * Импорт версии приложения из Google AI Studio (ZIP) в репозиторий.
 *
 * Как получить ZIP: AI Studio → приложение → «Версии» → «Download version».
 * GitHub-синхронизация в AI Studio требует OAuth + sudo-подтверждение владельца,
 * поэтому ZIP — штатный и полностью автоматизируемый путь.
 *
 * Использование:
 *   node scripts/import-argon-version.mjs <путь-к-zip> [--slug=2026-10-30] [--commit]
 *
 * Что делает:
 *   1) распаковывает архив в design/argon-<slug> (по умолчанию — дата из имени файла или сегодня);
 *   2) удаляет служебную папку .aistudio и добавляет .gitignore/postcss.config.js;
 *   3) печатает diff против предыдущей версии (добавлено / изменено / удалено);
 *   4) с --commit сразу коммитит новую папку в текущую ветку.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DESIGN_DIR = path.join(ROOT, 'design');
const IGNORE = new Set(['node_modules', 'dist', '.git', '.aistudio']);

const args = process.argv.slice(2);
const zipArg = args.find((a) => !a.startsWith('--'));
if (!zipArg) {
  console.error('usage: node scripts/import-argon-version.mjs <zip> [--slug=YYYY-MM-DD] [--commit]');
  process.exit(1);
}
const slugArg = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
const doCommit = args.includes('--commit');

const zipPath = path.resolve(zipArg);
if (!fs.existsSync(zipPath)) {
  console.error(`нет файла: ${zipPath}`);
  process.exit(1);
}

function detectSlug() {
  if (slugArg) return slugArg;
  // ketopulse-telegram-oct-29-2026-3-42-08-am.zip -> 2026-10-29
  const m = path.basename(zipPath).match(/([a-z]{3})-(\d{1,2})-(\d{4})/i);
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if (m) {
    const month = months[m[1].toLowerCase()];
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

const slug = detectSlug();
const target = path.join(DESIGN_DIR, `argon-${slug}`);

if (fs.existsSync(target)) {
  console.error(`папка уже существует: ${target}\nукажи другой slug: --slug=...`);
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
execFileSync('powershell', ['-NoProfile', '-Command',
  `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${target}' -Force`], { stdio: 'inherit' });

fs.rmSync(path.join(target, '.aistudio'), { recursive: true, force: true });
fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules/\ndist/\n');
// Пустой postcss-конфиг обязателен: иначе Vite подхватит postcss.config.js
// основного проекта (Tailwind 3), а пакет собран на @tailwindcss/vite (Tailwind 4).
fs.writeFileSync(path.join(target, 'postcss.config.js'), 'export default {\n  plugins: {},\n}\n');

function walk(dir, base = dir, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      out.set(rel, createHash('sha1').update(fs.readFileSync(full)).digest('hex'));
    }
  }
  return out;
}

const prevDirs = fs.readdirSync(DESIGN_DIR)
  .filter((d) => /^argon-\d{4}-\d{2}-\d{2}$/.test(d) && d !== `argon-${slug}`)
  .sort();
const prev = prevDirs.length ? path.join(DESIGN_DIR, prevDirs[prevDirs.length - 1]) : null;

const next = walk(target);
console.log(`\nимпортировано: design/argon-${slug} — ${next.size} файлов`);

if (prev) {
  const before = walk(prev);
  const added = [...next.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !next.has(k));
  const changed = [...next.keys()].filter((k) => before.has(k) && before.get(k) !== next.get(k));
  console.log(`предыдущая версия: ${path.basename(prev)}`);
  console.log(`добавлено: ${added.length}${added.length ? '\n  ' + added.join('\n  ') : ''}`);
  console.log(`изменено:  ${changed.length}${changed.length ? '\n  ' + changed.join('\n  ') : ''}`);
  console.log(`удалено:   ${removed.length}${removed.length ? '\n  ' + removed.join('\n  ') : ''}`);
}

if (doCommit) {
  execFileSync('git', ['add', path.join('design', `argon-${slug}`)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('git', ['-c', 'user.name=Hermes', '-c', 'user.email=hermes@local',
    'commit', '-q', '-m', `design: import Argon version ${slug}`], { cwd: ROOT, stdio: 'inherit' });
  console.log('закоммичено');
} else {
  console.log('проверка: git status design/');
}
