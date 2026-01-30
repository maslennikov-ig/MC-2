/**
 * Migration script for existing quality test data
 * @module scripts/benchmark-llm/migrate-data
 *
 * Parses JSON files from specs/008-generation-generation-json/quality-tests/
 * and inserts into Supabase llm_model_benchmarks tables.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  type ModelBenchmark,
  type TestRunData,
  type QualityAnalysisFormatA,
  type QualityAnalysisFormatB,
  calculateQualityTier,
  extractProvider,
  slugToName,
} from './types';

const QUALITY_TESTS_DIR = path.resolve(
  process.cwd(),
  '../../specs/008-generation-generation-json/quality-tests'
);

/**
 * Parse scenario string to extract type and language
 * e.g., "lesson-en" -> { type: "lesson", language: "en" }
 */
function parseScenario(scenario: string): { type: string; language: 'en' | 'ru' } {
  const parts = scenario.split('-');
  const language = parts[parts.length - 1] as 'en' | 'ru';
  const type = parts.slice(0, -1).join('-');
  return { type, language };
}

/**
 * Parse quality-analysis.json file (Format A)
 */
function parseFormatA(data: QualityAnalysisFormatA, modelSlug: string): Partial<ModelBenchmark> {
  const runs: TestRunData[] = [];
  let totalSchema = 0;
  let totalContent = 0;
  let totalLanguage = 0;
  let totalOverall = 0;
  let totalIssues = 0;
  let runCount = 0;

  for (const [scenario, results] of Object.entries(data.scenarios)) {
    const { language } = parseScenario(scenario);

    results.forEach((result, index) => {
      runs.push({
        scenario,
        runNumber: index + 1,
        language,
        schemaScore: result.schemaScore,
        contentScore: result.contentScore,
        languageScore: result.languageScore,
        overallScore: result.overallScore,
        issues: result.issues,
        isError: false,
      });

      totalSchema += result.schemaScore;
      totalContent += result.contentScore;
      totalLanguage += result.languageScore;
      totalOverall += result.overallScore;
      totalIssues += result.issues.length;
      runCount++;
    });
  }

  const avgSchema = runCount > 0 ? totalSchema / runCount : 0;
  const avgContent = runCount > 0 ? totalContent / runCount : 0;
  const avgLanguage = runCount > 0 ? totalLanguage / runCount : 0;
  const avgOverall = runCount > 0 ? totalOverall / runCount : 0;

  return {
    modelSlug,
    modelName: data.model || slugToName(modelSlug),
    provider: extractProvider(modelSlug),
    testDate: new Date(data.timestamp),
    overallQualityScore: avgOverall,
    contentQualityScore: avgContent,
    schemaComplianceScore: avgSchema,
    languageQualityScore: avgLanguage,
    totalIssues,
    criticalIssues: 0,
    errorRate: 0,
    qualityTier: calculateQualityTier(avgOverall),
    runs,
  };
}

/**
 * Parse quality-analysis.json file (Format B)
 */
function parseFormatB(data: QualityAnalysisFormatB, modelSlug: string): Partial<ModelBenchmark> {
  const runs: TestRunData[] = [];
  let totalSchema = 0;
  let totalContent = 0;
  let totalLanguage = 0;
  let totalOverall = 0;
  let totalIssues = 0;

  for (const analysis of data.analyses) {
    const { language } = parseScenario(analysis.scenario);
    const schemaScore =
      typeof analysis.schemaScore === 'object' ? analysis.schemaScore.score : analysis.schemaScore;

    runs.push({
      scenario: analysis.scenario,
      runNumber: analysis.runNumber,
      language,
      schemaScore,
      contentScore: analysis.contentScore,
      languageScore: analysis.languageScore,
      overallScore: analysis.overallScore,
      issues: analysis.issues,
      isError: false,
    });

    totalSchema += schemaScore;
    totalContent += analysis.contentScore;
    totalLanguage += analysis.languageScore;
    totalOverall += analysis.overallScore;
    totalIssues += analysis.issues.length;
  }

  const runCount = data.analyses.length;
  const avgSchema = runCount > 0 ? totalSchema / runCount : 0;
  const avgContent = runCount > 0 ? totalContent / runCount : 0;
  const avgLanguage = runCount > 0 ? totalLanguage / runCount : 0;
  const avgOverall = runCount > 0 ? totalOverall / runCount : 0;

  return {
    modelSlug: data.modelSlug || modelSlug,
    modelName: data.model || slugToName(modelSlug),
    provider: extractProvider(modelSlug),
    testDate: new Date(data.timestamp),
    overallQualityScore: avgOverall,
    contentQualityScore: avgContent,
    schemaComplianceScore: avgSchema,
    languageQualityScore: avgLanguage,
    totalIssues,
    criticalIssues: 0,
    errorRate: 0,
    qualityTier: calculateQualityTier(avgOverall),
    runs,
  };
}

