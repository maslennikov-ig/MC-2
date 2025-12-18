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

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL_ID = 'moonshotai/kimi-k2-thinking';

// Estimated pricing (to be verified from OpenRouter API response headers)
// Using conservative estimates based on similar models
const ESTIMATED_PRICING = {
  inputPricePerMillion: 4.0,  // Thinking models typically expensive
  outputPricePerMillion: 12.0,
};

// ============================================================================
// TEST DATA
// ============================================================================

interface TestCase {
  id: string;
  name: string;
  type: 'metadata' | 'lesson';
  language: string;
  courseTitle: string;
  prompt: string;
  expectedOutputLength: { min: number; max: number };
}

const TEST_CASES: TestCase[] = [
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
  "course_title": string (10-1000 chars),
  "course_description": string (50-3000 chars - elevator pitch),
  "course_overview": string (100-10000 chars - comprehensive overview),
  "target_audience": string (20-1500 chars),
  "estimated_duration_hours": number (positive),
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[] (0-10 items, 10-600 chars each),
  "learning_outcomes": [
    {
      "id": string (UUID),
      "text": string (10-500 chars, measurable objective),
      "language": "en",
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "estimatedDuration": number (5-15 minutes),
      "targetAudienceLevel": "beginner" | "intermediate" | "advanced"
    }
  ] (3-15 outcomes),
  "assessment_strategy": {
    "quiz_per_section": boolean,
    "final_exam": boolean,
    "practical_projects": number (0-10),
    "assessment_description": string (50-1500 chars)
  },
  "course_tags": string[] (5-20 tags, max 150 chars each)
}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs (Bloom's taxonomy)
2. Course overview must comprehensively describe course content and value
3. Target audience must clearly define who will benefit from this course
4. Assessment strategy must align with pedagogical approach and learning outcomes
5. All text fields must be coherent and professionally written

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
  "course_title": string (10-1000 chars),
  "course_description": string (50-3000 chars - elevator pitch),
  "course_overview": string (100-10000 chars - comprehensive overview),
  "target_audience": string (20-1500 chars),
  "estimated_duration_hours": number (positive),
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[] (0-10 items, 10-600 chars each),
  "learning_outcomes": [
    {
      "id": string (UUID),
      "text": string (10-500 chars, measurable objective),
      "language": "ru",
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "estimatedDuration": number (5-15 minutes),
      "targetAudienceLevel": "beginner" | "intermediate" | "advanced"
    }
  ] (3-15 outcomes),
  "assessment_strategy": {
    "quiz_per_section": boolean,
    "final_exam": boolean,
    "practical_projects": number (0-10),
    "assessment_description": string (50-1500 chars)
  },
  "course_tags": string[] (5-20 tags, max 150 chars each)
}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs (Bloom's taxonomy)
2. Course overview must comprehensively describe course content and value
3. Target audience must clearly define who will benefit from this course
4. Assessment strategy must align with pedagogical approach and learning outcomes
5. All text fields must be coherent and professionally written

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
- Learning Objectives (section-level): Understand variable assignment and basic data types; Apply type conversion in practical scenarios
- Key Topics: Variables, Data Types, Type Conversion, Memory Management
- Estimated Lessons: 3

**Your Task**: Expand this section into 3-5 detailed lessons.

**Constraints**:
1. **Lesson Breakdown**: Generate 3 lessons (can be 3-5 if pedagogically justified)
2. **Learning Objectives** (FR-011): Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - FR-030: Apply conversational style to objectives
3. **Key Topics** (FR-011): Each lesson must have 2-10 specific key topics
4. **Estimated Duration** (FR-011): Each lesson 3-45 minutes (realistic for content scope)
5. **Practical Exercises** (FR-010): Each lesson must have 3-5 exercises from these types:
   - self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection
6. **Coherence**: Lessons must follow logical progression, build on prerequisites
7. **Language**: All content in en

**Output Format**: Valid JSON matching this structure (1 section with 3-5 lessons):

{
  "section_number": 1,
  "section_title": "Variables and Data Types",
  "section_description": "50-500 char comprehensive section overview",
  "learning_objectives": [
    {
      "id": "uuid-v4",
      "text": "Measurable objective with action verb",
      "language": "en",
      "cognitiveLevel": "remember|understand|apply|analyze|evaluate|create",
      "estimatedDuration": 5-15,
      "targetAudienceLevel": "beginner|intermediate|advanced"
    }
  ],
  "estimated_duration_minutes": 15-180,
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "Engaging lesson title (5-500 chars)",
      "lesson_objectives": [
        {
          "id": "uuid-v4",
          "text": "SMART objective (conversational style)",
          "language": "en",
          "cognitiveLevel": "apply",
          "estimatedDuration": 10,
          "targetAudienceLevel": "beginner"
        }
      ],
      "key_topics": ["Topic 1 (conversational framing)", "Topic 2", "Topic 3"],
      "estimated_duration_minutes": 5-45,
      "practical_exercises": [
        {
          "exercise_type": "hands_on",
          "exercise_title": "Exercise title (5-300 chars)",
          "exercise_description": "Detailed instructions (10-1500 chars)"
        }
      ]
    }
  ]
}

