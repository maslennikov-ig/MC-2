#!/usr/bin/env tsx
/**
 * LLM Benchmark CLI
 * @module scripts/benchmark-llm
 *
 * Commands:
 *   migrate [--dry-run]    - Migrate existing test data to Supabase
 *   leaderboard            - Display model leaderboard
 *   compare <m1> <m2>      - Compare two models
 *   show <model>           - Show detailed benchmark for a model
 */

import { Command } from 'commander';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { loadAllBenchmarks, migrateData } from './migrate-data';
import { testModel, runBenchmark } from './test-model';
import { type LeaderboardEntry, type QualityTier } from './types';

const program = new Command();

program.name('benchmark-llm').description('LLM Model Benchmark System').version('1.0.0');

/**
 * Format score as percentage with color indicator
 */
function formatScore(score: number): string {
  const pct = (score * 100).toFixed(1);
  return `${pct}%`;
}

/**
 * Get tier badge
 */
function getTierBadge(tier: QualityTier): string {
  const badges: Record<QualityTier, string> = {
    S: '[S-TIER]',
    A: '[A-TIER]',
    B: '[B-TIER]',
    C: '[C-TIER]',
    D: '[D-TIER]',
  };
  return badges[tier];
}

// ============================================================================
// MIGRATE COMMAND
// ============================================================================

program
  .command('migrate')
  .description('Migrate existing test data to Supabase')
  .option('--dry-run', 'Preview changes without inserting')
  .action(async (options: { dryRun?: boolean }) => {
    await migrateData(options.dryRun ?? false);
  });

// ============================================================================
// TEST COMMAND
// ============================================================================

