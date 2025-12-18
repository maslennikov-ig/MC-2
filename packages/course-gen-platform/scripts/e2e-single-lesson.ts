/**
 * E2E Test Script: Single Lesson Generation
 *
 * Runs the complete Stage 6 pipeline for a single lesson and saves
 * the output of each stage to a markdown report file.
 *
 * Uses LangGraph streaming to capture intermediate states.
 *
 * Usage: npx tsx scripts/e2e-single-lesson.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables from the correct path
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
console.log(`Loading env from: ${envPath}`);

// Import Stage 6 orchestrator
import { executeStage6, type Stage6Input, type Stage6Output } from '../src/stages/stage6-lesson-content/orchestrator';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';

// ============================================================================
// Test Data
// ============================================================================

const TEST_COURSE_ID = uuidv4();
const TEST_LESSON_ID = uuidv4();

/**
 * Create a realistic lesson specification for testing
 */
function createTestLessonSpec(): LessonSpecificationV2 {
  return {
    lesson_id: TEST_LESSON_ID,
    title: 'Введение в машинное обучение',
    description: 'Этот урок познакомит вас с основами машинного обучения, ' +
      'включая ключевые концепции, типы алгоритмов и практические применения.',
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-ML-1',
        objective: 'Понять основные концепции машинного обучения',
        bloom_level: 'understand',
      },
      {
        id: 'LO-ML-2',
        objective: 'Различать типы машинного обучения (supervised, unsupervised, reinforcement)',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-ML-3',
        objective: 'Применить знания для выбора подходящего алгоритма',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Как компьютеры учатся без явного программирования?',
      key_learning_objectives: 'концепции ML, типы алгоритмов, практические применения',
    },
    sections: [
      {
        title: 'Что такое машинное обучение?',
        content_archetype: 'concept_explainer',
        rag_context_id: uuidv4(),
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: ['машинное обучение', 'искусственный интеллект', 'алгоритм'],
          prohibited_terms: [],
        },
        key_points_to_cover: [
          'Определение машинного обучения',
          'Отличие от традиционного программирования',
          'Исторический контекст развития',
        ],
      },
      {
        title: 'Типы машинного обучения',
        content_archetype: 'concept_explainer',
        rag_context_id: uuidv4(),
        constraints: {
          depth: 'comprehensive',
          required_keywords: ['supervised', 'unsupervised', 'reinforcement learning'],
          prohibited_terms: [],
        },
        key_points_to_cover: [
          'Обучение с учителем (Supervised Learning)',
          'Обучение без учителя (Unsupervised Learning)',
          'Обучение с подкреплением (Reinforcement Learning)',
          'Примеры применения каждого типа',
        ],
      },
    ],
    exercises: [
      {
        type: 'quiz',
        difficulty: 'easy',
        learning_objective_id: 'LO-ML-2',
        structure_template: 'Определите тип машинного обучения для следующих задач: ' +
          '1) Классификация email как спам/не спам, ' +
          '2) Группировка клиентов по поведению, ' +
          '3) Обучение робота ходить',
        rubric_criteria: [
          {
            criteria: ['Правильное определение типа ML', 'Обоснование выбора'],
            weight: 100,
          },
        ],
      },
    ],
    rag_context: {
      primary_documents: [uuidv4()],
      search_queries: ['машинное обучение основы', 'типы ML алгоритмов'],
      expected_chunks: 5,
    },
    estimated_duration_minutes: 25,
    difficulty_level: 'beginner',
  };
}

/**
 * Create mock RAG chunks for testing
 */
