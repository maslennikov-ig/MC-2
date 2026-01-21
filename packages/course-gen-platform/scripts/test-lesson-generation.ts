#!/usr/bin/env tsx
/**
 * A/B Testing Script for Lesson Generation Models
 * @module scripts/test-lesson-generation
 *
 * Compares multiple LLM models for lesson content generation:
 * - Runs same lesson spec through different models
 * - Applies heuristic validations (prompt markers, language consistency, etc.)
 * - Measures time, tokens, and quality metrics
 * - Generates comparison report
 *
 * Usage:
 * pnpm tsx scripts/test-lesson-generation.ts \
 *   --course-id bc34283a-0a61-45cb-8e5c-773a3b67a86c \
 *   --lesson-id 8c3623c0-07e5-4e01-853d-ff3eab14a546 \
 *   --models "xiaomi/mimo-v2-flash:free,z-ai/glm-4.7-flash,allenai/olmo-3.1-32b-instruct"
 */

import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import logger from '@/shared/logger';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { ChatOpenAI } from '@langchain/openai';
import { generateIntroduction } from '@/stages/stage6-lesson-content/nodes/generator/generator-content';
import {
  checkPromptMarkers,
  checkLanguageConsistency,
  checkMermaidSyntax,
  checkSectionDuplication,
} from '@/stages/stage6-lesson-content/judge/heuristic-filter';

// ============================================================================
// TYPES
// ============================================================================

interface TestConfig {
  courseId: string;
  lessonId: string;
  models: string[];
}

interface ModelResult {
  model: string;
  success: boolean;
  durationMs: number;
  tokensUsed: number;
  content: string;
  validationResults: {
    promptMarkers: number;
    foreignCharacters: number;
    mermaidIssues: number;
    duplicateSections: number;
  };
  error?: string;
}

interface ComparisonReport {
  config: TestConfig;
  lessonTitle: string;
  results: ModelResult[];
  timestamp: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OUTPUT_DIR = '.tmp/test-generation';
const REPORT_FILENAME = 'comparison-report.md';

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Parse CLI arguments
 */
function parseArguments(): TestConfig {
  program
    .requiredOption('--course-id <id>', 'Course UUID')
    .requiredOption('--lesson-id <id>', 'Lesson UUID')
    .option(
      '--models <models>',
      'Comma-separated list of model IDs',
      'xiaomi/mimo-v2-flash:free,z-ai/glm-4.7-flash,allenai/olmo-3.1-32b-instruct'
    )
    .parse();

  const options = program.opts();

  return {
    courseId: options.courseId,
    lessonId: options.lessonId,
    models: options.models.split(',').map((m: string) => m.trim()),
  };
}

/**
 * Load lesson specification from database
 */
async function loadLessonSpec(courseId: string, lessonId: string): Promise<LessonSpecificationV2> {
  logger.info({ courseId, lessonId }, 'Loading lesson specification from database');

  const supabase = getSupabaseAdmin();

  // Query lessons table for the spec
  const { data: lesson, error } = await supabase
    .from('lessons' as any)
    .select('specification_v2, title, course_id')
    .eq('id', lessonId)
    .eq('course_id', courseId)
    .single();

  if (error || !lesson) {
    throw new Error(`Failed to load lesson: ${error?.message || 'Not found'}`);
  }

  if (!lesson.specification_v2) {
    throw new Error('Lesson does not have specification_v2 (V2 lesson spec required)');
  }

  logger.info({ lessonTitle: lesson.title }, 'Lesson specification loaded successfully');

  return lesson.specification_v2 as LessonSpecificationV2;
}

/**
 * Generate content using a specific model
 */
async function generateWithModel(
  model: string,
  lessonSpec: LessonSpecificationV2,
  language: string
): Promise<ModelResult> {
  const startTime = Date.now();

  logger.info({ model }, `Starting generation with model`);

  try {
    // Create LangChain model instance with model override
    const openaiKey = process.env.OPENROUTER_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable not set');
    }

    const modelInstance = new ChatOpenAI({
      model: model,
      temperature: 0.7,
      maxTokens: 4000,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: openaiKey,
        defaultHeaders: {
          'HTTP-Referer': process.env.APP_URL || 'https://megacampus.ai',
          'X-Title': 'MegaCampus Course Generator - A/B Test',
        },
      },
    });

