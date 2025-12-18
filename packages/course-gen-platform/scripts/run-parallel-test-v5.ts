/**
 * Parallel LLM Testing Script - Test Run 5 (FINAL)
 *
 * Executes all 12 models in parallel for maximum speed.
 * Each model runs 4 scenarios x 3 runs = 12 generations.
 * Total: 144 API calls executed in parallel batches.
 *
 * FINAL TEST RUN - For consolidated quality analysis
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

const OUTPUT_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing/test-run-5';

const MODELS = [
  { slug: 'kimi-k2-0905', apiName: 'moonshotai/kimi-k2-0905', name: 'Kimi K2 0905' },
  { slug: 'kimi-k2-thinking', apiName: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking' },
  { slug: 'deepseek-v32-exp', apiName: 'deepseek/deepseek-v3.2-exp', name: 'DeepSeek v3.2 Exp' },
  { slug: 'deepseek-chat-v31', apiName: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1' },
  { slug: 'grok-4-fast', apiName: 'x-ai/grok-4-fast', name: 'Grok 4 Fast' },
  { slug: 'glm-46', apiName: 'z-ai/glm-4.6', name: 'GLM 4.6' },
  { slug: 'minimax-m2', apiName: 'minimax/minimax-m2', name: 'MiniMax M2' },
  { slug: 'qwen3-32b', apiName: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
  { slug: 'qwen3-235b-thinking', apiName: 'qwen/qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B Thinking' },
  { slug: 'qwen3-235b-a22b-2507', apiName: 'qwen/qwen3-235b-a22b-2507', name: 'Qwen3 235B A22B Instruct 2507' },
  { slug: 'oss-120b', apiName: 'openai/gpt-oss-120b', name: 'OSS 120B' },
  { slug: 'qwen3-235b-a22b', apiName: 'qwen/qwen3-235b-a22b', name: 'Qwen3 235B A22B' }
];

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

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`
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

КРИТИЧЕСКИ ВАЖНО: Верните ТОЛЬКО валидный JSON. Без markdown, без блоков кода, без объяснений.`
  },
  {
    id: 'lesson-en',
    type: 'lesson',
    language: 'en',
    prompt: `You are a course design expert. Generate a complete section with lessons and exercises.

Course: "Introduction to Python Programming" (Beginner level)
Section: "Variables and Data Types in Python"

Generate a JSON object with:
- section_number: 1
- section_title: string
- section_description: string (2-3 sentences)
- learning_objectives: string[] (3-5 specific, measurable objectives)
- lessons: array of 3-5 lessons, each with:
  - lesson_number: number
  - lesson_title: string
  - lesson_objective: string (specific, measurable)
  - key_topics: string[] (3-7 topics)
  - exercises: array of 1-3 exercises, each with:
    - exercise_title: string
    - exercise_instructions: string (clear, actionable steps)

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`
  },
  {
    id: 'lesson-ru',
    type: 'lesson',
    language: 'ru',
    prompt: `Вы эксперт по разработке образовательных курсов. Создайте полную секцию с уроками и упражнениями.

Курс: "Машинное обучение для начинающих" (Средний уровень)
Секция: "Основы нейронных сетей"

Создайте JSON объект с:
- section_number: 1
- section_title: string
- section_description: string (2-3 предложения)
- learning_objectives: string[] (3-5 конкретных, измеримых целей)
- lessons: массив из 3-5 уроков, каждый с:
  - lesson_number: number
  - lesson_title: string
  - lesson_objective: string (конкретная, измеримая цель)
  - key_topics: string[] (3-7 тем)
  - exercises: массив из 1-3 упражнений, каждое с:
    - exercise_title: string
    - exercise_instructions: string (чёткие, выполнимые шаги)

КРИТИЧЕСКИ ВАЖНО: Верните ТОЛЬКО валидный JSON. Без markdown, без блоков кода, без объяснений.`
  }
];

// ============================================================================
// TYPES
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

interface TestSummary {
  testRunId: string;
  model: string;
  modelSlug: string;
  apiName: string;
  timestamp: string;
  duration: number;
  durationMinutes: string;
  scenarios: number;
  runsPerScenario: number;
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  successRate: string;
  avgTestDuration: string;
  results: TestResult[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanJsonResponse(text: string): string {
  // Remove markdown code blocks
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Remove leading/trailing whitespace
  text = text.trim();

  // Find the first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

async function testModelScenario(
  model: typeof MODELS[0],
  scenario: typeof SCENARIOS[0],
  runNumber: number
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    console.log(`🚀 [${model.slug}] Starting ${scenario.id} run ${runNumber}...`);

    const llm = new ChatOpenAI({
      modelName: model.apiName,
      temperature: 0.7,
      maxTokens: 4000,
      apiKey: OPENROUTER_API_KEY,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
    });

    const response = await llm.invoke(scenario.prompt);
    const content = response.content as string;
    const cleanedContent = cleanJsonResponse(content);

    // Validate JSON
    JSON.parse(cleanedContent);

    // Save to file
    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const filename = `${scenario.id}-run${runNumber}.json`;
    const filepath = join(modelDir, filename);
    writeFileSync(filepath, cleanedContent, 'utf-8');

    const duration = Date.now() - startTime;

    // Save log
    const logFilename = `${scenario.id}-run${runNumber}.log`;
    const logFilepath = join(modelDir, logFilename);
    writeFileSync(
      logFilepath,
      `Model: ${model.name}\nScenario: ${scenario.id}\nRun: ${runNumber}\nDuration: ${duration}ms\nSuccess: true\nTimestamp: ${new Date().toISOString()}\n`,
      'utf-8'
    );

    console.log(`✅ [${model.slug}] ${scenario.id} run ${runNumber} completed in ${duration}ms`);

    return {
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      success: true,
      duration,
      contentLength: cleanedContent.length
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ [${model.slug}] ${scenario.id} run ${runNumber} failed: ${errorMessage}`);

    // Save error log
    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const logFilename = `${scenario.id}-run${runNumber}.log`;
    const logFilepath = join(modelDir, logFilename);
    writeFileSync(
      logFilepath,
      `Model: ${model.name}\nScenario: ${scenario.id}\nRun: ${runNumber}\nDuration: ${duration}ms\nSuccess: false\nError: ${errorMessage}\nTimestamp: ${new Date().toISOString()}\n`,
      'utf-8'
    );

    return {
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      success: false,
      duration,
      error: errorMessage
    };
  }
}

async function testModel(model: typeof MODELS[0]): Promise<TestSummary> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Testing model: ${model.name} (${model.apiName})`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();
  const results: TestResult[] = [];

  // Run all scenarios x 3 runs in parallel for this model
  const tasks = [];
  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= 3; run++) {
      tasks.push(testModelScenario(model, scenario, run));
    }
  }

  // Execute all tasks for this model in parallel
  const taskResults = await Promise.all(tasks);
  results.push(...taskResults);

  const duration = Date.now() - startTime;
  const successfulTests = results.filter(r => r.success).length;
  const failedTests = results.filter(r => !r.success).length;
  const successRate = ((successfulTests / results.length) * 100).toFixed(2);
  const avgDuration = (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(0);

  const summary: TestSummary = {
    testRunId: `2025-11-14-v5-${model.slug}`,
    model: model.name,
    modelSlug: model.slug,
    apiName: model.apiName,
    timestamp: new Date().toISOString(),
    duration,
    durationMinutes: (duration / 60000).toFixed(2),
    scenarios: SCENARIOS.length,
    runsPerScenario: 3,
    totalTests: results.length,
    successfulTests,
    failedTests,
    successRate,
    avgTestDuration: avgDuration,
    results
  };

  // Save summary
  const modelDir = join(OUTPUT_DIR, model.slug);
  const summaryPath = join(modelDir, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ${model.name} Summary:`);
  console.log(`   Total Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Success Rate: ${successRate}%`);
  console.log(`   Successful: ${successfulTests}/${results.length}`);
  console.log(`   Failed: ${failedTests}/${results.length}`);
  console.log(`   Avg Test Duration: ${avgDuration}ms`);
  console.log(`${'='.repeat(80)}\n`);

  return summary;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 PARALLEL LLM TESTING - TEST RUN 5 FINAL (12 Models)');
  console.log('='.repeat(80));
  console.log(`📁 Output Directory: ${OUTPUT_DIR}`);
  console.log(`📊 Models: ${MODELS.length}`);
  console.log(`🎯 Scenarios: ${SCENARIOS.length}`);
  console.log(`🔄 Runs per scenario: 3`);
  console.log(`📝 Total tests: ${MODELS.length * SCENARIOS.length * 3}`);
  console.log('='.repeat(80) + '\n');

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const overallStartTime = Date.now();

  // Run all models in parallel
  console.log('🔥 Starting all 12 models in parallel...\n');
  const modelSummaries = await Promise.all(
    MODELS.map(model => testModel(model))
  );

  const overallDuration = Date.now() - overallStartTime;

  // Create overall summary
  const overallSummary = {
    testRunId: '2025-11-14-v5-final-all-models',
    timestamp: new Date().toISOString(),
    duration: overallDuration,
    durationMinutes: (overallDuration / 60000).toFixed(2),
    totalModels: MODELS.length,
    totalScenarios: SCENARIOS.length,
    runsPerScenario: 3,
    totalTests: MODELS.length * SCENARIOS.length * 3,
    modelSummaries: modelSummaries.map(s => ({
      model: s.model,
      modelSlug: s.modelSlug,
      successRate: s.successRate,
      avgTestDuration: s.avgTestDuration,
      duration: s.duration
    }))
  };

  writeFileSync(
    join(OUTPUT_DIR, 'test-run-5-summary.json'),
    JSON.stringify(overallSummary, null, 2),
    'utf-8'
  );

  // Final report
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TEST RUN 5 FINAL COMPLETED');
  console.log('='.repeat(80));
  console.log(`⏱️  Total Duration: ${(overallDuration / 60000).toFixed(2)} minutes`);
  console.log(`📊 Models Tested: ${MODELS.length}`);
  console.log(`✅ All model summaries saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(80) + '\n');

  // Print model success rates
  console.log('📈 Model Success Rates:');
  modelSummaries
    .sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate))
    .forEach(s => {
      const icon = parseFloat(s.successRate) === 100 ? '✅' :
                   parseFloat(s.successRate) >= 90 ? '⚠️' : '❌';
      console.log(`   ${icon} ${s.model.padEnd(35)} ${s.successRate}% (${s.avgTestDuration}ms avg)`);
    });

  console.log('\n✨ Test run 5 FINAL complete!\n');
}

main().catch(console.error);
