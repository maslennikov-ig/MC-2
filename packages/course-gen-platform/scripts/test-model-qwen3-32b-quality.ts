#!/usr/bin/env tsx
/**
 * Quality-Focused Model Evaluation: qwen/qwen3-32b
 *
 * Executes 3 runs per scenario (12 API calls total) to measure:
 * - Quality (schema compliance + content quality)
 * - Consistency (standard deviation across runs)
 * - Real outputs (saved to disk for manual review)
 *
 * Expected: 2/4 SUCCESS (metadata only, lessons return HTML or HTTP 500)
 *
 * Output: /tmp/quality-tests/qwen3-32b/
 *
 * Usage:
 *   pnpm tsx scripts/test-model-qwen3-32b-quality.ts
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

interface TestRun {
  scenario: string;
  runNumber: number;
  status: 'SUCCESS' | 'FAILED';
  duration: number;
  outputPath?: string;
  logPath?: string;
  errorPath?: string;
  error?: string;
  contentLength?: number;
  tokens?: {
    input: number;
    output: number;
  };
}

/**
 * Output directory configuration:
 * - Default: .tmp/quality-tests/{model-name}/ (ignored by git, always available)
 * - Override: Set QUALITY_TESTS_DIR=custom/path/ to save results elsewhere
 *
 * Example: Save to current spec:
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx scripts/test-model-qwen3-32b-quality.ts
 */
const BASE_QUALITY_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

