/**
 * Single Model LLM Testing Script - Gemini 2.5 Flash Preview
 *
 * Testing google/gemini-2.5-flash-preview-09-2025
 * 4 scenarios x 3 runs = 12 generations.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OUTPUT_DIR = '/home/me/code/megacampus2/docs/llm-testing/test-run-6';

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

const MODEL = {
  slug: 'gemini-2.5-flash-preview',
  apiName: 'google/gemini-2.5-flash-preview-05-20',
  name: 'Gemini 2.5 Flash Preview'
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

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no explanations.`
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

КРИТИЧЕСКИ ВАЖНО: Верните ТОЛЬКО валидный JSON. Без markdown, без блоков кода, без объяснений.`
  }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanJsonResponse(text) {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callOpenRouter(model, prompt) {
  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://megacampus.ai',
      'X-Title': 'MegaCampus LLM Testing Run 6'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function runSingleTest(model, scenario, runNumber) {
  const startTime = Date.now();

  try {
    console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - Starting...`);

    const content = await callOpenRouter(model.apiName, scenario.prompt);
    const duration = Date.now() - startTime;

    const cleaned = cleanJsonResponse(content);

    let parsed;
    let parseError = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e.message;
      parsed = null;
    }

    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const outputFile = join(modelDir, `${scenario.id}-run${runNumber}.json`);
    const logFile = join(modelDir, `${scenario.id}-run${runNumber}.log`);
    const rawFile = join(modelDir, `${scenario.id}-run${runNumber}.raw`);

    writeFileSync(rawFile, content, 'utf-8');

    if (parsed) {
      writeFileSync(outputFile, JSON.stringify(parsed, null, 2), 'utf-8');
    } else {
      writeFileSync(outputFile, JSON.stringify({
        error: 'JSON parse error',
        parseError,
        rawContent: cleaned
      }, null, 2), 'utf-8');
    }

    writeFileSync(logFile, JSON.stringify({
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      duration,
      timestamp: new Date().toISOString(),
      contentLength: cleaned.length,
      parseSuccess: parsed !== null,
      parseError
    }, null, 2), 'utf-8');

    const status = parsed ? '✅' : '⚠️ JSON parse error';
    console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - ${status} (${(duration / 1000).toFixed(1)}s)`);

    return {
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      success: parsed !== null,
      duration,
      contentLength: cleaned.length,
      parseError
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error.message || String(error);

    console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - ❌ Error: ${errorMsg.substring(0, 100)}`);

    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const errorFile = join(modelDir, `${scenario.id}-run${runNumber}-ERROR.json`);
    writeFileSync(errorFile, JSON.stringify({
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      error: errorMsg,
      duration,
      timestamp: new Date().toISOString()
    }, null, 2), 'utf-8');

    return {
      model: model.name,
      modelSlug: model.slug,
      scenario: scenario.id,
      runNumber,
      success: false,
      duration,
      error: errorMsg
    };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║         LLM Test - Gemini 2.5 Flash Preview                   ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Test Configuration:`);
  console.log(`   Model: ${MODEL.name} (${MODEL.apiName})`);
  console.log(`   Scenarios: ${SCENARIOS.length}`);
  console.log(`   Runs per scenario: 3`);
  console.log(`   Total API calls: ${SCENARIOS.length * 3}`);
  console.log(`   Output directory: ${OUTPUT_DIR}\n`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const overallStartTime = Date.now();
  console.log(`\n🚀 Starting tests for ${MODEL.name}...\n`);

  const promises = [];
  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= 3; run++) {
      promises.push(runSingleTest(MODEL, scenario, run));
      await sleep(200);
    }
  }

  const testResults = await Promise.all(promises);

  const overallDuration = Date.now() - overallStartTime;
  const successCount = testResults.filter(r => r.success).length;
  const totalCount = testResults.length;
  const avgDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║                    TEST COMPLETE                              ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Statistics:`);
  console.log(`   Total duration: ${(overallDuration / 1000 / 60).toFixed(2)} minutes`);
  console.log(`   Total tests: ${totalCount}`);
  console.log(`   Successful: ${successCount} (${((successCount/totalCount)*100).toFixed(1)}%)`);
  console.log(`   Failed: ${totalCount - successCount}`);
  console.log(`   Average test duration: ${(avgDuration / 1000).toFixed(1)}s\n`);

  // Save model summary
  const summaryFile = join(OUTPUT_DIR, MODEL.slug, 'summary.json');
  writeFileSync(summaryFile, JSON.stringify({
    model: MODEL.name,
    slug: MODEL.slug,
    apiName: MODEL.apiName,
    totalTests: totalCount,
    successful: successCount,
    failed: totalCount - successCount,
    successRate: ((successCount / totalCount) * 100).toFixed(1),
    avgDuration: avgDuration.toFixed(0),
    results: testResults
  }, null, 2), 'utf-8');

  const icon = successCount === totalCount ? '✅' : successCount > 8 ? '⚠️' : '❌';
  console.log(`   ${icon} ${MODEL.name.padEnd(25)} ${successCount}/${totalCount} (${((successCount/totalCount)*100).toFixed(1)}%)`);
  console.log('\n✅ Tests completed!\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