**Quality Requirements**:
- Objectives must be measurable (use action verbs: analyze, create, implement, NOT "understand", "know")
- Topics must be specific (NOT generic like "Introduction", "Overview")
- Exercises must be actionable with clear instructions
- Duration must be realistic for content scope

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
- Learning Objectives (section-level): Понять базовые концепции нейронных сетей; Применить знания на практических примерах
- Key Topics: Нейроны, Слои, Активационные функции, Обучение
- Estimated Lessons: 3

**Your Task**: Expand this section into 3-5 detailed lessons.

**Constraints**:
1. **Lesson Breakdown**: Generate 3 lessons (can be 3-5 if pedagogically justified)
2. **Learning Objectives** (FR-011): Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - FR-030: Apply conversational style to objectives
3. **Key Topics** (FR-011): Each lesson must have 2-10 specific key topics
4. **Estimated Duration** (FR-011): Each lesson 3-45 minutes (realistic for content scope)
5. **Practical Exercises** (FR-010): Each lesson must have 3-5 exercises from these types:
   - self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection
6. **Coherence**: Lessons must follow logical progression, build on prerequisites
7. **Language**: All content in ru

**Output Format**: Valid JSON matching this structure (1 section with 3-5 lessons):

{
  "section_number": 1,
  "section_title": "Основы нейронных сетей",
  "section_description": "50-500 char comprehensive section overview",
  "learning_objectives": [
    {
      "id": "uuid-v4",
      "text": "Measurable objective with action verb",
      "language": "ru",
      "cognitiveLevel": "remember|understand|apply|analyze|evaluate|create",
      "estimatedDuration": 5-15,
      "targetAudienceLevel": "beginner|intermediate|advanced"
    }
  ],
  "estimated_duration_minutes": 15-180,
  "lessons": [
    {
      "lesson_number": 1,
      "lesson_title": "Engaging lesson title (5-500 chars)",
      "lesson_objectives": [
        {
          "id": "uuid-v4",
          "text": "SMART objective (conversational style)",
          "language": "ru",
          "cognitiveLevel": "apply",
          "estimatedDuration": 10,
          "targetAudienceLevel": "beginner"
        }
      ],
      "key_topics": ["Topic 1 (conversational framing)", "Topic 2", "Topic 3"],
      "estimated_duration_minutes": 5-45,
      "practical_exercises": [
        {
          "exercise_type": "hands_on",
          "exercise_title": "Exercise title (5-300 chars)",
          "exercise_description": "Detailed instructions (10-1500 chars)"
        }
      ]
    }
  ]
}

**Quality Requirements**:
- Objectives must be measurable (use action verbs: analyze, create, implement, NOT "understand", "know")
- Topics must be specific (NOT generic like "Introduction", "Overview")
- Exercises must be actionable with clear instructions
- Duration must be realistic for content scope

