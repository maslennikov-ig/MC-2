#!/usr/bin/env node

/**
 * Model Evaluation Test: moonshotai/kimi-k2-thinking
 *
 * Tests the Moonshot Kimi K2 Thinking model on 4 test cases:
 * - Test 1: Metadata generation (English) - "Introduction to Python Programming"
 * - Test 2: Metadata generation (Russian) - "Машинное обучение для начинающих"
 * - Test 3: Lesson generation (English) - "Variables and Data Types in Python"
 * - Test 4: Lesson generation (Russian) - "Основы нейронных сетей"
 *
 * Output: Detailed results with token counts, cost, duration, and quality metrics
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL_ID = 'moonshotai/kimi-k2-thinking';

// Estimated pricing (to be verified from OpenRouter API response headers)
const ESTIMATED_PRICING = {
  inputPricePerMillion: 4.0,
  outputPricePerMillion: 12.0,
};

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_CASES = [
  {
    id: 'test_1_metadata_en',
    name: 'Metadata Generation - English Beginner',
    type: 'metadata',
    language: 'en',
    courseTitle: 'Introduction to Python Programming',
    prompt: `You are an expert course designer creating comprehensive metadata for an educational course.

**Course Title**: Introduction to Python Programming
**Target Language**: en
**Content Style**: conversational

**Scenario**: Create course metadata from title only using your knowledge base.

**Instructions**:
1. Infer course scope, difficulty, and target audience from the title
2. Generate comprehensive metadata based on typical courses in this domain
3. Ensure pedagogical soundness and coherent structure
4. Use your expertise to create realistic, implementable course design

**Generate the following metadata fields** (JSON format):

{
  "course_title": "string",
  "course_description": "string",
  "course_overview": "string",
  "target_audience": "string",
  "estimated_duration_hours": 0,
  "difficulty_level": "beginner",
  "prerequisites": [],
  "learning_outcomes": [
    {
      "id": "uuid-string",
      "text": "string",
      "language": "en",
      "cognitiveLevel": "remember",
      "estimatedDuration": 10,
      "targetAudienceLevel": "beginner"
    }
  ],
  "assessment_strategy": {
    "quiz_per_section": true,
    "final_exam": true,
    "practical_projects": 2,
    "assessment_description": "string"
  },
  "course_tags": []
}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs
2. Course overview must comprehensively describe course content
3. All text fields must be coherent and professionally written

**Output Format**: Valid JSON only, no markdown, no explanations.`,
    expectedOutputLength: { min: 400, max: 2000 },
  },
  {
    id: 'test_2_metadata_ru',
    name: 'Metadata Generation - Russian Intermediate',
    type: 'metadata',
    language: 'ru',
    courseTitle: 'Машинное обучение для начинающих',
    prompt: `You are an expert course designer creating comprehensive metadata for an educational course.

**Course Title**: Машинное обучение для начинающих
**Target Language**: ru
**Content Style**: conversational

**Scenario**: Create course metadata from title only using your knowledge base.

**Instructions**:
1. Infer course scope, difficulty, and target audience from the title
2. Generate comprehensive metadata based on typical courses in this domain
3. Ensure pedagogical soundness and coherent structure
4. Use your expertise to create realistic, implementable course design

**Generate the following metadata fields** (JSON format):

{
  "course_title": "string",
  "course_description": "string",
  "course_overview": "string",
  "target_audience": "string",
  "estimated_duration_hours": 0,
  "difficulty_level": "beginner",
  "prerequisites": [],
  "learning_outcomes": [
    {
      "id": "uuid-string",
      "text": "string",
      "language": "ru",
      "cognitiveLevel": "remember",
      "estimatedDuration": 10,
      "targetAudienceLevel": "beginner"
    }
  ],
  "assessment_strategy": {
    "quiz_per_section": true,
    "final_exam": true,
    "practical_projects": 2,
    "assessment_description": "string"
  },
  "course_tags": []
}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs
2. Course overview must comprehensively describe course content
3. All text fields must be coherent and professionally written

**Output Format**: Valid JSON only, no markdown, no explanations.`,
    expectedOutputLength: { min: 400, max: 2000 },
  },
  {
    id: 'test_3_lesson_en',
    name: 'Lesson Generation - English Programming',
    type: 'lesson',
    language: 'en',
    courseTitle: 'Python Programming',
    prompt: `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: Python Programming
- Target Language: en
- Content Style: conversational

**Section to Expand** (Section 1):
- Section Title: Variables and Data Types
- Learning Objectives: Understand variable assignment; Apply type conversion
- Key Topics: Variables, Data Types, Type Conversion
- Estimated Lessons: 3

**Your Task**: Expand this section into 3-5 detailed lessons with exercises.

**Constraints**:
1. Generate 3 lessons (can be 3-5 if pedagogically justified)
2. Each lesson must have 1-5 SMART objectives
3. Each lesson must have 2-10 key topics
4. Each lesson 3-45 minutes (realistic duration)
5. Each lesson must have 3-5 exercises
6. Lessons must follow logical progression
7. All content in en

**Output Format**: Valid JSON structure

{
  "section_number": 1,
  "section_title": "Variables and Data Types",
  "section_description": "string",
  "learning_objectives": [],
  "estimated_duration_minutes": 45,
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "string",
      "lesson_objectives": [],
      "key_topics": [],
      "estimated_duration_minutes": 15,
      "practical_exercises": []
    }
  ]
}

**Quality Requirements**:
- Objectives must be measurable with action verbs
- Topics must be specific
- Exercises must be actionable
- Duration must be realistic

**Output**: Valid JSON only, no markdown, no explanations.`,
    expectedOutputLength: { min: 1000, max: 5000 },
  },
  {
    id: 'test_4_lesson_ru',
    name: 'Lesson Generation - Russian Theory',
    type: 'lesson',
    language: 'ru',
    courseTitle: 'Машинное обучение',
    prompt: `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: Машинное обучение
- Target Language: ru
- Content Style: conversational

**Section to Expand** (Section 1):
- Section Title: Основы нейронных сетей
- Learning Objectives: Понять базовые концепции; Применить знания на практике
- Key Topics: Нейроны, Слои, Активационные функции
- Estimated Lessons: 3

**Your Task**: Expand this section into 3-5 detailed lessons with exercises.

**Constraints**:
1. Generate 3 lessons (can be 3-5 if pedagogically justified)
2. Each lesson must have 1-5 SMART objectives
3. Each lesson must have 2-10 key topics
4. Each lesson 3-45 minutes (realistic duration)
5. Each lesson must have 3-5 exercises
6. Lessons must follow logical progression
7. All content in ru

**Output Format**: Valid JSON structure

{
  "section_number": 1,
  "section_title": "Основы нейронных сетей",
  "section_description": "string",
  "learning_objectives": [],
  "estimated_duration_minutes": 45,
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "string",
      "lesson_objectives": [],
      "key_topics": [],
      "estimated_duration_minutes": 15,
      "practical_exercises": []
    }
  ]
}

**Quality Requirements**:
- Objectives must be measurable with action verbs
- Topics must be specific
- Exercises must be actionable
- Duration must be realistic

**Output**: Valid JSON only, no markdown, no explanations.`,
    expectedOutputLength: { min: 1000, max: 5000 },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateJSON(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    return { valid: true, data: parsed };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

function validateMetadataSchema(data) {
  if (!data || typeof data !== 'object') return false;

  const requiredFields = [
    'course_title',
    'course_description',
    'course_overview',
    'target_audience',
    'estimated_duration_hours',
    'difficulty_level',
    'prerequisites',
    'learning_outcomes',
    'assessment_strategy',
    'course_tags',
  ];

  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }

  if (!['beginner', 'intermediate', 'advanced'].includes(data.difficulty_level)) {
    return false;
  }

  if (!Array.isArray(data.learning_outcomes)) return false;

  return true;
}

function validateLessonSchema(data) {
  if (!data || typeof data !== 'object') return false;

  if (!data.lessons || !Array.isArray(data.lessons)) return false;
  if (data.lessons.length === 0) return false;

  const lesson = data.lessons[0];
  if (!lesson.lesson_title || !Array.isArray(lesson.practical_exercises)) {
    return false;
  }

  return true;
}

function assessContentQuality(output, type, language) {
  let score = 1.0;

  if (type === 'metadata') {
    if (!output.course_title || output.course_title.length < 10) {
      score -= 0.2;
    }

    if (!output.course_description || output.course_description.length < 50) {
      score -= 0.2;
    }

    if (!output.learning_outcomes || output.learning_outcomes.length < 3) {
      score -= 0.15;
    }

    const allText = JSON.stringify(output).toLowerCase();
    if (allText.includes('lorem ipsum') || allText.includes('todo') || allText.includes('[insert]')) {
      score -= 0.15;
    }
  } else {
    if (!output.lessons || output.lessons.length < 3) {
      score -= 0.15;
    }

    const lesson = output.lessons?.[0];
    if (!lesson || !lesson.lesson_objectives || lesson.lesson_objectives.length === 0) {
      score -= 0.2;
    }

    if (!lesson?.practical_exercises || lesson.practical_exercises.length < 3) {
      score -= 0.2;
    }

    const allText = JSON.stringify(output).toLowerCase();
    if (allText.includes('lorem ipsum') || allText.includes('todo') || allText.includes('[insert]')) {
      score -= 0.15;
    }
  }

  return Math.max(0, score);
}

function detectLanguage(text) {
  const russianCharCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const englishCharCount = (text.match(/[a-zA-Z]/g) || []).length;

  if (russianCharCount > englishCharCount) {
    return 'ru';
  }
  return 'en';
}

async function callOpenRouter(prompt, maxTokens = 8000) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
  }

  return await response.json();
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runTests() {
  const results = [];

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Model Evaluation: ${MODEL_ID}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(80)}\n`);

  for (const testCase of TEST_CASES) {
    console.log(`Running Test: ${testCase.id} - ${testCase.name}...`);
    const startTime = Date.now();

    const result = {
      testId: testCase.id,
      testName: testCase.name,
      type: testCase.type,
      language: testCase.language,
      status: 'success',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      durationMs: 0,
      outputLength: 0,
      schemaCompliance: false,
      contentQuality: 0,
      language_consistency: false,
    };

    try {
      const response = await callOpenRouter(testCase.prompt);

      result.inputTokens = response.usage.prompt_tokens;
      result.outputTokens = response.usage.completion_tokens;
      result.totalTokens = response.usage.total_tokens;

      const inputCost = (result.inputTokens / 1000000) * ESTIMATED_PRICING.inputPricePerMillion;
      const outputCost = (result.outputTokens / 1000000) * ESTIMATED_PRICING.outputPricePerMillion;
      result.costUSD = inputCost + outputCost;

      result.durationMs = Date.now() - startTime;

      const outputContent = response.choices[0].message.content;
      result.rawOutput = outputContent;
      result.outputLength = outputContent.length;

      let jsonMatch = outputContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        const lines = outputContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('{')) {
            const remaining = lines.slice(i).join('\n');
            jsonMatch = remaining.match(/\{[\s\S]*\}/);
            if (jsonMatch) break;
          }
        }
      }

      if (!jsonMatch) {
        result.status = 'failed';
        result.error = 'No JSON found in response';
        result.schemaCompliance = false;
        results.push(result);
        console.log(`  ✗ Failed: No JSON found in response\n`);
        continue;
      }

      const jsonValidation = validateJSON(jsonMatch[0]);
      if (!jsonValidation.valid) {
        result.status = 'failed';
        result.error = `Invalid JSON: ${jsonValidation.error}`;
        result.schemaCompliance = false;
        results.push(result);
        console.log(`  ✗ Failed: ${result.error}\n`);
        continue;
      }

      result.output = jsonValidation.data;

      if (testCase.type === 'metadata') {
        result.schemaCompliance = validateMetadataSchema(result.output);
      } else {
        result.schemaCompliance = validateLessonSchema(result.output);
      }

      result.contentQuality = assessContentQuality(
        result.output,
        testCase.type,
        testCase.language
      );

      const detectedLanguage = detectLanguage(outputContent);
      result.language_consistency = detectedLanguage === testCase.language;

      result.status = result.schemaCompliance ? 'success' : 'failed';

      console.log(`  ✓ Success`);
      console.log(`    - Tokens: ${result.totalTokens} (input: ${result.inputTokens}, output: ${result.outputTokens})`);
      console.log(`    - Cost: $${result.costUSD.toFixed(6)}`);
      console.log(`    - Duration: ${result.durationMs}ms`);
      console.log(`    - Schema Compliant: ${result.schemaCompliance}`);
      console.log(`    - Quality Score: ${(result.contentQuality * 100).toFixed(1)}%`);
      console.log(`    - Language Consistent: ${result.language_consistency}`);
      console.log();
    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      console.log(`  ✗ Error: ${result.error}\n`);
    }

    results.push(result);
  }

  return results;
}

// ============================================================================
// RESULTS REPORTING
// ============================================================================

function generateMarkdownReport(results) {
  let md = `# Model Evaluation Results: ${MODEL_ID}

**Date**: ${new Date().toISOString().split('T')[0]}
**Model**: ${MODEL_ID}
**Test Cases**: ${results.length}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | ${results.length} |
| **Successful** | ${results.filter(r => r.status === 'success').length} |
| **Failed** | ${results.filter(r => r.status === 'failed').length} |
| **Errors** | ${results.filter(r => r.status === 'error').length} |
| **Total Cost** | $${results.reduce((sum, r) => sum + r.costUSD, 0).toFixed(4)} |
| **Average Quality Score** | ${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length * 100).toFixed(1)}% |
| **Schema Compliance Rate** | ${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}% |
| **Total Duration** | ${results.reduce((sum, r) => sum + r.durationMs, 0)}ms |
| **Avg Duration per Test** | ${(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length).toFixed(0)}ms |

---

## Detailed Results

`;

  for (const result of results) {
    md += `### Test ${result.testId}: ${result.testName}

**Status**: ${result.status === 'success' ? '✓ Success' : result.status === 'failed' ? '✗ Failed' : '⚠️ Error'}

| Metric | Value |
|--------|-------|
| **Input Tokens** | ${result.inputTokens.toLocaleString()} |
| **Output Tokens** | ${result.outputTokens.toLocaleString()} |
| **Total Tokens** | ${result.totalTokens.toLocaleString()} |
| **Cost (USD)** | $${result.costUSD.toFixed(6)} |
| **Duration (ms)** | ${result.durationMs} |
| **Output Length** | ${result.outputLength.toLocaleString()} chars |
| **Schema Compliant** | ${result.schemaCompliance ? '✓ Yes' : '✗ No'} |
| **Content Quality** | ${(result.contentQuality * 100).toFixed(1)}% |
| **Language Consistency** | ${result.language_consistency ? '✓ Yes' : '✗ No'} |

`;

    if (result.error) {
      md += `**Error**: ${result.error}\n\n`;
    }

    if (result.output) {
      const outputPreview = JSON.stringify(result.output, null, 2);
      md += `**Output Preview**:
\`\`\`json
${outputPreview.substring(0, 1000)}${
        outputPreview.length > 1000 ? '\n... (truncated)' : ''
      }
\`\`\`

`;
    }

    md += `---

`;
  }

  md += `## Cost Analysis

| Test | Type | Input | Output | Total | Cost |
|------|------|-------|--------|-------|------|
`;

  for (const result of results) {
    md += `| ${result.testId} | ${result.type} | ${result.inputTokens.toLocaleString()} | ${result.outputTokens.toLocaleString()} | ${result.totalTokens.toLocaleString()} | $${result.costUSD.toFixed(6)} |
`;
  }

  const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCost = results.reduce((sum, r) => sum + r.costUSD, 0);

  md += `| **TOTAL** | - | - | - | ${totalTokens.toLocaleString()} | **$${totalCost.toFixed(4)}** |

---

## Quality Assessment

| Test | Quality Score | Schema | Language | Status |
|------|---------------|--------|----------|--------|
`;

  for (const result of results) {
    const qualityScore = (result.contentQuality * 100).toFixed(1);
    md += `| ${result.testId} | ${qualityScore}% | ${result.schemaCompliance ? '✓' : '✗'} | ${result.language_consistency ? '✓' : '✗'} | ${result.status} |
`;
  }

  md += `

---

## Pricing Analysis

**Note**: Pricing based on estimated rates (\`$${ESTIMATED_PRICING.inputPricePerMillion} input / $${ESTIMATED_PRICING.outputPricePerMillion} output per 1M tokens).
Actual pricing should be verified from OpenRouter API documentation.

**Total Test Cost**: $${totalCost.toFixed(4)}
**Estimated Cost per Metadata Generation**: $${(results.filter(r => r.type === 'metadata').reduce((sum, r) => sum + r.costUSD, 0) / results.filter(r => r.type === 'metadata').length).toFixed(6)}
**Estimated Cost per Lesson Generation**: $${(results.filter(r => r.type === 'lesson').reduce((sum, r) => sum + r.costUSD, 0) / results.filter(r => r.type === 'lesson').length).toFixed(6)}

---

## Comparison to Baseline

**Baseline Model**: qwen/qwen3-max
- **Input Cost**: $1.20 per 1M tokens
- **Output Cost**: $6.00 per 1M tokens
- **Target Quality**: ≥ 0.80
- **Target Cost Reduction**: ≥ 30% ($0.63 → $0.44 per course)

### Model Performance vs Targets

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Average Quality | ≥ 0.75 | ${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length).toFixed(3)} | ${results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length >= 0.75 ? '✓' : '✗'} |
| Schema Compliance | ≥ 95% | ${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}% | ${results.filter(r => r.schemaCompliance).length / results.length >= 0.95 ? '✓' : '✗'} |
| Success Rate | 100% | ${(results.filter(r => r.status === 'success').length / results.length * 100).toFixed(1)}% | ${results.filter(r => r.status === 'success').length === results.length ? '✓' : '✗'} |

---

## Recommendations

${
  results.filter(r => r.status === 'success').length === results.length &&
  results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length >= 0.75 &&
  results.filter(r => r.schemaCompliance).length / results.length >= 0.95
    ? `✓ **VIABLE ALTERNATIVE**: This model meets minimum criteria for deployment.

**Strengths**:
- All tests passed successfully (${results.filter(r => r.status === 'success').length}/${results.length})
- Average quality score: ${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length * 100).toFixed(1)}% (≥75% required)
- Schema compliance rate: ${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}% (≥95% required)
- Average cost per test: $${(totalCost / results.length).toFixed(6)}

**Next Steps**:
1. Run full 10-model comparison across all candidates
2. Verify actual pricing with OpenRouter support
3. Implement cost calculator integration if cost-effective
4. Add feature flag for gradual rollout (10% → 50% → 100%)
5. Monitor production quality metrics (Jina-v3 similarity scores)`
    : `⚠️ **FURTHER INVESTIGATION NEEDED**: Review results below.

**Issues Detected**:
${results.filter(r => r.status !== 'success').length > 0 ? `- ${results.filter(r => r.status !== 'success').length} test(s) failed or errored` : ''}
${results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length < 0.75 ? `- Average quality (${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length * 100).toFixed(1)}%) below 75% threshold` : ''}
${results.filter(r => r.schemaCompliance).length / results.length < 0.95 ? `- Schema compliance (${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}%) below 95% threshold` : ''}

**Recommendations**:
1. Adjust prompts for better schema adherence
2. Increase max_tokens if output is being truncated
3. Consider different temperature settings
4. Document failures for detailed analysis`
}

---

**Report Generated**: ${new Date().toISOString()}
`;

  return md;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  try {
    const results = await runTests();

    const report = generateMarkdownReport(results);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const outputPath = path.join(
      __dirname,
      'docs',
      'investigations',
      'model-eval-kimi-k2-thinking.md'
    );

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, report);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Results saved to: ${outputPath}`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(report);

    const allSuccessful = results.every(r => r.status === 'success');
    process.exit(allSuccessful ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
