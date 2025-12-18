#!/usr/bin/env tsx
/**
 * Quality-focused testing for Kimi K2 0905 model
 * Configuration: docs/llm-testing/test-config-2025-11-13-complete.json
 * Methodology: docs/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md
 *
 * Expected: 4/4 SUCCESS (S-TIER model)
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables from packages/course-gen-platform/.env
dotenv.config({ path: resolve(__dirname, 'packages/course-gen-platform/.env') });

// Configuration
const MODEL = {
  name: 'Kimi K2 0905',
  slug: 'kimi-k2-0905',
  apiName: 'moonshotai/kimi-k2-0905',
  tier: 'S-TIER'
};

const TEST_SCENARIOS = [
  {
    id: 'metadata-en',
    entityId: 'metadata',
    language: 'en',
    title: 'Introduction to Python Programming',
    description: 'Beginner-level technical programming course'
  },
  {
    id: 'metadata-ru',
    entityId: 'metadata',
    language: 'ru',
    title: 'Машинное обучение для начинающих',
    description: 'Intermediate-level conceptual ML course'
  },
  {
    id: 'lesson-en',
    entityId: 'lesson',
    language: 'en',
    title: 'Variables and Data Types in Python',
    description: 'Hands-on programming section with exercises'
  },
  {
    id: 'lesson-ru',
    entityId: 'lesson',
    language: 'ru',
    title: 'Основы нейронных сетей',
    description: 'Conceptual theory section with examples'
  }
];

const TEST_PARAMS = {
  runsPerScenario: 3,
  temperature: 0.7,
  maxTokens: 8000,
  waitBetweenRequests: 2000
};

const OUTPUT_DIR = '/tmp/quality-tests/kimi-k2-0905';

// Prompt templates
function buildMetadataPrompt(scenario: typeof TEST_SCENARIOS[0]): string {
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

function buildLessonPrompt(scenario: typeof TEST_SCENARIOS[0]): string {
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
      "key_topics": ["..."],
      "exercises": [{"exercise_title": "...", "exercise_instructions": "..."}]
    },
    {
      "lesson_number": 3,
      "lesson_title": "...",
      "lesson_objective": "...",
      "key_topics": ["..."],
      "exercises": [{"exercise_title": "...", "exercise_instructions": "..."}]
    }
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

// Test execution
async function runTest(
  scenario: typeof TEST_SCENARIOS[0],
  runNumber: number
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    const prompt = scenario.entityId === 'metadata'
      ? buildMetadataPrompt(scenario)
      : buildLessonPrompt(scenario);

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
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
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

    return { success: true, duration };

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

    return { success: false, duration, error: error.message };
  }
}

// Main execution
async function main() {
  console.log(`\n=== Quality Testing: ${MODEL.name} ===\n`);
  console.log(`Model: ${MODEL.apiName}`);
  console.log(`Scenarios: ${TEST_SCENARIOS.length}`);
  console.log(`Runs per scenario: ${TEST_PARAMS.runsPerScenario}`);
  console.log(`Total API calls: ${TEST_SCENARIOS.length * TEST_PARAMS.runsPerScenario}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const scenario of TEST_SCENARIOS) {
    for (let runNumber = 1; runNumber <= TEST_PARAMS.runsPerScenario; runNumber++) {
      totalTests++;

      const result = await runTest(scenario, runNumber);

      if (result.success) {
        passedTests++;
      } else {
        failedTests++;
      }

      // Wait between requests (rate limiting)
      if (runNumber < TEST_PARAMS.runsPerScenario || scenario !== TEST_SCENARIOS[TEST_SCENARIOS.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, TEST_PARAMS.waitBetweenRequests));
      }
    }
  }

  console.log(`\n=== Test Complete ===\n`);
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success rate: ${(passedTests / totalTests * 100).toFixed(1)}%`);
  console.log(`\nResults saved to: ${OUTPUT_DIR}`);

  if (failedTests === 0) {
    console.log(`\n✅ ${MODEL.tier} model confirmed: All tests passed!`);
  } else {
    console.log(`\n⚠️  ${failedTests} test(s) failed. Review error files for details.`);
  }
}

main().catch(console.error);
