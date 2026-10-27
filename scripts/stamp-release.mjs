import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
console.log(`Built release ${release.buildId}`);
