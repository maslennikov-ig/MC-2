/**
 * Unit Test: Qwen3-235B Direct Section Generation Testing
 * @module tests/unit/stage5/qwen3-section-generation
 *
 * Purpose: Isolate and test qwen3-235b section generation WITHOUT full E2E pipeline
 * to determine if T053 failures are model-specific or prompt-specific.
 *
 * Test Scenarios (4 A/B comparisons):
 * 1. Baseline: Current prompt + qwen3-235b
 * 2. Control: Same prompt + gpt-oss-120b
 * 3. Variation 1: Simplified Russian prompt + qwen3-235b
 * 4. Variation 2: Explicit Zod schema in prompt + qwen3-235b
 *
 * Reference:
 * - Failed T053 run: Course ID 6841dba7-cd01-4f1d-ad2e-f48ae4fdae7a
 * - Investigation: INV-2025-11-17-007-qwen3-section-quality.md
 * - Task: T053 Section 1.1 (Qwen3-235b Direct Testing)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';
import { SectionSchema } from '@megacampus/shared-types/generation-result';
import { UnifiedRegenerator } from '@/shared/regeneration';
import type { Section } from '@megacampus/shared-types';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODELS = {
  qwen3_235b: 'qwen/qwen3-235b-a22b-thinking-2507',
  gpt_oss_120b: 'openai/gpt-oss-120b',
} as const;

const TEST_SECTION_CONTEXT = {
  sectionIndex: 0,
  sectionTitle: 'Основы продаж билетов на массовые мероприятия',
  learningObjectives: [
    'Понимать процесс продажи билетов на крупные образовательные мероприятия',
    'Применять техники работы с клиентами в контексте продажи билетов',
    'Использовать AMO CRM для управления продажами',
  ],
  keyTopics: [
    'Процесс продажи билетов',
    'Работа с клиентами',
    'AMO CRM интеграция',
    'Регулярный менеджмент продаж',
  ],
  estimatedLessons: 4,
  courseTitle: 'Курс по продажам билетов на образовательные мероприятия',
  difficulty: 'intermediate',
  language: 'ru',
};

type TestScenario = {
  name: string;
  model: string;
  promptType: 'baseline' | 'simplified' | 'schema-explicit';
  description: string;
};

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'Baseline: qwen3-235b + Current Prompt',
    model: MODELS.qwen3_235b,
    promptType: 'baseline',
    description: 'Exact prompt used in failed T053 run',
  },
  {
    name: 'Control: gpt-oss-120b + Same Prompt',
    model: MODELS.gpt_oss_120b,
    promptType: 'baseline',
    description: 'Baseline comparison with known-good model',
  },
  {
    name: 'Variation 1: qwen3-235b + Simplified Prompt',
    model: MODELS.qwen3_235b,
    promptType: 'simplified',
    description: 'Simpler Russian prompt without complex constraints',
  },
  {
    name: 'Variation 2: qwen3-235b + Explicit Schema',
    model: MODELS.qwen3_235b,
    promptType: 'schema-explicit',
    description: 'Prompt with explicit Zod schema in system message',
  },
];

// ============================================================================
// Prompt Builders
// ============================================================================

function buildBaselinePrompt(context: typeof TEST_SECTION_CONTEXT): string {
  return `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: ${context.courseTitle}
- Target Language: ${context.language}
- Content Style: Профессиональный, практико-ориентированный

**Section to Expand** (Section ${context.sectionIndex + 1}):
- Section Title: ${context.sectionTitle}
- Learning Objectives (section-level): ${context.learningObjectives.join('; ')}
- Key Topics: ${context.keyTopics.join(', ')}
- Estimated Lessons: ${context.estimatedLessons}

**Analysis Context** (from Stage 4):
- Difficulty: ${context.difficulty}
- Category: professional
- Topic: Продажи билетов и управление продажами

**Your Task**: Expand this section into ${context.estimatedLessons} detailed lessons.

**Constraints**:
1. **Lesson Breakdown**: Generate ${context.estimatedLessons} lessons (can be 3-5 if pedagogically justified)
2. **Learning Objectives**: Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
3. **Key Topics**: Each lesson must have 2-10 specific key topics
4. **Estimated Duration**: Each lesson 3-45 minutes (realistic for content scope)
5. **Practical Exercises**: Each lesson must have 3-5 exercises from these types:
   - self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection
6. **Coherence**: Lessons must follow logical progression, build on prerequisites
7. **Language**: All content in ${context.language}

**Output Format**: Valid JSON matching this structure (1 section with ${context.estimatedLessons} lessons):

{
  "section_number": ${context.sectionIndex + 1},
  "section_title": "${context.sectionTitle}",
  "section_description": "50-500 char comprehensive section overview",
  "learning_objectives": [
    {
      "id": "uuid-v4",
      "text": "Measurable objective with action verb",
      "language": "${context.language}",
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
          "text": "SMART objective",
          "language": "${context.language}",
          "cognitiveLevel": "apply",
          "estimatedDuration": 10,
          "targetAudienceLevel": "intermediate"
        }
      ],
      "key_topics": ["Topic 1", "Topic 2", "Topic 3"],
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

**Output**: Valid JSON only, no markdown, no explanations.`;
}

function buildSimplifiedPrompt(context: typeof TEST_SECTION_CONTEXT): string {
  return `Вы - эксперт по созданию образовательных курсов. Создайте ${context.estimatedLessons} урока для раздела "${context.sectionTitle}".

**Контекст**:
- Курс: ${context.courseTitle}
- Уровень: ${context.difficulty}
- Темы раздела: ${context.keyTopics.join(', ')}

**Требования к каждому уроку**:
1. Название урока (5-500 символов)
2. 1-5 учебных целей (минимум 15 символов каждая)
3. 2-10 ключевых тем
4. Длительность: 3-45 минут
5. 3-5 практических упражнений (типы: hands_on, quiz, case_study, discussion, self_assessment)

**Формат вывода**: Только валидный JSON, без markdown блоков.

Структура JSON:
{
  "section_number": ${context.sectionIndex + 1},
  "section_title": "${context.sectionTitle}",
  "section_description": "Описание раздела (50-500 символов)",
  "learning_objectives": [
    {
      "id": "uuid формат",
      "text": "Цель обучения",
      "language": "ru",
      "cognitiveLevel": "apply",
      "estimatedDuration": 10,
      "targetAudienceLevel": "intermediate"
    }
  ],
  "estimated_duration_minutes": 120,
  "lessons": [...]
}`;
}

function buildSchemaExplicitPrompt(context: typeof TEST_SECTION_CONTEXT): string {
  const schemaDoc = `
## STRICT SCHEMA REQUIREMENTS

Each lesson MUST match this Zod schema:

LessonSchema = z.object({
  lesson_number: z.number().int().positive(),
  lesson_title: z.string().min(5).max(500),
  lesson_objectives: z.array(LearningObjectiveSchema).min(1).max(5),
  key_topics: z.array(z.string().min(5).max(500)).min(2).max(10),
  estimated_duration_minutes: z.number().int().min(3).max(45),
  practical_exercises: z.array(ExerciseSchema).min(3).max(5)
})

LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(15).max(1000),
  language: z.string(),
  cognitiveLevel: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
  estimatedDuration: z.number().int().min(1).max(60),
  targetAudienceLevel: z.enum(['beginner', 'intermediate', 'advanced'])
})

ExerciseSchema = z.object({
  exercise_type: z.enum(['hands_on', 'quiz', 'case_study', 'discussion', 'self_assessment', 'simulation', 'reflection']),
  exercise_title: z.string().min(5).max(300),
  exercise_description: z.string().min(10).max(1500)
})

## CRITICAL VALIDATION RULES

1. All UUIDs MUST be valid UUID v4 format
2. All string lengths MUST be within min/max bounds
3. All enums MUST use exact values from schema
4. All arrays MUST have counts within min/max bounds
5. All numbers MUST be positive integers within ranges
`;

  return buildBaselinePrompt(context) + '\n\n' + schemaDoc;
}

function getPromptBuilder(promptType: TestScenario['promptType']): (context: typeof TEST_SECTION_CONTEXT) => string {
  switch (promptType) {
    case 'baseline':
      return buildBaselinePrompt;
    case 'simplified':
      return buildSimplifiedPrompt;
    case 'schema-explicit':
      return buildSchemaExplicitPrompt;
  }
}

// ============================================================================
// Test Helper Functions
// ============================================================================

interface TestResult {
  scenario: string;
  model: string;
  promptType: string;
  rawOutputLength: number;
  rawOutputPreview: string;
  parseSuccess: boolean;
  parseError?: string;
  qualityScore?: number;
  qualityPassed?: boolean;
  layerUsed?: string;
  retryCount?: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  sectionValid?: boolean;
  lessonCount?: number;
  validationErrors?: string[];
}

async function runScenarioTest(scenario: TestScenario): Promise<TestResult> {
  console.log(`\n[Test] Running: ${scenario.name}`);

  const result: TestResult = {
    scenario: scenario.name,
    model: scenario.model,
    promptType: scenario.promptType,
    rawOutputLength: 0,
    rawOutputPreview: '',
    parseSuccess: false,
  };

  try {
    // Build prompt
    const promptBuilder = getPromptBuilder(scenario.promptType);
    const prompt = promptBuilder(TEST_SECTION_CONTEXT);

    // Create model
    const model = new ChatOpenAI({
      modelName: scenario.model,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
      apiKey: process.env.OPENROUTER_API_KEY!,  // Updated for @langchain/openai v1.x
      temperature: 0.7,
      maxTokens: 30000,
      timeout: 300000, // 5 minutes
    });

    // Invoke model
    console.log(`[Test] Invoking model: ${scenario.model}`);
    const response = await model.invoke(prompt);
    const rawContent = response.content.toString();

    result.rawOutputLength = rawContent.length;
    result.rawOutputPreview = rawContent.slice(0, 500);

    // Estimate tokens (rough approximation)
    result.tokenUsage = {
      input: Math.ceil(prompt.length / 4),
      output: Math.ceil(rawContent.length / 4),
      total: Math.ceil((prompt.length + rawContent.length) / 4),
    };

    // Parse with UnifiedRegenerator
    console.log(`[Test] Parsing with UnifiedRegenerator`);
    const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
      enabledLayers: ['auto-repair', 'critique-revise'],
      maxRetries: 5,
      model: model,
      qualityValidator: (data) => {
        return data.sections && Array.isArray(data.sections) && data.sections.length > 0;
      },
      metricsTracking: true,
      stage: 'generation',
      courseId: 'test-qwen3-direct',
      phaseId: `scenario_${scenario.promptType}`,
    });

    const parseResult = await regenerator.regenerate({
      rawOutput: rawContent,
      originalPrompt: prompt,
    });

    result.parseSuccess = parseResult.success;
    result.layerUsed = parseResult.metadata.layerUsed;
    result.retryCount = parseResult.metadata.retryCount;
    result.qualityPassed = parseResult.metadata.qualityPassed || false;

    if (!parseResult.success || !parseResult.data) {
      result.parseError = parseResult.error || 'Unknown parse error';
      return result;
    }

    // Validate with SectionSchema
    console.log(`[Test] Validating with SectionSchema`);
    const sections = parseResult.data.sections;

    if (!sections || sections.length === 0) {
      result.parseError = 'No sections in parsed data';
      return result;
    }

    const section = sections[0];
    const validationResult = SectionSchema.safeParse(section);

    result.sectionValid = validationResult.success;

    if (!validationResult.success) {
      result.validationErrors = validationResult.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return result;
    }

    // Calculate quality score (simple heuristic)
    result.lessonCount = section.lessons?.length || 0;
    result.qualityScore = calculateQualityScore(section);

    console.log(`[Test] ✅ Success - Quality: ${result.qualityScore?.toFixed(2)}`);

  } catch (error) {
    result.parseError = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[Test] ❌ Failed - ${result.parseError}`);
  }

  return result;
}

function calculateQualityScore(section: Section): number {
  let score = 0;

  // Factor 1: Lesson count (0.3)
  const lessonCount = section.lessons?.length || 0;
  if (lessonCount >= 3 && lessonCount <= 5) {
    score += 0.3;
  } else if (lessonCount > 0) {
    score += 0.15;
  }

  // Factor 2: Objectives quality (0.3)
  const hasObjectives = section.learning_objectives && section.learning_objectives.length > 0;
  if (hasObjectives) {
    score += 0.3;
  }

  // Factor 3: Lesson completeness (0.4)
  if (section.lessons) {
    const validLessons = section.lessons.filter((lesson) => {
      const hasObjectives = lesson.lesson_objectives && lesson.lesson_objectives.length > 0;
      const hasTopics = lesson.key_topics && lesson.key_topics.length >= 2;
      const hasExercises = lesson.practical_exercises && lesson.practical_exercises.length >= 3;
      return hasObjectives && hasTopics && hasExercises;
    });

    score += (validLessons.length / section.lessons.length) * 0.4;
  }

  return score;
}

// ============================================================================
// Tests
// ============================================================================

describe('Qwen3-235B Section Generation - Direct Testing', () => {
  const results: TestResult[] = [];

  beforeAll(() => {
    // Verify environment
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is required for this test');
    }
  });

  it('should run all 4 test scenarios and collect results', async () => {
    for (const scenario of TEST_SCENARIOS) {
      const result = await runScenarioTest(scenario);
      results.push(result);
    }

    // Generate report
    await generateInvestigationReport(results);

    // Assertions
    expect(results).toHaveLength(4);

    // At least control (gpt-oss-120b) should pass
    const controlResult = results.find((r) => r.model === MODELS.gpt_oss_120b);
    expect(controlResult).toBeDefined();
    expect(controlResult?.parseSuccess).toBe(true);

    console.log('\n\n=== TEST RESULTS SUMMARY ===\n');
    results.forEach((r) => {
      console.log(`${r.scenario}:`);
      console.log(`  Parse: ${r.parseSuccess ? '✅' : '❌'} | Layer: ${r.layerUsed} | Quality: ${r.qualityScore?.toFixed(2) || 'N/A'}`);
    });
  }, 600000); // 10 minutes timeout
});

// ============================================================================
// Report Generation
// ============================================================================

async function generateInvestigationReport(results: TestResult[]): Promise<void> {
  const reportPath = path.join(
    process.cwd(),
    '../../../docs/investigations/INV-2025-11-17-007-qwen3-section-quality.md'
  );

  const timestamp = new Date().toISOString().split('T')[0];

  // Calculate statistics
  const qwen3Results = results.filter((r) => r.model === MODELS.qwen3_235b);
  const controlResult = results.find((r) => r.model === MODELS.gpt_oss_120b);
  const qwen3SuccessRate = qwen3Results.filter((r) => r.parseSuccess).length / qwen3Results.length;

  const report = `# Investigation: Qwen3-235B Section Generation Quality Analysis

**ID**: INV-2025-11-17-007
**Date**: ${timestamp}
**Status**: ✅ COMPLETED
**Priority**: HIGH (blocking T053 E2E test)
**Related Task**: T053 Section 1.1 (Qwen3-235b Direct Testing)

---

## Executive Summary

Isolated testing of qwen3-235b model for section generation to determine if T053 failures are **model-specific** or **prompt-specific**.

**Key Findings**:
- **Qwen3-235B Success Rate**: ${(qwen3SuccessRate * 100).toFixed(0)}% (${qwen3Results.filter((r) => r.parseSuccess).length}/${qwen3Results.length} scenarios)
- **GPT-OSS-120B Success Rate**: ${controlResult?.parseSuccess ? '100%' : '0%'} (control)
- **Root Cause**: ${qwen3SuccessRate < 0.5 ? 'MODEL-SPECIFIC ISSUE' : qwen3SuccessRate < 1.0 ? 'PROMPT OPTIMIZATION NEEDED' : 'NO ISSUE DETECTED'}

**Recommendation**: ${generateRecommendation(results)}

---

## Test Scenarios

${TEST_SCENARIOS.map((scenario, idx) => `
### Scenario ${idx + 1}: ${scenario.name}

**Model**: \`${scenario.model}\`
**Prompt Type**: ${scenario.promptType}
**Description**: ${scenario.description}

**Results**:
${formatScenarioResults(results[idx])}
`).join('\n')}

---

## Comparison Table

| Scenario | Model | Parse Success | Layer Used | Quality Score | Lesson Count | Token Usage |
|----------|-------|---------------|------------|---------------|--------------|-------------|
${results.map((r) => `| ${r.scenario} | ${r.model.split('/')[1]} | ${r.parseSuccess ? '✅' : '❌'} | ${r.layerUsed || 'N/A'} | ${r.qualityScore?.toFixed(2) || 'N/A'} | ${r.lessonCount || 'N/A'} | ${r.tokenUsage?.total.toLocaleString() || 'N/A'} |`).join('\n')}

---

## Analysis

### Model-Specific Issues

${analyzeModelIssues(results)}

### Prompt-Specific Issues

${analyzePromptIssues(results)}

---

## Raw Output Samples

${results.map((r, idx) => `
### Sample ${idx + 1}: ${r.scenario}

**Parse Success**: ${r.parseSuccess ? '✅ YES' : '❌ NO'}

**Raw Output Preview** (first 500 chars):
\`\`\`
${r.rawOutputPreview}
\`\`\`

${r.parseError ? `**Parse Error**: ${r.parseError}` : ''}
${r.validationErrors ? `**Validation Errors**:\n${r.validationErrors.map((e) => `- ${e}`).join('\n')}` : ''}
`).join('\n')}

---

## Recommendations

### Top Priority

${generateTopRecommendation(results)}

### Next Steps

1. **If model-specific**: Switch to DeepSeek v3.1 or Kimi K2 for RU lessons
2. **If prompt-specific**: Implement best-performing prompt variation
3. **Follow-up testing**: Validate fix with full T053 E2E test

---

## Token Usage Analysis

| Scenario | Input Tokens | Output Tokens | Total Tokens | Est. Cost ($) |
|----------|--------------|---------------|--------------|---------------|
${results.map((r) => `| ${r.scenario} | ${r.tokenUsage?.input.toLocaleString() || 'N/A'} | ${r.tokenUsage?.output.toLocaleString() || 'N/A'} | ${r.tokenUsage?.total.toLocaleString() || 'N/A'} | ${r.tokenUsage ? calculateCost(r.tokenUsage, r.model) : 'N/A'} |`).join('\n')}

---

**Investigation Completed**: ${timestamp}
**Report Generated**: Automated via qwen3-section-generation.test.ts
`;

  await fs.writeFile(reportPath, report, 'utf-8');
  console.log(`\n[Report] Generated: ${reportPath}`);
}

function formatScenarioResults(result: TestResult): string {
  return `
- **Parse Success**: ${result.parseSuccess ? '✅ YES' : '❌ NO'}
- **Layer Used**: ${result.layerUsed || 'N/A'}
- **Retry Count**: ${result.retryCount || 0}
- **Quality Score**: ${result.qualityScore?.toFixed(2) || 'N/A'}
- **Quality Passed**: ${result.qualityPassed ? '✅ YES' : '❌ NO'}
- **Section Valid**: ${result.sectionValid ? '✅ YES' : '❌ NO'}
- **Lesson Count**: ${result.lessonCount || 'N/A'}
- **Token Usage**: ${result.tokenUsage?.total.toLocaleString() || 'N/A'}
${result.parseError ? `- **Error**: ${result.parseError}` : ''}
${result.validationErrors ? `- **Validation Errors**: ${result.validationErrors.length} issues` : ''}
`;
}

function analyzeModelIssues(results: TestResult[]): string {
  const qwen3Results = results.filter((r) => r.model === MODELS.qwen3_235b);
  const controlResult = results.find((r) => r.model === MODELS.gpt_oss_120b);

  if (!controlResult?.parseSuccess) {
    return '⚠️ Control test (gpt-oss-120b) also failed. Issue is likely **prompt-specific**, not model-specific.';
  }

  const qwen3SuccessCount = qwen3Results.filter((r) => r.parseSuccess).length;

  if (qwen3SuccessCount === 0) {
    return `❌ **Critical**: Qwen3-235B failed ALL test scenarios (0/${qwen3Results.length}), while control passed. This is a **MODEL-SPECIFIC ISSUE**. Recommend switching to DeepSeek v3.1 or Kimi K2 for RU lessons.`;
  }

  if (qwen3SuccessCount < qwen3Results.length) {
    return `⚠️ **Partial Success**: Qwen3-235B passed ${qwen3SuccessCount}/${qwen3Results.length} scenarios. Issue is **PROMPT-SPECIFIC** - model CAN generate valid output with better prompts.`;
  }

  return `✅ **No Model Issues**: Qwen3-235B passed all test scenarios. Issue from T053 was likely transient or environment-specific.`;
}

function analyzePromptIssues(results: TestResult[]): string {
  const qwen3Results = results.filter((r) => r.model === MODELS.qwen3_235b);
  const bestQwen3 = qwen3Results.reduce((best, current) =>
    (current.qualityScore || 0) > (best.qualityScore || 0) ? current : best
  );

  if (!bestQwen3.parseSuccess) {
    return 'N/A - All qwen3-235b scenarios failed parsing.';
  }

  return `
**Best-performing prompt**: ${bestQwen3.promptType}
- Quality Score: ${bestQwen3.qualityScore?.toFixed(2)}
- Parse Success: ${bestQwen3.parseSuccess ? 'YES' : 'NO'}
- Layer Used: ${bestQwen3.layerUsed}

**Recommendation**: ${bestQwen3.promptType === 'baseline' ? 'Current prompt is optimal' : `Switch to ${bestQwen3.promptType} prompt style`}
`;
}

function generateRecommendation(results: TestResult[]): string {
  const qwen3Results = results.filter((r) => r.model === MODELS.qwen3_235b);
  const controlResult = results.find((r) => r.model === MODELS.gpt_oss_120b);
  const qwen3SuccessCount = qwen3Results.filter((r) => r.parseSuccess).length;

  if (!controlResult?.parseSuccess) {
    return '⚠️ Fix prompts first - even control test failed';
  }

  if (qwen3SuccessCount === 0) {
    return '❌ CRITICAL: Switch models immediately (use DeepSeek v3.1 or Kimi K2 for RU)';
  }

  if (qwen3SuccessCount < qwen3Results.length) {
    const bestQwen3 = qwen3Results.reduce((best, current) =>
      (current.qualityScore || 0) > (best.qualityScore || 0) ? current : best
    );
    return `✅ Optimize prompts - use ${bestQwen3.promptType} style for better results`;
  }

  return '✅ No issues detected - investigate T053 environment or transient failures';
}

function generateTopRecommendation(results: TestResult[]): string {
  const qwen3Results = results.filter((r) => r.model === MODELS.qwen3_235b);
  const qwen3SuccessCount = qwen3Results.filter((r) => r.parseSuccess).length;

  if (qwen3SuccessCount === 0) {
    return `
1. **IMMEDIATE**: Switch RU lesson generation to DeepSeek v3.1 (8.8/10 quality, 100% stability)
2. **Update**: \`packages/course-gen-platform/src/services/stage5/section-batch-generator.ts\` line 52
   - Change: \`ru_lessons_primary: 'qwen/qwen3-235b-a22b-thinking-2507'\`
   - To: \`ru_lessons_primary: 'deepseek/deepseek-v3.1-terminus'\`
3. **Test**: Re-run T053 E2E test
4. **Monitor**: Quality scores and cost impact
`;
  }

  const bestQwen3 = qwen3Results.reduce((best, current) =>
    (current.qualityScore || 0) > (best.qualityScore || 0) ? current : best
  );

  return `
1. **Implement**: ${bestQwen3.promptType} prompt variation (achieved ${bestQwen3.qualityScore?.toFixed(2)} quality)
2. **Update**: \`buildBatchPrompt()\` in section-batch-generator.ts
3. **A/B Test**: Compare old vs new prompt on 10 courses
4. **Rollout**: If quality improves by >5%, deploy to production
`;
}

function calculateCost(tokenUsage: { input: number; output: number }, model: string): string {
  const pricing: Record<string, { input: number; output: number }> = {
    [MODELS.qwen3_235b]: { input: 0.08, output: 0.33 },
    [MODELS.gpt_oss_120b]: { input: 1.0, output: 5.0 },
  };

  const modelPricing = pricing[model];
  if (!modelPricing) return 'N/A';

  const inputCost = (tokenUsage.input / 1_000_000) * modelPricing.input;
  const outputCost = (tokenUsage.output / 1_000_000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  return totalCost.toFixed(6);
}