**Output**: Valid JSON only, no markdown, no explanations.`,
    expectedOutputLength: { min: 1000, max: 5000 },
  },
];

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface APIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface TestResult {
  testId: string;
  testName: string;
  type: 'metadata' | 'lesson';
  language: string;
  status: 'success' | 'failed' | 'error';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  durationMs: number;
  outputLength: number;
  schemaCompliance: boolean;
  contentQuality: number; // 0-1 scale
  language_consistency: boolean;
  output?: any;
  error?: string;
  rawOutput?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function estimateTokens(text: string): number {
  // Rough approximation: 4 chars ≈ 1 token (English)
  return Math.ceil(text.length / 4);
}

function validateJSON(jsonStr: string): { valid: boolean; data?: any; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    return { valid: true, data: parsed };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown JSON parse error'
    };
  }
}

function validateMetadataSchema(data: any): boolean {
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

  // Validate difficulty_level enum
  if (!['beginner', 'intermediate', 'advanced'].includes(data.difficulty_level)) {
    return false;
  }

  // Validate learning_outcomes is array
  if (!Array.isArray(data.learning_outcomes)) return false;

  return true;
}

function validateLessonSchema(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  if (!data.lessons || !Array.isArray(data.lessons)) return false;
  if (data.lessons.length === 0) return false;

  // Check first lesson structure
  const lesson = data.lessons[0];
  if (!lesson.lesson_title || !Array.isArray(lesson.practical_exercises)) {
    return false;
  }

  return true;
}

function assessContentQuality(
  output: any,
  type: 'metadata' | 'lesson',
  language: string
): number {
  let score = 1.0;

  if (type === 'metadata') {
    // Check course_title length and content
    if (!output.course_title || output.course_title.length < 10) {
      score -= 0.2;
    }

    // Check description quality
    if (!output.course_description || output.course_description.length < 50) {
      score -= 0.2;
    }

    // Check learning outcomes
    if (!output.learning_outcomes || output.learning_outcomes.length < 3) {
      score -= 0.15;
    }

    // Check for placeholder text
    const allText = JSON.stringify(output).toLowerCase();
    if (allText.includes('lorem ipsum') || allText.includes('todo') || allText.includes('[insert]')) {
      score -= 0.15;
    }
  } else {
    // Lesson schema check
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

    // Check for placeholder text
    const allText = JSON.stringify(output).toLowerCase();
    if (allText.includes('lorem ipsum') || allText.includes('todo') || allText.includes('[insert]')) {
      score -= 0.15;
    }
  }

  return Math.max(0, score);
}

function detectLanguage(text: string): string {
  // Simple language detection
  const russianCharCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const engishCharCount = (text.match(/[a-zA-Z]/g) || []).length;

  if (russianCharCount > engishCharCount) {
    return 'ru';
  }
  return 'en';
}

// ============================================================================
// API CALL FUNCTION
// ============================================================================

async function callOpenRouter(prompt: string, maxTokens: number = 8000): Promise<APIResponse> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  const response = await axios.post(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      model: MODEL_ID,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minutes timeout
    }
  );

  return response.data;
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Model Evaluation: ${MODEL_ID}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(80)}\n`);

  for (const testCase of TEST_CASES) {
    console.log(`Running Test: ${testCase.id} - ${testCase.name}...`);
    const startTime = Date.now();

    const result: TestResult = {
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

      // Calculate cost
      const inputCost = (result.inputTokens / 1000000) * ESTIMATED_PRICING.inputPricePerMillion;
      const outputCost = (result.outputTokens / 1000000) * ESTIMATED_PRICING.outputPricePerMillion;
      result.costUSD = inputCost + outputCost;

      result.durationMs = Date.now() - startTime;

      const outputContent = response.choices[0].message.content;
      result.rawOutput = outputContent;
      result.outputLength = outputContent.length;

      // Try to extract JSON
      let jsonMatch = outputContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Try alternative extraction
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

      // Validate schema
      if (testCase.type === 'metadata') {
        result.schemaCompliance = validateMetadataSchema(result.output);
      } else {
        result.schemaCompliance = validateLessonSchema(result.output);
      }

      // Assess content quality
      result.contentQuality = assessContentQuality(
        result.output,
        testCase.type,
        testCase.language
      );

      // Check language consistency
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
      result.error = error instanceof Error ? error.message : 'Unknown error';
      console.log(`  ✗ Error: ${result.error}\n`);
    }

    results.push(result);
  }

  return results;
}

