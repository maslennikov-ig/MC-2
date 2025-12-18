#!/usr/bin/env tsx
/**
 * Quality-Focused Model Evaluation: qwen/qwen3-235b-a22b
 *
 * PURPOSE: Test model quality (NOT token count) with 3 runs per scenario
 *
 * Test Cases (3 runs each = 12 API calls total):
 * 1. Metadata generation, English: "Introduction to Python Programming"
 * 2. Metadata generation, Russian: "Машинное обучение для начинающих"
 * 3. Lesson generation, English: "Variables and Data Types in Python"
 * 4. Lesson generation, Russian: "Основы нейронных сетей"
 *
 * Output Directory: /tmp/quality-tests/qwen3-235b-a22b/
 * - {scenario}-run{N}.json - Full model output
 * - {scenario}-run{N}.log - Metadata (duration, tokens, timestamp)
 * - {scenario}-run{N}-ERROR.json - Error details (if failed)
 *
 * Expected: 0/4 FAILED (C-TIER model, previously failed all tests)
 *
 * Usage:
 *   pnpm tsx scripts/test-model-qwen3-235b-a22b-quality.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config({ path: resolve(__dirname, '../.env') });

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
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

interface TestScenario {
  id: string;
  entityId: 'metadata' | 'lesson';
  language: 'en' | 'ru';
  title: string;
  description: string;
}

interface TestResult {
  scenarioId: string;
  runNumber: number;
  status: 'SUCCESS' | 'FAILED';
  duration: number;
  outputPath?: string;
  logPath?: string;
  errorPath?: string;
  error?: string;
}

/**
 * Output directory configuration:
 * - Default: .tmp/quality-tests/{model-name}/ (ignored by git, always available)
 * - Override: Set QUALITY_TESTS_DIR=custom/path/ to save results elsewhere
 *
 * Example: Save to current spec:
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx scripts/test-model-qwen3-235b-a22b-quality.ts
 */
const BASE_QUALITY_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

class QualityEvaluator {
  private apiKey: string;
  private outputDir = `${BASE_QUALITY_DIR}/qwen3-235b-a22b`;
  private results: TestResult[] = [];
  private runsPerScenario = 3;