function createTestRAGChunks(): RAGChunk[] {
  return [
    {
      chunk_id: uuidv4(),
      document_id: uuidv4(),
      document_name: 'ml-fundamentals.pdf',
      content: `Машинное обучение (Machine Learning) — это область искусственного интеллекта,
        которая изучает алгоритмы, способные автоматически улучшать свою производительность
        на основе опыта. В отличие от традиционного программирования, где разработчик явно
        описывает правила, в машинном обучении система сама выявляет закономерности в данных.

        Основное преимущество ML — способность обрабатывать сложные задачи, для которых
        трудно сформулировать явные правила: распознавание изображений, понимание естественного
        языка, прогнозирование временных рядов.`,
      page_or_section: 'Глава 1: Введение',
      relevance_score: 0.95,
    },
    {
      chunk_id: uuidv4(),
      document_id: uuidv4(),
      document_name: 'ml-types.pdf',
      content: `Supervised Learning (Обучение с учителем) — алгоритм обучается на размеченных
        данных, где известен правильный ответ. Примеры: классификация, регрессия.

        Unsupervised Learning (Обучение без учителя) — алгоритм находит скрытые закономерности
        в неразмеченных данных. Примеры: кластеризация, снижение размерности.

        Reinforcement Learning (Обучение с подкреплением) — агент учится через взаимодействие
        со средой, получая награды или штрафы. Примеры: игры, робототехника.`,
      page_or_section: 'Глава 2: Типы ML',
      relevance_score: 0.92,
    },
    {
      chunk_id: uuidv4(),
      document_id: uuidv4(),
      document_name: 'ml-history.pdf',
      content: `История машинного обучения начинается с 1950-х годов. Алан Тьюринг предложил
        тест Тьюринга в 1950 году. Артур Сэмюэл ввел термин "машинное обучение" в 1959 году.

        Ключевые вехи:
        - 1957: Перцептрон (Frank Rosenblatt)
        - 1986: Backpropagation (Rumelhart, Hinton, Williams)
        - 2012: AlexNet побеждает в ImageNet
        - 2017: Transformer архитектура (Attention Is All You Need)
        - 2022+: Эра больших языковых моделей (GPT, Claude)`,
      page_or_section: 'Глава 3: История',
      relevance_score: 0.88,
    },
  ];
}

// ============================================================================
// Report Generation
// ============================================================================

class ReportGenerator {
  private report: string[] = [];

  constructor(courseId: string, lessonId: string) {
    this.report.push('# Stage 6 E2E Test Report: Single Lesson Generation\n');
    this.report.push(`**Generated**: ${new Date().toISOString()}\n`);
    this.report.push(`**Course ID**: \`${courseId}\`\n`);
    this.report.push(`**Lesson ID**: \`${lessonId}\`\n`);
    this.report.push('\n---\n');
  }

  addSection(title: string, content: string) {
    this.report.push(`\n## ${title}\n`);
    this.report.push(content);
  }

  addStageOutput(stageName: string, output: unknown, truncateAt = 15000) {
    this.report.push(`\n### ${stageName}\n`);

    if (typeof output === 'string') {
      this.report.push('```markdown\n');
      this.report.push(output.slice(0, truncateAt));
      if (output.length > truncateAt) {
        this.report.push('\n\n... [truncated] ...\n');
      }
      this.report.push('\n```\n');
    } else {
      this.report.push('```json\n');
      const jsonStr = JSON.stringify(output, null, 2);
      this.report.push(jsonStr.slice(0, truncateAt));
      if (jsonStr.length > truncateAt) {
        this.report.push('\n\n... [truncated] ...\n');
      }
      this.report.push('\n```\n');
    }
  }

  addError(error: Error) {
    this.report.push('\n## ❌ Error\n');
    this.report.push('```\n');
    this.report.push(`Error: ${error.message}\n`);
    this.report.push(`Stack: ${error.stack}\n`);
    this.report.push('```\n');
  }

  addSummary(metrics: {
    totalDuration: number;
    tokensUsed: number;
    qualityScore: number | null;
    modelUsed: string | null;
    success: boolean;
    errors: string[];
  }) {
    this.report.push('\n---\n');
    this.report.push('\n## Summary\n');
    this.report.push(`| Metric | Value |\n`);
    this.report.push(`|--------|-------|\n`);
    this.report.push(`| Status | ${metrics.success ? '✅ Success' : '❌ Failed'} |\n`);
    this.report.push(`| Total Duration | ${metrics.totalDuration}ms (${(metrics.totalDuration / 1000).toFixed(1)}s) |\n`);
    this.report.push(`| Tokens Used | ${metrics.tokensUsed} |\n`);
    this.report.push(`| Quality Score | ${metrics.qualityScore?.toFixed(2) ?? 'N/A'} |\n`);
    this.report.push(`| Model Used | ${metrics.modelUsed ?? 'N/A'} |\n`);
    this.report.push(`| Errors | ${metrics.errors.length} |\n`);

    if (metrics.errors.length > 0) {
      this.report.push('\n### Errors:\n');
      metrics.errors.forEach((err, i) => {
        this.report.push(`${i + 1}. ${err}\n`);
      });
    }
  }

