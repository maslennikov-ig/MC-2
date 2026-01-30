#!/usr/bin/env tsx
/**
 * Full Lesson A/B Testing Script
 * @module scripts/test-full-lesson-generation
 *
 * Generates complete lessons with sections (including Mermaid diagrams).
 * Uses proper LessonSpecificationV2 format for realistic testing.
 *
 * Usage:
 * pnpm tsx scripts/test-full-lesson-generation.ts \
 *   --models "xiaomi/mimo-v2-flash,allenai/olmo-3.1-32b-instruct"
 */

import 'dotenv/config';
import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '@/shared/logger';
import type {
  LessonSpecificationV2,
  SectionSpecV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { generateIntroduction } from '@/stages/stage6-lesson-content/nodes/generator/generator-content';
import { generateSection } from '@/stages/stage6-lesson-content/nodes/generator/generator-section';
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
  models: string[];
  sectionsToGenerate: number;
}

interface SectionResult {
  title: string;
  content: string;
  tokensUsed: number;
  durationMs: number;
  hasMermaid: boolean;
  validationResults: {
    promptMarkers: number;
    foreignCharacters: number;
    mermaidIssues: number;
  };
}

interface ModelResult {
  model: string;
  success: boolean;
  totalDurationMs: number;
  totalTokensUsed: number;
  introduction: {
    content: string;
    tokensUsed: number;
    durationMs: number;
  } | null;
  sections: SectionResult[];
  aggregatedValidation: {
    promptMarkers: number;
    foreignCharacters: number;
    mermaidIssues: number;
    duplicateSections: number;
  };
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OUTPUT_DIR = '.tmp/test-full-generation';
const REPORT_FILENAME = 'full-lesson-report.md';

// ============================================================================
// LESSON SPECIFICATION (Based on real "Импортозамещение" lesson)
// ============================================================================

function createRealLessonSpec(): LessonSpecificationV2 {
  // Proper V2 sections with all required fields
  const sections: SectionSpecV2[] = [
    {
      title: 'История импортозамещения: уроки прошлого и вызовы настоящего',
      content_archetype: 'concept_explainer',
      rag_context_id: 'rag-1',
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['импортозамещение', 'стратегия', '2014', 'санкции'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Исторические циклы импортозамещения в России',
        'Уроки 2014 года: продовольственное эмбарго как катализатор',
        'Эволюция от кризисной реакции к стратегическому подходу',
      ],
      analogies_to_use: 'Сравнение с пересадкой растения в новую почву',
    },
    {
      title: 'Процесс замены поставщиков: пошаговая стратегия',
      content_archetype: 'case_study',
      rag_context_id: 'rag-2',
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['поставщик', 'риски', 'переход', 'пилот'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'ABC/XYZ-анализ критичности компонентов',
        'Этапы подготовки к переходу на локального поставщика',
        'Создание визуализации процесса с помощью диаграммы',
        'KPI для мониторинга успешности перехода',
      ],
      analogies_to_use: 'Аналогия с пересадкой растения без шока для корневой системы',
    },
  ];

  return {
    lesson_id: 'real-lesson-001',
    course_id: 'bc34283a-0a61-45cb-8e5c-773a3b67a86c',
    title: 'Суть импортозамещения: от кризиса к стратегии',
    description:
      'Урок раскрывает эволюцию импортозамещения в России и предоставляет практические инструменты для перехода на отечественных поставщиков.',
    estimated_duration_minutes: 15,
    difficulty_level: 'intermediate',
    learning_objectives: [
      {
        id: 'LO-1',
        objective: 'Описать основные принципы импортозамещения через исторический контекст',
        bloom_level: 'understand',
      },
      {
        id: 'LO-2',
        objective: 'Применять пошаговую стратегию замены импортных поставщиков на локальных',
        bloom_level: 'apply',
      },
      {
        id: 'LO-3',
        objective: 'Оценивать риски и возможности при переходе на импортозамещение',
        bloom_level: 'evaluate',
      },
    ],
    sections,
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'case_study',
      language: 'ru',
    },
    intro_blueprint: {
      hook_strategy: 'statistic',
      hook_topic: '80% сделок срываются на этапе перехода к локальным поставщикам',
      key_learning_objectives: 'История импортозамещения, стратегия перехода, управление рисками',
    },
    lesson_context: {
      previous_lesson: null, // First lesson in course
      next_lesson: {
        lesson_id: '1.2',
        title: 'Правовой ландшафт импортозамещения 2025 года',
        key_concepts: ['законодательство', 'нормативы', '44-ФЗ', '223-ФЗ'],
      },
      concepts_already_covered: [],
      terms_already_defined: [],
    },
  };
}

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

