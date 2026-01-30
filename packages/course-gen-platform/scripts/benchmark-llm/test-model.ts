/**
 * LLM Model Quality Tester
 * @module scripts/benchmark-llm/test-model
 *
 * Runs quality tests on LLM models and evaluates using LLM-Judge system.
 * Results are saved to Supabase for comparison on /benchmarks page.
 */

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { type QualityTier } from './types';

// ============================================================================
// Types
// ============================================================================

interface TestScenario {
  name: string;
  description: string;
  prompt: string;
  language: 'en' | 'ru';
  expectedMinWords: number;
}

interface JudgeScore {
  semanticQuality: number; // 0-35
  practicalValue: number; // 0-25
  taskCompliance: number; // 0-15
  noHallucinations: number; // 0-10
  structure: number; // 0-10
  visualization: number; // 0-5
}

interface JudgeVerdict {
  scores: JudgeScore;
  baseScore: number;
  bonuses: Array<{ type: string; points: number; reason: string }>;
  penalties: Array<{ type: string; points: number; reason: string; location?: string }>;
  totalScore: number;
  tier: QualityTier;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

interface TestResult {
  modelSlug: string;
  modelName: string;
  provider: string;
  scenario: string;
  language: 'en' | 'ru';
  inputPrompt: string;
  outputContent: string;
  wordCount: number;
  generationTimeMs: number;
  tokenCount?: number;
  judgeVerdicts: {
    primary?: JudgeVerdict;
    secondary?: JudgeVerdict;
    tiebreaker?: JudgeVerdict;
  };
  finalScore: number;
  tier: QualityTier;
}

// ============================================================================
// Configuration
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const JUDGE_MODELS = {
  primary: 'deepseek/deepseek-chat-v3-0324',
  secondary: 'qwen/qwen-2.5-72b-instruct',
  tiebreaker: 'anthropic/claude-3.5-sonnet',
};

const TIEBREAKER_THRESHOLD = 0.15; // 15% difference triggers tiebreaker

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: 'full-generation',
    description: 'Full lesson generation with theory, examples, and diagrams',
    language: 'ru',
    expectedMinWords: 1500,
    prompt: `Создай полный урок на тему «Оптимизация управления запасами» для менеджеров логистики B2B компаний.

Требования:
1. Теоретическая часть с ключевыми концепциями (EOQ, Safety Stock, Reorder Point)
2. Практические примеры из реального бизнеса (минимум 3 кейса)
3. ABC/XYZ анализ с пошаговым алгоритмом применения
4. KPI и метрики эффективности управления запасами
5. Mermaid диаграммы для визуализации процессов (минимум 2 диаграммы)
6. Задания для самопроверки (3-5 вопросов)

Формат: Markdown с чёткой структурой разделов.
Язык: Русский (профессиональный бизнес-стиль).
Целевая аудитория: Менеджеры среднего звена с 3-5 годами опыта в логистике.

ВАЖНО:
- Все примеры должны быть конкретными с цифрами
- Не использовать общие фразы типа "может варьироваться"
- Mermaid диаграммы должны иметь корректный синтаксис (без escaped quotes)
- Не упоминать что ты AI или ассистент`,
  },
];

// ============================================================================
// Judge Prompt
// ============================================================================