  save(filename: string): string {
    const outputDir = path.join(__dirname, '..', '.tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, this.report.join(''));
    return outputPath;
  }
}

// ============================================================================
// Main E2E Test
// ============================================================================

async function runE2ETest() {
  console.log('🚀 Starting Stage 6 E2E Test: Single Lesson Generation\n');

  const lessonSpec = createTestLessonSpec();
  const ragChunks = createTestRAGChunks();
  const report = new ReportGenerator(TEST_COURSE_ID, TEST_LESSON_ID);

  // Add test input to report
  report.addSection('Test Input', '');
  report.addStageOutput('Lesson Specification', lessonSpec);
  report.addStageOutput('RAG Chunks', ragChunks);

  console.log(`📋 Lesson: "${lessonSpec.title}"`);
  console.log(`📚 Sections: ${lessonSpec.sections.length}`);
  console.log(`📖 RAG Chunks: ${ragChunks.length}`);
  console.log('');

  const startTime = Date.now();

  try {
    const input: Stage6Input = {
      lessonSpec,
      courseId: TEST_COURSE_ID,
      ragChunks,
    };

    console.log('⚡ Executing Stage 6 pipeline...');
    console.log('   (planner → expander → assembler → smoother → judge)\n');

    const result: Stage6Output = await executeStage6(input);

    const totalDuration = Date.now() - startTime;

    // Add results to report
    report.addSection('Pipeline Execution Results', '');

    if (result.lessonContent) {
      report.addStageOutput('Generated Lesson Content (Full)', result.lessonContent);

      // Add separate views of content
      if (result.lessonContent.content) {
        report.addSection('Content Breakdown', '');
        report.addStageOutput('Introduction', result.lessonContent.content.intro);
        report.addStageOutput('Sections', result.lessonContent.content.sections);
        report.addStageOutput('Examples', result.lessonContent.content.examples);
        report.addStageOutput('Exercises', result.lessonContent.content.exercises);
      }
    } else {
      report.addSection('Generated Content', '**No content generated** - pipeline may have failed or content was rejected by judge.');
    }

    // Add summary
    report.addSummary({
      totalDuration,
      tokensUsed: result.metrics.tokensUsed,
      qualityScore: result.metrics.qualityScore,
      modelUsed: result.metrics.modelUsed,
      success: result.success,
      errors: result.errors,
    });

    // Save report
    const reportPath = report.save(`e2e-single-lesson-${Date.now()}.md`);

    // Console output
    console.log('🏁 E2E Test Complete!\n');
    console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log(`   Tokens: ${result.metrics.tokensUsed}`);
    console.log(`   Quality Score: ${result.metrics.qualityScore?.toFixed(2) ?? 'N/A'}`);
    console.log(`   Model: ${result.metrics.modelUsed ?? 'N/A'}`);
    console.log(`   Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n   Errors:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    console.log(`\n📄 Full report saved to: ${reportPath}`);

    // Preview generated content
    if (result.lessonContent?.content?.intro) {
      console.log('\n---\n📝 Content Preview (Introduction):\n');
      console.log(result.lessonContent.content.intro.slice(0, 500));
      if (result.lessonContent.content.intro.length > 500) {
        console.log('\n... [see full report for complete content]');
      }
    }

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));

    report.addError(err);
    report.addSummary({
      totalDuration,
      tokensUsed: 0,
      qualityScore: null,
      modelUsed: null,
      success: false,
      errors: [err.message],
    });

    const reportPath = report.save(`e2e-single-lesson-error-${Date.now()}.md`);

    console.error('\n❌ E2E Test Failed!\n');
    console.error(`   Error: ${err.message}`);
    console.error(`   Duration: ${totalDuration}ms`);
    console.error(`\n📄 Error report saved to: ${reportPath}`);

    process.exit(1);
  }
}

// Run the test
runE2ETest().catch(console.error);
