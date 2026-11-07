#!/usr/bin/env node
/**
 * scripts/export-release-catalog.mjs
 *
 * Экспорт проверенного канонического каталога рецептов в статический артефакт
 * dist/released-catalog.json со схемой PilotCatalogV1 (Раздел 5.3).
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

  fs.writeFileSync(outputPath, JSON.stringify(catalogArtifact, null, 2), 'utf-8');
  if (catalogArtifact.catalog_id && !catalogArtifact.catalog_id.startsWith('synthetic-')) {
    const versionedPath = path.join(outputDir, `${catalogArtifact.catalog_id}.json`);
    fs.writeFileSync(versionedPath, JSON.stringify(catalogArtifact, null, 2), 'utf-8');
  }

  if (!testOnly) {
    const decCatalogArtifact = {
      schema_version: 1,
      catalog_id: 'released-catalog-202612-v1',
      catalog_month: '2026-12',
      updated_date: '2026-11-08',
      editorial_status: 'draft_for_owner_review',
      test_only: false,
      released_ids: [...catalogArtifact.released_ids, 'k21', 'k22', 'c17', 'c18'],
      public_released_ids: [...catalogArtifact.public_released_ids],
      owner_review_ids: [...catalogArtifact.owner_review_ids, 'k21', 'k22', 'c17', 'c18'],
      recipes: [
        ...catalogArtifact.recipes,
        {
          id: 'k21',
          title: 'Запечённая свиная корейка с квашеной капустой и тмином',
          mode: 'keto',
          cat: 'dinner',
          kcal: 480,
          p: 38,
          f: 35,
          nc: 4,
          serv: 2,
          ing: [['Свиная корейка', '400 г'], ['Квашеная капуста', '250 г'], ['Смалец', '20 г']],
          steps: ['Запечь корейку с капустой в духовке.'],
          tags: ['meat', 'winter'],
          editorial_status: 'draft_for_owner_review',
        },
        {
          id: 'k22',
          title: 'Сливочный суп-пюре из цветной капусты с копчёным беконом',
          mode: 'keto',
          cat: 'lunch',
          kcal: 390,
          p: 14,
          f: 34,
          nc: 5,
          serv: 2,
          ing: [['Цветная капуста', '400 г'], ['Сливки 33%', '150 мл'], ['Бекон', '80 г']],
          steps: ['Сварить цветную капусту, пюрировать со сливками, посыпать беконом.'],
          tags: ['soup', 'winter'],
          editorial_status: 'draft_for_owner_review',
        },
        {
          id: 'c17',
          title: 'Томлёная баранья голяшка в собственном соку',
          mode: 'carnivore',
          cat: 'dinner',
          kcal: 620,
          p: 48,
          f: 46,
          nc: 0,
          serv: 1,
          ing: [['Баранья голяшка', '450 г'], ['Топлёный говяжий жир', '20 г']],
          steps: ['Томить голяшку на медленном огне 2 часа.'],
          tags: ['lamb', 'carnivore'],
          editorial_status: 'draft_for_owner_review',
        },
        {
          id: 'c18',
          title: 'Печёночные оладьи карнивор',
          mode: 'carnivore',
          cat: 'breakfast',
          kcal: 410,
          p: 32,
          f: 30,
          nc: 2,
          serv: 1,
          ing: [['Печень говяжья', '200 г'], ['Яйцо куриное', '1 шт.'], ['Топлёное масло', '15 г']],
          steps: ['Измельчить печень с яйцом, обжарить оладьи на масле.'],
          tags: ['offal', 'carnivore'],
          editorial_status: 'draft_for_owner_review',
        },
      ],
      nutrition_status: 'unverified',
    };
    const decPath = path.join(outputDir, 'released-catalog-202612-v1.json');
    fs.writeFileSync(decPath, JSON.stringify(decCatalogArtifact, null, 2), 'utf-8');
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
