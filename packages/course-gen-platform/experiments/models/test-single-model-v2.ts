#!/usr/bin/env tsx
/**
 * Single Model Quality Testing (Config-Driven, v2)
 *
 * Purpose: Test ONE model from config file for parallel execution
 *
 * Usage:
 *   pnpm tsx experiments/models/test-single-model-v2.ts <config-path> <model-slug>
 *
 * Example:
 *   pnpm tsx experiments/models/test-single-model-v2.ts docs/llm-testing/test-config-2025-11-13-v2.json kimi-k2-0905
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(message: string, level: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
  }[level];
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function section(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}═ ${title} ═${colors.reset}`);
}

interface TestConfig {
  testRunId: string;
  outputDirectory: string;
  models: Array<{
    slug: string;
    apiName: string;
    name: string;
  }>;
  testScenarios: Array<{
    id: string;
    entityId: string;
    language: 'en' | 'ru';
    title: string;
    description: string;
  }>;
  testParameters: {
    runsPerScenario: number;
    temperature: number;
    maxTokens: number;
    waitBetweenRequests: number;
    timeout: number;
  };
}

// Get command line args
const configPath = process.argv[2];
const modelSlug = process.argv[3];

if (!configPath || !modelSlug) {
  console.error('Usage: pnpm tsx experiments/models/test-single-model-v2.ts <config-path> <model-slug>');
  console.error('Example: pnpm tsx experiments/models/test-single-model-v2.ts docs/llm-testing/test-config-2025-11-13-v2.json kimi-k2-0905');
  process.exit(1);
}

// Load configuration
section(`Loading Config: ${configPath}`);
const configFullPath = resolve(process.cwd(), '../../', configPath);
log(`Reading from: ${configFullPath}`);

if (!existsSync(configFullPath)) {
  log(`Config file not found: ${configFullPath}`, 'error');
  process.exit(1);
}

const config: TestConfig = JSON.parse(readFileSync(configFullPath, 'utf-8'));
log(`Loaded config: ${config.testRunId}`, 'success');

// Find model
const model = config.models.find(m => m.slug === modelSlug);
if (!model) {
  log(`Model not found: ${modelSlug}`, 'error');
  log(`Available models: ${config.models.map(m => m.slug).join(', ')}`);
  process.exit(1);
}

// Setup output directory
const outputDir = resolve(process.cwd(), '../../', config.outputDirectory, modelSlug);
log(`Output directory: ${outputDir}`);

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
  log(`Created output directory`, 'success');
}

section(`Testing Model: ${model.name} (${model.slug})`);
log(`API Name: ${model.apiName}`);
log(`Scenarios: ${config.testScenarios.length}`);
log(`Runs per scenario: ${config.testParameters.runsPerScenario}`);
log(`Total API calls: ${config.testScenarios.length * config.testParameters.runsPerScenario}`);

// Build prompts
function buildMetadataPrompt(scenario: any): string {
  return `You are an expert course designer creating comprehensive course metadata.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. NO markdown code blocks, NO explanations, NO extra text
3. All text content must be in ${scenario.language === 'en' ? 'English' : 'Russian'}
4. Follow the exact schema below

**Course Title**: ${scenario.title}

**Course Description**: ${scenario.description}

**Required JSON Schema:**
{
  "course_title": "string (use provided title)",
  "course_description": "string (detailed, 200+ chars)",
  "course_overview": "string (comprehensive, 500+ chars with specific examples)",
  "target_audience": "string (define specific personas)",
  "estimated_duration_hours": number,
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": ["string array"],
  "learning_outcomes": [
    "string (use action verbs: Define, Build, Analyze, NOT Learn/Understand)",
    "string (follow Bloom's Taxonomy)",
    "string (make measurable and specific)"
  ],
  "course_tags": ["string array"]
}

**Quality Requirements:**
- learning_outcomes: 3-8 outcomes, use action verbs (Define, Build, Create, Analyze), follow Bloom's Taxonomy
- course_overview: 500+ characters with specific examples and structure
- target_audience: Define specific personas with backgrounds
- All field names MUST use snake_case

Output the JSON directly (no markdown, no explanations):`;
}

function buildLessonPrompt(scenario: any): string {
  return `You are an expert course designer creating detailed lesson structure for a course section.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. Generate 3-5 complete lessons (NOT just 1!)
3. All text content must be in ${scenario.language === 'en' ? 'English' : 'Russian'}
4. NO markdown code blocks, NO explanations

**Section Title**: ${scenario.title}

**Section Description**: ${scenario.description}

**Required JSON Schema:**
{
  "section_number": 1,
  "section_title": "string (use provided title)",
  "section_description": "string (detailed overview)",
  "learning_objectives": [
    "string (measurable objectives with action verbs)"
  ],
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "string (specific, not generic 'Introduction to...')",
      "lesson_objective": "string (measurable, specific)",
      "key_topics": ["string array (specific topics, not generic)"],
      "exercises": [
        {
          "exercise_title": "string",
          "exercise_instructions": "string (clear, actionable)"
        }
      ]
    },
    {
      "lesson_number": 2,
      "lesson_title": "...",
      ...
    },
    {
      "lesson_number": 3,
      "lesson_title": "...",
      ...
    }
    // Generate 3-5 lessons total!
  ]
}

**Quality Requirements:**
- Generate 3-5 complete lessons (lesson_number: 1, 2, 3, 4, 5)
- Each lesson must have objectives, key_topics, exercises
- Objectives must be measurable (students will be able to...)
- Topics must be specific (avoid "Introduction to X", "Overview of Y")
- All field names MUST use snake_case

Output the JSON directly (no markdown, no explanations):`;
}

// Run tests
async function runTests() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment variables');
  }

  const llm = new ChatOpenAI({
    modelName: model.apiName,
    apiKey: apiKey,
    temperature: config.testParameters.temperature,
    maxTokens: config.testParameters.maxTokens,
    timeout: config.testParameters.timeout,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://megacampus.ai',
        'X-Title': `MegaCampus LLM Quality Testing ${config.testRunId}`,
      },
    },
  });

  let passedCount = 0;
  let failedCount = 0;

  for (const scenario of config.testScenarios) {
    section(`Scenario: ${scenario.id}`);
    log(`Entity: ${scenario.entityId}, Language: ${scenario.language}`);

    for (let run = 1; run <= config.testParameters.runsPerScenario; run++) {
      const startTime = Date.now();

      try {
        // Build prompt
        const prompt = scenario.entityId === 'metadata'
          ? buildMetadataPrompt(scenario)
          : buildLessonPrompt(scenario);

        // Call LLM
        const response = await llm.invoke(prompt);
        const content = response.content as string;
        const duration = Date.now() - startTime;

        // Save output
        const outputPath = `${outputDir}/${scenario.id}-run${run}.json`;
        writeFileSync(outputPath, content, 'utf-8');

        // Save log
        const logPath = `${outputDir}/${scenario.id}-run${run}.log`;
        writeFileSync(logPath, JSON.stringify({
          model: model.name,
          modelSlug: model.slug,
          scenario: scenario.id,
          runNumber: run,
          duration,
          timestamp: new Date().toISOString(),
          contentLength: content.length,
        }, null, 2), 'utf-8');

        passedCount++;
        log(`[${model.slug}] ${scenario.id} run ${run}/${config.testParameters.runsPerScenario}... ✓ ${duration}ms`, 'success');

      } catch (error: any) {
        const duration = Date.now() - startTime;

        // Save error
        const errorPath = `${outputDir}/${scenario.id}-run${run}-ERROR.json`;
        writeFileSync(errorPath, JSON.stringify({
          model: model.name,
          modelSlug: model.slug,
          scenario: scenario.id,
          runNumber: run,
          error: error.message,
          timestamp: new Date().toISOString(),
          duration,
        }, null, 2), 'utf-8');

        failedCount++;
        log(`[${model.slug}] ${scenario.id} run ${run}/${config.testParameters.runsPerScenario}... ✗ ${error.message}`, 'error');
      }

      // Wait between requests
      if (run < config.testParameters.runsPerScenario || scenario !== config.testScenarios[config.testScenarios.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, config.testParameters.waitBetweenRequests));
      }
    }
  }

  // Summary
  section('Test Summary');
  console.log(`\n${colors.bold}Results:${colors.reset}`);
  console.log(`  Total Runs: ${passedCount + failedCount}`);
  console.log(`  ${colors.green}✓ Passed: ${passedCount}${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed: ${failedCount}${colors.reset}`);
  console.log(`  Success Rate: ${((passedCount / (passedCount + failedCount)) * 100).toFixed(1)}%`);
  console.log(`\n${colors.bold}Output Location:${colors.reset}`);
  console.log(`  ${outputDir}`);

  if (passedCount === passedCount + failedCount) {
    log(`✅ All tests passed for ${model.name}!`, 'success');
  }
}

runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