/**
 * Parse markdown summary file to extract scores
 */
function parseMarkdownSummary(
  mdContent: string,
  modelSlug: string
): Partial<ModelBenchmark> | null {
  // Extract Overall Quality Score from markdown
  const scoreMatch = mdContent.match(/Overall Quality Score:\s*\*\*(\d+(?:\.\d+)?)\%?\*\*/i);
  const tierMatch = mdContent.match(/\*\*(S|A|B|C|D)-TIER\*\*/i);

  if (!scoreMatch) return null;

  const overallScore = parseFloat(scoreMatch[1]) / 100;
  const tier = tierMatch?.[1] as 'S' | 'A' | 'B' | 'C' | 'D' | undefined;

  // Extract breakdown from table if available
  const schemaMatch = mdContent.match(/Avg Schema[^|]*\|\s*(\d+(?:\.\d+)?)\%/i);
  const contentMatch = mdContent.match(/Avg Content[^|]*\|\s*(\d+(?:\.\d+)?)\%/i);

  // Extract date
  const dateMatch = mdContent.match(/\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  const testDate = dateMatch ? new Date(dateMatch[1]) : new Date('2025-11-13');

  return {
    modelSlug,
    modelName: slugToName(modelSlug),
    provider: extractProvider(modelSlug),
    testDate,
    overallQualityScore: overallScore,
    contentQualityScore: contentMatch ? parseFloat(contentMatch[1]) / 100 : overallScore,
    schemaComplianceScore: schemaMatch ? parseFloat(schemaMatch[1]) / 100 : 1.0,
    languageQualityScore: 0.8, // Default
    totalIssues: 0,
    criticalIssues: 0,
    errorRate: 0,
    qualityTier: tier || calculateQualityTier(overallScore),
    runs: [],
  };
}

/**
 * Scan model directory and collect all run data from individual JSON files
 */
function scanModelDirectory(modelDir: string, modelSlug: string): TestRunData[] {
  const runs: TestRunData[] = [];
  const files = fs.readdirSync(modelDir);

  for (const file of files) {
    // Match pattern: lesson-en-run1.json or metadata-ru-run2-ERROR.json
    const match = file.match(/^(lesson|metadata)-(en|ru)-run(\d+)(-ERROR)?\.json$/);
    if (!match) continue;

    const [, type, lang, runNum, isError] = match;
    const filePath = path.join(modelDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Determine scores based on content validity
      const isValidJson = data && typeof data === 'object';
      const hasRequiredFields =
        type === 'lesson'
          ? Array.isArray(data.lessons) || data.lesson_title
          : data.course_overview || data.description;

      runs.push({
        scenario: `${type}-${lang}`,
        runNumber: parseInt(runNum, 10),
        language: lang as 'en' | 'ru',
        schemaScore: isValidJson ? 1.0 : 0,
        contentScore: hasRequiredFields ? 0.8 : 0.5,
        languageScore: 0.8,
        overallScore: isValidJson && hasRequiredFields ? 0.85 : 0.5,
        issues: isError ? ['Run had errors during generation'] : [],
        isError: !!isError,
      });
    } catch {
      runs.push({
        scenario: `${type}-${lang}`,
        runNumber: parseInt(runNum, 10),
        language: lang as 'en' | 'ru',
        schemaScore: 0,
        contentScore: 0,
        languageScore: 0,
        overallScore: 0,
        issues: ['Failed to parse JSON file'],
        isError: true,
      });
    }
  }

  return runs;
}

/**
 * Load benchmark data from a model directory
 */
function loadModelBenchmark(modelDir: string): ModelBenchmark | null {
  const modelSlug = path.basename(modelDir);

  // Try loading quality-analysis.json first
  const analysisPath = path.join(modelDir, 'quality-analysis.json');
  if (fs.existsSync(analysisPath)) {
    try {
      const content = fs.readFileSync(analysisPath, 'utf-8');
      const data = JSON.parse(content);

      // Detect format
      if ('scenarios' in data) {
        const benchmark = parseFormatA(data as QualityAnalysisFormatA, modelSlug);
        return {
          ...benchmark,
          testVersion: '1.0.0',
          heuristicScores: {},
          rawResultsPath: `specs/008-generation-generation-json/quality-tests/${modelSlug}`,
        } as ModelBenchmark;
      } else if ('analyses' in data) {
        const benchmark = parseFormatB(data as QualityAnalysisFormatB, modelSlug);
        return {
          ...benchmark,
          testVersion: '1.0.0',
          heuristicScores: {},
          rawResultsPath: `specs/008-generation-generation-json/quality-tests/${modelSlug}`,
        } as ModelBenchmark;
      }
    } catch (err) {
      console.error(`Failed to parse quality-analysis.json for ${modelSlug}:`, err);
    }
  }

  // Try loading from markdown summary
  const summaryFiles = [
    'EXECUTIVE-SUMMARY.md',
    'SUMMARY.md',
    'TEST-EXECUTION-REPORT.md',
    'QUALITY-ANALYSIS-REPORT.md',
    'QUALITY-TEST-REPORT.md',
  ];

  for (const summaryFile of summaryFiles) {
    const summaryPath = path.join(modelDir, summaryFile);
    if (fs.existsSync(summaryPath)) {
      const mdContent = fs.readFileSync(summaryPath, 'utf-8');
      const benchmark = parseMarkdownSummary(mdContent, modelSlug);
      if (benchmark) {
        // Scan for individual run files
        const runs = scanModelDirectory(modelDir, modelSlug);
        if (runs.length > 0) {
          // Recalculate averages from runs
          const avgSchema = runs.reduce((s, r) => s + r.schemaScore, 0) / runs.length;
          const avgContent = runs.reduce((s, r) => s + r.contentScore, 0) / runs.length;
          const avgLanguage = runs.reduce((s, r) => s + r.languageScore, 0) / runs.length;
          const avgOverall = runs.reduce((s, r) => s + r.overallScore, 0) / runs.length;
          const errorCount = runs.filter(r => r.isError).length;

          return {
            ...benchmark,
            schemaComplianceScore: avgSchema,
            contentQualityScore: avgContent,
            languageQualityScore: avgLanguage,
            overallQualityScore: avgOverall,
            errorRate: errorCount / runs.length,
            qualityTier: calculateQualityTier(avgOverall),
            testVersion: '1.0.0',
            heuristicScores: {},
            rawResultsPath: `specs/008-generation-generation-json/quality-tests/${modelSlug}`,
            runs,
          } as ModelBenchmark;
        }
        return {
          ...benchmark,
          testVersion: '1.0.0',
          heuristicScores: {},
          rawResultsPath: `specs/008-generation-generation-json/quality-tests/${modelSlug}`,
          runs: [],
        } as ModelBenchmark;
      }
    }
  }

  // Last resort: scan individual files and create benchmark from them
  const runs = scanModelDirectory(modelDir, modelSlug);
  if (runs.length > 0) {
    const avgSchema = runs.reduce((s, r) => s + r.schemaScore, 0) / runs.length;
    const avgContent = runs.reduce((s, r) => s + r.contentScore, 0) / runs.length;
    const avgLanguage = runs.reduce((s, r) => s + r.languageScore, 0) / runs.length;
    const avgOverall = runs.reduce((s, r) => s + r.overallScore, 0) / runs.length;
    const errorCount = runs.filter(r => r.isError).length;

    return {
      modelSlug,
      modelName: slugToName(modelSlug),
      provider: extractProvider(modelSlug),
      testDate: new Date('2025-11-13'),
      testVersion: '1.0.0',
      overallQualityScore: avgOverall,
      contentQualityScore: avgContent,
      schemaComplianceScore: avgSchema,
      languageQualityScore: avgLanguage,
      heuristicScores: {},
      totalIssues: runs.reduce((s, r) => s + r.issues.length, 0),
      criticalIssues: 0,
      errorRate: errorCount / runs.length,
      qualityTier: calculateQualityTier(avgOverall),
      rawResultsPath: `specs/008-generation-generation-json/quality-tests/${modelSlug}`,
      runs,
    };
  }

  console.warn(`No valid benchmark data found for ${modelSlug}`);
  return null;
}

/**
 * Load all benchmarks from quality-tests directory
 */
export function loadAllBenchmarks(): ModelBenchmark[] {
  if (!fs.existsSync(QUALITY_TESTS_DIR)) {
    console.error(`Quality tests directory not found: ${QUALITY_TESTS_DIR}`);
    return [];
  }

  const modelDirs = fs
    .readdirSync(QUALITY_TESTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(QUALITY_TESTS_DIR, d.name));

  const benchmarks: ModelBenchmark[] = [];

  for (const modelDir of modelDirs) {
    const benchmark = loadModelBenchmark(modelDir);
    if (benchmark) {
      benchmarks.push(benchmark);
    }
  }

  // Sort by overall quality score descending
  benchmarks.sort((a, b) => b.overallQualityScore - a.overallQualityScore);

  return benchmarks;
}

/**
 * Insert benchmarks into Supabase
 */
export async function insertBenchmarks(
  benchmarks: ModelBenchmark[],
  dryRun: boolean = false
): Promise<void> {
  if (dryRun) {
    console.log('\n=== DRY RUN MODE ===\n');
    console.log(`Would insert ${benchmarks.length} benchmarks:\n`);

    for (const b of benchmarks) {
      console.log(
        `- ${b.modelName} (${b.modelSlug}): ${(b.overallQualityScore * 100).toFixed(1)}% [${b.qualityTier}-TIER]`
      );
      console.log(`  Provider: ${b.provider}, Runs: ${b.runs.length}`);
    }
    return;
  }

  const supabase = getSupabaseAdmin();

  for (const benchmark of benchmarks) {
    console.log(`Inserting benchmark for ${benchmark.modelName}...`);

    // Insert main benchmark record
    const { data: benchmarkData, error: benchmarkError } = await supabase
      .from('llm_model_benchmarks')
      .upsert(
        {
          model_slug: benchmark.modelSlug,
          model_name: benchmark.modelName,
          provider: benchmark.provider,
          test_date: benchmark.testDate.toISOString().split('T')[0],
          test_version: benchmark.testVersion,
          overall_quality_score: benchmark.overallQualityScore,
          content_quality_score: benchmark.contentQualityScore,
          schema_compliance_score: benchmark.schemaComplianceScore,
          language_quality_score: benchmark.languageQualityScore,
          heuristic_scores: benchmark.heuristicScores,
          total_issues: benchmark.totalIssues,
          critical_issues: benchmark.criticalIssues,
          error_rate: benchmark.errorRate,
          quality_tier: benchmark.qualityTier,
          raw_results_path: benchmark.rawResultsPath,
        },
        { onConflict: 'model_slug,test_date' }
      )
      .select('id')
      .single();

    if (benchmarkError) {
      console.error(`Failed to insert benchmark for ${benchmark.modelSlug}:`, benchmarkError);
      continue;
    }

    // Insert run records
    if (benchmark.runs.length > 0 && benchmarkData) {
      const runRecords = benchmark.runs.map(run => ({
        benchmark_id: benchmarkData.id,
        scenario: run.scenario,
        run_number: run.runNumber,
        language: run.language,
        schema_score: run.schemaScore,
        content_score: run.contentScore,
        language_score: run.languageScore,
        overall_score: run.overallScore,
        heuristic_result: run.heuristicResult || null,
        issues: run.issues,
        is_error: run.isError,
        error_message: run.errorMessage || null,
      }));

      const { error: runsError } = await supabase.from('llm_benchmark_runs').upsert(runRecords, {
        onConflict: 'benchmark_id,scenario,run_number',
      });

      if (runsError) {
        console.error(`Failed to insert runs for ${benchmark.modelSlug}:`, runsError);
      }
    }

    console.log(`  Inserted with ${benchmark.runs.length} runs`);
  }
}

/**
 * Main migration function
 */
export async function migrateData(dryRun: boolean = false): Promise<void> {
  console.log('Loading benchmarks from quality tests directory...');
  const benchmarks = loadAllBenchmarks();

  console.log(`Found ${benchmarks.length} model benchmarks\n`);

  await insertBenchmarks(benchmarks, dryRun);

  console.log('\nMigration complete!');
}

// CLI execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const dryRun = process.argv.includes('--dry-run');
  migrateData(dryRun).catch(console.error);
}
