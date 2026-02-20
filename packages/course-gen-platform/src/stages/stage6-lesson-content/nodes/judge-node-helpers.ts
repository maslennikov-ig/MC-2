/**
 * Judge Node Helper Functions
 * @module stages/stage6-lesson-content/nodes/judge-node-helpers
 *
 * Extracted helper functions to reduce complexity of judge-node.ts
 * These functions represent logical phases of the judge evaluation process.
 */

import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type {
  JudgeRecommendation,
  JudgeVerdict,
  ArbiterOutput,
} from '@megacampus/shared-types/judge-types';
import type { LessonContent, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type {
  MermaidRenderValidationResult,
  MermaidRenderRemediationMetadata,
} from '../utils/mermaid-render-validator';
import type { CascadeEvaluationInput, CascadeResult } from '../judge/cascade-evaluator';
import { DecisionAction, type DecisionResult } from '../judge/decision-engine';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { buildLessonContent } from '../judge/judge-helpers';
import { buildEnrichedJudgeOutput, extractJudgeModels } from '../judge/judge-output-builder';
import { buildJudgeProgressSummary } from '../judge/judge-progress';
import { validateMermaidRenderInLessonContentBody } from '../utils/mermaid-render-validator';
import { runMermaidFixPipeline } from '../utils/mermaid-fix-pipeline';
import { executeTargetedRefinementFlow, buildReviewInfo } from './judge-refinement-helpers';

/**
 * Context object passed between judge phases
 * Contains all state needed for evaluation and decision making
 */
export interface JudgeContext {
  state: LessonGraphStateType;
  contentBody: LessonContentBody;
  startTime: number;
  cascadeResult?: CascadeResult;
  verdict?: JudgeVerdict | null;
  decision?: DecisionResult;
  finalContent?: LessonContent | null;
  finalScore?: number;
  finalRecommendation?: JudgeRecommendation;
  needsRegeneration?: boolean;
  needsHumanReview?: boolean;
  refinementTokensUsed?: number;
  arbiterOutput?: ArbiterOutput | null;
  mermaidRenderValidation?: MermaidRenderValidationResult | null;
}

type MermaidAggregateMetrics = NonNullable<MermaidRenderRemediationMetadata['aggregateMetrics']>;

interface MermaidContentBodyRemediationResult {
  contentBody: LessonContentBody;
  transformed: boolean;
  fieldsScanned: number;
  fieldsTransformed: number;
  pipelineRuns: number;
  aggregateMetrics: MermaidAggregateMetrics;
}

const MERMAID_HINT_REGEX =
  /```mermaid|^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitgraph)\b/im;

function createEmptyMermaidAggregateMetrics(): MermaidAggregateMetrics {
  return {
    diagramsTotal: 0,
    diagramsAutoWrapped: 0,
    diagramsFixedRegex: 0,
    diagramsFixedLLM: 0,
    diagramsFallback: 0,
    diagramsSimplified: 0,
    diagramsSplit: 0,
    diagramsStructuredFallback: 0,
  };
}

function mergeMermaidMetrics(
  target: MermaidAggregateMetrics,
  source: MermaidAggregateMetrics
): MermaidAggregateMetrics {
  return {
    diagramsTotal: target.diagramsTotal + (source.diagramsTotal ?? 0),
    diagramsAutoWrapped: target.diagramsAutoWrapped + (source.diagramsAutoWrapped ?? 0),
    diagramsFixedRegex: target.diagramsFixedRegex + (source.diagramsFixedRegex ?? 0),
    diagramsFixedLLM: target.diagramsFixedLLM + (source.diagramsFixedLLM ?? 0),
    diagramsFallback: target.diagramsFallback + (source.diagramsFallback ?? 0),
    diagramsSimplified: (target.diagramsSimplified ?? 0) + (source.diagramsSimplified ?? 0),
    diagramsSplit: (target.diagramsSplit ?? 0) + (source.diagramsSplit ?? 0),
    diagramsStructuredFallback:
      (target.diagramsStructuredFallback ?? 0) + (source.diagramsStructuredFallback ?? 0),
  };
}

async function remediateMermaidField(
  value: string,
  aggregate: MermaidContentBodyRemediationResult
): Promise<string> {
  if (!MERMAID_HINT_REGEX.test(value)) {
    return value;
  }

  aggregate.fieldsScanned++;
  const pipelineResult = await runMermaidFixPipeline(value, { skipLLM: true });
  aggregate.pipelineRuns++;
  aggregate.aggregateMetrics = mergeMermaidMetrics(
    aggregate.aggregateMetrics,
    pipelineResult.metrics
  );

  if (!pipelineResult.modified) {
    return value;
  }

  aggregate.transformed = true;
  aggregate.fieldsTransformed++;
  return pipelineResult.content;
}

async function remediateMermaidInContentBody(
  contentBody: LessonContentBody
): Promise<MermaidContentBodyRemediationResult> {
  const aggregate: MermaidContentBodyRemediationResult = {
    contentBody,
    transformed: false,
    fieldsScanned: 0,
    fieldsTransformed: 0,
    pipelineRuns: 0,
    aggregateMetrics: createEmptyMermaidAggregateMetrics(),
  };

  const intro = await remediateMermaidField(contentBody.intro ?? '', aggregate);

  const sections: LessonContentBody['sections'] = [];
  for (const section of contentBody.sections ?? []) {
    sections.push({
      ...section,
      content: await remediateMermaidField(section.content ?? '', aggregate),
    });
  }

  const examples: LessonContentBody['examples'] = [];
  for (const example of contentBody.examples ?? []) {
    examples.push({
      ...example,
      content: await remediateMermaidField(example.content ?? '', aggregate),
      code: example.code,
    });
  }

  const exercises: LessonContentBody['exercises'] = [];
  for (const exercise of contentBody.exercises ?? []) {
    const hints: string[] = [];
    for (const hint of exercise.hints ?? []) {
      hints.push(await remediateMermaidField(hint, aggregate));
    }

    exercises.push({
      ...exercise,
      question: await remediateMermaidField(exercise.question ?? '', aggregate),
      solution: await remediateMermaidField(exercise.solution ?? '', aggregate),
      hints,
    });
  }

  return {
    ...aggregate,
    contentBody: {
      ...contentBody,
      intro,
      sections,
      examples,
      exercises,
    },
  };
}

function resolveRemediationStrategy(
  aggregateMetrics: MermaidAggregateMetrics
): MermaidRenderRemediationMetadata['strategy'] {
  const simplified = aggregateMetrics.diagramsSimplified ?? 0;
  const split = aggregateMetrics.diagramsSplit ?? 0;
  const structuredFallback = aggregateMetrics.diagramsStructuredFallback ?? 0;

  const strategyCount = [simplified > 0, split > 0, structuredFallback > 0].filter(Boolean).length;

  if (strategyCount > 1) {
    return 'mixed';
  }
  if (structuredFallback > 0) {
    return 'structured_markdown_fallback';
  }
  if (split > 0) {
    return 'split';
  }
  if (simplified > 0) {
    return 'simplify';
  }
  return 'none';
}

/**
 * Phase 1: Setup judge context and validate inputs
 *
 * Prepares the evaluation context, validates content, and logs trace start.
 * Returns early if content is invalid.
 *
 * @param state - Current LangGraph state
 * @param contentBody - Extracted content body
 * @param startTime - Timestamp when judge started
 * @returns Initial judge context or null if validation failed
 */
export async function setupJudgeContext(
  state: LessonGraphStateType,
  contentBody: LessonContentBody | null,
  startTime: number
): Promise<JudgeContext | null> {
  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      currentNode: 'judge',
      hasGeneratedContent: Boolean(state.generatedContent),
      refinementIterationCount: state.refinementIterationCount,
    },
    'Judge node: Starting content evaluation'
  );

  // Log trace at start
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'judge',
    stepName: 'judge_start',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
      moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      hasGeneratedContent: Boolean(state.generatedContent),
      refinementIterationCount: state.refinementIterationCount,
    },
    durationMs: 0,
  });

  // Validate content body
  if (!contentBody) {
    logger.error(
      {
        lessonId: state.lessonSpec.lesson_id,
      },
      'Judge node: No valid content body to evaluate'
    );
    return null; // Signal validation failure
  }

  // Return initial context
  return {
    state,
    contentBody,
    startTime,
  };
}

/**
 * Phase 2: Execute cascade evaluation
 *
 * Runs the cascade evaluation (heuristics → single judge → CLEV)
 * and extracts the verdict. Handles synthetic verdict creation for
 * heuristic structural issues.
 *
 * @param context - Judge context
 * @returns Updated context with cascade result and verdict
 */
export async function runCascadeEvaluation(context: JudgeContext): Promise<JudgeContext> {
  const { state, contentBody } = context;

  // Build cascade input
  const cascadeInput: CascadeEvaluationInput = {
    lessonContent: contentBody,
    lessonSpec: state.lessonSpec,
    ragChunks: state.ragChunks,
    language: state.language,
  };

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
    },
    'Judge node: Executing cascade evaluation'
  );

  const cascadeResult = await import('../judge/cascade-evaluator').then(m =>
    m.executeCascadeEvaluation(cascadeInput)
  );

  // Extract verdict
  let verdict = cascadeResult.clevResult?.verdicts?.[0] ?? cascadeResult.singleJudgeVerdict ?? null;

  // Create synthetic verdict for heuristic structural issues
  verdict = createSyntheticVerdictIfNeeded(verdict, cascadeResult, contentBody, state);

  return {
    ...context,
    cascadeResult,
    verdict,
  };
}

/**
 * Create synthetic verdict for heuristic structural issues
 *
 * If no verdict but heuristic failures exist (e.g., missing sections),
 * creates a synthetic verdict to enable targeted refinement.
 *
 * @param verdict - Current verdict (may be null)
 * @param cascadeResult - Cascade evaluation result
 * @param contentBody - Content being evaluated
 * @param state - Graph state
 * @returns Verdict (original or synthetic)
 */
function createSyntheticVerdictIfNeeded(
  verdict: JudgeVerdict | null,
  cascadeResult: CascadeResult,
  contentBody: LessonContentBody,
  state: LessonGraphStateType
): JudgeVerdict | null {
  if (verdict || !cascadeResult.heuristicResults) {
    return verdict;
  }

  // Check for structural issues
  const structuralIssues = cascadeResult.heuristicResults.failureReasons.filter(r =>
    r.includes('Missing required sections')
  );

  if (structuralIssues.length === 0 || !contentBody) {
    return null;
  }

  // Parse missing section names
  const parsedIssues = structuralIssues.map(issue => {
    const colonIndex = issue.indexOf(':');
    const sectionPart = colonIndex > 0 ? issue.slice(colonIndex + 1).trim() : 'content';
    const sectionName = sectionPart.split(',')[0].trim().toLowerCase();

    // Map section names to valid section IDs
    let location: string;
    if (sectionName === 'exercises' || sectionName === 'examples') {
      location = 'sec_conclusion';
    } else if (sectionName === 'introduction' || sectionName === 'intro') {
      location = 'sec_introduction';
    } else if (sectionName === 'conclusion' || sectionName === 'summary') {
      location = 'sec_conclusion';
    } else {
      location = `sec_${sectionName || '1'}`;
    }

    return {
      description: issue,
      criterion: 'completeness' as const,
      severity: 'major' as const,
      location,
      suggestedFix: `Add the missing ${sectionName} section with appropriate content based on the lesson specification`,
    };
  });

  // Create synthetic verdict
  const syntheticVerdict: JudgeVerdict = {
    judgeModel: 'heuristic-fixer',
    overallScore: 0.78,
    confidence: 'high' as const,
    recommendation: 'ACCEPT_WITH_MINOR_REVISION' as JudgeRecommendation,
    criteriaScores: {
      learning_objective_alignment: 0.85,
      pedagogical_structure: 0.8,
      factual_accuracy: 0.9,
      clarity_readability: 0.85,
      engagement_examples: 0.8,
      completeness: 0.55,
    },
    issues: parsedIssues,
    strengths: [
      'Content quality is acceptable',
      'Most sections are complete',
      'Learning objectives addressed',
    ],
    temperature: 0.3,
    passed: false,
    durationMs: 0,
    tokensUsed: 0,
  };

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      structuralIssues,
      parsedLocations: parsedIssues.map(i => i.location),
    },
    'Judge node: Created synthetic verdict for heuristic structural fix'
  );

  return syntheticVerdict;
}

/**
 * Phase 3: Make decision from verdict
 *
 * Uses decision engine to determine action based on verdict and context.
 *
 * @param context - Judge context with verdict
 * @returns Updated context with decision
 */
export async function makeJudgeDecision(context: JudgeContext): Promise<JudgeContext> {
  const { verdict, state } = context;

  if (!verdict) {
    logger.warn(
      {
        lessonId: state.lessonSpec.lesson_id,
        cascadeStage: context.cascadeResult?.stage,
      },
      'Judge node: No verdict from cascade evaluation'
    );

    return context; // Will handle in next phase
  }

  const makeDecisionFromVerdict = (await import('../judge/decision-engine'))
    .makeDecisionFromVerdict;

  const decision = makeDecisionFromVerdict(
    verdict,
    context.contentBody,
    state.refinementIterationCount,
    state.previousScores
  );

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      action: decision.action,
      score: verdict.overallScore,
      confidence: verdict.confidence,
      reason: decision.reason,
    },
    'Judge node: Decision made'
  );

  return {
    ...context,
    decision,
  };
}

/**
 * Phase 4: Process decision action
 *
 * Executes the appropriate action based on decision:
 * - ACCEPT: Build final content
 * - TARGETED_FIX/ITERATIVE_REFINEMENT: Run targeted refinement
 * - REGENERATE: Mark for regeneration
 * - ESCALATE_TO_HUMAN: Mark for human review
 *
 * @param context - Judge context with decision
 * @returns Updated context with final content and recommendation
 */
export async function processJudgeDecision(context: JudgeContext): Promise<JudgeContext> {
  const { decision, verdict, state, contentBody } = context;

  if (!decision || !verdict) {
    // No decision possible, return context as-is
    return context;
  }

  let finalContent: LessonContent | null = null;
  let finalScore = verdict.overallScore;
  let finalRecommendation: JudgeRecommendation = verdict.recommendation;
  let needsRegeneration = false;
  let needsHumanReview = false;
  let refinementTokensUsed = 0;
  let arbiterOutput = null;
  let mermaidRenderValidation: MermaidRenderValidationResult | null = null;

  switch (decision.action) {
    case DecisionAction.ACCEPT: {
      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
        },
        'Judge node: Content ACCEPTED'
      );

      finalContent = buildLessonContent(state, contentBody, verdict.overallScore);
      break;
    }

    case DecisionAction.TARGETED_FIX:
    case DecisionAction.ITERATIVE_REFINEMENT: {
      const refinementResult = await executeTargetedRefinementFlow(context, verdict, contentBody);

      finalContent = refinementResult.finalContent;
      finalScore = refinementResult.finalScore;
      finalRecommendation = refinementResult.finalRecommendation;
      needsRegeneration = refinementResult.needsRegeneration;
      needsHumanReview = refinementResult.needsHumanReview;
      refinementTokensUsed = refinementResult.refinementTokensUsed;
      arbiterOutput = refinementResult.arbiterOutput;
      break;
    }

    case DecisionAction.REGENERATE: {
      needsRegeneration = true;
      finalRecommendation = 'REGENERATE';

      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          reason: decision.reason,
        },
        'Judge node: Content needs REGENERATION'
      );
      break;
    }

    case DecisionAction.ESCALATE_TO_HUMAN: {
      needsHumanReview = true;
      finalRecommendation = 'ESCALATE_TO_HUMAN';

      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          confidence: verdict.confidence,
        },
        'Judge node: Escalating to HUMAN REVIEW'
      );
      break;
    }
  }

  if (finalRecommendation === 'ACCEPT' || finalRecommendation === 'ACCEPT_WITH_MINOR_REVISION') {
    let contentForMermaidGate = finalContent?.content ?? contentBody;

    try {
      const initialValidation =
        await validateMermaidRenderInLessonContentBody(contentForMermaidGate);

      if (!initialValidation.passed) {
        logger.warn(
          {
            lessonId: state.lessonSpec.lesson_id,
            recommendationBeforeGate: finalRecommendation,
            totalBlocks: initialValidation.totalBlocks,
            failedBlocks: initialValidation.failedBlocks,
            fallbackComments: initialValidation.fallbackComments,
            failedDiagnostics: initialValidation.diagnostics
              .filter(d => !d.renderValid)
              .slice(0, 3)
              .map(d => ({
                blockIndex: d.blockIndex,
                errors: d.errors,
                codeSnippet: d.codeSnippet,
              })),
          },
          'Judge node: Mermaid render gate failed, applying deterministic remediation'
        );

        const remediationResult = await remediateMermaidInContentBody(contentForMermaidGate);
        contentForMermaidGate = remediationResult.contentBody;

        const postValidation =
          await validateMermaidRenderInLessonContentBody(contentForMermaidGate);
        const remediationMetadata: MermaidRenderRemediationMetadata = {
          attempted: true,
          transformed: remediationResult.transformed,
          strategy: resolveRemediationStrategy(remediationResult.aggregateMetrics),
          fieldsScanned: remediationResult.fieldsScanned,
          fieldsTransformed: remediationResult.fieldsTransformed,
          pipelineRuns: remediationResult.pipelineRuns,
          aggregateMetrics: remediationResult.aggregateMetrics,
          initialFailedBlocks: initialValidation.failedBlocks,
          initialFallbackComments: initialValidation.fallbackComments,
          postFailedBlocks: postValidation.failedBlocks,
          postFallbackComments: postValidation.fallbackComments,
        };

        mermaidRenderValidation = {
          ...postValidation,
          remediation: remediationMetadata,
        };

        if (!postValidation.passed) {
          logger.warn(
            {
              lessonId: state.lessonSpec.lesson_id,
              recommendationAfterGate: finalRecommendation,
              postFailedBlocks: postValidation.failedBlocks,
              postFallbackComments: postValidation.fallbackComments,
              remediationMetadata,
            },
            'Judge node: Mermaid remediation still reports failures, continuing with transformed content'
          );
        } else {
          logger.info(
            {
              lessonId: state.lessonSpec.lesson_id,
              recommendationAfterGate: finalRecommendation,
              remediationMetadata,
            },
            'Judge node: Mermaid remediation succeeded, continuing with transformed content'
          );
        }
      } else {
        mermaidRenderValidation = {
          ...initialValidation,
          remediation: null,
        };
      }

      finalContent = buildLessonContent(state, contentForMermaidGate, finalScore);
      needsRegeneration = false;
      needsHumanReview = false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      mermaidRenderValidation = {
        passed: false,
        totalBlocks: 0,
        failedBlocks: 1,
        fallbackComments: 0,
        diagnostics: [
          {
            blockIndex: -1,
            diagramType: null,
            parseValid: false,
            renderValid: false,
            svgHasRenderableContent: false,
            errors: [`Mermaid render gate crashed: ${errorMessage}`],
            codeSnippet: '',
          },
        ],
        remediation: {
          attempted: true,
          transformed: false,
          strategy: 'none',
          fieldsScanned: 0,
          fieldsTransformed: 0,
          pipelineRuns: 0,
          aggregateMetrics: createEmptyMermaidAggregateMetrics(),
          initialFailedBlocks: 0,
          initialFallbackComments: 0,
          postFailedBlocks: 0,
          postFallbackComments: 0,
          error: errorMessage,
        },
      };

      logger.error(
        {
          lessonId: state.lessonSpec.lesson_id,
          recommendationBeforeGate: finalRecommendation,
          error: errorMessage,
        },
        'Judge node: Mermaid render gate crashed, continuing with existing accepted content'
      );

      finalContent = finalContent ?? buildLessonContent(state, contentForMermaidGate, finalScore);
      needsRegeneration = false;
      needsHumanReview = false;
    }
  }

  return {
    ...context,
    finalContent,
    finalScore,
    finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    refinementTokensUsed,
    arbiterOutput,
    mermaidRenderValidation,
  };
}

/**
 * Phase 5: Finalize judge result
 *
 * Builds final state update including:
 * - Progress summary
 * - Review info
 * - Trace logging
 * - State updates
 *
 * @param context - Complete judge context
 * @returns Final state update object
 */
export async function finalizeJudgeResult(context: JudgeContext): Promise<LessonGraphStateUpdate> {
  const {
    state,
    startTime,
    cascadeResult,
    decision,
    finalContent,
    finalScore,
    finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    refinementTokensUsed,
    arbiterOutput,
    mermaidRenderValidation,
  } = context;

  const durationMs = Date.now() - startTime;
  const totalTokensUsed = (cascadeResult?.totalTokensUsed ?? 0) + (refinementTokensUsed ?? 0);

  // Build reviewInfo
  const reviewInfo = buildReviewInfo(needsHumanReview, cascadeResult);

  // Build enriched output
  const enrichedOutput = buildEnrichedJudgeOutput(
    cascadeResult!,
    state,
    needsRegeneration ?? false,
    needsHumanReview ?? false
  );
  const judgeModelsUsed = extractJudgeModels(enrichedOutput);
  const modelUsed =
    judgeModelsUsed.length === 0
      ? null
      : judgeModelsUsed.length === 1
        ? judgeModelsUsed[0]
        : judgeModelsUsed.join(', ');

  // Log trace
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'judge',
    stepName: 'judge_complete',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
      moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
    },
    outputData: {
      finalRecommendation,
      finalScore,
      decisionAction: decision?.action,
      needsRegeneration,
      judgeModelsUsed,
      enrichedOutput,
      mermaidRenderGate: mermaidRenderValidation
        ? {
            passed: mermaidRenderValidation.passed,
            totalBlocks: mermaidRenderValidation.totalBlocks,
            failedBlocks: mermaidRenderValidation.failedBlocks,
            fallbackComments: mermaidRenderValidation.fallbackComments,
            failedDiagnostics: mermaidRenderValidation.diagnostics
              .filter(d => !d.renderValid)
              .slice(0, 3)
              .map(d => ({
                blockIndex: d.blockIndex,
                errors: d.errors,
                codeSnippet: d.codeSnippet,
              })),
            remediation: mermaidRenderValidation.remediation ?? null,
          }
        : null,
    },
    modelUsed,
    tokensUsed: totalTokensUsed,
    durationMs,
  });

  // Build progress summary
  const completionProgress = buildJudgeProgressSummary(
    finalRecommendation!,
    cascadeResult!,
    decision?.action ?? null,
    state.language,
    durationMs,
    totalTokensUsed,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  // Determine final lesson content
  const finalLessonContent =
    finalRecommendation === 'ACCEPT' || finalRecommendation === 'ACCEPT_WITH_MINOR_REVISION'
      ? finalContent
      : null;

  // Track targeted refinement usage
  const usedTargetedRefinement =
    decision?.action === DecisionAction.TARGETED_FIX ||
    decision?.action === DecisionAction.ITERATIVE_REFINEMENT;

  return {
    currentNode: 'judge',
    lessonContent: finalLessonContent,
    qualityScore: finalScore,
    judgeRecommendation: finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    reviewInfo: reviewInfo ?? undefined,
    regenerationMode: needsRegeneration ? 'full_regenerate' : null,
    regenerateCount: needsRegeneration
      ? (state.regenerateCount ?? 0) + 1
      : (state.regenerateCount ?? 0),
    retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
    tokensUsed: totalTokensUsed,
    durationMs,
    progressSummary: completionProgress,
    ...(usedTargetedRefinement && {
      arbiterOutput,
      targetedRefinementStatus: finalContent ? ('accepted' as const) : ('escalated' as const),
      targetedRefinementTokensUsed: refinementTokensUsed,
    }),
  };
}
