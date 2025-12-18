#!/usr/bin/env tsx
/**
 * Quality-Focused Model Testing: x-ai/grok-4-fast
 *
 * Methodology: MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 * Configuration: docs/llm-testing/test-config-2025-11-13-complete.json
 *
 * Test Strategy:
 * - 4 scenarios × 3 runs each = 12 API calls
 * - Save full JSON outputs (NOT token counts!)
 * - Analyze schema + content + language quality
 * - Measure consistency across runs
 *
 * Output Directory: /tmp/quality-tests/grok-4-fast/
 *
 * Usage:
 *   pnpm tsx scripts/test-grok-4-fast-quality.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { promises as fs } from 'fs';
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

interface TestRun {
  scenario: TestScenario;
  runNumber: number;
  success: boolean;
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
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx scripts/test-grok-4-fast-quality.ts
 */
const BASE_QUALITY_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

class GrokQualityTester {
  private apiKey: string;
  private outputDir = `${BASE_QUALITY_DIR}/grok-4-fast`;
  private runs: TestRun[] = [];

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
      throw new Error('OPENROUTER_API_KEY not found in environment');
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

  private async invokeModel(prompt: string, maxRetries = 2): Promise<{ content: string; duration: number; tokens: any }> {
    const model = new ChatOpenAI({
      modelName: 'x-ai/grok-4-fast',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      apiKey: this.apiKey,
      temperature: 0.7,
      maxTokens: 8000,
    });

    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const response = await model.invoke(prompt);
        const duration = Date.now() - startTime;
        const content = response.content.toString();

        const usage = (response as any).response_metadata?.tokenUsage || {};
        const tokens = {
          input: usage.promptTokens || 0,
          output: usage.completionTokens || 0,
        };

        return { content, duration, tokens };
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          log(`Retry ${attempt + 1}/${maxRetries - 1} after error...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }

  private async runTest(scenario: TestScenario, runNumber: number): Promise<TestRun> {
    const startTime = Date.now();

    try {
      // Build prompt based on entity type
      const prompt = scenario.entityId === 'metadata'
        ? this.buildMetadataPrompt(scenario)
        : this.buildLessonPrompt(scenario);

      // Call model with retry logic
      const result = await this.invokeModel(prompt);
      const duration = Date.now() - startTime;

      // Save full output
      const outputPath = `${this.outputDir}/${scenario.id}-run${runNumber}.json`;
      await fs.writeFile(outputPath, result.content, 'utf-8');

      // Save metadata log
      const logPath = `${this.outputDir}/${scenario.id}-run${runNumber}.log`;
      await fs.writeFile(logPath, JSON.stringify({
        model: 'Grok 4 Fast',
        modelSlug: 'grok-4-fast',
        apiName: 'x-ai/grok-4-fast',
        scenario: scenario.id,
        runNumber,
        duration,
        timestamp: new Date().toISOString(),
        contentLength: result.content.length,
        tokenUsage: result.tokens,
      }, null, 2), 'utf-8');

      log(`[grok-4-fast] ${scenario.id} run ${runNumber}/3... ✓ ${duration}ms`, 'success');

      return {
        scenario,
        runNumber,
        success: true,
        duration,
        outputPath,
        logPath,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Save error details
      const errorPath = `${this.outputDir}/${scenario.id}-run${runNumber}-ERROR.json`;
      await fs.writeFile(errorPath, JSON.stringify({
        model: 'Grok 4 Fast',
        modelSlug: 'grok-4-fast',
        scenario: scenario.id,
        runNumber,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
        duration,
      }, null, 2), 'utf-8');

      log(`[grok-4-fast] ${scenario.id} run ${runNumber}/3... ✗ ${error.message}`, 'error');

      return {
        scenario,
        runNumber,
        success: false,
        duration,
        errorPath,
        error: error.message,
      };
    }
  }

  async runAllTests(): Promise<void> {
    section('Quality-Focused Testing: Grok 4 Fast');
    log('Model: x-ai/grok-4-fast', 'info');
    log('Scenarios: 4 (metadata-en, metadata-ru, lesson-en, lesson-ru)', 'info');
    log('Runs per scenario: 3', 'info');
    log('Total API calls: 12', 'info');
    log('Output: /tmp/quality-tests/grok-4-fast/', 'info');

    await this.ensureOutputDir();

    // Run tests for each scenario × 3 runs
    for (const scenario of this.scenarios) {
      section(`Testing: ${scenario.id} (${scenario.language.toUpperCase()})`);

      for (let run = 1; run <= 3; run++) {
        const result = await this.runTest(scenario, run);
        this.runs.push(result);

        // Wait 2s between requests (rate limiting)
        if (!(scenario === this.scenarios[this.scenarios.length - 1] && run === 3)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    this.printSummary();
  }

  private printSummary(): void {
    section('Test Execution Summary');

    const successful = this.runs.filter(r => r.success).length;
    const failed = this.runs.filter(r => !r.success).length;
    const totalDuration = this.runs.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\nTotal runs: ${this.runs.length}`);
    console.log(`${colors.green}✓ Successful: ${successful}${colors.reset}`);
    console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
    console.log(`Success rate: ${((successful / this.runs.length) * 100).toFixed(1)}%`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`Avg duration per call: ${(totalDuration / this.runs.length / 1000).toFixed(1)}s`);

    // Group by scenario
    section('Results by Scenario');
    for (const scenario of this.scenarios) {
      const scenarioRuns = this.runs.filter(r => r.scenario.id === scenario.id);
      const scenarioSuccess = scenarioRuns.filter(r => r.success).length;
      const status = scenarioSuccess === 3 ? `${colors.green}✓ 3/3${colors.reset}` : `${colors.yellow}⚠ ${scenarioSuccess}/3${colors.reset}`;
      console.log(`  ${status} ${scenario.id} (${scenario.language.toUpperCase()})`);
    }

    console.log(`\n${colors.bold}Next Steps:${colors.reset}`);
    console.log(`1. Review outputs: ls -la ${this.outputDir}/`);
    console.log(`2. Inspect sample: cat ${this.outputDir}/metadata-en-run1.json`);
    console.log(`3. Run quality analysis script (analyze schema + content + language)`);
    console.log(`4. Generate quality rankings`);
  }
}

async function main() {
  try {
    const tester = new GrokQualityTester();
    await tester.runAllTests();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
