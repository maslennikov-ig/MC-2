#!/usr/bin/env tsx
/**
 * Quality-Focused Model Evaluation: z-ai/glm-4.6
 *
 * Methodology: MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 * Configuration: test-config-2025-11-13-complete.json
 *
 * Executes 3 runs per scenario (4 scenarios = 12 total API calls)
 * Saves full JSON outputs to /tmp/quality-tests/glm-46/
 * Analyzes both schema compliance and content quality
 *
 * Expected: 4/4 SUCCESS (S-TIER multilingual model)
 *
 * Usage:
 *   pnpm tsx experiments/models/test-model-glm-46-quality.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Color codes
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

function log(message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Output directory configuration:
 * - Default: .tmp/quality-tests/{model-name}/ (ignored by git, always available)
 * - Override: Set QUALITY_TESTS_DIR=custom/path/ to save results elsewhere
 *
 * Example: Save to current spec:
 * QUALITY_TESTS_DIR=specs/008-generation-generation-json/quality-tests pnpm tsx experiments/models/test-model-glm-46-quality.ts
 */
const BASE_QUALITY_DIR = process.env.QUALITY_TESTS_DIR || '.tmp/quality-tests';

// Configuration
const MODEL_SLUG = 'glm-46';
const MODEL_API_NAME = 'z-ai/glm-4.6';
const MODEL_DISPLAY_NAME = 'GLM 4.6';
const OUTPUT_DIR = `${BASE_QUALITY_DIR}/glm-46`;
const RUNS_PER_SCENARIO = 3;
const TEMPERATURE = 0.7;
const MAX_TOKENS = 8000;
const WAIT_BETWEEN_REQUESTS = 2000; // ms

interface TestScenario {
  id: string;
  entityId: 'metadata' | 'lesson';
  language: 'en' | 'ru';
  title: string;
  description: string;
}

interface TestResult {
  success: boolean;
  duration: number;
  outputPath?: string;
  logPath?: string;
  error?: string;
  errorPath?: string;
}