  private scenarios: TestScenario[] = [
    {
      id: 'metadata-en',
      entityId: 'metadata',
      language: 'en',
      title: 'Introduction to Python Programming',
      description: 'Beginner-level technical programming course',
    },
    {
      id: 'metadata-ru',
      entityId: 'metadata',
      language: 'ru',
      title: 'Машинное обучение для начинающих',
      description: 'Intermediate-level conceptual ML course',
    },
    {
      id: 'lesson-en',
      entityId: 'lesson',
      language: 'en',
      title: 'Variables and Data Types in Python',
      description: 'Hands-on programming section with exercises',
    },
    {
      id: 'lesson-ru',
      entityId: 'lesson',
      language: 'ru',
      title: 'Основы нейронных сетей',
      description: 'Conceptual theory section with examples',
    },
  ];

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  private buildMetadataPrompt(scenario: TestScenario): string {
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

  private buildLessonPrompt(scenario: TestScenario): string {
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

  private async invokeModel(
    scenario: TestScenario,
    runNumber: number
  ): Promise<{ content: string; duration: number; tokens: { input: number; output: number } }> {
    const prompt = scenario.entityId === 'metadata'
      ? this.buildMetadataPrompt(scenario)
      : this.buildLessonPrompt(scenario);

    const startTime = Date.now();
    try {
      // Direct fetch to handle reasoning models properly
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://megacampus.ai',
          'X-Title': 'MegaCampus Quality Testing'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3-235b-a22b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 8000
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      // Handle reasoning models: check both content and reasoning fields
      const message = data.choices?.[0]?.message || {};
      let content = message.content || '';

      // If content is empty but reasoning exists, this is a reasoning model failure
      if (!content && message.reasoning) {
        throw new Error('Model only provided reasoning, no actual content (hit token limit during thinking)');
      }

      // If content is completely empty (even without reasoning), also fail
      if (!content || content.trim().length === 0) {
        throw new Error('Model returned empty content (no output generated)');
      }

      // Extract token usage
      const usage = data.usage || {};
      const tokens = {
        input: usage.prompt_tokens || Math.ceil(prompt.length / 4),
        output: usage.completion_tokens || Math.ceil(content.length / 4),
      };

      return { content, duration, tokens };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw { error, duration };
    }
  }

  private async runTest(scenario: TestScenario, runNumber: number): Promise<TestResult> {
    const startTime = Date.now();

    try {
      log(`[qwen3-235b-a22b] ${scenario.id} run ${runNumber}/${this.runsPerScenario}...`, 'info');

      const result = await this.invokeModel(scenario, runNumber);
      const duration = Date.now() - startTime;

      // Save full output
      const outputPath = `${this.outputDir}/${scenario.id}-run${runNumber}.json`;
      await writeFile(outputPath, result.content, 'utf-8');

      // Save metadata log
      const logPath = `${this.outputDir}/${scenario.id}-run${runNumber}.log`;
      await writeFile(
        logPath,
        JSON.stringify(
          {
            model: 'Qwen3 235B A22B',
            modelSlug: 'qwen3-235b-a22b',
            apiName: 'qwen/qwen3-235b-a22b',
            scenario: scenario.id,
            runNumber,
            duration,
            timestamp: new Date().toISOString(),
            contentLength: result.content.length,
            tokenUsage: result.tokens,
          },
          null,
          2
        ),
        'utf-8'
      );

      log(`[qwen3-235b-a22b] ${scenario.id} run ${runNumber}/${this.runsPerScenario}... ✓ ${duration}ms`, 'success');

      return {
        scenarioId: scenario.id,
        runNumber,
        status: 'SUCCESS',
        duration,
        outputPath,
        logPath,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMessage = err.error?.message || err.message || 'Unknown error';

      // Save error details
      const errorPath = `${this.outputDir}/${scenario.id}-run${runNumber}-ERROR.json`;
      await writeFile(
        errorPath,
        JSON.stringify(
          {
            model: 'Qwen3 235B A22B',
            modelSlug: 'qwen3-235b-a22b',
            scenario: scenario.id,
            runNumber,
            error: errorMessage,
            timestamp: new Date().toISOString(),
            duration,
          },
          null,
          2
        ),
        'utf-8'
      );

      log(`[qwen3-235b-a22b] ${scenario.id} run ${runNumber}/${this.runsPerScenario}... ✗ ${errorMessage}`, 'error');

      return {
        scenarioId: scenario.id,
        runNumber,
        status: 'FAILED',
        duration,
        errorPath,
        error: errorMessage,
      };
    }
  }

  private printSummary(): void {
    section('Test Summary: qwen/qwen3-235b-a22b');

    console.log('\nResults:');
    this.scenarios.forEach(scenario => {
      const scenarioResults = this.results.filter(r => r.scenarioId === scenario.id);
      const passed = scenarioResults.filter(r => r.status === 'SUCCESS').length;
      const failed = scenarioResults.filter(r => r.status === 'FAILED').length;

      const status = failed === 0
        ? `${colors.green}✓${colors.reset}`
        : `${colors.red}✗${colors.reset}`;

      console.log(`  ${status} ${scenario.id}: ${passed}/${this.runsPerScenario} passed`);
    });

    const totalPassed = this.results.filter(r => r.status === 'SUCCESS').length;
    const totalFailed = this.results.filter(r => r.status === 'FAILED').length;
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;

    console.log(`\nOverall:`);
    console.log(`  Total Runs: ${this.results.length}`);
    console.log(`  Passed: ${totalPassed}`);
    console.log(`  Failed: ${totalFailed}`);
    console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);

    console.log(`\nOutputs saved to: ${this.outputDir}/`);

    if (totalFailed > 0) {
      console.log(`\n${colors.yellow}⚠ WARNING: ${totalFailed} test runs failed${colors.reset}`);
      console.log(`Expected: This is a C-TIER model (previously 0/4 FAILED)`);
    }
  }

  async runAll(): Promise<void> {
    section('Quality-Focused Model Evaluation: qwen/qwen3-235b-a22b');
    log('Testing with 3 runs per scenario (12 API calls total)', 'info');
    log('Expected: 0/4 FAILED (C-TIER model, previously failed all tests)', 'warning');
    log(`Output directory: ${this.outputDir}/`, 'info');

    // Create output directory
    await mkdir(this.outputDir, { recursive: true });

    // Run all tests
    for (const scenario of this.scenarios) {
      for (let runNumber = 1; runNumber <= this.runsPerScenario; runNumber++) {
        const result = await this.runTest(scenario, runNumber);
        this.results.push(result);

        // Wait 2s between requests (rate limiting)
        if (!(scenario === this.scenarios[this.scenarios.length - 1] && runNumber === this.runsPerScenario)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    this.printSummary();
  }
}

async function main() {
  try {
    const evaluator = new QualityEvaluator();
    await evaluator.runAll();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
