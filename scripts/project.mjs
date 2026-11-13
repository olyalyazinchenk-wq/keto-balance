#!/usr/bin/env node
// Project-local entrypoint independent of a broken host npm/npx shim.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [task, ...extra] = process.argv.slice(2);
const commands = {
  build: ['scripts/build-isolated.mjs', '--json'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '--pretty', 'false'],
  unit: ['--test', '--test-reporter=tap', ...readdirSync(path.join(root, 'tests/frontend')).filter(f => f.endsWith('.test.cjs')).sort().map(f => `tests/frontend/${f}`)],
  e2e: ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.full.config.ts'],
};
if (!commands[task]) {
  console.error('Usage: node scripts/project.mjs build|typecheck|unit|e2e [extra arguments]');
  process.exit(2);
}
const run = spawnSync(process.execPath, [...commands[task], ...extra], {
  cwd: root, stdio: 'inherit', env: { ...process.env, KETO_LOAD_DOTENV: '0' },
});
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
