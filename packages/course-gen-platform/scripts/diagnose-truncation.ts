#!/usr/bin/env tsx
/**
 * Diagnose JSON truncation issue with Xiaomi model
 *
 * Tests:
 * 1. Simple JSON - does the model complete it?
 * 2. Medium JSON with patched_content
 * 3. Large JSON mimicking self-review response
 */

import OpenAI from 'openai';
import { config } from 'dotenv';

// Load .env file
config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://megacampus.ai',
    'X-Title': 'MegaCampus Diagnostics',
  },
});

const MODEL = 'xiaomi/mimo-v2-flash:free';

interface TestResult {
  name: string;
  maxTokens: number;
  outputTokens: number;
  finishReason: string;
  isValidJson: boolean;
  contentLength: number;
  truncated: boolean;
  error?: string;
}

async function runTest(
  name: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<TestResult> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TEST: ${name}`);
  console.log(`  maxTokens: ${maxTokens}`);
  console.log(`${'═'.repeat(60)}`);

  try {
    const start = Date.now();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    });

    const duration = Date.now() - start;
    const content = completion.choices[0]?.message?.content || '';
    const finishReason = completion.choices[0]?.finish_reason || 'unknown';
    const outputTokens = completion.usage?.completion_tokens || 0;

    // Check if JSON is valid
    let isValidJson = false;
    let truncated = false;
    try {
      JSON.parse(content);
      isValidJson = true;
    } catch (e) {
      truncated = true;
    }

    console.log(`  Duration: ${duration}ms`);
    console.log(`  Output tokens: ${outputTokens}`);
    console.log(`  Finish reason: ${finishReason}`);
    console.log(`  Content length: ${content.length} chars`);
    console.log(`  Valid JSON: ${isValidJson}`);
    console.log(`  Truncated: ${truncated}`);

    if (truncated) {
      console.log(`\n  Content preview (last 200 chars):`);
      console.log(`  ${content.slice(-200)}`);
    }

    return {
      name,
      maxTokens,
      outputTokens,
      finishReason,
      isValidJson,
      contentLength: content.length,
      truncated,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${errorMsg}`);
    return {
      name,
      maxTokens,
      outputTokens: 0,
      finishReason: 'error',
      isValidJson: false,
      contentLength: 0,
      truncated: true,
      error: errorMsg,
    };
  }
}

