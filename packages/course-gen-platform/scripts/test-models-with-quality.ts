#!/usr/bin/env tsx
/**
 * Quality-Focused Model Testing Framework
 *
 * Purpose: Test LLM models by QUALITY, not token count
 * Methodology:
 *   1. Run 3-5 generations per model/task
 *   2. Save full JSON outputs
 *   3. Analyze quality (schema, content, language)
 *   4. Rank by quality (ignore cost for now)
 *
 * Output Structure:
 *   /tmp/quality-tests/
 *     {model-slug}/
 *       metadata-en-{run-1-5}.json
 *       metadata-ru-{run-1-5}.json
 *       lesson-en-{run-1-5}.json
 *       lesson-ru-{run-1-5}.json
 *     quality-report.json
 *
 * Usage:
 *   pnpm tsx scripts/test-models-with-quality.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config({ path: resolve(__dirname, '../.env') });

/**
 * Output directory configuration:
 * - Default: .tmp/quality-tests/ (ignored by git, always available)
 * - Override: Set QUALITY_TESTS_DIR=custom/path/ to save results elsewhere
 *
 * Example: Save to current spec:
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx scripts/test-models-with-quality.ts
 */
const OUTPUT_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
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
  console.log(`\n${colors.bold}${colors.cyan}═══ ${title} ═══${colors.reset}`);
}

interface ModelConfig {
  name: string;
  slug: string;
  apiName: string;
}

interface TestScenario {
  id: string;
  type: 'metadata' | 'lesson';
  language: 'en' | 'ru';
  title: string;
  description: string;
}

const MODELS: ModelConfig[] = [
  {
    name: 'Kimi K2 0905',
    slug: 'kimi-k2-0905',
    apiName: 'moonshotai/kimi-k2-0905',
  },
  {
    name: 'Kimi K2 Thinking',
    slug: 'kimi-k2-thinking',
    apiName: 'moonshotai/kimi-k2-thinking',
  },
  {
    name: 'DeepSeek v3.2 Exp',
    slug: 'deepseek-v32-exp',
    apiName: 'deepseek/deepseek-v3.2-exp',
  },
  {
    name: 'DeepSeek Chat v3.1',
    slug: 'deepseek-chat-v31',
    apiName: 'deepseek/deepseek-chat-v3.1',
  },
  {
    name: 'Grok 4 Fast',
    slug: 'grok-4-fast',
    apiName: 'x-ai/grok-4-fast',
  },
  {
    name: 'MiniMax M2',
    slug: 'minimax-m2',
    apiName: 'minimax/minimax-m2',
  },
];

const SCENARIOS: TestScenario[] = [
  {
    id: 'metadata-en',
    type: 'metadata',
    language: 'en',
    title: 'Introduction to Python Programming',
    description: 'Beginner-level technical course',
  },
  {
    id: 'metadata-ru',
    type: 'metadata',
    language: 'ru',
    title: 'Машинное обучение для начинающих',
    description: 'Intermediate-level conceptual course',
  },
  {
    id: 'lesson-en',
    type: 'lesson',
    language: 'en',
    title: 'Variables and Data Types in Python',
    description: 'Programming hands-on section',
  },
  {
    id: 'lesson-ru',
    type: 'lesson',
    language: 'ru',
    title: 'Основы нейронных сетей',
    description: 'Theory conceptual section',
  },
];

const RUNS_PER_SCENARIO = 3; // 3-5 runs for consistency testing

class QualityTester {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  private buildMetadataPrompt(title: string, language: string): string {
    return `You are an expert course designer creating comprehensive metadata for an educational course.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names
2. NO markdown, NO explanations, NO code blocks
3. All text must be in ${language === 'ru' ? 'Russian' : 'English'}

**Course Title**: ${title}
**Target Language**: ${language}

**Required JSON Schema:**
{
  "course_title": string (10-100 chars, descriptive),
  "course_description": string (50-500 chars, engaging value proposition),
  "course_overview": string (500-3000 chars, detailed structure and outcomes),
  "target_audience": string (100-500 chars, specific personas),
  "estimated_duration_hours": number (realistic, 5-100),
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[] (0-5 items, realistic requirements),
  "learning_outcomes": [
    {
      "text": string (action verb + specific measurable outcome),
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"
    }
  ] (3-8 outcomes, following Bloom's Taxonomy),
  "course_tags": string[] (5-15 relevant keywords)
}

**Quality Expectations:**
- learning_outcomes must use action verbs (Define, Explain, Build, Analyze, etc.)
- course_overview must include specific examples and structure
- target_audience must define clear personas with context
- All fields must use snake_case (NOT camelCase)

Output the JSON directly:`;
  }