const JUDGE_PROMPT = `You are an expert educational content quality evaluator. Your task is to assess AI-generated learning materials using a rigorous point-based scoring system.

## Your Evaluation Philosophy

You are NOT just checking for technical correctness. You are evaluating whether a REAL STUDENT could effectively learn from this material:
- Would they understand the concepts?
- Could they apply this knowledge at work tomorrow?
- Would they remember the key takeaways?
- Would they be misled by any incorrect information?

Be strict but fair. Award points for genuine quality, penalize for real problems.

## Scoring Criteria (100 base points maximum)

### 1. SEMANTIC QUALITY (0-35 points) — Most Important!
| Points | Description |
|--------|-------------|
| 32-35 | Expert-level: Deeper than textbooks, unique insights |
| 26-31 | Excellent: All key aspects covered with good detail |
| 20-25 | Good: Main topics covered, but no wow-factor |
| 14-19 | Basic: Shallow, many gaps in coverage |
| 7-13 | Weak: Very superficial, little useful content |
| 0-6 | Poor: Empty or incorrect content |

### 2. PRACTICAL VALUE (0-25 points)
| Points | Description |
|--------|-------------|
| 23-25 | Excellent: Immediately actionable, real industry cases |
| 18-22 | Good: Good examples, clear how to use |
| 13-17 | Average: Examples present but abstract |
| 7-12 | Weak: Mostly theory, little practice |
| 0-6 | Poor: Pure theory without application |

### 3. TASK COMPLIANCE (0-15 points)
| Points | Description |
|--------|-------------|
| 14-15 | Perfect: All requirements met |
| 11-13 | Good: Almost all, minor deviations |
| 8-10 | Average: Main requirements done, some missed |
| 4-7 | Weak: Much doesn't match the task |
| 0-3 | Poor: Task ignored |

### 4. NO HALLUCINATIONS (0-10 points)
| Points | Description |
|--------|-------------|
| 10 | Impeccable: Everything verifiable and correct |
| 8-9 | Excellent: No obvious hallucinations |
| 6-7 | Good: Minor inaccuracies |
| 3-5 | Problems: Questionable claims present |
| 0-2 | Critical: Clear hallucinations |

### 5. STRUCTURE & NAVIGATION (0-10 points)
| Points | Description |
|--------|-------------|
| 10 | Perfect: Clear structure, easy to follow |
| 8-9 | Good: Structure present, minor issues |
| 6-7 | Average: Understandable but confusing |
| 3-5 | Weak: Chaotic structure |
| 0-2 | Poor: Stream of consciousness |

### 6. VISUALIZATION & GRAPHICS (0-5 points)
| Points | Description |
|--------|-------------|
| 5 | Excellent: Diagrams help understanding, correct syntax |
| 4 | Good: Useful visualizations, minor issues |
| 3 | Average: Present but don't help much |
| 1-2 | Weak: Syntax errors or inappropriate |
| 0 | None or all broken |

## Bonuses (can exceed 100 total)
| Bonus | Points | Condition |
|-------|--------|-----------|
| Unique Insights | +5-15 | Information you wouldn't expect from AI |
| Creative Examples | +5-10 | Memorable analogies |
| Perfect Style | +5 | Reads like a professional author |

## Penalties (subtract from total)
| Penalty | Points | Condition |
|---------|--------|-----------|
| Critical Hallucination | -15 | Invented fact presented as truth |
| Factual Error | -10 | Incorrect information |
| Content Truncation | -10 | Unfinished sentences |
| Language Switching | -10 | RU↔EN within text |
| Broken Mermaid | -5 | Syntax errors in diagrams |
| Prompt Plagiarism | -5 | Repeating instructions as content |

---

**CONTENT TO EVALUATE:**
{content}

---

**RESPOND WITH VALID JSON ONLY:**
{
  "scores": {
    "semanticQuality": <0-35>,
    "practicalValue": <0-25>,
    "taskCompliance": <0-15>,
    "noHallucinations": <0-10>,
    "structure": <0-10>,
    "visualization": <0-5>
  },
  "baseScore": <sum of scores>,
  "bonuses": [{"type": "...", "points": <number>, "reason": "..."}],
  "penalties": [{"type": "...", "points": <negative>, "reason": "...", "location": "..."}],
  "totalScore": <calculated>,
  "tier": "<S|A|B|C|D>",
  "confidence": "<high|medium|low>",
  "summary": "2-3 sentence assessment",
  "strengths": ["..."],
  "weaknesses": ["..."]
}`;

// ============================================================================
// OpenRouter Client
// ============================================================================

function createOpenRouterClient(): OpenAI {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  return new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': 'https://ai.megacampus.ru',
      'X-Title': 'MegaCampus AI Benchmark',
    },
  });
}

// ============================================================================
// Generation
// ============================================================================

async function generateContent(
  client: OpenAI,
  modelId: string,
  prompt: string
): Promise<{ content: string; timeMs: number; tokens?: number }> {
  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 8000,
  });

  const timeMs = Date.now() - startTime;
  const content = response.choices[0]?.message?.content || '';
  const tokens = response.usage?.completion_tokens;

  return { content, timeMs, tokens };
}

