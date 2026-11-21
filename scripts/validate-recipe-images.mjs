#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

export function validateRecipeImages({ publicDir = path.join(ROOT, 'public'), recipes, images } = {}) {
  const { RECIPE_IMAGES } = loadTs(path.join(ROOT, 'src/data/recipeImages.ts'));
  const catalog = recipes || [
    ...loadTs(path.join(ROOT, 'src/data/recipes.ts')).KETO_RELEASED_RECIPES,
    ...loadTs(path.join(ROOT, 'src/data/ketoDraftRecipes.ts')).KETO_DRAFT_RECIPES,
    ...loadTs(path.join(ROOT, 'src/data/monthlyCandidateRecipes.ts')).DECEMBER_REVIEW_CANDIDATES.filter(r => r.mode === 'keto'),
  ];
  const mapping = images || RECIPE_IMAGES;
  const seen = new Set();
  let bytes = 0;
  for (const recipe of catalog) {
    const src = mapping[recipe.id];
    if (!src || !/^\/media\/food-first\/[a-z0-9-]+\.webp$/.test(src)) throw new Error(`Recipe ${recipe.id} has no valid local photo`);
    for (const extension of ['webp', 'jpg']) {
      const filename = path.join(publicDir, src.replace(/\.webp$/, `.${extension}`));
      if (!fs.existsSync(filename)) throw new Error(`Recipe ${recipe.id} missing ${extension}: ${src}`);
      const data = fs.readFileSync(filename);
      const valid = extension === 'webp'
        ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
        : data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
      if (!valid || data.length < 1024 || data.length > 400 * 1024) throw new Error(`Recipe ${recipe.id} invalid or oversized ${extension}`);
      bytes += data.length;
      if (extension === 'webp') {
        const hash = createHash('sha256').update(data).digest('hex');
        if (seen.has(hash)) throw new Error(`Recipe ${recipe.id} reuses another dish image`);
        seen.add(hash);
      }
    }
  }
  return { recipes: catalog.length, files: catalog.length * 2, bytes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Recipe image validation PASS:', JSON.stringify(validateRecipeImages())); }
  catch (error) { console.error('Recipe image validation FAILED:', error.message); process.exitCode = 1; }
}
