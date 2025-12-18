#!/usr/bin/env tsx
/**
 * Quality-Focused Model Testing: qwen/qwen3-235b-a22b-thinking-2507
 *
 * Methodology: MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 * - 3 runs per scenario (12 API calls total)
 * - Full JSON outputs saved to /tmp/quality-tests/qwen3-235b-thinking/
 * - Quality analysis (schema + content + language)
 *
 * Expected: 2/4 SUCCESS (A-TIER model)
 * - Metadata: PASS (excellent quality with deep reasoning)
 * - Lessons: FAIL (expected to fail lesson generation)
 *
 * Usage:
 *   pnpm tsx scripts/test-model-qwen3-235b-thinking.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

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
  console.log(`\n${colors.bold}${colors.cyan}═══ ${title} ═══${colors.reset}`);
}

interface TestScenario {
  id: string;
  entityId: 'metadata' | 'lesson';
  language: 'en' | 'ru';
  title: string;
  description: string;
}

interface TestRun {
  scenarioId: string;
  runNumber: number;
  status: 'SUCCESS' | 'FAILED';
  duration: number;
  outputPath?: string;
  logPath?: string;
  errorPath?: string;
  error?: string;
  contentLength?: number;
}

class QualityTester {
  private apiKey: string;
  private modelSlug = 'qwen3-235b-thinking';
  private modelName = 'qwen/qwen3-235b-a22b-thinking-2507';
  private outputDir = '/tmp/quality-tests/qwen3-235b-thinking';
  private runs: TestRun[] = [];
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

  async init(): Promise<void> {
    // Create output directory
    if (!existsSync(this.outputDir)) {
      await mkdir(this.outputDir, { recursive: true });
      log(`Created directory: ${this.outputDir}`, 'info');
    }
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

  private async callOpenRouter(prompt: string): Promise<{ content: string; duration: number }> {
    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://megacampus.ai',
        'X-Title': 'MegaCampus LLM Quality Testing'
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    return { content, duration };
  }

  private async runTest(scenario: TestScenario, runNumber: number): Promise<TestRun> {
    const startTime = Date.now();

    try {
      // Build prompt based on entity type
      const prompt = scenario.entityId === 'metadata'
        ? this.buildMetadataPrompt(scenario)
        : this.buildLessonPrompt(scenario);

      // Call OpenRouter API
      const result = await this.callOpenRouter(prompt);

      // Save full output
      const outputPath = `${this.outputDir}/${scenario.id}-run${runNumber}.json`;
      await writeFile(outputPath, result.content, 'utf-8');

      // Save metadata log
      const logPath = `${this.outputDir}/${scenario.id}-run${runNumber}.log`;
      await writeFile(logPath, JSON.stringify({
        model: 'Qwen3 235B Thinking',
        modelSlug: this.modelSlug,
        modelName: this.modelName,
        scenario: scenario.id,
        runNumber,
        duration: result.duration,
        timestamp: new Date().toISOString(),
        contentLength: result.content.length,
      }, null, 2), 'utf-8');

      log(`[${this.modelSlug}] ${scenario.id} run ${runNumber}/${this.runsPerScenario}... ✓ ${result.duration}ms`, 'success');

      return {
        scenarioId: scenario.id,
        runNumber,
        status: 'SUCCESS',
        duration: result.duration,
        outputPath,
        logPath,
        contentLength: result.content.length,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Save error details
      const errorPath = `${this.outputDir}/${scenario.id}-run${runNumber}-ERROR.json`;
      await writeFile(errorPath, JSON.stringify({
        model: 'Qwen3 235B Thinking',
        modelSlug: this.modelSlug,
        scenario: scenario.id,
        runNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
        duration
      }, null, 2), 'utf-8');

      log(`[${this.modelSlug}] ${scenario.id} run ${runNumber}/${this.runsPerScenario}... ✗ ${error.message}`, 'error');

      return {
        scenarioId: scenario.id,
        runNumber,
        status: 'FAILED',
        duration,
        error: error.message,
        errorPath,
      };
    }
  }

  async runAllTests(): Promise<void> {
    section(`Quality Testing: ${this.modelName}`);
    log(`Running ${this.scenarios.length} scenarios × ${this.runsPerScenario} runs = ${this.scenarios.length * this.runsPerScenario} total API calls`, 'info');
    log(`Output directory: ${this.outputDir}`, 'info');

    for (const scenario of this.scenarios) {
      section(`Scenario: ${scenario.id} (${scenario.entityId}, ${scenario.language})`);

      for (let i = 1; i <= this.runsPerScenario; i++) {
        const run = await this.runTest(scenario, i);
        this.runs.push(run);

        // Wait 2s between requests (rate limiting)
        if (i < this.runsPerScenario || scenario.id !== this.scenarios[this.scenarios.length - 1].id) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    this.printSummary();
  }

  printSummary(): void {
    section('Test Execution Summary');

    const passed = this.runs.filter(r => r.status === 'SUCCESS').length;
    const failed = this.runs.filter(r => r.status === 'FAILED').length;

    console.log(`\nResults:`);
    console.log(`  Total Runs: ${this.runs.length}`);
    console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
    console.log(`  Failed: ${failed > 0 ? colors.red : colors.green}${failed}${colors.reset}`);

    console.log(`\nBy Scenario:`);
    for (const scenario of this.scenarios) {
      const scenarioRuns = this.runs.filter(r => r.scenarioId === scenario.id);
      const scenarioPassed = scenarioRuns.filter(r => r.status === 'SUCCESS').length;
      const status = scenarioPassed === this.runsPerScenario ? '✓' : '✗';
      const color = scenarioPassed === this.runsPerScenario ? colors.green : colors.red;
      console.log(`  ${color}${status}${colors.reset} ${scenario.id}: ${scenarioPassed}/${this.runsPerScenario} passed`);
    }

    console.log(`\nOutputs saved to: ${this.outputDir}`);
    console.log(`Next step: Analyze quality scores (schema + content + language)`);
  }
}

async function main() {
  try {
    const tester = new QualityTester();
    await tester.init();
    await tester.runAllTests();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
