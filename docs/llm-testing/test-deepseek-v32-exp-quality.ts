#!/usr/bin/env tsx
/**
 * Quality-Focused Testing for DeepSeek v3.2 Experimental
 *
 * Methodology: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 * Configuration: docs/llm-testing/test-config-2025-11-13-complete.json
 *
 * This script runs 3 tests per scenario (4 scenarios = 12 API calls)
 * and saves full JSON outputs for quality analysis.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables from packages/course-gen-platform/.env
const ENV_PATH = path.join(__dirname, 'packages/course-gen-platform/.env');

async function loadEnv() {
  try {
    const envContent = await fs.readFile(ENV_PATH, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join('=');
        }
      }
    }
  } catch (error) {
    console.error(`Failed to load .env file from ${ENV_PATH}:`, error);
    process.exit(1);
  }
}

// Model configuration
const MODEL = {
  name: 'DeepSeek v3.2 Exp',
  slug: 'deepseek-v32-exp',
  apiName: 'deepseek/deepseek-v3.2-exp',
  tier: 'S-TIER'
};

// Test scenarios from config
const SCENARIOS = [
  {
    id: 'metadata-en',
    entityId: 'metadata',
    language: 'en' as const,
    title: 'Introduction to Python Programming',
    description: 'Beginner-level technical programming course'
  },
  {
    id: 'metadata-ru',
    entityId: 'metadata',
    language: 'ru' as const,
    title: 'Машинное обучение для начинающих',
    description: 'Intermediate-level conceptual ML course'
  },
  {
    id: 'lesson-en',
    entityId: 'lesson',
    language: 'en' as const,
    title: 'Variables and Data Types in Python',
    description: 'Hands-on programming section with exercises'
  },
  {
    id: 'lesson-ru',
    entityId: 'lesson',
    language: 'ru' as const,
    title: 'Основы нейронных сетей',
    description: 'Conceptual theory section with examples'
  }
];

const TEST_PARAMS = {
  runsPerScenario: 3,
  temperature: 0.7,
  maxTokens: 8000,
  waitBetweenRequests: 2000,
  timeout: 60000
};

const OUTPUT_DIR = '/tmp/quality-tests/deepseek-v32-exp';

// Prompt builders
function buildMetadataPrompt(scenario: typeof SCENARIOS[0]): string {
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

function buildLessonPrompt(scenario: typeof SCENARIOS[0]): string {
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

interface TestResult {
  success: boolean;
  duration: number;
  outputPath?: string;
  logPath?: string;
  error?: string;
  errorPath?: string;
}

async function runTest(
  scenario: typeof SCENARIOS[0],
  runNumber: number
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    // Build prompt
    const prompt = scenario.entityId === 'metadata'
      ? buildMetadataPrompt(scenario)
      : buildLessonPrompt(scenario);

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://megacampus.ai',
        'X-Title': 'MegaCampus LLM Quality Testing'
      },
      body: JSON.stringify({
        model: MODEL.apiName,
        messages: [{ role: 'user', content: prompt }],
        temperature: TEST_PARAMS.temperature,
        max_tokens: TEST_PARAMS.maxTokens
      }),
      signal: AbortSignal.timeout(TEST_PARAMS.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    // Save full output
    const outputPath = path.join(OUTPUT_DIR, `${scenario.id}-run${runNumber}.json`);
    await fs.writeFile(outputPath, content, 'utf-8');

    // Save metadata log
    const logPath = path.join(OUTPUT_DIR, `${scenario.id}-run${runNumber}.log`);
    await fs.writeFile(logPath, JSON.stringify({
      model: MODEL.name,
      modelSlug: MODEL.slug,
      scenario: scenario.id,
      runNumber,
      duration,
      timestamp: new Date().toISOString(),
      contentLength: content.length,
      tokenUsage: data.usage
    }, null, 2), 'utf-8');

    console.log(`[${MODEL.slug}] ${scenario.id} run ${runNumber}/${TEST_PARAMS.runsPerScenario}... ✓ ${duration}ms`);

    return { success: true, duration, outputPath, logPath };

  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Save error details
    const errorPath = path.join(OUTPUT_DIR, `${scenario.id}-run${runNumber}-ERROR.json`);
    await fs.writeFile(errorPath, JSON.stringify({
      model: MODEL.name,
      modelSlug: MODEL.slug,
      scenario: scenario.id,
      runNumber,
      error: error.message,
      timestamp: new Date().toISOString(),
      duration
    }, null, 2), 'utf-8');

    console.log(`[${MODEL.slug}] ${scenario.id} run ${runNumber}/${TEST_PARAMS.runsPerScenario}... ✗ ${error.message}`);

    return { success: false, duration, error: error.message, errorPath };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Quality-Focused Model Testing: DeepSeek v3.2 Experimental');
  console.log('='.repeat(80));
  console.log();

  // Load environment
  await loadEnv();

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY not found in environment');
    process.exit(1);
  }

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log();

  // Test configuration
  console.log(`Model: ${MODEL.name} (${MODEL.apiName})`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Runs per scenario: ${TEST_PARAMS.runsPerScenario}`);
  console.log(`Total API calls: ${SCENARIOS.length * TEST_PARAMS.runsPerScenario}`);
  console.log(`Temperature: ${TEST_PARAMS.temperature}`);
  console.log(`Max tokens: ${TEST_PARAMS.maxTokens}`);
  console.log();
  console.log('-'.repeat(80));
  console.log();

  const allResults: TestResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Run tests
  for (const scenario of SCENARIOS) {
    for (let runNumber = 1; runNumber <= TEST_PARAMS.runsPerScenario; runNumber++) {
      const result = await runTest(scenario, runNumber);
      allResults.push(result);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      // Wait between requests (rate limiting)
      if (runNumber < TEST_PARAMS.runsPerScenario || scenario !== SCENARIOS[SCENARIOS.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, TEST_PARAMS.waitBetweenRequests));
      }
    }
    console.log();
  }

  // Summary
  console.log('='.repeat(80));
  console.log('Test Execution Complete');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total runs: ${allResults.length}`);
  console.log(`Success: ${successCount} (${(successCount / allResults.length * 100).toFixed(1)}%)`);
  console.log(`Errors: ${errorCount}`);
  console.log();

  const avgDuration = allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length;
  console.log(`Average duration: ${avgDuration.toFixed(0)}ms`);
  console.log();
  console.log(`Results saved to: ${OUTPUT_DIR}`);
  console.log();

  // Scenario breakdown
  console.log('Scenario Breakdown:');
  for (const scenario of SCENARIOS) {
    const scenarioResults = allResults.filter((r, i) =>
      SCENARIOS[Math.floor(i / TEST_PARAMS.runsPerScenario)].id === scenario.id
    );
    const scenarioSuccess = scenarioResults.filter(r => r.success).length;
    console.log(`  ${scenario.id}: ${scenarioSuccess}/${TEST_PARAMS.runsPerScenario} success`);
  }
  console.log();

  if (errorCount > 0) {
    console.log('⚠️  Errors occurred. Check *-ERROR.json files for details.');
    console.log();
  }

  console.log('Next steps:');
  console.log('1. Review outputs: ls -la /tmp/quality-tests/deepseek-v32-exp/');
  console.log('2. Inspect sample JSON: cat /tmp/quality-tests/deepseek-v32-exp/metadata-en-run1.json');
  console.log('3. Run quality analysis (if available)');
  console.log();
}

main().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