    // Generate introduction (simpler test than full content)
    const { content, tokensUsed } = await generateIntroduction(lessonSpec, language, modelInstance);

    const durationMs = Date.now() - startTime;

    // Run heuristic validations
    const promptMarkersResult = checkPromptMarkers(content);
    const languageResult = checkLanguageConsistency(content, language);
    const mermaidResult = checkMermaidSyntax(content);
    const duplicationResult = checkSectionDuplication(content);

    const result: ModelResult = {
      model,
      success: true,
      durationMs,
      tokensUsed,
      content,
      validationResults: {
        promptMarkers: promptMarkersResult.detectedMarkers.length,
        foreignCharacters: languageResult.foreignCharacters,
        mermaidIssues: mermaidResult.mermaidIssues.length,
        duplicateSections: duplicationResult.duplicatePairs.length,
      },
    };

    logger.info(
      {
        model,
        durationMs,
        tokensUsed,
        validations: result.validationResults,
      },
      'Generation complete'
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({ model, error }, 'Generation failed');

    return {
      model,
      success: false,
      durationMs,
      tokensUsed: 0,
      content: '',
      validationResults: {
        promptMarkers: 0,
        foreignCharacters: 0,
        mermaidIssues: 0,
        duplicateSections: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Save model result to file
 */
async function saveModelResult(result: ModelResult, outputDir: string): Promise<void> {
  const modelDirName = result.model.replace(/[/:]/g, '-');
  const modelDir = path.join(outputDir, modelDirName);

  await fs.mkdir(modelDir, { recursive: true });

  // Save content
  const contentPath = path.join(modelDir, 'content.md');
  await fs.writeFile(contentPath, result.content, 'utf-8');

  // Save metadata
  const metadataPath = path.join(modelDir, 'metadata.json');
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        model: result.model,
        success: result.success,
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed,
        validationResults: result.validationResults,
        error: result.error,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );

  logger.debug({ model: result.model, modelDir }, 'Model result saved');
}

/**
 * Generate markdown comparison report
 */
function generateReport(report: ComparisonReport): string {
  const successful = report.results.filter(r => r.success);
  const failed = report.results.filter(r => !r.success);

  // Determine winner (lowest validation issues + reasonable performance)
  let winner = 'N/A';
  if (successful.length > 0) {
    const scored = successful.map(r => {
      const totalIssues =
        r.validationResults.promptMarkers +
        r.validationResults.foreignCharacters +
        r.validationResults.mermaidIssues +
        r.validationResults.duplicateSections;

      // Score = weighted (lower is better)
      // Critical: prompt markers (x10), foreign chars (x5)
      // High: mermaid issues (x3), duplicate sections (x2)
      const qualityScore =
        r.validationResults.promptMarkers * 10 +
        r.validationResults.foreignCharacters * 5 +
        r.validationResults.mermaidIssues * 3 +
        r.validationResults.duplicateSections * 2;

      return { model: r.model, qualityScore, totalIssues };
    });

    // Sort by quality score (ascending = better)
    scored.sort((a, b) => a.qualityScore - b.qualityScore);
    winner = scored[0].model;
  }

  let markdown = `# Model Comparison Report

**Lesson**: ${report.lessonTitle}
**Date**: ${report.timestamp}
**Models Tested**: ${report.results.length}
**Successful**: ${successful.length}
**Failed**: ${failed.length}

---

## Summary Table

| Model | Duration | Tokens | Prompt Markers | CJK Characters | Mermaid Errors | Duplicate Sections | Status |
|-------|----------|--------|----------------|----------------|----------------|---------------------|--------|
`;

  for (const result of report.results) {
    const status = result.success ? '✅ OK' : '❌ FAILED';
    const duration = result.success ? `${(result.durationMs / 1000).toFixed(1)}s` : '-';
    const tokens = result.success ? result.tokensUsed.toString() : '-';

    markdown += `| ${result.model} | ${duration} | ${tokens} | ${result.validationResults.promptMarkers} | ${result.validationResults.foreignCharacters} | ${result.validationResults.mermaidIssues} | ${result.validationResults.duplicateSections} | ${status} |\n`;
  }

  markdown += `\n---\n\n## Winner\n\n🏆 **${winner}**\n\n`;
  markdown += `Based on validation scores:\n`;
  markdown += `- Prompt Markers (weight: 10x) - indicates LLM hallucination\n`;
  markdown += `- Foreign Characters (weight: 5x) - CJK in Russian content\n`;
  markdown += `- Mermaid Issues (weight: 3x) - diagram syntax errors\n`;
  markdown += `- Duplicate Sections (weight: 2x) - generation loops\n\n`;

  markdown += `---\n\n## Detailed Results\n\n`;

  for (const result of report.results) {
    markdown += `### ${result.model}\n\n`;

    if (!result.success) {
      markdown += `**Status**: ❌ FAILED\n\n`;
      markdown += `**Error**: ${result.error || 'Unknown error'}\n\n`;
      markdown += `**Duration**: ${(result.durationMs / 1000).toFixed(1)}s\n\n`;
      continue;
    }

    markdown += `**Status**: ✅ Success\n\n`;
    markdown += `**Performance**:\n`;
    markdown += `- Duration: ${(result.durationMs / 1000).toFixed(1)}s\n`;
    markdown += `- Tokens Used: ${result.tokensUsed}\n`;
    markdown += `- Tokens/Second: ${(result.tokensUsed / (result.durationMs / 1000)).toFixed(1)}\n\n`;

    markdown += `**Validation Results**:\n`;
    markdown += `- Prompt Markers: ${result.validationResults.promptMarkers} ${result.validationResults.promptMarkers > 0 ? '⚠️ CRITICAL' : '✅'}\n`;
    markdown += `- Foreign Characters: ${result.validationResults.foreignCharacters} ${result.validationResults.foreignCharacters > 0 ? '⚠️ WARNING' : '✅'}\n`;
    markdown += `- Mermaid Issues: ${result.validationResults.mermaidIssues} ${result.validationResults.mermaidIssues > 0 ? '⚠️' : '✅'}\n`;
    markdown += `- Duplicate Sections: ${result.validationResults.duplicateSections} ${result.validationResults.duplicateSections > 0 ? '⚠️' : '✅'}\n\n`;

    markdown += `**Content Preview** (first 300 chars):\n\n`;
    markdown += '```\n';
    markdown += result.content.slice(0, 300) + (result.content.length > 300 ? '...' : '');
    markdown += '\n```\n\n';
  }

  markdown += `---\n\n## Configuration\n\n`;
  markdown += `- **Course ID**: ${report.config.courseId}\n`;
  markdown += `- **Lesson ID**: ${report.config.lessonId}\n`;
  markdown += `- **Models**: ${report.config.models.join(', ')}\n`;
  markdown += `- **Output Directory**: ${OUTPUT_DIR}\n\n`;

  markdown += `---\n\n*Generated by test-lesson-generation.ts*\n`;

  return markdown;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const config = parseArguments();

  logger.info(
    {
      courseId: config.courseId,
      lessonId: config.lessonId,
      models: config.models,
    },
    'Starting A/B test for lesson generation'
  );

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Load lesson spec
  const lessonSpec = await loadLessonSpec(config.courseId, config.lessonId);

  // Determine language from spec
  const language = lessonSpec.metadata.language || 'ru';

  // Run generation for each model
  const results: ModelResult[] = [];

  for (const model of config.models) {
    const result = await generateWithModel(model, lessonSpec, language);
    results.push(result);

    // Save result to disk
    await saveModelResult(result, OUTPUT_DIR);
  }

  // Generate comparison report
  const report: ComparisonReport = {
    config,
    lessonTitle: lessonSpec.title,
    results,
    timestamp: new Date().toISOString(),
  };

  const markdown = generateReport(report);

  // Save report
  const reportPath = path.join(OUTPUT_DIR, REPORT_FILENAME);
  await fs.writeFile(reportPath, markdown, 'utf-8');

  logger.info({ reportPath }, 'Comparison report generated');

  // Print summary to console
  console.log('\n' + '='.repeat(80));
  console.log('A/B TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`\nLesson: ${lessonSpec.title}`);
  console.log(`Models Tested: ${config.models.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  console.log(`\nReport: ${reportPath}`);
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  const allSuccessful = results.every(r => r.success);
  process.exit(allSuccessful ? 0 : 1);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch(error => {
  logger.error({ error }, 'Fatal error in A/B test script');
  console.error('Fatal error:', error);
  process.exit(1);
});
