/**
 * Supplementary test for Qwen3 235B A22B Instruct 2507
 *
 * Testing if the Instruct 2507 version performs better than the base a22b model
 */

import { ChatOpenAI } from '@langchain/openai';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Load .env file
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && match[1] === 'OPENROUTER_API_KEY') {
      process.env.OPENROUTER_API_KEY = match[2].trim();
    }
  });
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found in environment or .env file');
  process.exit(1);
}

const OUTPUT_DIR =
  '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing/test-run-3';

const MODEL = {
  slug: 'qwen3-235b-a22b-2507',
  apiName: 'qwen/qwen3-235b-a22b-2507',
  name: 'Qwen3 235B A22B Instruct 2507',
};

const SCENARIOS = [
  {
    id: 'metadata-en',
    type: 'metadata',
    language: 'en',
    prompt: `You are a course design expert. Generate comprehensive course metadata for the following course.

Course Title: "Introduction to Python Programming"
Description: Beginner-level technical programming course

Generate a JSON object with the following fields:
- course_title: string (10-200 chars)
- course_description: string (50-500 chars, elevator pitch)
- course_overview: string (100+ chars, comprehensive description)
- target_audience: string (30+ chars)
- estimated_duration_hours: number (realistic estimate)
- difficulty_level: "beginner" | "intermediate" | "advanced"
- prerequisites: string[] (1-5 items)
- learning_outcomes: string[] (3-8 measurable outcomes using Bloom's taxonomy verbs)
- course_tags: string[] (3-10 relevant tags)

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,
  },
  {
    id: 'metadata-ru',
    type: 'metadata',
    language: 'ru',
    prompt: `Вы эксперт по разработке образовательных курсов. Создайте полные метаданные курса для следующего курса.

Название курса: "Машинное обучение для начинающих"
Описание: Курс среднего уровня, концептуальный курс по ML

Создайте JSON объект со следующими полями:
- course_title: string (10-200 символов)
- course_description: string (50-500 символов, краткая презентация)
- course_overview: string (100+ символов, развёрнутое описание)
- target_audience: string (30+ символов)
- estimated_duration_hours: number (реалистичная оценка)
- difficulty_level: "beginner" | "intermediate" | "advanced"
- prerequisites: string[] (1-5 элементов)
- learning_outcomes: string[] (3-8 измеримых результатов обучения с глаголами таксономии Блума)
- course_tags: string[] (3-10 релевантных тегов)

КРИТИЧЕСКИ ВАЖНО: Верните ТОЛЬКО валидный JSON. Без markdown, без блоков кода, без объяснений.`,
  },
  {
    id: 'lesson-en',
    type: 'lesson',
    language: 'en',
    prompt: `You are a course design expert. Generate a complete lesson section structure for the following topic.

Section Topic: "Variables and Data Types in Python"
Description: Hands-on programming section with exercises

Generate a JSON object with the following fields:
- section_number: number (use 1)
- section_title: string (10-100 chars)
- section_description: string (30+ chars)
- learning_objectives: string[] (1-5 measurable objectives)
- lessons: array of 3-5 lesson objects, each with:
  - lesson_number: number (sequential)
  - lesson_title: string (10-100 chars)
  - lesson_objective: string (20+ chars, measurable)
  - key_topics: string[] (3-7 topics)
  - exercises: array of 1-3 exercise objects, each with:
    - exercise_title: string (5-100 chars)
    - exercise_instructions: string (20+ chars, clear and actionable)

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`,
  },
  {
    id: 'lesson-ru',
    type: 'lesson',
    language: 'ru',
    prompt: `Вы эксперт по разработке образовательных курсов. Создайте полную структуру раздела урока для следующей темы.

Тема раздела: "Основы нейронных сетей"
Описание: Концептуальный теоретический раздел с примерами

Создайте JSON объект со следующими полями:
- section_number: number (используйте 1)
- section_title: string (10-100 символов)
- section_description: string (30+ символов)
- learning_objectives: string[] (1-5 измеримых целей)
- lessons: массив из 3-5 объектов урока, каждый с:
  - lesson_number: number (последовательный)
  - lesson_title: string (10-100 символов)
  - lesson_objective: string (20+ символов, измеримый)
  - key_topics: string[] (3-7 тем)
  - exercises: массив из 1-3 объектов упражнения, каждый с:
    - exercise_title: string (5-100 символов)
    - exercise_instructions: string (20+ символов, чёткие и выполнимые)

КРИТИЧЕСКИ ВАЖНО: Верните ТОЛЬКО валидный JSON. Без markdown, без блоков кода, без объяснений.`,
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanJsonResponse(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

interface TestResult {
  model: string;
  modelSlug: string;
  scenario: string;
  runNumber: number;
  success: boolean;
  duration: number;
  error?: string;
  contentLength?: number;
}

async function runSingleTest(
  scenario: (typeof SCENARIOS)[0],
  runNumber: number
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    console.log(`  [${MODEL.slug}] ${scenario.id} run${runNumber} - Starting...`);

    const llm = new ChatOpenAI({
      modelName: MODEL.apiName,
      apiKey: OPENROUTER_API_KEY,
      temperature: 0.7,
      maxTokens: 8000,
      timeout: 120000,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
          'HTTP-Referer': 'https://ai.megacampus.ru',
          'X-Title': 'MegaCampus LLM Testing v3 - Qwen3 235B A22B 2507 Supplementary',
        },
      },
    });

    const response = await llm.invoke(scenario.prompt);
    const duration = Date.now() - startTime;

    const content = response.content as string;
    const cleaned = cleanJsonResponse(content);

    // Try to parse JSON
    const parsed = JSON.parse(cleaned);

    // Save result
    const modelDir = join(OUTPUT_DIR, MODEL.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const outputFile = join(modelDir, `${scenario.id}-run${runNumber}.json`);
    const logFile = join(modelDir, `${scenario.id}-run${runNumber}.log`);

    writeFileSync(outputFile, JSON.stringify(parsed, null, 2), 'utf-8');
    writeFileSync(
      logFile,
      JSON.stringify(
        {
          model: MODEL.name,
          modelSlug: MODEL.slug,
          scenario: scenario.id,
          runNumber,
          duration,
          timestamp: new Date().toISOString(),
          contentLength: cleaned.length,
        },
        null,
        2
      ),
      'utf-8'
    );

    console.log(
      `  [${MODEL.slug}] ${scenario.id} run${runNumber} - ✅ Success (${(duration / 1000).toFixed(1)}s)`
    );

    return {
      model: MODEL.name,
      modelSlug: MODEL.slug,
      scenario: scenario.id,
      runNumber,
      success: true,
      duration,
      contentLength: cleaned.length,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error.message || String(error);

    console.log(
      `  [${MODEL.slug}] ${scenario.id} run${runNumber} - ❌ Error: ${errorMsg.substring(0, 100)}`
    );

    // Save error log
    const modelDir = join(OUTPUT_DIR, MODEL.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const errorFile = join(modelDir, `${scenario.id}-run${runNumber}-ERROR.json`);
    writeFileSync(
      errorFile,
      JSON.stringify(
        {
          model: MODEL.name,
          modelSlug: MODEL.slug,
          scenario: scenario.id,
          runNumber,
          error: errorMsg,
          duration,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    );

    return {
      model: MODEL.name,
      modelSlug: MODEL.slug,
      scenario: scenario.id,
      runNumber,
      success: false,
      duration,
      error: errorMsg,
    };
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║    Qwen3 235B A22B Instruct 2507 - Supplementary Test        ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Test Configuration:`);
  console.log(`   Model: ${MODEL.name}`);
  console.log(`   API Name: ${MODEL.apiName}`);
  console.log(`   Scenarios: ${SCENARIOS.length}`);
  console.log(`   Runs per scenario: 3`);
  console.log(`   Total API calls: ${SCENARIOS.length * 3}`);
  console.log(`   Output directory: ${OUTPUT_DIR}/${MODEL.slug}\n`);

  const overallStartTime = Date.now();
  const results: TestResult[] = [];

  console.log('🚀 Starting tests...\n');

  // Run all scenarios sequentially with 3 runs each
  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= 3; run++) {
      const result = await runSingleTest(scenario, run);
      results.push(result);

      // Small delay between requests
      if (run < 3 || scenario.id !== SCENARIOS[SCENARIOS.length - 1].id) {
        await sleep(500);
      }
    }
  }

  const overallDuration = Date.now() - overallStartTime;

  // Calculate statistics
  const totalTests = results.length;
  const successfulTests = results.filter(r => r.success).length;
  const failedTests = totalTests - successfulTests;
  const successRate = (successfulTests / totalTests) * 100;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  // Save summary
  const summary = {
    testRunId: '2025-11-14-v3-qwen3-235b-a22b-2507-supplementary',
    model: MODEL.name,
    modelSlug: MODEL.slug,
    apiName: MODEL.apiName,
    timestamp: new Date().toISOString(),
    duration: overallDuration,
    durationMinutes: (overallDuration / 1000 / 60).toFixed(2),
    scenarios: SCENARIOS.length,
    runsPerScenario: 3,
    totalTests,
    successfulTests,
    failedTests,
    successRate: successRate.toFixed(2),
    avgTestDuration: avgDuration.toFixed(0),
    results,
  };

  const summaryFile = join(OUTPUT_DIR, MODEL.slug, 'summary.json');
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');

  // Print final statistics
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║              SUPPLEMENTARY TEST COMPLETE                      ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 ${MODEL.name} Statistics:`);
  console.log(`   Total duration: ${(overallDuration / 1000 / 60).toFixed(2)} minutes`);
  console.log(`   Total tests: ${totalTests}`);
  console.log(`   Successful: ${successfulTests} (${successRate.toFixed(1)}%)`);
  console.log(`   Failed: ${failedTests}`);
  console.log(`   Average test duration: ${(avgDuration / 1000).toFixed(1)}s\n`);

  const icon = successRate === 100 ? '✅' : successRate > 80 ? '⚠️' : '❌';
  console.log(
    `${icon} ${MODEL.name}: ${successfulTests}/${totalTests} (${successRate.toFixed(1)}%)\n`
  );

  console.log(`📁 Results saved to: ${OUTPUT_DIR}/${MODEL.slug}`);
  console.log(`📄 Summary: ${summaryFile}\n`);

  // Comparison with base qwen3-235b-a22b
  console.log('📊 Comparison with base qwen3-235b-a22b:');
  console.log(`   Base model (qwen3-235b-a22b): 0/12 (0.0%) - FAILED`);
  console.log(`   Instruct 2507: ${successfulTests}/${totalTests} (${successRate.toFixed(1)}%)\n`);

  if (successRate > 0) {
    console.log('✅ Instruct 2507 version performs BETTER than base model!');
  } else {
    console.log('❌ Instruct 2507 version has the SAME issues as base model');
  }

  console.log('\n✅ Test complete!\n');
}

// Run main
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
