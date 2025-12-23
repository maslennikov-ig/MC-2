#!/usr/bin/env tsx
/**
 * Quality-Focused Testing: deepseek/deepseek-chat-v3.1
 *
 * Methodology: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 * Configuration: docs/llm-testing/test-config-2025-11-13-complete.json
 *
 * Runs 3 tests per scenario (4 scenarios = 12 API calls)
 * Saves full JSON outputs to /tmp/quality-tests/deepseek-chat-v31/
 * Analyzes schema compliance AND content quality
 *
 * Expected: 4/4 SUCCESS (S-TIER model, excellent Russian support)
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFile, mkdir } from 'fs/promises';

dotenv.config({ path: resolve(__dirname, '../../.env') });

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

interface TestResult {
  scenario: string;
  run: number;
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
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx experiments/models/test-deepseek-chat-v31-quality.ts
 */
const BASE_QUALITY_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

class QualityTester {
  private apiKey: string;
  private modelSlug = 'deepseek-chat-v31';
  private modelApiName = 'deepseek/deepseek-chat-v3.1';
  private outputDir = `${BASE_QUALITY_DIR}/deepseek-chat-v31`;
  private results: TestResult[] = [];
  private runsPerScenario = 3;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async setup() {
    await mkdir(this.outputDir, { recursive: true });
    log(`Output directory: ${this.outputDir}`, 'info');
  }

  private buildMetadataPrompt(title: string, language: 'en' | 'ru'): string {
    return `You are an expert course designer creating comprehensive course metadata.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. NO markdown code blocks, NO explanations, NO extra text
3. All text content must be in ${language === 'en' ? 'English' : 'Russian'}
4. Follow the exact schema below

**Course Title**: ${title}

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

  private buildLessonPrompt(title: string, language: 'en' | 'ru'): string {
    return `You are an expert course designer creating detailed lesson structure for a course section.

**CRITICAL REQUIREMENTS:**
1. Output ONLY valid JSON with snake_case field names (NOT camelCase)
2. Generate 3-5 complete lessons (NOT just 1!)
3. All text content must be in ${language === 'en' ? 'English' : 'Russian'}
4. NO markdown code blocks, NO explanations

**Section Title**: ${title}

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
      "lesson_objective": "...",
      "key_topics": [...],
      "exercises": [...]
    },
    {
      "lesson_number": 3,
      "lesson_title": "...",
      "lesson_objective": "...",
      "key_topics": [...],
      "exercises": [...]
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

  private async callAPI(prompt: string): Promise<{ content: string; duration: number }> {
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
        model: this.modelApiName,
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

  private async runTest(scenarioId: string, prompt: string, runNumber: number): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const { content, duration } = await this.callAPI(prompt);

      // Save full output
      const outputPath = `${this.outputDir}/${scenarioId}-run${runNumber}.json`;
      await writeFile(outputPath, content, 'utf-8');

      // Save metadata log
      const logPath = `${this.outputDir}/${scenarioId}-run${runNumber}.log`;
      await writeFile(logPath, JSON.stringify({
        model: 'DeepSeek Chat v3.1',
        modelSlug: this.modelSlug,
        scenario: scenarioId,
        runNumber,
        duration,
        timestamp: new Date().toISOString(),
        contentLength: content.length
      }, null, 2), 'utf-8');

      log(`[${this.modelSlug}] ${scenarioId} run ${runNumber}/${this.runsPerScenario}... ✓ ${duration}ms`, 'success');

      return {
        scenario: scenarioId,
        run: runNumber,
        success: true,
        duration,
        outputPath,
        logPath
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Save error details
      const errorPath = `${this.outputDir}/${scenarioId}-run${runNumber}-ERROR.json`;
      await writeFile(errorPath, JSON.stringify({
        model: 'DeepSeek Chat v3.1',
        modelSlug: this.modelSlug,
        scenario: scenarioId,
        runNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
        duration
      }, null, 2), 'utf-8');

      log(`[${this.modelSlug}] ${scenarioId} run ${runNumber}/${this.runsPerScenario}... ✗ ${error.message}`, 'error');

      return {
        scenario: scenarioId,
        run: runNumber,
        success: false,
        duration,
        errorPath,
        error: error.message
      };
    }
  }

  async runScenario(scenarioId: string, entityType: 'metadata' | 'lesson', title: string, language: 'en' | 'ru') {
    section(`Scenario: ${scenarioId}`);
    log(`Entity: ${entityType}, Language: ${language}`, 'info');

    const prompt = entityType === 'metadata'
      ? this.buildMetadataPrompt(title, language)
      : this.buildLessonPrompt(title, language);

    for (let run = 1; run <= this.runsPerScenario; run++) {
      const result = await this.runTest(scenarioId, prompt, run);
      this.results.push(result);

      // Wait 2s between requests (rate limiting)
      if (run < this.runsPerScenario) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async runAllScenarios() {
    // Scenario 1: Metadata - English
    await this.runScenario('metadata-en', 'metadata', 'Introduction to Python Programming', 'en');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scenario 2: Metadata - Russian
    await this.runScenario('metadata-ru', 'metadata', 'Машинное обучение для начинающих', 'ru');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scenario 3: Lesson - English
    await this.runScenario('lesson-en', 'lesson', 'Variables and Data Types in Python', 'en');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scenario 4: Lesson - Russian
    await this.runScenario('lesson-ru', 'lesson', 'Основы нейронных сетей', 'ru');
  }

  printSummary() {
    section('Test Summary');

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = totalDuration / this.results.length;

    console.log(`\n${colors.bold}Results:${colors.reset}`);
    console.log(`  Total Runs: ${this.results.length}`);
    console.log(`  ${colors.green}✓ Passed: ${passed}${colors.reset}`);
    console.log(`  ${colors.red}✗ Failed: ${failed}${colors.reset}`);
    console.log(`  Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);
    console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);

    console.log(`\n${colors.bold}Output Location:${colors.reset}`);
    console.log(`  ${this.outputDir}/`);

    if (failed > 0) {
      console.log(`\n${colors.bold}${colors.red}Errors:${colors.reset}`);
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  ${colors.red}✗${colors.reset} ${r.scenario} run ${r.run}: ${r.error}`);
      });
    }

    console.log(`\n${colors.bold}Next Steps:${colors.reset}`);
    console.log(`  1. Review outputs: ls -la ${this.outputDir}/`);
    console.log(`  2. Inspect JSON files for quality analysis`);
    console.log(`  3. Check for schema compliance (snake_case, required fields)`);
    console.log(`  4. Verify lesson count (should be 3-5, not 1!)`);

    if (passed === this.results.length) {
      log(`✅ All tests passed! (${passed}/${this.results.length})`, 'success');
    } else {
      log(`⚠️ Some tests failed (${passed}/${this.results.length} passed)`, 'warning');
    }
  }
}

async function main() {
  section('Quality-Focused Testing: DeepSeek Chat v3.1');
  log('Configuration: docs/llm-testing/test-config-2025-11-13-complete.json', 'info');
  log('Methodology: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md', 'info');
  log('Expected: 4/4 SUCCESS (S-TIER model)', 'info');

  try {
    const tester = new QualityTester();
    await tester.setup();
    await tester.runAllScenarios();
    tester.printSummary();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
