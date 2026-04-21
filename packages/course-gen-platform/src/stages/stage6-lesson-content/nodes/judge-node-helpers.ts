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
import type {
  LessonContent,
  LessonContentBody,
  LessonQualitySignals,
} from '@megacampus/shared-types/lesson-content';
import type {
  MermaidRenderValidationResult,
  MermaidRenderRemediationMetadata,
} from '../utils/mermaid-render-validator';
import { countMermaidFallbackComments } from '../utils/mermaid-render-validator';
import type { CascadeEvaluationInput, CascadeResult } from '../judge/cascade-evaluator';
import { DecisionAction, type DecisionResult } from '../judge/decision-engine';
import { actionToRecommendation } from '../judge/decision-engine';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { costTracker, createTokenUsage } from '@/shared/metrics/cost-tracker';
import { buildLessonContent } from '../judge/judge-helpers';
import { buildEnrichedJudgeOutput, extractJudgeModels } from '../judge/judge-output-builder';
import { buildJudgeProgressSummary } from '../judge/judge-progress';
import { validateMermaidSyntax } from '../utils/mermaid-validator';
import { MERMAID_BLOCK_REGEX } from '../utils/mermaid-sanitizer';

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
  tableFixMetrics?: TableFixPipelineMetrics | null;
  qaSignals?: LessonQualitySignals | null;
}

import {
  createEmptyMermaidAggregateMetrics,
  remediateMermaidInContentBody,
  remediateTablesInContentBody,
  resolveRemediationStrategy,
} from './judge-remediation-helpers';
import type { TableFixPipelineMetrics } from '../utils/table-fix-pipeline';
import { QualityRemediationAction, buildQaSignals } from '../quality/remediation';

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
    state.previousScores,
    {
      isTerminalRemediationRung: state.selectedModelPhase === 'stage_6_auto_last_chance',
    }
  );

  const forcedAction = context.cascadeResult?.heuristicResults?.qualitySummary?.action;
  if (
    forcedAction === QualityRemediationAction.PARTIAL_REGEN &&
    decision.action === DecisionAction.ACCEPT
  ) {
    decision.action = DecisionAction.TARGETED_FIX;
    decision.reason =
      'Deterministic quality guard requested localized regeneration for obvious lesson defects';
  } else if (forcedAction === QualityRemediationAction.REVIEW_REQUIRED) {
    decision.action = DecisionAction.ESCALATE_TO_HUMAN;
    decision.reason = 'Deterministic quality guard escalated lesson to human review';
  }

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
 * Parse-only Mermaid validation for a LessonContentBody.
 *
 * Replaces render-based validation (JSDOM) with mermaid.parse() only.
 * JSDOM has limited SVG support and rejects valid diagrams; parse-only
 * is the reliable gate.
 *
 * Produces a MermaidRenderValidationResult compatible with existing
 * logging/metadata, with renderValid always set to match parseValid.
 */