async function main() {
  console.log(`\n${'╔════════════════════════════════════════════════════════════════╗'}`);
  console.log(`${'║          JSON Truncation Diagnostics - Xiaomi MiMo             ║'}`);
  console.log(`${'╚════════════════════════════════════════════════════════════════╝'}`);
  console.log(`\n  Model: ${MODEL}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  const results: TestResult[] = [];

  // Test 1: Simple JSON (should work)
  results.push(await runTest(
    'Simple JSON',
    'Return ONLY valid JSON, no markdown.',
    'Return a JSON object with status "PASS", reasoning "All checks passed", and an empty issues array.',
    1000
  ));

  // Test 2: Medium JSON with nested content
  results.push(await runTest(
    'Medium JSON with content field',
    'Return ONLY valid JSON, no markdown.',
    `Return a JSON object with:
- status: "FIXED"
- reasoning: "Fixed minor issues"
- issues: array with 3 items, each having type, severity, location, description
- patched_content: a nested object with intro (200 chars of Russian text) and sections array (3 items with id, title, content of 300 chars each)`,
    4000
  ));

  // Test 3: Large JSON mimicking actual self-review response
  const largeLesson = `
# Введение в TypeScript

TypeScript - это язык программирования с статической типизацией.

## Что такое TypeScript

TypeScript расширяет JavaScript добавляя типы. Это позволяет обнаруживать ошибки на этапе компиляции.

\`\`\`typescript
let name: string = "Hello";
let age: number = 25;
\`\`\`

## Преимущества TypeScript

1. Статическая типизация помогает находить ошибки раньше
2. Улучшенная поддержка IDE и автодополнение
3. Лучшая документация кода через типы

## Пример кода

\`\`\`typescript
interface User {
  name: string;
  age: number;
  email?: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
\`\`\`
`;

  results.push(await runTest(
    'Large JSON with patched_content (realistic)',
    `Return ONLY valid JSON. Include the full patched_content field with the corrected lesson content.`,
    `Analyze this lesson and return a JSON object:
- status: "FIXED"
- reasoning: brief explanation
- issues: array of found issues
- patched_content: the FULL corrected lesson content (include all original sections)

Lesson to analyze:
${largeLesson}`,
    4000
  ));

  // Test 4: Same test with higher maxTokens
  results.push(await runTest(
    'Large JSON with patched_content (8192 tokens)',
    `Return ONLY valid JSON. Include the full patched_content field with the corrected lesson content.`,
    `Analyze this lesson and return a JSON object:
- status: "FIXED"
- reasoning: brief explanation
- issues: array of found issues
- patched_content: the FULL corrected lesson content (include all original sections)

Lesson to analyze:
${largeLesson}`,
    8192
  ));

  // Test 5: Very high maxTokens
  results.push(await runTest(
    'Large JSON with patched_content (16000 tokens)',
    `Return ONLY valid JSON. Include the full patched_content field with the corrected lesson content.`,
    `Analyze this lesson and return a JSON object:
- status: "FIXED"
- reasoning: brief explanation
- issues: array of found issues
- patched_content: the FULL corrected lesson content (include all original sections)

Lesson to analyze:
${largeLesson}`,
    16000
  ));

  // Test 6: Explicit NO MARKDOWN instruction
  results.push(await runTest(
    'NO MARKDOWN - explicit instruction',
    `You are a JSON-only assistant. Return ONLY raw JSON.
CRITICAL: Do NOT wrap JSON in markdown code blocks.
Do NOT use \`\`\`json or \`\`\`.
Output ONLY the JSON object starting with { and ending with }.`,
    `Return a JSON object with:
- status: "FIXED"
- reasoning: "Fixed issues"
- issues: array with 2 items
- patched_content: the FULL lesson content below

Lesson:
${largeLesson}`,
    8192
  ));

  // Test 7: Different model - compare
  const testWithDifferentPrompt = await runTest(
    'Structured output instruction',
    `Output a single JSON object. No explanation, no markdown, no text before or after. Just JSON.`,
    `Generate this JSON structure exactly:
{
  "status": "FIXED",
  "reasoning": "Cleaned up formatting issues",
  "issues": [{"type": "HYGIENE", "severity": "FIXABLE", "location": "intro", "description": "Fixed whitespace"}],
  "patched_content": "${largeLesson.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
}`,
    8192
  );
  results.push(testWithDifferentPrompt);

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SUMMARY`);
  console.log(`${'═'.repeat(60)}`);

  for (const r of results) {
    const status = r.isValidJson ? '✅' : '❌';
    console.log(`  ${status} ${r.name}`);
    console.log(`     maxTokens: ${r.maxTokens}, output: ${r.outputTokens}, finish: ${r.finishReason}`);
  }

  const failedTests = results.filter(r => !r.isValidJson);
  if (failedTests.length > 0) {
    console.log(`\n  ⚠️  ${failedTests.length}/${results.length} tests produced invalid JSON`);
    console.log(`  Analysis:`);
    for (const r of failedTests) {
      if (r.finishReason === 'stop' && r.outputTokens < r.maxTokens * 0.8) {
        console.log(`    - ${r.name}: Model stopped early (${r.outputTokens}/${r.maxTokens} tokens)`);
        console.log(`      → Model quality issue, not token limit`);
      } else if (r.finishReason === 'length') {
        console.log(`    - ${r.name}: Hit token limit`);
        console.log(`      → Need higher maxTokens`);
      }
    }
  } else {
    console.log(`\n  ✅ All tests produced valid JSON`);
  }
}

main().catch(console.error);
