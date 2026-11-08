#!/usr/bin/env node
/**
 * scripts/export-release-catalog.mjs
 *
 * Экспорт проверенного канонического каталога рецептов в статический артефакт
 * dist/released-catalog.json со схемой PilotCatalogV1 (Раздел 5.3).
 * Сохраняет подтверждённые неизменяемые версии в catalogs/archive/ и предотвращает перезапись существующих ID.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const sortedKeys = Object.keys(value).sort();
  const result = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

export function computeRecipeHash(recipe) {
  // Рекурсивно детерминированный JSON для всех вложенных структур
  const canonical = canonicalize(recipe);
  const serialized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export function exportReleaseCatalog(options = {}) {
  const recipesPath = options.recipesPath ?? path.join(ROOT, 'src/data/recipes.ts');
  const releasedIdsPath = options.releasedIdsPath ?? path.join(ROOT, 'src/data/releasedRecipeIds.ts');
  const outputPath = options.outputPath ?? path.join(ROOT, 'dist/released-catalog.json');
  const testOnly = options.testOnly ?? false;

  const { RECIPES } = loadTs(recipesPath);
  const {
    RELEASED_RECIPE_IDS,
    OWNER_ACCEPTANCE_RECIPE_IDS,
    OWNER_REVIEW_CARNIVORE_IDS,
    RELEASED_RECIPE_APPROVALS,
  } = loadTs(releasedIdsPath);

  if (!Array.isArray(RECIPES)) {
    throw new TypeError('RECIPES must be an array.');
  }

  const releasedIds = options.releasedIds ?? (OWNER_ACCEPTANCE_RECIPE_IDS || RELEASED_RECIPE_IDS);
  const approvals = options.approvals ?? (RELEASED_RECIPE_APPROVALS || []);

  if (!Array.isArray(releasedIds)) {
    throw new TypeError('releasedIds must be an array.');
  }

  // 1. Проверка на дубликаты
  const seenIds = new Set();
  for (const id of releasedIds) {
    if (seenIds.has(id)) {
      throw new Error(`Duplicate recipe ID in released list: ${id}`);
    }
    seenIds.add(id);
  }

  // 2. Индексация рецептов
  const recipesMap = new Map();
  for (const r of RECIPES) {
    recipesMap.set(r.id, r);
  }

  const approvalsMap = new Map();
  for (const a of approvals) {
    approvalsMap.set(a.id, a);
  }

  const approvedRecipes = [];

  for (const id of releasedIds) {
    const recipe = recipesMap.get(id);
    if (!recipe) {
      throw new Error(`Released recipe ID not found in recipes catalog: ${id}`);
    }

    if (!testOnly) {
      const approval = approvalsMap.get(id);
      if (!approval) {
        throw new Error(`Missing approval record for released recipe: ${id}`);
      }
      if (!approval.approvalRef || typeof approval.approvalRef !== 'string') {
        throw new Error(`Invalid or empty approvalRef for recipe: ${id}`);
      }
      if (!approval.approvalDate || !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvalDate)) {
        throw new Error(`Invalid or missing approvalDate for recipe: ${id}`);
      }
      const actualHash = computeRecipeHash(recipe);
      if (!approval.sourceHash || typeof approval.sourceHash !== 'string') {
        throw new Error(`Missing required sourceHash for recipe: ${id}`);
      }
      if (approval.sourceHash !== actualHash) {
        throw new Error(`Stale content hash for approved recipe ${id}: expected ${approval.sourceHash}, actual ${actualHash}`);
      }
    }

    approvedRecipes.push(recipe);
  }

  const catalogArtifact = {
    schema_version: 1,
    catalog_id: options.catalogId ?? (testOnly ? 'synthetic-pilot-v1' : 'released-catalog-202611-v1'),
    catalog_month: '2026-11',
    updated_date: '2026-11-07',
    editorial_status: 'owner_review',
    test_only: testOnly,
    released_ids: [...releasedIds],
    public_released_ids: [...(RELEASED_RECIPE_IDS || [])],
    owner_review_ids: [...(OWNER_REVIEW_CARNIVORE_IDS || [])],
    recipes: approvedRecipes.map(r => {
      const app = approvalsMap.get(r.id);
      return {
        ...r,
        editorial_status: app?.editorialStatus ?? (r.mode === 'carnivore' ? 'review' : 'approved'),
        approval_ref: app?.approvalRef,
        approval_date: app?.approvalDate,
      };
    }),
    nutrition_status: 'unverified'
  };

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const isDefaultOutput = !options.outputPath || path.resolve(outputPath) === path.resolve(ROOT, 'dist/released-catalog.json');
  const archiveDir = options.archiveDir !== undefined ? options.archiveDir : (isDefaultOutput ? path.join(ROOT, 'catalogs/archive') : null);
  if (!testOnly && archiveDir && !fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  function verifyAndSaveToArchive(artifact) {
    if (!archiveDir || !artifact.catalog_id || artifact.catalog_id.startsWith('synthetic-') || testOnly) {
      return;
    }
    const archivePath = path.join(archiveDir, `${artifact.catalog_id}.json`);
    if (fs.existsSync(archivePath)) {
      const existing = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      const existingRecipes = existing.recipes || [];
      const newRecipes = artifact.recipes || [];
      const existingMap = new Map(existingRecipes.map(r => [r.id, r]));
      const newMap = new Map(newRecipes.map(r => [r.id, r]));

      if (existingRecipes.length !== newRecipes.length) {
        throw new Error(
          `Immutability violation: catalog_id '${artifact.catalog_id}' was already released with ${existingRecipes.length} recipes, but current export has ${newRecipes.length}. Modifying a released catalog is forbidden; please bump the catalog_id version.`
        );
      }

      for (const [id, rExisting] of existingMap.entries()) {
        const rNew = newMap.get(id);
        if (!rNew) {
          throw new Error(
            `Immutability violation: recipe '${id}' in released catalog '${artifact.catalog_id}' is missing in current export.`
          );
        }
        const hExisting = computeRecipeHash(rExisting);
        const hNew = computeRecipeHash(rNew);
        if (hExisting !== hNew) {
          throw new Error(
            `Immutability violation: recipe '${id}' in released catalog '${artifact.catalog_id}' has been modified (content hash mismatch). ` +
            `Existing: ${hExisting}, New: ${hNew}. Re-releasing a modified recipe under the same catalog_id is strictly forbidden. Please bump catalog_id.`
          );
        }
      }
    } else {
      fs.writeFileSync(archivePath, JSON.stringify(artifact, null, 2), 'utf-8');
    }
  }

  verifyAndSaveToArchive(catalogArtifact);

  fs.writeFileSync(outputPath, JSON.stringify(catalogArtifact, null, 2), 'utf-8');
  if (catalogArtifact.catalog_id && !catalogArtifact.catalog_id.startsWith('synthetic-')) {
    const versionedPath = path.join(outputDir, `${catalogArtifact.catalog_id}.json`);
    fs.writeFileSync(versionedPath, JSON.stringify(catalogArtifact, null, 2), 'utf-8');
  }

  if (!testOnly) {
    const decCandidatesPath = path.join(ROOT, 'src/data/decemberDraftRecipes.ts');
    const { DECEMBER_DRAFT_RECIPES } = loadTs(decCandidatesPath);

    const decCatalogArtifact = {
      schema_version: 1,
      catalog_id: 'released-catalog-202612-v1',
      catalog_month: '2026-12',
      updated_date: '2026-11-08',
      editorial_status: 'draft_for_owner_review',
      test_only: false,
      released_ids: [...catalogArtifact.released_ids, ...DECEMBER_DRAFT_RECIPES.map(r => r.id)],
      public_released_ids: [...catalogArtifact.public_released_ids],
      owner_review_ids: [...catalogArtifact.owner_review_ids, ...DECEMBER_DRAFT_RECIPES.map(r => r.id)],
      recipes: [
        ...catalogArtifact.recipes,
        ...DECEMBER_DRAFT_RECIPES,
      ],
      nutrition_status: 'unverified',
    };
    verifyAndSaveToArchive(decCatalogArtifact);
    const decPath = path.join(outputDir, 'released-catalog-202612-v1.json');
    fs.writeFileSync(decPath, JSON.stringify(decCatalogArtifact, null, 2), 'utf-8');
  }

  // Copy any other archived catalog versions into outputDir (dist/)
  if (!testOnly && fs.existsSync(archiveDir)) {
    for (const f of fs.readdirSync(archiveDir)) {
      if (f.endsWith('.json')) {
        const dest = path.join(outputDir, f);
        fs.copyFileSync(path.join(archiveDir, f), dest);
      }
    }
  }

  return {
    status: 'ok',
    outputPath,
    catalog: catalogArtifact,
    totalReleased: approvedRecipes.length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const res = exportReleaseCatalog();
    console.log(`[INFO] Release catalog exported to ${res.outputPath} (${res.totalReleased} recipes).`);
  } catch (err) {
    console.error(`[ERROR] Export failed: ${err.message}`);
    process.exit(1);
  }
}