  private buildLessonPrompt(sectionTitle: string, language: string): string {
    return `You are an expert course designer creating detailed lesson structure for a course section.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names
2. NO markdown, NO explanations, NO code blocks
3. Generate 3-5 complete lessons (NOT just 1!)
4. All text must be in ${language === 'ru' ? 'Russian' : 'English'}

**Section Title**: ${sectionTitle}
**Target Language**: ${language}

**Required JSON Schema:**
{
  "section_number": 1,
  "section_title": "${sectionTitle}",
  "section_description": string (100-300 chars, motivational intro),
  "learning_objectives": string[] (3-5 section-level objectives),
  "lessons": [
    {
      "lesson_number": number (1, 2, 3, etc.),
      "lesson_title": string (5-100 chars, specific topic),
      "lesson_objectives": string[] (2-5 measurable objectives),
      "key_topics": string[] (3-8 specific concepts, NOT generic),
      "estimated_duration_minutes": number (10-45, realistic),
      "exercises": [
        {
          "exercise_type": "hands_on" | "quiz" | "project",
          "exercise_title": string (5-50 chars),
          "exercise_instructions": string (50-500 chars, actionable steps)
        }
      ] (1-3 exercises per lesson)
    }
  ] (MUST be 3-5 lessons, NOT 1!)
}

**Quality Expectations:**
- Generate 3-5 complete lessons with progressive difficulty
- lesson_objectives must be measurable with action verbs
- key_topics must be specific concepts (not "Introduction to...")
- exercises must have clear, actionable instructions
- All fields must use snake_case (NOT camelCase)

Output the JSON directly:`;
  }

  private async invokeModel(
    modelApiName: string,
    prompt: string
  ): Promise<{ content: string; duration: number }> {
    const model = new ChatOpenAI({
      modelName: modelApiName,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      apiKey: this.apiKey,
      temperature: 0.7,
      maxTokens: 8000,
    });

    const startTime = Date.now();
    try {
      const response = await model.invoke(prompt);
      const duration = Date.now() - startTime;
      const content = response.content.toString();
      return { content, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw { error, duration };
    }
  }

  async runTest(
    model: ModelConfig,
    scenario: TestScenario,
    runNumber: number
  ): Promise<void> {
    const modelDir = `${OUTPUT_DIR}/${model.slug}`;
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const outputFile = `${modelDir}/${scenario.id}-run${runNumber}.json`;
    const logFile = `${modelDir}/${scenario.id}-run${runNumber}.log`;

    log(
      `[${model.slug}] ${scenario.id} run ${runNumber}/${RUNS_PER_SCENARIO}...`,
      'info'
    );

    try {
      const prompt =
        scenario.type === 'metadata'
          ? this.buildMetadataPrompt(scenario.title, scenario.language)
          : this.buildLessonPrompt(scenario.title, scenario.language);

      const result = await this.invokeModel(model.apiName, prompt);

      // Save full output
      writeFileSync(outputFile, result.content, 'utf-8');

      // Save metadata log
      const logData = {
        model: model.name,
        scenario: scenario.id,
        runNumber,
        duration: result.duration,
        timestamp: new Date().toISOString(),
        contentLength: result.content.length,
      };
      writeFileSync(logFile, JSON.stringify(logData, null, 2), 'utf-8');

      log(
        `[${model.slug}] ${scenario.id} run ${runNumber} - ${result.duration}ms, ${result.content.length} chars`,
        'success'
      );
    } catch (err: any) {
      log(
        `[${model.slug}] ${scenario.id} run ${runNumber} FAILED: ${err.error?.message || err}`,
        'error'
      );

      // Save error
      const errorData = {
        model: model.name,
        scenario: scenario.id,
        runNumber,
        error: err.error?.message || String(err),
        timestamp: new Date().toISOString(),
      };
      writeFileSync(
        `${modelDir}/${scenario.id}-run${runNumber}-ERROR.json`,
        JSON.stringify(errorData, null, 2),
        'utf-8'
      );
    }

    // Wait 2s between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async runAllTests(): Promise<void> {
    section('Quality-Focused Model Testing Framework');
    log(`Testing ${MODELS.length} models × ${SCENARIOS.length} scenarios × ${RUNS_PER_SCENARIO} runs`, 'info');
    log(`Total tests: ${MODELS.length * SCENARIOS.length * RUNS_PER_SCENARIO}`, 'info');
    log(`Output directory: ${OUTPUT_DIR}`, 'info');

    for (const model of MODELS) {
      section(`Testing: ${model.name}`);

      for (const scenario of SCENARIOS) {
        for (let run = 1; run <= RUNS_PER_SCENARIO; run++) {
          await this.runTest(model, scenario, run);
        }
      }
    }

    section('All Tests Complete');
    log(`Results saved to: ${OUTPUT_DIR}`, 'success');
    log('Next step: Run quality analysis script', 'info');
    log('Command: pnpm tsx scripts/analyze-quality.ts', 'info');
  }
}

async function main() {
  try {
    const tester = new QualityTester();
    await tester.runAllTests();
  } catch (error) {
    log(
      `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
    process.exit(1);
  }
}

main().catch(console.error);