// ============================================================================
// RESULTS REPORTING
// ============================================================================

function generateMarkdownReport(results: TestResult[]): string {
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
      md += `**Output Preview**:
\`\`\`json
${JSON.stringify(result.output, null, 2).substring(0, 1000)}${
        JSON.stringify(result.output, null, 2).length > 1000 ? '\n... (truncated)' : ''
      }
\`\`\`

`;
    }

    md += `---

`;
  }

  // Cost analysis
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

## Pricing Estimate

**Note**: Pricing based on estimated rates (${ESTIMATED_PRICING.inputPricePerMillion}/\`$${ESTIMATED_PRICING.outputPricePerMillion} per 1M tokens).
Actual pricing should be verified from OpenRouter API response headers.

**Total Test Cost**: $${totalCost.toFixed(4)}
**Estimated Cost per Metadata Generation**: $${(results.filter(r => r.type === 'metadata').reduce((sum, r) => sum + r.costUSD, 0) / results.filter(r => r.type === 'metadata').length).toFixed(6)}
**Estimated Cost per Lesson Generation**: $${(results.filter(r => r.type === 'lesson').reduce((sum, r) => sum + r.costUSD, 0) / results.filter(r => r.type === 'lesson').length).toFixed(6)}

---

## Comparison Baseline

**Target Quality Score**: ≥ 0.75 (vs Qwen 3 Max baseline ≥ 0.80)
**Target Cost Reduction**: ≥ 30% (from $0.63 to $0.44 per course)
**Target Schema Compliance**: ≥ 95%

### Results vs Targets

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
    ? `✓ **VIABLE ALTERNATIVE**: This model meets minimum criteria for deployment as alternative to Qwen 3 Max.

**Strengths**:
- All tests passed successfully
- Quality score meets minimum threshold (${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length * 100).toFixed(1)}% ≥ 75%)
- Schema compliance rate exceeds requirement (${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}% ≥ 95%)

**Next Steps**:
1. Run full 10-model comparison across all candidates
2. Verify pricing with OpenRouter support
3. Implement cost calculator integration
4. Add feature flag for gradual rollout (10% → 50% → 100%)
5. Monitor production quality metrics for 2 weeks`
    : `⚠️ **FURTHER INVESTIGATION NEEDED**: This model may not meet all criteria.

**Issues**:
${results.filter(r => r.status !== 'success').length > 0 ? `- ${results.filter(r => r.status !== 'success').length} tests failed or errored` : ''}
${results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length < 0.75 ? `- Average quality score (${(results.reduce((sum, r) => sum + r.contentQuality, 0) / results.length * 100).toFixed(1)}%) below threshold (75%)` : ''}
${results.filter(r => r.schemaCompliance).length / results.length < 0.95 ? `- Schema compliance rate (${(results.filter(r => r.schemaCompliance).length / results.length * 100).toFixed(1)}%) below threshold (95%)` : ''}

**Recommendations**:
1. Adjust prompts for better schema adherence
2. Increase max_tokens if output is being truncated
3. Consider different temperature or model variant
4. Document failures for OpenRouter support`
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

    // Generate markdown report
    const report = generateMarkdownReport(results);

    // Write to file
    const outputPath = path.join(
      __dirname,
      '..',
      'docs',
      'investigations',
      'model-eval-kimi-k2-thinking.md'
    );

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, report);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Results saved to: ${outputPath}`);
    console.log(`${'='.repeat(80)}\n`);

    // Print summary
    console.log(report);

    // Exit with appropriate code
    const allSuccessful = results.every(r => r.status === 'success');
    process.exit(allSuccessful ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
