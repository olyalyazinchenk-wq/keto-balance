#!/usr/bin/env node
/**
 * scripts/validate-catalog.mjs
 *
 * Pre-publication validation script for Keto-Balance product catalog.
 * Uses keto-engine to deterministically verify macronutrients, calories,
 * net carbs, and cross-catalog synchronization (recipes.ts <-> bot_data.json).
 *
 * Exits with non-zero code on errors, preventing release publication.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

export function runCatalogValidation(options = {}) {
  const strict = options.strict ?? false;
  const tolerancePct = options.tolerancePct ?? 25; // max allowed calorie discrepancy % before error
  const warningPct = options.warningPct ?? 15;     // warning threshold %
  const maxAbsDiff = options.maxAbsDiff ?? 60;     // max absolute kcal diff before error

  // Load engine and recipes dynamically to ensure latest source
  const engine = loadTs(path.join(ROOT, 'src/core/keto-engine/index.ts'));
  const { RECIPES } = loadTs(path.join(ROOT, 'src/data/recipes.ts'));

  const botSyncEnabled = Object.hasOwn(options, 'botRecipes');
  if (options.requireBotSync && !botSyncEnabled) {
    throw new Error('Bot synchronization requires an explicit synthetic fixture.');
  }
  const botRecipes = botSyncEnabled ? options.botRecipes : [];
  if (!Array.isArray(botRecipes)) {
    throw new TypeError('botRecipes must be an explicit array.');
  }
  const seenBotIds = new Set();
  for (const item of botRecipes) {
    if (
      !item || typeof item.id !== 'string' || !item.id || seenBotIds.has(item.id) ||
      !['kcal', 'p', 'f', 'nc'].every((field) =>
        typeof item[field] === 'number' && Number.isFinite(item[field]))
    ) {
      throw new TypeError('Invalid explicit bot recipe fixture.');
    }
    seenBotIds.add(item.id);
  }
  const botDataPath = botSyncEnabled ? '[explicit fixture]' : null;

  const botMap = new Map(botRecipes.map(r => [r.id, r]));
  let totalDiff = 0;

  const report = {
    timestamp: new Date().toISOString(),
    engine: 'src/core/keto-engine',
    catalogPath: 'src/data/recipes.ts',
    botDataPath,
    summary: {
      totalRecipes: RECIPES.length,
      passedCount: 0,
      warningCount: 0,
      errorCount: 0,
      botSyncErrors: 0,
      maxCalorieDiscrepancy: 0,
      avgCalorieDiscrepancy: 0,
      status: 'PENDING',
    },
    discrepancies: [],
    recipes: [],
  };

  report.botSync = {
    status: botSyncEnabled ? 'PENDING' : 'NOT_RUN',
    source: botDataPath,
  };
  if (!Array.isArray(RECIPES) || RECIPES.length === 0) {
    throw new Error('Static catalog is missing or empty.');
  }

  for (const r of RECIPES) {
    const issues = [];
    let status = 'PASS';

    // 1. Basic field validity
    if (typeof r.kcal !== 'number' || r.kcal <= 0 || !Number.isFinite(r.kcal)) {
      issues.push({ field: 'kcal', message: `Invalid declared calories: ${r.kcal}`, severity: 'error' });
    }
    if (typeof r.p !== 'number' || r.p < 0 || !Number.isFinite(r.p)) {
      issues.push({ field: 'p', message: `Invalid protein: ${r.p}`, severity: 'error' });
    }
    if (typeof r.f !== 'number' || r.f < 0 || !Number.isFinite(r.f)) {
      issues.push({ field: 'f', message: `Invalid fat: ${r.f}`, severity: 'error' });
    }
    if (typeof r.nc !== 'number' || r.nc < 0 || !Number.isFinite(r.nc)) {
      issues.push({ field: 'nc', message: `Invalid net carbs: ${r.nc}`, severity: 'error' });
    }

    // 2. Engine calculations
    const profile = engine.calculateMacroProfile({
      protein: r.p,
      fat: r.f,
      carbs: r.nc,
      declaredCalories: r.kcal,
    });

    if (profile.validation && !profile.validation.isValid) {
      for (const issue of profile.validation.issues) {
        issues.push({ ...issue, source: 'keto-engine' });
      }
    }

    const calcKcal = profile.calculatedCalories;
    const diff = Math.abs(calcKcal - r.kcal);
    const pctDiff = r.kcal > 0 ? (diff / r.kcal) * 100 : 0;
    totalDiff += diff;

    if (diff > report.summary.maxCalorieDiscrepancy) {
      report.summary.maxCalorieDiscrepancy = Math.round(diff * 10) / 10;
    }

    // Caloric tolerance checks
    if (diff > maxAbsDiff || pctDiff > tolerancePct) {
      issues.push({
        field: 'calories',
        severity: 'error',
        message: `Calorie discrepancy exceeds tolerance: declared=${r.kcal}, calculated=${calcKcal}, diff=${diff.toFixed(1)} kcal (${pctDiff.toFixed(1)}%)`,
        declared: r.kcal,
        calculated: calcKcal,
        diff,
        pctDiff,
      });
    } else if (diff > 35 || pctDiff > warningPct) {
      issues.push({
        field: 'calories',
        severity: 'warning',
        message: `Noticeable calorie discrepancy: declared=${r.kcal}, calculated=${calcKcal}, diff=${diff.toFixed(1)} kcal (${pctDiff.toFixed(1)}%)`,
        declared: r.kcal,
        calculated: calcKcal,
        diff,
        pctDiff,
      });
    }

    // 3. Optional synchronization against explicitly supplied synthetic records.
    if (botSyncEnabled) {
      const botRecipe = botMap.get(r.id);
      if (!botRecipe) {
        issues.push({
          field: 'bot_data_sync',
          severity: 'error',
          message: `Recipe ${r.id} missing from explicit fixture`,
        });
        report.summary.botSyncErrors++;
      } else {
        if (botRecipe.kcal !== r.kcal) {
          issues.push({
            field: 'bot_data_sync.kcal',
            severity: 'error',
            message: `kcal mismatch for ${r.id} in explicit fixture`,
          });
          report.summary.botSyncErrors++;
        }
        if (botRecipe.p !== r.p || botRecipe.f !== r.f || botRecipe.nc !== r.nc) {
          issues.push({
            field: 'bot_data_sync.macros',
            severity: 'error',
            message: `Macro mismatch for ${r.id} in explicit fixture`,
          });
          report.summary.botSyncErrors++;
        }
      }
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');

    if (hasErrors) {
      status = 'ERROR';
      report.summary.errorCount++;
    } else if (hasWarnings) {
      status = 'WARN';
      report.summary.warningCount++;
    } else {
      status = 'PASS';
      report.summary.passedCount++;
    }

    const recipeResult = {
      id: r.id,
      title: r.title,
      mode: r.mode,
      cat: r.cat,
      declared: { kcal: r.kcal, p: r.p, f: r.f, nc: r.nc },
      calculated: {
        kcal: calcKcal,
        ratios: profile.ratios,
      },
      discrepancy: {
        kcalDiff: Math.round(diff * 10) / 10,
        pctDiff: Math.round(pctDiff * 10) / 10,
      },
      status,
      issues,
    };

    report.recipes.push(recipeResult);

    if (issues.length > 0) {
      report.discrepancies.push({
        id: r.id,
        title: r.title,
        status,
        issues,
      });
    }
  }

  report.summary.avgCalorieDiscrepancy =
    report.summary.totalRecipes > 0
      ? Math.round((totalDiff / report.summary.totalRecipes) * 10) / 10
      : 0;

  report.botSync.status = !botSyncEnabled
    ? 'NOT_RUN'
    : report.summary.botSyncErrors > 0 ? 'FAILED' : 'PASSED';

  const isFailed = report.summary.errorCount > 0 || (strict && report.summary.warningCount > 0);
  report.summary.status = isFailed ? 'FAILED' : 'PASSED';

  return report;
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const silent = args.includes('--silent');

  let customReportPath = null;
  const reportArgIdx = args.findIndex(a => a.startsWith('--report=') || a === '--report');
  if (reportArgIdx !== -1) {
    if (args[reportArgIdx].startsWith('--report=')) {
      customReportPath = args[reportArgIdx].slice(9);
    } else if (args[reportArgIdx + 1]) {
      customReportPath = args[reportArgIdx + 1];
    }
  }

  if (!silent) {
    console.log('[KETO-ENGINE] Starting pre-publication catalog validation...');
  }

  const report = runCatalogValidation({ strict });

  // Save reports to docs/release and dist (if dist exists)
  const releaseDocsDir = path.join(ROOT, 'docs/release');
  fs.mkdirSync(releaseDocsDir, { recursive: true });
  const defaultReportPath = path.join(releaseDocsDir, 'catalog-validation-report.json');
  const reportTarget = customReportPath ? path.resolve(customReportPath) : defaultReportPath;

  fs.writeFileSync(reportTarget, JSON.stringify(report, null, 2), 'utf8');

  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'catalog-validation-report.json'), JSON.stringify(report, null, 2), 'utf8');
  }

  if (!silent) {
    console.log(`[KETO-ENGINE] Total recipes evaluated: ${report.summary.totalRecipes}`);
    console.log(`[KETO-ENGINE] Results: ${report.summary.passedCount} PASS, ${report.summary.warningCount} WARN, ${report.summary.errorCount} ERROR`);
    console.log(`[KETO-ENGINE] Max discrepancy: ${report.summary.maxCalorieDiscrepancy} kcal; Average: ${report.summary.avgCalorieDiscrepancy} kcal`);
    console.log(`[KETO-ENGINE] Bot data sync errors: ${report.summary.botSyncErrors}`);
    console.log(`[KETO-ENGINE] Detailed report written to: ${path.relative(ROOT, reportTarget)}`);

    if (report.discrepancies.length > 0) {
      console.log("\n[DISCREPANCIES NOTE]:");
      for (const d of report.discrepancies) {
        console.log(`  - [${d.status}] ${d.id} (${d.title}):`);
        for (const issue of d.issues) {
          console.log(`      * [${issue.severity.toUpperCase()}] ${issue.message}`);
        }
      }
    }
  }

  if (report.summary.status === 'FAILED') {
    console.error(`\n[FATAL] Catalog validation FAILED with ${report.summary.errorCount} errors! Release publication blocked.`);
    process.exit(1);
  } else {
    if (!silent) {
      console.log(
        `\nStatic catalog checks PASSED. Bot synchronization: ${report.botSync.status}. ` +
        'This does not establish content, clinical or full release acceptance.\n'
      );
    }
    process.exit(0);
  }
}