const TEST_SCENARIOS: TestScenario[] = [
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

/**
 * Build metadata generation prompt
 */
function buildMetadataPrompt(scenario: TestScenario): string {
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

/**
 * Build lesson generation prompt
 */
function buildLessonPrompt(scenario: TestScenario): string {
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

/**
 * Call OpenRouter API
 */
async function callOpenRouter(prompt: string): Promise<{ content: string; duration: number; usage: any }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const startTime = Date.now();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://megacampus.ai',
      'X-Title': 'MegaCampus LLM Quality Testing',
    },
    body: JSON.stringify({
      model: MODEL_API_NAME,
      messages: [{ role: 'user', content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const duration = Date.now() - startTime;

  return { content, duration, usage: data.usage };
}

/**
 * Run single test
 */
async function runTest(
  scenario: TestScenario,
  runNumber: number
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    // Build prompt based on entity type
    const prompt = scenario.entityId === 'metadata'
      ? buildMetadataPrompt(scenario)
      : buildLessonPrompt(scenario);

    // Call OpenRouter API
    const { content, duration, usage } = await callOpenRouter(prompt);

    // Save full output
    const outputPath = `${OUTPUT_DIR}/${scenario.id}-run${runNumber}.json`;
    writeFileSync(outputPath, content, 'utf-8');

    // Save metadata log
    const logPath = `${OUTPUT_DIR}/${scenario.id}-run${runNumber}.log`;
    writeFileSync(logPath, JSON.stringify({
      model: MODEL_DISPLAY_NAME,
      modelSlug: MODEL_SLUG,
      scenario: scenario.id,
      runNumber,
      duration,
      timestamp: new Date().toISOString(),
      contentLength: content.length,
      tokenUsage: usage,
    }, null, 2), 'utf-8');

    console.log(`${colors.green}✓${colors.reset} [${MODEL_SLUG}] ${scenario.id} run ${runNumber}/${RUNS_PER_SCENARIO}... ${duration}ms`);

    return { success: true, duration, outputPath, logPath };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Save error details
    const errorPath = `${OUTPUT_DIR}/${scenario.id}-run${runNumber}-ERROR.json`;
    writeFileSync(errorPath, JSON.stringify({
      model: MODEL_DISPLAY_NAME,
      modelSlug: MODEL_SLUG,
      scenario: scenario.id,
      runNumber,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      duration,
    }, null, 2), 'utf-8');

    console.log(`${colors.red}✗${colors.reset} [${MODEL_SLUG}] ${scenario.id} run ${runNumber}/${RUNS_PER_SCENARIO}... ${errorMessage}`);

    return { success: false, duration, error: errorMessage, errorPath };
  }
}

/**
 * Wait between requests
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${colors.bold}${colors.cyan}═════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}Quality-Focused Model Evaluation: ${MODEL_DISPLAY_NAME}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═════════════════════════════════════════════════════${colors.reset}\n`);

  log(`Model: ${MODEL_API_NAME}`);
  log(`Output directory: ${OUTPUT_DIR}`);
  log(`Runs per scenario: ${RUNS_PER_SCENARIO}`);
  log(`Total API calls: ${TEST_SCENARIOS.length * RUNS_PER_SCENARIO}`);
  log(`Expected: 4/4 SUCCESS (S-TIER multilingual model)\n`);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    log(`Created output directory: ${OUTPUT_DIR}\n`);
  }

  const allResults: TestResult[] = [];
  const startTimeTotal = Date.now();

  // Run all tests
  for (const scenario of TEST_SCENARIOS) {
    for (let runNumber = 1; runNumber <= RUNS_PER_SCENARIO; runNumber++) {
      const result = await runTest(scenario, runNumber);
      allResults.push(result);

      // Wait between requests (except after last request)
      if (!(scenario === TEST_SCENARIOS[TEST_SCENARIOS.length - 1] && runNumber === RUNS_PER_SCENARIO)) {
        await wait(WAIT_BETWEEN_REQUESTS);
      }
    }
  }

  const totalDuration = Date.now() - startTimeTotal;
  const successCount = allResults.filter(r => r.success).length;
  const errorCount = allResults.filter(r => !r.success).length;

  // Summary
  console.log(`\n${colors.bold}${colors.cyan}═════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}Test Execution Summary${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═════════════════════════════════════════════════════${colors.reset}\n`);

  if (successCount === allResults.length) {
    console.log(`${colors.green}✓${colors.reset} All tests complete (${successCount}/${allResults.length} passed, ${errorCount} errors)`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} Tests complete with errors (${successCount}/${allResults.length} passed, ${errorCount} errors)`);
  }

  console.log(`${colors.green}✓${colors.reset} Results saved to ${OUTPUT_DIR}/`);
  console.log(`${colors.dim}→ Total duration: ${(totalDuration / 1000).toFixed(1)}s${colors.reset}`);
  console.log(`${colors.dim}→ Average duration per request: ${(allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length).toFixed(0)}ms${colors.reset}\n`);

  console.log(`${colors.cyan}Next steps:${colors.reset}`);
  console.log(`  1. Review outputs: ls -la ${OUTPUT_DIR}/`);
  console.log(`  2. Check for errors: find ${OUTPUT_DIR}/ -name "*-ERROR.json"`);
  console.log(`  3. Analyze quality: Run quality analysis script`);
  console.log(`  4. Compare with other models in /tmp/quality-tests/\n`);

  // Generate brief summary report
  const summaryPath = `${OUTPUT_DIR}/test-summary.md`;
  const summary = `# Test Execution Summary: ${MODEL_DISPLAY_NAME}

**Date**: ${new Date().toISOString()}
**Model**: ${MODEL_API_NAME}
**Slug**: ${MODEL_SLUG}

## Results

- **Total Tests**: ${allResults.length}
- **Successful**: ${successCount}
- **Failed**: ${errorCount}
- **Success Rate**: ${((successCount / allResults.length) * 100).toFixed(1)}%
- **Total Duration**: ${(totalDuration / 1000).toFixed(1)}s
- **Average Duration**: ${(allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length).toFixed(0)}ms

## Test Breakdown

${TEST_SCENARIOS.map(scenario => {
  const scenarioResults = allResults.filter((_, i) =>
    Math.floor(i / RUNS_PER_SCENARIO) === TEST_SCENARIOS.indexOf(scenario)
  );
  const scenarioSuccess = scenarioResults.filter(r => r.success).length;
  return `### ${scenario.id}
- Language: ${scenario.language}
- Entity: ${scenario.entityId}
- Runs: ${scenarioSuccess}/${RUNS_PER_SCENARIO} successful`;
}).join('\n\n')}

## Files Generated

${allResults.map((r, i) => {
  const scenarioIndex = Math.floor(i / RUNS_PER_SCENARIO);
  const runNumber = (i % RUNS_PER_SCENARIO) + 1;
  const scenario = TEST_SCENARIOS[scenarioIndex];
  if (r.success) {
    return `- \`${scenario.id}-run${runNumber}.json\` (${r.duration}ms)`;
  } else {
    return `- \`${scenario.id}-run${runNumber}-ERROR.json\` (${r.error})`;
  }
}).join('\n')}

## Next Steps

1. Review outputs in \`${OUTPUT_DIR}/\`
2. Run quality analysis to evaluate schema compliance and content quality
3. Compare with other models in \`/tmp/quality-tests/\`
4. Generate final rankings across all models

---

**Generated**: ${new Date().toISOString()}
`;

  writeFileSync(summaryPath, summary, 'utf-8');
  console.log(`${colors.green}✓${colors.reset} Summary report saved: ${summaryPath}\n`);
}

// Execute
main().catch(error => {
  console.error(`\n${colors.red}✗ Fatal error:${colors.reset}`, error);
  process.exit(1);
});