program
  .command('test <model>')
  .description('Test a model quality and save results to database')
  .option('--scenario <name>', 'Test scenario to run', 'full-generation')
  .option('--skip-judge', 'Skip LLM-Judge evaluation (faster, no scores)')
  .action(async (model: string, options: { scenario: string; skipJudge?: boolean }) => {
    try {
      const result = await testModel({
        modelId: model,
        scenario: options.scenario,
        skipJudge: options.skipJudge,
      });

      console.log('\n=== Test Complete ===\n');
      console.log(`Model: ${result.modelName}`);
      console.log(`Score: ${result.finalScore} points`);
      console.log(`Tier: ${result.tier}`);
      console.log(`Words: ${result.wordCount}`);
      console.log(`Time: ${(result.generationTimeMs / 1000).toFixed(1)}s`);

      if (result.judgeVerdicts.primary) {
        console.log('\nPrimary Judge:');
        console.log(`  Summary: ${result.judgeVerdicts.primary.summary}`);
      }
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  });

// ============================================================================
// BATCH TEST COMMAND
// ============================================================================

program
  .command('batch-test')
  .description('Test multiple models and compare results')
  .argument('<models...>', 'Model IDs to test (space-separated)')
  .option('--scenario <name>', 'Test scenario to run', 'full-generation')
  .action(async (models: string[], options: { scenario: string }) => {
    await runBenchmark(models, options.scenario);
  });

// ============================================================================
// LEADERBOARD COMMAND
// ============================================================================

program
  .command('leaderboard')
  .description('Display model quality leaderboard')
  .option('--json', 'Output as JSON')
  .option('--local', 'Use local data instead of Supabase')
  .action(async (options: { json?: boolean; local?: boolean }) => {
    let entries: LeaderboardEntry[];

    if (options.local) {
      // Load from local files
      const benchmarks = loadAllBenchmarks();
      entries = benchmarks.map((b, i) => ({
        rank: i + 1,
        modelSlug: b.modelSlug,
        modelName: b.modelName,
        provider: b.provider,
        qualityTier: b.qualityTier,
        overallScore: b.overallQualityScore,
        contentScore: b.contentQualityScore,
        schemaScore: b.schemaComplianceScore,
        languageScore: b.languageQualityScore,
        errorRate: b.errorRate,
        testDate: b.testDate.toISOString().split('T')[0],
      }));
    } else {
      // Load from Supabase
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('llm_model_leaderboard')
        .select('*')
        .order('overall_quality_score', { ascending: false });

      if (error) {
        console.error('Failed to fetch leaderboard:', error);
        process.exit(1);
      }

      entries = (data || []).map((row, i) => ({
        rank: i + 1,
        modelSlug: row.model_slug,
        modelName: row.model_name,
        provider: row.provider,
        qualityTier: row.quality_tier as QualityTier,
        overallScore: Number(row.overall_quality_score),
        contentScore: Number(row.content_quality_score),
        schemaScore: Number(row.schema_compliance_score),
        languageScore: Number(row.language_quality_score),
        errorRate: Number(row.error_rate),
        testDate: row.test_date,
      }));
    }

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    // Display as table
    console.log('\n=== LLM MODEL QUALITY LEADERBOARD ===\n');
    console.log(
      'Rank | Model                    | Tier     | Overall | Content | Schema | Language | Errors'
    );
    console.log(
      '-----|--------------------------|----------|---------|---------|--------|----------|-------'
    );

    for (const entry of entries) {
      const rank = String(entry.rank).padStart(2, ' ');
      const model = entry.modelName.padEnd(24, ' ').slice(0, 24);
      const tier = getTierBadge(entry.qualityTier).padEnd(8, ' ');
      const overall = formatScore(entry.overallScore).padStart(7, ' ');
      const content = formatScore(entry.contentScore).padStart(7, ' ');
      const schema = formatScore(entry.schemaScore).padStart(6, ' ');
      const language = formatScore(entry.languageScore).padStart(8, ' ');
      const errors = formatScore(entry.errorRate).padStart(6, ' ');

      console.log(
        ` ${rank}  | ${model} | ${tier} | ${overall} | ${content} | ${schema} | ${language} | ${errors}`
      );
    }

    console.log('\n');
    console.log('Tier Thresholds: S >= 95% | A >= 85% | B >= 75% | C >= 60% | D < 60%');
    console.log(`Total models: ${entries.length}`);
    console.log('');
  });

// ============================================================================
// COMPARE COMMAND
// ============================================================================

program
  .command('compare <model1> <model2>')
  .description('Compare two models side by side')
  .action(async (model1: string, model2: string) => {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('llm_model_benchmarks')
      .select('*')
      .in('model_slug', [model1, model2])
      .order('test_date', { ascending: false });

    if (error) {
      console.error('Failed to fetch benchmarks:', error);
      process.exit(1);
    }

    if (!data || data.length < 2) {
      console.error(
        `Could not find both models. Found: ${data?.map(d => d.model_slug).join(', ')}`
      );
      process.exit(1);
    }

    // Get latest for each model
    const m1 = data.find(d => d.model_slug === model1);
    const m2 = data.find(d => d.model_slug === model2);

    if (!m1 || !m2) {
      console.error('Model not found');
      process.exit(1);
    }

    console.log('\n=== MODEL COMPARISON ===\n');
    console.log(
      `${'Metric'.padEnd(25)} | ${m1.model_name.padEnd(20)} | ${m2.model_name.padEnd(20)}`
    );
    console.log('-'.repeat(70));
    console.log(
      `${'Quality Tier'.padEnd(25)} | ${getTierBadge(m1.quality_tier as QualityTier).padEnd(20)} | ${getTierBadge(m2.quality_tier as QualityTier).padEnd(20)}`
    );
    console.log(
      `${'Overall Score'.padEnd(25)} | ${formatScore(Number(m1.overall_quality_score)).padEnd(20)} | ${formatScore(Number(m2.overall_quality_score)).padEnd(20)}`
    );
    console.log(
      `${'Content Quality'.padEnd(25)} | ${formatScore(Number(m1.content_quality_score)).padEnd(20)} | ${formatScore(Number(m2.content_quality_score)).padEnd(20)}`
    );
    console.log(
      `${'Schema Compliance'.padEnd(25)} | ${formatScore(Number(m1.schema_compliance_score)).padEnd(20)} | ${formatScore(Number(m2.schema_compliance_score)).padEnd(20)}`
    );
    console.log(
      `${'Language Quality'.padEnd(25)} | ${formatScore(Number(m1.language_quality_score)).padEnd(20)} | ${formatScore(Number(m2.language_quality_score)).padEnd(20)}`
    );
    console.log(
      `${'Error Rate'.padEnd(25)} | ${formatScore(Number(m1.error_rate)).padEnd(20)} | ${formatScore(Number(m2.error_rate)).padEnd(20)}`
    );
    console.log(
      `${'Test Date'.padEnd(25)} | ${m1.test_date.padEnd(20)} | ${m2.test_date.padEnd(20)}`
    );

    // Winner
    const winner = Number(m1.overall_quality_score) > Number(m2.overall_quality_score) ? m1 : m2;
    const diff = Math.abs(Number(m1.overall_quality_score) - Number(m2.overall_quality_score));

    console.log('\n');
    console.log(`Winner: ${winner.model_name} (+${(diff * 100).toFixed(1)}%)`);
    console.log('');
  });

// ============================================================================
// SHOW COMMAND
// ============================================================================

program
  .command('show <model>')
  .description('Show detailed benchmark for a model')
  .action(async (model: string) => {
    const supabase = getSupabaseAdmin();

    // Get latest benchmark
    const { data: benchmark, error: benchmarkError } = await supabase
      .from('llm_model_benchmarks')
      .select('*')
      .eq('model_slug', model)
      .order('test_date', { ascending: false })
      .limit(1)
      .single();

    if (benchmarkError || !benchmark) {
      console.error(`Benchmark not found for model: ${model}`);
      process.exit(1);
    }

    // Get runs
    const { data: runs } = await supabase
      .from('llm_benchmark_runs')
      .select('*')
      .eq('benchmark_id', benchmark.id)
      .order('scenario')
      .order('run_number');

    console.log(`\n=== ${benchmark.model_name} ===\n`);
    console.log(`Model Slug: ${benchmark.model_slug}`);
    console.log(`Provider: ${benchmark.provider}`);
    console.log(`Quality Tier: ${getTierBadge(benchmark.quality_tier as QualityTier)}`);
    console.log(`Test Date: ${benchmark.test_date}`);
    console.log(`Test Version: ${benchmark.test_version}`);
    console.log('');
    console.log('--- Scores ---');
    console.log(`Overall Quality:   ${formatScore(Number(benchmark.overall_quality_score))}`);
    console.log(`Content Quality:   ${formatScore(Number(benchmark.content_quality_score))}`);
    console.log(`Schema Compliance: ${formatScore(Number(benchmark.schema_compliance_score))}`);
    console.log(`Language Quality:  ${formatScore(Number(benchmark.language_quality_score))}`);
    console.log('');
    console.log('--- Issues ---');
    console.log(`Total Issues:    ${benchmark.total_issues}`);
    console.log(`Critical Issues: ${benchmark.critical_issues}`);
    console.log(`Error Rate:      ${formatScore(Number(benchmark.error_rate))}`);

    if (runs && runs.length > 0) {
      console.log('');
      console.log('--- Test Runs ---');
      console.log('Scenario      | Run | Schema | Content | Language | Overall | Error');
      console.log('--------------|-----|--------|---------|----------|---------|------');

      for (const run of runs) {
        const scenario = run.scenario.padEnd(13, ' ');
        const runNum = String(run.run_number).padStart(3, ' ');
        const schema = formatScore(Number(run.schema_score)).padStart(6, ' ');
        const content = formatScore(Number(run.content_score)).padStart(7, ' ');
        const language = formatScore(Number(run.language_score)).padStart(8, ' ');
        const overall = formatScore(Number(run.overall_score)).padStart(7, ' ');
        const error = run.is_error ? '  Yes ' : '  No  ';

        console.log(
          `${scenario} | ${runNum} | ${schema} | ${content} | ${language} | ${overall} | ${error}`
        );
      }
    }

    console.log('');
  });

// ============================================================================
// GENERATE LEADERBOARD MARKDOWN
// ============================================================================

program
  .command('generate-markdown')
  .description('Generate LEADERBOARD.md file')
  .option('--output <path>', 'Output file path', 'docs/reports/model-benchmarks/LEADERBOARD.md')
  .action(async (options: { output: string }) => {
    const benchmarks = loadAllBenchmarks();

    const lines: string[] = [
      '# LLM Model Quality Leaderboard',
      '',
      `> Auto-generated: ${new Date().toISOString().split('T')[0]}`,
      '',
      '## Quality Tiers',
      '',
      '| Tier | Score Range | Recommendation |',
      '|------|-------------|----------------|',
      '| **S** | 95%+ | Primary model |',
      '| **A** | 85-94% | Production |',
      '| **B** | 75-84% | With review |',
      '| **C** | 60-74% | Fallback only |',
      '| **D** | <60% | Do not use |',
      '',
      '## Leaderboard',
      '',
      '| Rank | Model | Provider | Tier | Overall | Content | Schema | Language | Errors |',
      '|------|-------|----------|------|---------|---------|--------|----------|--------|',
    ];

    benchmarks.forEach((b, i) => {
      lines.push(
        `| ${i + 1} | ${b.modelName} | ${b.provider} | **${b.qualityTier}** | ${formatScore(b.overallQualityScore)} | ${formatScore(b.contentQualityScore)} | ${formatScore(b.schemaComplianceScore)} | ${formatScore(b.languageQualityScore)} | ${formatScore(b.errorRate)} |`
      );
    });

    lines.push('');
    lines.push('## Methodology');
    lines.push('');
    lines.push('Content Quality Score (CQS) uses weighted heuristic filters:');
    lines.push('');
    lines.push('| Filter | Weight | Type |');
    lines.push('|--------|--------|------|');
    lines.push('| Prompt Markers | 15% | CRITICAL |');
    lines.push('| Language Consistency | 12% | CRITICAL |');
    lines.push('| Markdown Structure | 10% | HIGH |');
    lines.push('| Section Duplication | 9% | HIGH |');
    lines.push('| Mermaid Syntax | 8% | HIGH |');
    lines.push('| Flesch-Kincaid | 8% | STANDARD |');
    lines.push('| Word Count | 7% | STANDARD |');
    lines.push('| Sections | 7% | STANDARD |');
    lines.push('| Keyword Coverage | 7% | STANDARD |');
    lines.push('| Learning Objectives | 7% | STANDARD |');
    lines.push('| Content Density | 5% | STANDARD |');
    lines.push('| Prohibited Terms | 5% | STANDARD |');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Generated by `pnpm benchmark-llm generate-markdown`*');

    const content = lines.join('\n');

    const fs = await import('fs');
    const path = await import('path');

    const outputPath = path.resolve(process.cwd(), options.output);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content);
    console.log(`Leaderboard written to: ${outputPath}`);
  });

// Parse and execute
program.parse();
