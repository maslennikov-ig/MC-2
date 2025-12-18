"use strict";
/**
 * Parallel LLM Testing Script - Test Run 3
 *
 * Executes all 11 models in parallel for maximum speed.
 * Each model runs 4 scenarios x 3 runs = 12 generations.
 * Total: 132 API calls executed in parallel batches.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = require("@langchain/openai");
const fs_1 = require("fs");
const path_1 = require("path");
// ============================================================================
// CONFIGURATION
// ============================================================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OUTPUT_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing/test-run-3';
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
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runSingleTest(model, scenario, runNumber) {
    const startTime = Date.now();
    try {
        console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - Starting...`);
        const llm = new openai_1.ChatOpenAI({
            modelName: model.apiName,
            temperature: 0.7,
            maxTokens: 8000,
            timeout: 120000,
            configuration: {
                baseURL: OPENROUTER_BASE_URL,
                defaultHeaders: {
                    'HTTP-Referer': 'https://megacampus.ai',
                    'X-Title': 'MegaCampus LLM Testing v3'
                }
            }
        });
        const response = await llm.invoke(scenario.prompt);
        const duration = Date.now() - startTime;
        const content = response.content;
        const cleaned = cleanJsonResponse(content);
        // Try to parse JSON
        const parsed = JSON.parse(cleaned);
        // Save result
        const modelDir = (0, path_1.join)(OUTPUT_DIR, model.slug);
        if (!(0, fs_1.existsSync)(modelDir)) {
            (0, fs_1.mkdirSync)(modelDir, { recursive: true });
        }
        const outputFile = (0, path_1.join)(modelDir, `${scenario.id}-run${runNumber}.json`);
        const logFile = (0, path_1.join)(modelDir, `${scenario.id}-run${runNumber}.log`);
        (0, fs_1.writeFileSync)(outputFile, JSON.stringify(parsed, null, 2), 'utf-8');
        (0, fs_1.writeFileSync)(logFile, JSON.stringify({
            model: model.name,
            modelSlug: model.slug,
            scenario: scenario.id,
            runNumber,
            duration,
            timestamp: new Date().toISOString(),
            contentLength: cleaned.length
        }, null, 2), 'utf-8');
        console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - ✅ Success (${(duration / 1000).toFixed(1)}s)`);
        return {
            model: model.name,
            modelSlug: model.slug,
            scenario: scenario.id,
            runNumber,
            success: true,
            duration,
            contentLength: cleaned.length
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error.message || String(error);
        console.log(`  [${model.slug}] ${scenario.id} run${runNumber} - ❌ Error: ${errorMsg.substring(0, 100)}`);
        // Save error log
        const modelDir = (0, path_1.join)(OUTPUT_DIR, model.slug);
        if (!(0, fs_1.existsSync)(modelDir)) {
            (0, fs_1.mkdirSync)(modelDir, { recursive: true });
        }
        const errorFile = (0, path_1.join)(modelDir, `${scenario.id}-run${runNumber}-ERROR.json`);
        (0, fs_1.writeFileSync)(errorFile, JSON.stringify({
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
async function runModelTests(model) {
    console.log(`\n🚀 Starting tests for ${model.name}...`);
    const results = [];
    // Run all scenarios for this model in parallel
    const promises = [];
    for (const scenario of SCENARIOS) {
        for (let run = 1; run <= 3; run++) {
            promises.push(runSingleTest(model, scenario, run));
            // Small delay between starting requests
            await sleep(100);
        }
    }
    const testResults = await Promise.all(promises);
    results.push(...testResults);
    const successCount = testResults.filter(r => r.success).length;
    const totalCount = testResults.length;
    const avgDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
    console.log(`\n✅ ${model.name} completed: ${successCount}/${totalCount} success (avg ${(avgDuration / 1000).toFixed(1)}s)\n`);
    return results;
}
// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                                                               ║');
    console.log('║         LLM Test Run 3 - PARALLEL EXECUTION                   ║');
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Test Configuration:`);
    console.log(`   Models: ${MODELS.length}`);
    console.log(`   Scenarios: ${SCENARIOS.length}`);
    console.log(`   Runs per scenario: 3`);
    console.log(`   Total API calls: ${MODELS.length * SCENARIOS.length * 3}`);
    console.log(`   Execution mode: PARALLEL (all models simultaneously)`);
    console.log(`   Output directory: ${OUTPUT_DIR}\n`);
    // Create output directory
    if (!(0, fs_1.existsSync)(OUTPUT_DIR)) {
        (0, fs_1.mkdirSync)(OUTPUT_DIR, { recursive: true });
    }
    const overallStartTime = Date.now();
    // Run ALL models in parallel
    console.log('🚀 Starting parallel execution of all 11 models...\n');
    const allPromises = MODELS.map(model => runModelTests(model));
    const allResults = await Promise.all(allPromises);
    const overallDuration = Date.now() - overallStartTime;
    // Flatten results
    const flatResults = allResults.flat();
    // Calculate statistics
    const totalTests = flatResults.length;
    const successfulTests = flatResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    const successRate = (successfulTests / totalTests) * 100;
    const avgDuration = flatResults.reduce((sum, r) => sum + r.duration, 0) / flatResults.length;
    // Save summary
    const summary = {
        testRunId: '2025-11-14-v3-parallel-eval',
        testVersion: 'v3',
        executionMode: 'PARALLEL',
        timestamp: new Date().toISOString(),
        duration: overallDuration,
        durationMinutes: (overallDuration / 1000 / 60).toFixed(2),
        models: MODELS.length,
        scenarios: SCENARIOS.length,
        runsPerScenario: 3,
        totalTests,
        successfulTests,
        failedTests,
        successRate: successRate.toFixed(2),
        avgTestDuration: avgDuration.toFixed(0),
        results: flatResults,
        modelSummary: MODELS.map(model => {
            const modelResults = flatResults.filter(r => r.modelSlug === model.slug);
            const modelSuccess = modelResults.filter(r => r.success).length;
            return {
                model: model.name,
                slug: model.slug,
                totalTests: modelResults.length,
                successful: modelSuccess,
                failed: modelResults.length - modelSuccess,
                successRate: ((modelSuccess / modelResults.length) * 100).toFixed(1)
            };
        })
    };
    const summaryFile = (0, path_1.join)(OUTPUT_DIR, 'test-run-3-summary.json');
    (0, fs_1.writeFileSync)(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    // Print final statistics
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                                                               ║');
    console.log('║                    TEST RUN 3 COMPLETE                        ║');
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Overall Statistics:`);
    console.log(`   Total duration: ${(overallDuration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`   Total tests: ${totalTests}`);
    console.log(`   Successful: ${successfulTests} (${successRate.toFixed(1)}%)`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Average test duration: ${(avgDuration / 1000).toFixed(1)}s\n`);
    console.log(`📁 Results saved to: ${OUTPUT_DIR}`);
    console.log(`📄 Summary: ${summaryFile}\n`);
    console.log(`🎯 Per-Model Summary:\n`);
    summary.modelSummary.forEach(m => {
        const icon = parseFloat(m.successRate) === 100 ? '✅' : parseFloat(m.successRate) > 80 ? '⚠️' : '❌';
        console.log(`   ${icon} ${m.model.padEnd(25)} ${m.successful}/${m.totalTests} (${m.successRate}%)`);
    });
    console.log('\n✅ All tests completed!\n');
}
// Run main
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
