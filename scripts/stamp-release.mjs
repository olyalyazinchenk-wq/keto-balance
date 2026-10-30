import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Pre-publication check: ensure catalog validation passed
const reportPath = 'docs/release/catalog-validation-report.json';
if (!existsSync(reportPath)) {
  throw new Error('Release publication blocked: catalog validation report missing. Run scripts/validate-catalog.mjs');
}
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (report.summary?.status !== 'PASSED') {
  throw new Error(`Release publication blocked: catalog validation status is ${report.summary?.status} with ${report.summary?.errorCount} errors`);
}
writeFileSync('dist/catalog-validation-report.json', `${JSON.stringify(report, null, 2)}\n`);

const assets = readdirSync('dist/assets').sort();
if (!assets.some(name => name.endsWith('.js')) || !assets.some(name => name.endsWith('.css'))) {
  throw new Error('Release assets missing');
}
const hash = createHash('sha256');
for (const name of assets) {
  hash.update(name);
  hash.update(readFileSync(join('dist/assets', name)));
}
let gitSha = 'unknown';
try { gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
catch { /* Source archives may not contain .git. Artifact identity still exists. */ }
const release = {
  buildId: hash.digest('hex').slice(0, 16),
  gitSha,
  builtAt: new Date().toISOString(),
  assets,
};
writeFileSync('dist/release.json', `${JSON.stringify(release, null, 2)}\n`);
writeFileSync('dist/build-meta.json', `${JSON.stringify(release, null, 2)}\n`);
console.log(`Built release ${release.buildId}`);