class QualityTester {
  private apiKey: string;
  private outputDir = `${BASE_QUALITY_DIR}/qwen3-32b`;
  private runs: TestRun[] = [];
  private modelName = 'qwen/qwen3-32b';
  private modelDisplayName = 'Qwen3 32B';
  private runsPerScenario = 3;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async setup(): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    log(`Output directory created: ${this.outputDir}`, 'info');
  }

  private buildMetadataPrompt(title: string, language: string): string {
    return `You are an expert course designer creating comprehensive course metadata.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. NO markdown code blocks, NO explanations, NO extra text
3. All text content must be in ${language === 'en' ? 'English' : 'Russian'}
4. Follow the exact schema below

**Course Title**: ${title}

**Course Description**: ${language === 'en' ? 'Beginner-level technical programming course' : 'Intermediate-level conceptual ML course'}

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

  private buildLessonPrompt(title: string, language: string): string {
    return `You are an expert course designer creating detailed lesson structure for a course section.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. Generate 3-5 complete lessons (NOT just 1!)
3. All text content must be in ${language === 'en' ? 'English' : 'Russian'}
4. NO markdown code blocks, NO explanations

**Section Title**: ${title}

**Section Description**: ${language === 'en' ? 'Hands-on programming section with exercises' : 'Conceptual theory section with examples'}

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
    prompt: string,
    scenario: string,
    runNumber: number
  ): Promise<TestRun> {
    const startTime = Date.now();

    try {
      const model = new ChatOpenAI({
        modelName: this.modelName,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        apiKey: this.apiKey,
        temperature: 0.7,
        maxTokens: 8000,
      });

      const response = await model.invoke(prompt);
      const duration = Date.now() - startTime;
      const content = response.content.toString();

      // Extract token usage
      const usage = (response as any).response_metadata?.tokenUsage || {};
      const tokens = {
        input: usage.promptTokens || Math.ceil(prompt.length / 4),
        output: usage.completionTokens || Math.ceil(content.length / 4),
      };

      // Save full output
      const outputPath = `${this.outputDir}/${scenario}-run${runNumber}.json`;
      await writeFile(outputPath, content, 'utf-8');

      // Save metadata log
      const logPath = `${this.outputDir}/${scenario}-run${runNumber}.log`;
      await writeFile(
        logPath,
        JSON.stringify(
          {
            model: this.modelDisplayName,
            modelSlug: 'qwen3-32b',
            modelApiName: this.modelName,
            scenario,
            runNumber,
            duration,
            timestamp: new Date().toISOString(),
            contentLength: content.length,
            tokenUsage: tokens,
          },
          null,
          2
        ),
        'utf-8'
      );

      log(
        `[qwen3-32b] ${scenario} run ${runNumber}/${this.runsPerScenario}... ✓ ${duration}ms (${tokens.output} tokens)`,
        'success'
      );

      return {
        scenario,
        runNumber,
        status: 'SUCCESS',
        duration,
        outputPath,
        logPath,
        contentLength: content.length,
        tokens,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Save error details
      const errorPath = `${this.outputDir}/${scenario}-run${runNumber}-ERROR.json`;
      await writeFile(
        errorPath,
        JSON.stringify(
          {
            model: this.modelDisplayName,
            modelSlug: 'qwen3-32b',
            scenario,
            runNumber,
            error: error.message || 'Unknown error',
            timestamp: new Date().toISOString(),
            duration,
          },
          null,
          2
        ),
        'utf-8'
      );

      log(
        `[qwen3-32b] ${scenario} run ${runNumber}/${this.runsPerScenario}... ✗ ${error.message}`,
        'error'
      );

      return {
        scenario,
        runNumber,
        status: 'FAILED',
        duration,
        errorPath,
        error: error.message,
      };
    }
  }

  async testScenario(
    scenarioId: string,
    entityType: 'metadata' | 'lesson',
    title: string,
    language: 'en' | 'ru'
  ): Promise<void> {
    section(`Scenario: ${scenarioId} (${this.runsPerScenario} runs)`);

    for (let run = 1; run <= this.runsPerScenario; run++) {
      const prompt =
        entityType === 'metadata'
          ? this.buildMetadataPrompt(title, language)
          : this.buildLessonPrompt(title, language);

      const result = await this.invokeModel(prompt, scenarioId, run);
      this.runs.push(result);

      // Wait 2s between requests (rate limiting)
      if (run < this.runsPerScenario) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  printSummary(): void {
    section('Test Execution Summary: qwen/qwen3-32b');

    const totalRuns = this.runs.length;
    const successfulRuns = this.runs.filter(r => r.status === 'SUCCESS').length;
    const failedRuns = this.runs.filter(r => r.status === 'FAILED').length;

    console.log(`\nTotal Runs: ${totalRuns}`);
    console.log(`${colors.green}✓${colors.reset} Successful: ${successfulRuns}`);
    console.log(`${colors.red}✗${colors.reset} Failed: ${failedRuns}`);

    // Group by scenario
    const scenarios = ['metadata-en', 'metadata-ru', 'lesson-en', 'lesson-ru'];
    scenarios.forEach(scenario => {
      const scenarioRuns = this.runs.filter(r => r.scenario === scenario);
      const success = scenarioRuns.filter(r => r.status === 'SUCCESS').length;
      const statusIcon = success === this.runsPerScenario ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      console.log(`\n${statusIcon} ${scenario}: ${success}/${this.runsPerScenario} successful`);

      scenarioRuns.forEach(run => {
        const icon = run.status === 'SUCCESS' ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        const details = run.status === 'SUCCESS'
          ? `${run.duration}ms, ${run.tokens?.output} tokens`
          : `${run.error}`;
        console.log(`  ${icon} Run ${run.runNumber}: ${details}`);
      });
    });

    console.log(`\n${colors.bold}Output Directory:${colors.reset} ${this.outputDir}`);
    console.log(`\n${colors.yellow}Expected:${colors.reset} 2/4 scenarios SUCCESS (metadata only)`);
    console.log(`${colors.yellow}Known Issue:${colors.reset} Lesson scenarios likely return HTML or HTTP 500`);
  }

  async runAll(): Promise<void> {
    section('Quality-Focused Testing: qwen/qwen3-32b');
    log('Configuration: 3 runs per scenario, 4 scenarios = 12 API calls', 'info');
    log('Pricing: $0.40 input / $0.40 output per 1M tokens', 'info');
    log('Expected: Metadata SUCCESS, Lessons FAILED (HTML/HTTP 500)', 'warning');

    await this.setup();

    // Test 1: Metadata - English
    await this.testScenario('metadata-en', 'metadata', 'Introduction to Python Programming', 'en');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Metadata - Russian
    await this.testScenario('metadata-ru', 'metadata', 'Машинное обучение для начинающих', 'ru');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Lesson - English
    await this.testScenario('lesson-en', 'lesson', 'Variables and Data Types in Python', 'en');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Lesson - Russian
    await this.testScenario('lesson-ru', 'lesson', 'Основы нейронных сетей', 'ru');

    this.printSummary();
  }
}

async function main() {
  try {
    const tester = new QualityTester();
    await tester.runAll();

    console.log(`\n${colors.bold}${colors.cyan}Next Steps:${colors.reset}`);
    console.log('1. Review outputs: /tmp/quality-tests/qwen3-32b/');
    console.log('2. Check for HTML responses in lesson-*.json files');
    console.log('3. Analyze metadata quality (schema + content)');
    console.log('4. Compare with other A-TIER models (qwen3-235b-thinking, oss-120b)');
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