// ============================================================================
// LLM-Judge Evaluation
// ============================================================================

async function evaluateWithJudge(
  client: OpenAI,
  judgeModel: string,
  content: string
): Promise<JudgeVerdict | null> {
  try {
    const prompt = JUDGE_PROMPT.replace('{content}', content);

    const response = await client.chat.completions.create({
      model: judgeModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const responseText = response.choices[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`Judge ${judgeModel} returned no JSON`);
      return null;
    }

    const verdict = JSON.parse(jsonMatch[0]) as JudgeVerdict;
    return verdict;
  } catch (error) {
    console.error(`Judge ${judgeModel} evaluation failed:`, error);
    return null;
  }
}

async function runCLEVVoting(
  client: OpenAI,
  content: string
): Promise<{ verdicts: TestResult['judgeVerdicts']; finalScore: number; tier: QualityTier }> {
  // Run primary and secondary judges in parallel
  const [primaryVerdict, secondaryVerdict] = await Promise.all([
    evaluateWithJudge(client, JUDGE_MODELS.primary, content),
    evaluateWithJudge(client, JUDGE_MODELS.secondary, content),
  ]);

  const verdicts: TestResult['judgeVerdicts'] = {
    primary: primaryVerdict || undefined,
    secondary: secondaryVerdict || undefined,
  };

  // If either judge failed, use the other
  if (!primaryVerdict && !secondaryVerdict) {
    return { verdicts, finalScore: 0, tier: 'D' };
  }

  if (!primaryVerdict) {
    return {
      verdicts,
      finalScore: secondaryVerdict!.totalScore,
      tier: secondaryVerdict!.tier,
    };
  }

  if (!secondaryVerdict) {
    return {
      verdicts,
      finalScore: primaryVerdict.totalScore,
      tier: primaryVerdict.tier,
    };
  }

  // Check if tiebreaker is needed
  const scoreDiff = Math.abs(primaryVerdict.totalScore - secondaryVerdict.totalScore);
  const avgScore = (primaryVerdict.totalScore + secondaryVerdict.totalScore) / 2;
  const diffRatio = scoreDiff / Math.max(avgScore, 1);

  if (diffRatio > TIEBREAKER_THRESHOLD) {
    console.log(`  Tiebreaker needed (diff: ${(diffRatio * 100).toFixed(1)}%)`);
    const tiebreakerVerdict = await evaluateWithJudge(client, JUDGE_MODELS.tiebreaker, content);
    verdicts.tiebreaker = tiebreakerVerdict || undefined;

    if (tiebreakerVerdict) {
      // Use median of three scores
      const scores = [
        primaryVerdict.totalScore,
        secondaryVerdict.totalScore,
        tiebreakerVerdict.totalScore,
      ].sort((a, b) => a - b);
      const finalScore = scores[1]; // median

      return {
        verdicts,
        finalScore,
        tier: calculateTierFromPoints(finalScore),
      };
    }
  }

  // Consensus: average of two judges
  const finalScore = Math.round((primaryVerdict.totalScore + secondaryVerdict.totalScore) / 2);

  return {
    verdicts,
    finalScore,
    tier: calculateTierFromPoints(finalScore),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function calculateTierFromPoints(points: number): QualityTier {
  if (points >= 95) return 'S';
  if (points >= 80) return 'A';
  if (points >= 65) return 'B';
  if (points >= 50) return 'C';
  return 'D';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function extractProvider(modelId: string): string {
  const [provider] = modelId.split('/');
  return provider || 'unknown';
}

function modelIdToSlug(modelId: string): string {
  return modelId.replace(/[/:]/g, '-').toLowerCase();
}

function modelIdToName(modelId: string): string {
  const [, name] = modelId.split('/');
  return name || modelId;
}

// ============================================================================
// Database Operations
// ============================================================================

async function saveTestResult(result: TestResult, testSessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Calculate aggregate scores from judge verdicts
  const primaryScores = result.judgeVerdicts.primary?.scores;
  const secondaryScores = result.judgeVerdicts.secondary?.scores;

  // Average scores if both judges provided them
  const avgScores: JudgeScore | null =
    primaryScores && secondaryScores
      ? {
          semanticQuality: Math.round(
            (primaryScores.semanticQuality + secondaryScores.semanticQuality) / 2
          ),
          practicalValue: Math.round(
            (primaryScores.practicalValue + secondaryScores.practicalValue) / 2
          ),
          taskCompliance: Math.round(
            (primaryScores.taskCompliance + secondaryScores.taskCompliance) / 2
          ),
          noHallucinations: Math.round(
            (primaryScores.noHallucinations + secondaryScores.noHallucinations) / 2
          ),
          structure: Math.round((primaryScores.structure + secondaryScores.structure) / 2),
          visualization: Math.round(
            (primaryScores.visualization + secondaryScores.visualization) / 2
          ),
        }
      : primaryScores || secondaryScores || null;

  // Calculate bonuses/penalties
  const allBonuses = [
    ...(result.judgeVerdicts.primary?.bonuses || []),
    ...(result.judgeVerdicts.secondary?.bonuses || []),
  ];
  const allPenalties = [
    ...(result.judgeVerdicts.primary?.penalties || []),
    ...(result.judgeVerdicts.secondary?.penalties || []),
  ];
  const bonusPoints = Math.round(allBonuses.reduce((sum, b) => sum + b.points, 0) / 2);
  const penaltyPoints = Math.round(allPenalties.reduce((sum, p) => sum + p.points, 0) / 2);

  // Insert or update benchmark record
  const { data: benchmark, error: benchmarkError } = await supabase
    .from('llm_model_benchmarks')
    .upsert(
      {
        model_slug: result.modelSlug,
        model_name: result.modelName,
        provider: result.provider,
        test_date: new Date().toISOString().split('T')[0],
        test_version: '2.0.0',
        // Legacy scores (for backwards compatibility)
        overall_quality_score: result.finalScore / 100,
        content_quality_score: (avgScores?.semanticQuality || 0) / 35,
        schema_compliance_score: (avgScores?.taskCompliance || 0) / 15,
        language_quality_score: (avgScores?.structure || 0) / 10,
        // New point-based scores
        score_semantic_quality: avgScores?.semanticQuality || null,
        score_practical_value: avgScores?.practicalValue || null,
        score_task_compliance: avgScores?.taskCompliance || null,
        score_no_hallucinations: avgScores?.noHallucinations || null,
        score_structure: avgScores?.structure || null,
        score_visualization: avgScores?.visualization || null,
        score_bonuses: bonusPoints,
        score_penalties: penaltyPoints,
        total_points: result.finalScore,
        quality_tier: result.tier,
        test_session_id: testSessionId,
        total_issues: allPenalties.length,
        critical_issues: allPenalties.filter(p => p.points <= -10).length,
        error_rate: 0,
      },
      { onConflict: 'model_slug,test_date' }
    )
    .select('id')
    .single();

  if (benchmarkError) {
    console.error('Failed to save benchmark:', benchmarkError);
    throw benchmarkError;
  }

  // Insert sample with full content
  const { error: sampleError } = await supabase.from('llm_benchmark_samples').upsert(
    {
      benchmark_id: benchmark.id,
      test_session_id: testSessionId,
      model_slug: result.modelSlug,
      scenario: result.scenario,
      language: result.language,
      input_prompt: result.inputPrompt,
      output_content: result.outputContent,
      output_preview: result.outputContent.substring(0, 500),
      judge_scores: result.judgeVerdicts,
      final_score: result.finalScore,
      tier: result.tier,
      score_breakdown: avgScores,
      word_count: result.wordCount,
      generation_time_ms: result.generationTimeMs,
      token_count: result.tokenCount,
    },
    { onConflict: 'model_slug,scenario,test_session_id' }
  );

  if (sampleError) {
    console.error('Failed to save sample:', sampleError);
    throw sampleError;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

export interface TestModelOptions {
  modelId: string;
  scenario?: string;
  language?: 'en' | 'ru';
  skipJudge?: boolean;
}

export async function testModel(options: TestModelOptions): Promise<TestResult> {
  const { modelId, scenario = 'full-generation', skipJudge = false } = options;

  console.log(`\n=== Testing Model: ${modelId} ===\n`);

  const client = createOpenRouterClient();
  const testScenario = TEST_SCENARIOS.find(s => s.name === scenario);

  if (!testScenario) {
    throw new Error(
      `Unknown scenario: ${scenario}. Available: ${TEST_SCENARIOS.map(s => s.name).join(', ')}`
    );
  }

  // Generate content
  console.log(`Generating content for scenario: ${testScenario.name}`);
  const { content, timeMs, tokens } = await generateContent(client, modelId, testScenario.prompt);

  const wordCount = countWords(content);
  console.log(`  Generated ${wordCount} words in ${(timeMs / 1000).toFixed(1)}s`);

  if (wordCount < testScenario.expectedMinWords) {
    console.warn(
      `  Warning: Content is shorter than expected (${testScenario.expectedMinWords} words)`
    );
  }

  // Evaluate with LLM-Judge
  let finalScore = 0;
  let tier: QualityTier = 'D';
  let judgeVerdicts: TestResult['judgeVerdicts'] = {};

  if (!skipJudge) {
    console.log(`\nRunning LLM-Judge evaluation...`);
    console.log(`  Primary: ${JUDGE_MODELS.primary}`);
    console.log(`  Secondary: ${JUDGE_MODELS.secondary}`);

    const evaluation = await runCLEVVoting(client, content);
    finalScore = evaluation.finalScore;
    tier = evaluation.tier;
    judgeVerdicts = evaluation.verdicts;

    console.log(`\n  Final Score: ${finalScore} points`);
    console.log(`  Tier: ${tier}`);
  }

  const result: TestResult = {
    modelSlug: modelIdToSlug(modelId),
    modelName: modelIdToName(modelId),
    provider: extractProvider(modelId),
    scenario: testScenario.name,
    language: testScenario.language,
    inputPrompt: testScenario.prompt,
    outputContent: content,
    wordCount,
    generationTimeMs: timeMs,
    tokenCount: tokens,
    judgeVerdicts,
    finalScore,
    tier,
  };

  return result;
}

export async function runBenchmark(
  modelIds: string[],
  scenario = 'full-generation'
): Promise<void> {
  const testSessionId = uuidv4();
  console.log(`\n========================================`);
  console.log(`  LLM Quality Benchmark`);
  console.log(`  Session: ${testSessionId}`);
  console.log(`  Models: ${modelIds.length}`);
  console.log(`========================================\n`);

  const results: TestResult[] = [];

  for (const modelId of modelIds) {
    try {
      const result = await testModel({ modelId, scenario });
      results.push(result);

      // Save to database
      console.log(`\nSaving results to database...`);
      await saveTestResult(result, testSessionId);
      console.log(`  Saved: ${result.modelSlug}`);
    } catch (error) {
      console.error(`\nFailed to test ${modelId}:`, error);
    }
  }

  // Print summary
  console.log(`\n========================================`);
  console.log(`  BENCHMARK RESULTS`);
  console.log(`========================================\n`);
  console.log(`Rank | Model                     | Score | Tier`);
  console.log(`-----|---------------------------|-------|-----`);

  const sorted = results.sort((a, b) => b.finalScore - a.finalScore);
  sorted.forEach((r, i) => {
    const rank = String(i + 1).padStart(2);
    const model = r.modelName.padEnd(25).slice(0, 25);
    const score = String(r.finalScore).padStart(5);
    console.log(`  ${rank} | ${model} | ${score} | ${r.tier}`);
  });

  console.log(`\nResults saved to: /benchmarks?session=${testSessionId}`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: pnpm benchmark-llm test <model-id> [--scenario <name>]');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm benchmark-llm test deepseek/deepseek-chat-v3-0324');
    console.log('  pnpm benchmark-llm test qwen/qwen-2.5-72b-instruct --scenario full-generation');
    process.exit(1);
  }

  const modelId = args[0];
  const scenarioIdx = args.indexOf('--scenario');
  const scenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : 'full-generation';

  testModel({ modelId, scenario })
    .then(async result => {
      const testSessionId = uuidv4();
      await saveTestResult(result, testSessionId);
      console.log(`\nResults saved. View at: /benchmarks?session=${testSessionId}`);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