async function generateFullLesson(
  model: string,
  lessonSpec: LessonSpecificationV2,
  language: string,
  sectionsToGenerate: number
): Promise<ModelResult> {
  const startTime = Date.now();
  let totalTokens = 0;

  logger.info({ model, sectionsToGenerate }, 'Starting full lesson generation');

  try {
    // 1. Generate Introduction
    logger.info({ model }, 'Generating introduction...');
    const introStart = Date.now();
    const modelInstance = createOpenRouterModel(model, 0.7, 4000);
    const introResult = await generateIntroduction(lessonSpec, language, modelInstance);
    const introDuration = Date.now() - introStart;
    totalTokens += introResult.tokensUsed;

    logger.info(
      { model, tokens: introResult.tokensUsed, durationMs: introDuration },
      'Introduction generated'
    );

    // 2. Generate Sections
    const sectionResults: SectionResult[] = [];
    let previousContext = introResult.content;

    const sectionsToProcess = lessonSpec.sections.slice(0, sectionsToGenerate);

    for (const section of sectionsToProcess) {
      logger.info({ model, sectionTitle: section.title }, 'Generating section...');
      const sectionStart = Date.now();

      try {
        const sectionResult = await generateSection(
          section,
          lessonSpec,
          [], // Empty RAG chunks for testing
          previousContext,
          language,
          model, // Model override
          'professional'
        );

        const sectionDuration = Date.now() - sectionStart;
        totalTokens += sectionResult.tokensUsed;

        // Validate section content
        const promptMarkersResult = checkPromptMarkers(sectionResult.content);
        const langResult = checkLanguageConsistency(sectionResult.content, language);
        const mermaidResult = checkMermaidSyntax(sectionResult.content);

        sectionResults.push({
          title: section.title,
          content: sectionResult.content,
          tokensUsed: sectionResult.tokensUsed,
          durationMs: sectionDuration,
          hasMermaid: sectionResult.content.includes('```mermaid'),
          validationResults: {
            promptMarkers: promptMarkersResult.detectedMarkers.length,
            foreignCharacters: langResult.foreignCharacters,
            mermaidIssues: mermaidResult.mermaidIssues.length,
          },
        });

        // Update context window for next section
        previousContext += '\n\n' + sectionResult.content;

        logger.info(
          {
            model,
            sectionTitle: section.title,
            tokens: sectionResult.tokensUsed,
            durationMs: sectionDuration,
            hasMermaid: sectionResult.content.includes('```mermaid'),
          },
          'Section generated'
        );
      } catch (sectionError) {
        logger.error(
          { model, sectionTitle: section.title, error: sectionError },
          'Section generation failed'
        );
        throw sectionError;
      }
    }

    // 3. Aggregate validation results
    const introPromptMarkers = checkPromptMarkers(introResult.content);
    const introLang = checkLanguageConsistency(introResult.content, language);
    const introMermaid = checkMermaidSyntax(introResult.content);

    const fullContent =
      introResult.content + '\n\n' + sectionResults.map(s => s.content).join('\n\n');
    const dupResult = checkSectionDuplication(fullContent);

    const aggregatedValidation = {
      promptMarkers:
        introPromptMarkers.detectedMarkers.length +
        sectionResults.reduce((sum, s) => sum + s.validationResults.promptMarkers, 0),
      foreignCharacters:
        introLang.foreignCharacters +
        sectionResults.reduce((sum, s) => sum + s.validationResults.foreignCharacters, 0),
      mermaidIssues:
        introMermaid.mermaidIssues.length +
        sectionResults.reduce((sum, s) => sum + s.validationResults.mermaidIssues, 0),
      duplicateSections: dupResult.duplicatePairs.length,
    };

    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        model,
        totalTokens,
        totalDurationMs: totalDuration,
        sectionsGenerated: sectionResults.length,
        validation: aggregatedValidation,
      },
      'Full lesson generation complete'
    );

    return {
      model,
      success: true,
      totalDurationMs: totalDuration,
      totalTokensUsed: totalTokens,
      introduction: {
        content: introResult.content,
        tokensUsed: introResult.tokensUsed,
        durationMs: introDuration,
      },
      sections: sectionResults,
      aggregatedValidation,
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    logger.error({ model, error }, 'Full lesson generation failed');

    return {
      model,
      success: false,
      totalDurationMs: totalDuration,
      totalTokensUsed: totalTokens,
      introduction: null,
      sections: [],
      aggregatedValidation: {
        promptMarkers: 0,
        foreignCharacters: 0,
        mermaidIssues: 0,
        duplicateSections: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(results: ModelResult[], lessonSpec: LessonSpecificationV2): string {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let markdown = `# Full Lesson Generation Report

**Lesson**: ${lessonSpec.title}
**Date**: ${new Date().toISOString()}
**Models Tested**: ${results.length}
**Successful**: ${successful.length}
**Failed**: ${failed.length}

---

## Summary Table

| Model | Duration | Tokens | Sections | Mermaid | Prompt Markers | CJK | Mermaid Issues | Status |
|-------|----------|--------|----------|---------|----------------|-----|----------------|--------|
`;

  for (const result of results) {
    const status = result.success ? '✅ OK' : '❌ FAILED';
    const duration = result.success ? `${(result.totalDurationMs / 1000).toFixed(1)}s` : '-';
    const tokens = result.success ? result.totalTokensUsed.toString() : '-';
    const sections = result.success ? result.sections.length.toString() : '-';
    const mermaidCount = result.sections.filter(s => s.hasMermaid).length;

    markdown += `| ${result.model} | ${duration} | ${tokens} | ${sections} | ${mermaidCount} | ${result.aggregatedValidation.promptMarkers} | ${result.aggregatedValidation.foreignCharacters} | ${result.aggregatedValidation.mermaidIssues} | ${status} |\n`;
  }

  markdown += `\n---\n\n## Detailed Results\n\n`;

  for (const result of results) {
    markdown += `### ${result.model}\n\n`;

    if (!result.success) {
      markdown += `**Status**: ❌ FAILED\n\n`;
      markdown += `**Error**: ${result.error || 'Unknown error'}\n\n`;
      continue;
    }

    markdown += `**Status**: ✅ Success\n\n`;
    markdown += `**Performance**:\n`;
    markdown += `- Total Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s\n`;
    markdown += `- Total Tokens: ${result.totalTokensUsed}\n`;
    markdown += `- Tokens/Second: ${(result.totalTokensUsed / (result.totalDurationMs / 1000)).toFixed(1)}\n\n`;

    markdown += `**Introduction** (${result.introduction?.tokensUsed || 0} tokens):\n\n`;
    markdown += '```\n';
    markdown += (result.introduction?.content || '').slice(0, 300) + '...\n';
    markdown += '```\n\n';

    markdown += `**Sections Generated**: ${result.sections.length}\n\n`;

    for (const section of result.sections) {
      const mermaidBadge = section.hasMermaid ? ' 📊 [MERMAID]' : '';
      const issues =
        section.validationResults.promptMarkers +
        section.validationResults.foreignCharacters +
        section.validationResults.mermaidIssues;
      const statusBadge = issues > 0 ? ' ⚠️' : ' ✅';

      markdown += `#### ${section.title}${mermaidBadge}${statusBadge}\n\n`;
      markdown += `- Tokens: ${section.tokensUsed}\n`;
      markdown += `- Duration: ${(section.durationMs / 1000).toFixed(1)}s\n`;
      markdown += `- Prompt Markers: ${section.validationResults.promptMarkers}\n`;
      markdown += `- CJK Characters: ${section.validationResults.foreignCharacters}\n`;
      markdown += `- Mermaid Issues: ${section.validationResults.mermaidIssues}\n\n`;

      if (section.hasMermaid) {
        const mermaidMatch = section.content.match(/```mermaid[\s\S]*?```/);
        if (mermaidMatch) {
          markdown += `**Mermaid Diagram**:\n\n`;
          markdown += mermaidMatch[0] + '\n\n';
        }
      }

      markdown += `**Preview** (first 200 chars):\n\n`;
      markdown += '```\n';
      markdown += section.content.slice(0, 200) + '...\n';
      markdown += '```\n\n';
    }

    markdown += `**Aggregated Validation**:\n`;
    markdown += `- Prompt Markers: ${result.aggregatedValidation.promptMarkers} ${result.aggregatedValidation.promptMarkers > 0 ? '⚠️ CRITICAL' : '✅'}\n`;
    markdown += `- CJK Characters: ${result.aggregatedValidation.foreignCharacters} ${result.aggregatedValidation.foreignCharacters > 0 ? '⚠️' : '✅'}\n`;
    markdown += `- Mermaid Issues: ${result.aggregatedValidation.mermaidIssues} ${result.aggregatedValidation.mermaidIssues > 0 ? '⚠️' : '✅'}\n`;
    markdown += `- Duplicate Sections: ${result.aggregatedValidation.duplicateSections} ${result.aggregatedValidation.duplicateSections > 0 ? '⚠️' : '✅'}\n\n`;

    markdown += '---\n\n';
  }

  return markdown;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  program
    .option(
      '--models <models>',
      'Comma-separated list of model IDs',
      'xiaomi/mimo-v2-flash,allenai/olmo-3.1-32b-instruct'
    )
    .option('--sections <count>', 'Number of sections to generate', '2')
    .parse();

  const options = program.opts();
  const config: TestConfig = {
    models: options.models.split(',').map((m: string) => m.trim()),
    sectionsToGenerate: parseInt(options.sections, 10),
  };

  console.log('\n' + '='.repeat(80));
  console.log('FULL LESSON A/B TEST');
  console.log('='.repeat(80));
  console.log(`\nModels: ${config.models.join(', ')}`);
  console.log(`Sections to generate: ${config.sectionsToGenerate}`);
  console.log('');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Create lesson spec
  const lessonSpec = createRealLessonSpec();

  // Run generation for each model
  const results: ModelResult[] = [];

  for (const model of config.models) {
    console.log(`\n>>> Testing model: ${model}`);
    const result = await generateFullLesson(model, lessonSpec, 'ru', config.sectionsToGenerate);
    results.push(result);

    // Save individual result
    const modelDirName = model.replace(/[/:]/g, '-');
    const modelDir = path.join(OUTPUT_DIR, modelDirName);
    await fs.mkdir(modelDir, { recursive: true });

    // Save full content
    if (result.success) {
      const fullContent =
        (result.introduction?.content || '') +
        '\n\n' +
        result.sections.map(s => s.content).join('\n\n');
      await fs.writeFile(path.join(modelDir, 'full-content.md'), fullContent, 'utf-8');
    }

    // Save metadata
    await fs.writeFile(
      path.join(modelDir, 'metadata.json'),
      JSON.stringify(result, null, 2),
      'utf-8'
    );
  }

  // Generate and save report
  const report = generateReport(results, lessonSpec);
  const reportPath = path.join(OUTPUT_DIR, REPORT_FILENAME);
  await fs.writeFile(reportPath, report, 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`\nLesson: ${lessonSpec.title}`);
  console.log(`Models Tested: ${config.models.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const mermaidCount = result.sections.filter(s => s.hasMermaid).length;
    const issues =
      result.aggregatedValidation.promptMarkers +
      result.aggregatedValidation.foreignCharacters +
      result.aggregatedValidation.mermaidIssues;

    console.log(
      `\n${status} ${result.model}: ${result.totalTokensUsed} tokens, ${mermaidCount} mermaid, ${issues} issues`
    );
  }

  console.log(`\nReport: ${reportPath}`);
  console.log('='.repeat(80) + '\n');

  const allSuccessful = results.every(r => r.success);
  process.exit(allSuccessful ? 0 : 1);
}

main().catch(error => {
  logger.error({ error }, 'Fatal error in full lesson test');
  console.error('Fatal error:', error);
  process.exit(1);
});