async function validateMermaidSyntaxInContentBody(
  contentBody: LessonContentBody
): Promise<MermaidRenderValidationResult> {
  // Flatten all text fields that may contain mermaid blocks
  const parts: string[] = [];
  if (contentBody.intro) parts.push(contentBody.intro);
  for (const section of contentBody.sections ?? []) {
    if (section.content) parts.push(section.content);
  }
  for (const example of contentBody.examples ?? []) {
    if (example.content) parts.push(example.content);
  }
  for (const exercise of contentBody.exercises ?? []) {
    if (exercise.question) parts.push(exercise.question);
    if (exercise.solution) parts.push(exercise.solution);
    for (const hint of exercise.hints ?? []) parts.push(hint);
  }
  const markdown = parts.join('\n\n');

  // Extract mermaid code blocks
  MERMAID_BLOCK_REGEX.lastIndex = 0;
  const blocks: { index: number; code: string }[] = [];
  let match: RegExpExecArray | null;
  let blockIndex = 0;
  while ((match = MERMAID_BLOCK_REGEX.exec(markdown)) !== null) {
    blocks.push({ index: blockIndex++, code: match[1].trim() });
  }

  // Validate each block with parse-only
  const diagnostics: MermaidRenderValidationResult['diagnostics'] = [];
  for (const block of blocks) {
    const result = await validateMermaidSyntax(block.code);
    const snippet = block.code.replace(/\s+/g, ' ').trim();
    diagnostics.push({
      blockIndex: block.index,
      diagramType: result.diagramType,
      parseValid: result.valid,
      // renderValid mirrors parseValid — we skip JSDOM render entirely
      renderValid: result.valid,
      svgHasRenderableContent: result.valid,
      errors: result.errors,
      codeSnippet: snippet.length > 140 ? `${snippet.slice(0, 140)}...` : snippet,
    });
  }

  const fallbackComments = countMermaidFallbackComments(markdown);
  const failedBlocks = diagnostics.filter(d => !d.parseValid).length;
  const passed = failedBlocks === 0 && fallbackComments === 0;

  return {
    passed,
    totalBlocks: blocks.length,
    failedBlocks,
    fallbackComments,
    diagnostics,
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
  let tableFixMetrics: TableFixPipelineMetrics | null = null;
  const qualitySummary = context.cascadeResult?.heuristicResults?.qualitySummary;
  const presentationCritic = context.cascadeResult?.heuristicResults?.presentationCritic;
  const qualityRetryCount = state.regenerateCount ?? 0;

  switch (decision.action) {
    case DecisionAction.ACCEPT: {
      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
        },
        'Judge node: Content ACCEPTED'
      );

      finalContent = buildLessonContent(
        state,
        contentBody,
        verdict.overallScore,
        buildQaSignals(
          qualitySummary,
          presentationCritic,
          qualitySummary?.action ?? null,
          qualityRetryCount
        )
      );
      finalRecommendation =
        verdict.recommendation === 'ACCEPT_WITH_MINOR_REVISION'
          ? 'ACCEPT_WITH_MINOR_REVISION'
          : actionToRecommendation(decision.action);
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
      // Parse-only validation: use mermaid.parse() instead of JSDOM render.
      // JSDOM has limited SVG support and rejects valid diagrams — parse-only
      // is the only reliable gate.
      const initialValidation = await validateMermaidSyntaxInContentBody(contentForMermaidGate);

      if (!initialValidation.passed) {
        logger.warn(
          {
            lessonId: state.lessonSpec.lesson_id,
            recommendationBeforeGate: finalRecommendation,
            totalBlocks: initialValidation.totalBlocks,
            failedBlocks: initialValidation.failedBlocks,
            fallbackComments: initialValidation.fallbackComments,
            failedDiagnostics: initialValidation.diagnostics
              .filter(d => !d.parseValid)
              .slice(0, 3)
              .map(d => ({
                blockIndex: d.blockIndex,
                errors: d.errors,
                codeSnippet: d.codeSnippet,
              })),
          },
          'Judge node: Mermaid parse gate failed, applying deterministic remediation'
        );

        const remediationResult = await remediateMermaidInContentBody(contentForMermaidGate);
        contentForMermaidGate = remediationResult.contentBody;

        const postValidation = await validateMermaidSyntaxInContentBody(contentForMermaidGate);
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
            'Judge node: Mermaid remediation still reports parse failures, continuing with transformed content'
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

      const tableRemediationResult = remediateTablesInContentBody(contentForMermaidGate);
      contentForMermaidGate = tableRemediationResult.contentBody;
      tableFixMetrics = tableRemediationResult.aggregateMetrics;

      if (tableRemediationResult.transformed) {
        logger.info(
          {
            lessonId: state.lessonSpec.lesson_id,
            recommendationAfterGate: finalRecommendation,
            tableFixMetrics,
            fieldsScanned: tableRemediationResult.fieldsScanned,
            fieldsTransformed: tableRemediationResult.fieldsTransformed,
          },
          'Judge node: Table remediation applied to accepted content'
        );
      }

      finalContent = buildLessonContent(
        state,
        contentForMermaidGate,
        finalScore,
        buildQaSignals(
          qualitySummary,
          presentationCritic,
          qualitySummary?.action ?? null,
          qualityRetryCount
        )
      );
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
            errors: [`Mermaid parse gate crashed: ${errorMessage}`],
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
        'Judge node: Mermaid parse gate crashed, continuing with existing accepted content'
      );

      finalContent =
        finalContent ??
        buildLessonContent(
          state,
          contentForMermaidGate,
          finalScore,
          buildQaSignals(
            qualitySummary,
            presentationCritic,
            qualitySummary?.action ?? null,
            qualityRetryCount
          )
        );
      needsRegeneration = false;
      needsHumanReview = false;
    }
  }

  const finalQaAction =
    needsHumanReview || finalRecommendation === 'ESCALATE_TO_HUMAN'
      ? QualityRemediationAction.REVIEW_REQUIRED
      : needsRegeneration
        ? QualityRemediationAction.FULL_REGEN
        : (qualitySummary?.action ?? null);

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
    tableFixMetrics,
    qaSignals: buildQaSignals(qualitySummary, presentationCritic, finalQaAction, qualityRetryCount),
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
    tableFixMetrics,
    qaSignals,
  } = context;

  const durationMs = Date.now() - startTime;
  const totalTokensUsed = (cascadeResult?.totalTokensUsed ?? 0) + (refinementTokensUsed ?? 0);
  const totalInputTokens = cascadeResult?.totalInputTokens ?? 0;
  const totalOutputTokens = cascadeResult?.totalOutputTokens ?? 0;

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

  // Calculate cost from per-model token usage
  let costUsd = 0;
  if (judgeModelsUsed.length > 0 && totalInputTokens > 0) {
    // We have per-model breakdown from verdicts — split tokens proportionally
    const perModelInput = Math.round(totalInputTokens / judgeModelsUsed.length);
    const perModelOutput = Math.round(totalOutputTokens / judgeModelsUsed.length);
    for (const modelId of judgeModelsUsed) {
      costUsd += costTracker.calculateCost(
        modelId,
        createTokenUsage(perModelInput, perModelOutput)
      );
    }
  } else if (judgeModelsUsed.length > 0 && totalTokensUsed > 0) {
    // Fallback: no input/output breakdown, estimate 80/20 split
    const estInput = Math.round(totalTokensUsed * 0.8);
    const estOutput = totalTokensUsed - estInput;
    const perModelInput = Math.round(estInput / judgeModelsUsed.length);
    const perModelOutput = Math.round(estOutput / judgeModelsUsed.length);
    for (const modelId of judgeModelsUsed) {
      costUsd += costTracker.calculateCost(
        modelId,
        createTokenUsage(perModelInput, perModelOutput)
      );
    }
  }

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
      inputTokens: totalInputTokens || undefined,
      outputTokens: totalOutputTokens || undefined,
    },
    outputData: {
      finalRecommendation,
      finalScore,
      decisionAction: decision?.action,
      needsRegeneration,
      judgeModelsUsed,
      enrichedOutput,
      qualitySummary: cascadeResult?.heuristicResults?.qualitySummary ?? null,
      mermaidRenderGate: mermaidRenderValidation
        ? {
            passed: mermaidRenderValidation.passed,
            totalBlocks: mermaidRenderValidation.totalBlocks,
            failedBlocks: mermaidRenderValidation.failedBlocks,
            fallbackComments: mermaidRenderValidation.fallbackComments,
            failedDiagnostics: mermaidRenderValidation.diagnostics
              .filter(d => !d.parseValid)
              .slice(0, 3)
              .map(d => ({
                blockIndex: d.blockIndex,
                errors: d.errors,
                codeSnippet: d.codeSnippet,
              })),
            remediation: mermaidRenderValidation.remediation ?? null,
          }
        : null,
      tableRemediation: tableFixMetrics,
    },
    modelUsed,
    tokensUsed: totalTokensUsed,
    costUsd: costUsd > 0 ? costUsd : undefined,
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
    qaSignals: qaSignals ?? undefined,
    ...(usedTargetedRefinement && {
      arbiterOutput,
      targetedRefinementStatus: finalContent ? ('accepted' as const) : ('escalated' as const),
      targetedRefinementTokensUsed: refinementTokensUsed,
    }),
  };
}
