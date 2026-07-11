/**
 * Stage 4 Analysis Orchestrator Phase Helpers
 *
 * Individual phase execution functions extracted from orchestrator-helpers.ts
 * to comply with ESLint max-lines rule.
 *
 * @module stages/stage4-analysis/orchestrator-phase-helpers
 */

import { getRedisClient } from '../../shared/cache/redis';
import { runPhase1Classification } from './phases/phase-1-classifier';
import { runPhase2Scope } from './phases/phase-2-scope';
import { runPhase3Expert } from './phases/phase-3-expert';
import { runPhase4Synthesis } from './phases/phase-4-synthesis';
import {
  runPhase05Clarifying,
  getPendingQuestions,
  getAnsweredQuestions,
  getClarifyingConfig,
  autoAnswerAllQuestions,
  extractAnswerString,
} from './phases/phase-0.5-clarifying';
import {
  updateCourseProgress,
  startPhase,
  completePhase,
  PROGRESS_RANGES,
  PROGRESS_MESSAGES,
} from './utils/validators';
import { getAndClearTraceData } from './utils/observability';
import {
  detectSectionBreakdownOverlap,
  buildOverlapFeedback,
} from './phases/phase-2-scope-helpers';
import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import type pino from 'pino';
import { ClarifyingQuestionsInterrupt } from '@/shared/errors';
import { logTrace } from '../../shared/trace-logger';
import type { AnalysisContext } from './orchestrator-helpers';
import { getErrorMessage } from '@/shared/workspace-utils';
import {
  runDocumentEvidencePreflight,
  verifyEvidenceSourcesWithQdrant,
  type DocumentEvidencePreflightDependencies,
  type DocumentEvidencePreflightInput,
  type DocumentEvidencePreflightResult,
} from './evidence/preflight';
import {
  createDocumentEvidenceRepository,
  type DocumentEvidenceDatabaseClient,
} from './evidence/repository';
import { fetchFullTextDocuments } from './handler-helpers';
import {
  createProductionEvidenceExtractor,
  createProductionStructuredEvidencePort,
} from './evidence/card-generator';
import { resolveDownstreamDocumentSummaries } from './evidence/downstream-context';
import { createHash } from 'node:crypto';
import {
  createProductionConflictDetectionPort,
  ConflictDetectionExecutionError,
  detectDocumentConflicts,
  type ConflictMetricDeltas,
  type DetectDocumentConflictsDependencies,
  type DetectDocumentConflictsInput,
} from './evidence/conflict-detector';
import {
  resolveDocumentEvidenceDecisions,
  type ResolveDocumentEvidenceDecisionsDependencies,
  type ResolveDocumentEvidenceDecisionsInput,
} from './evidence/decision-service';
import {
  publishDocumentEvidenceMetricsSafely,
  type DocumentEvidenceMetricEvent,
  type Stage4DurableTotals,
} from '@/shared/metrics/document-evidence-textfile';

export interface DocumentEvidencePhaseOverrides {
  enabled?: boolean;
  mode?: 'shadow' | 'active';
  runPreflight?: (
    input: DocumentEvidencePreflightInput,
    dependencies: DocumentEvidencePreflightDependencies
  ) => Promise<DocumentEvidencePreflightResult>;
  preflightDependencies?: DocumentEvidencePreflightDependencies;
  detectConflicts?: typeof detectDocumentConflicts;
  conflictDependencies?: DetectDocumentConflictsDependencies;
  resolveDecisions?: typeof resolveDocumentEvidenceDecisions;
  decisionDependencies?: ResolveDocumentEvidenceDecisionsDependencies;
  decisionMode?: 'manual' | 'automatic';
  retryDirective?: DocumentEvidencePreflightInput['retryDirective'];
  retryCoordinator?: Pick<
    ReturnType<typeof createDocumentEvidenceRepository>,
    | 'getDegradedRetryState'
    | 'recordAutomaticRetry'
    | 'getPendingRetryDirectives'
    | 'consumeRetryDirectives'
  >;
  publishMetrics?: typeof publishDocumentEvidenceMetricsSafely;
  loadCriticalConflictState?: () => Promise<{
    unresolved: number;
    oldestUnixSeconds: number;
    observedAtUnixMilliseconds: number;
  }>;
  loadDecisionTotals?: () => Promise<{
    user: number;
    system: number;
    degradedAutomatic: number;
  }>;
  loadDurableTotals?: () => Promise<Stage4DurableTotals>;
}

function stableUuidV8(value: string): string {
  const chars = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars
    .slice(12, 16)
    .join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20).join('')}`;
}

function evidenceEnabled(overrides?: DocumentEvidencePhaseOverrides): boolean {
  return overrides?.enabled ?? process.env.DOCUMENT_EVIDENCE_ENABLED === 'true';
}

function failedStage4Metric(
  mode: 'shadow' | 'active',
  durationSeconds: number,
  sourceCount: number,
  durableTotals?: Stage4DurableTotals,
  failureDeltas?: ConflictMetricDeltas
): DocumentEvidenceMetricEvent {
  return {
    stage: 'stage4',
    status: 'failed',
    mode,
    runDelta: 1,
    observedAtUnixMilliseconds: performance.timeOrigin + performance.now(),
    coverage: { source: sourceCount, assessed: 0, degraded: 0, failed: 0 },
    documentDeltas: { source: 0, assessed: 0, degraded: 0, failed: 0 },
    processingModes: {
      full_text: 0,
      hierarchical_summary: 0,
      summary: 0,
      targeted_retrieval: 0,
      metadata_only: 0,
    },
    batches: failureDeltas?.batches ?? 0,
    inputTokens: failureDeltas?.usage.input_tokens ?? 0,
    outputTokens: failureDeltas?.usage.output_tokens ?? 0,
    modelCalls: failureDeltas?.usage.model_calls ?? 0,
    costUsd: failureDeltas?.usage.total_cost_usd ?? 0,
    durationSeconds,
    conflicts: failureDeltas?.conflicts ?? {
      critical: 0,
      important: 0,
      informational: 0,
    },
    decisions: { user: 0, system: 0, degradedAutomatic: 0 },
    ...(durableTotals ? { durableTotals } : {}),
  };
}

async function loadDurableCriticalConflictState(context: AnalysisContext): Promise<{
  unresolved: number;
  oldestUnixSeconds: number;
  observedAtUnixMilliseconds: number;
}> {
  const { data, error, count } = await context.supabase
    .from('clarifying_questions')
    .select('created_at', { count: 'exact' })
    .eq('question_category', 'document_conflicts')
    .eq('question_priority', 'critical')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error('Critical conflict metrics reconciliation failed');
  const unresolved = count ?? data?.length ?? 0;
  const createdAt = data?.[0]?.created_at;
  const oldestUnixSeconds =
    unresolved > 0 && typeof createdAt === 'string'
      ? Math.floor(new Date(createdAt).getTime() / 1000)
      : 0;
  if (unresolved > 0 && (!Number.isSafeInteger(oldestUnixSeconds) || oldestUnixSeconds <= 0)) {
    throw new Error('Critical conflict metrics reconciliation returned an invalid timestamp');
  }
  return {
    unresolved,
    oldestUnixSeconds,
    observedAtUnixMilliseconds: performance.timeOrigin + performance.now(),
  };
}

async function loadDurableStage4Totals(context: AnalysisContext): Promise<Stage4DurableTotals> {
  type DurableTotalsClient = {
    rpc(
      functionName: 'get_document_evidence_observability_totals'
    ): Promise<{ data: unknown; error: unknown }>;
  };
  const totalsClient = context.supabase as unknown as DurableTotalsClient;
  const { data, error } = await totalsClient.rpc('get_document_evidence_observability_totals');
  if (error || !data) throw new Error('Document evidence metrics reconciliation failed');
  const row = data as Record<string, unknown>;
  const count = (column: string): number => {
    const value = Number(row[column]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Document evidence metrics reconciliation returned invalid totals');
    }
    return value;
  };
  const amount = (column: string): number => {
    const value = Number(row[column]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Document evidence metrics reconciliation returned invalid totals');
    }
    return value;
  };
  return {
    databaseStartUnixMilliseconds: count('database_start_unix_milliseconds'),
    generation: count('generation'),
    revision: count('revision'),
    runs: { accepted: count('accepted_runs'), failed: count('failed_runs') },
    documents: {
      source: count('source_documents'),
      assessed: count('assessed_documents'),
      degraded: count('degraded_documents'),
      failed: count('failed_documents'),
    },
    latestCoverage: {
      source: count('latest_coverage_source'),
      assessed: count('latest_coverage_assessed'),
      degraded: count('latest_coverage_degraded'),
      failed: count('latest_coverage_failed'),
    },
    processingModes: {
      full_text: count('full_text_documents'),
      hierarchical_summary: count('hierarchical_summary_documents'),
      summary: count('summary_documents'),
      targeted_retrieval: count('targeted_retrieval_documents'),
      metadata_only: count('metadata_only_documents'),
    },
    batches: count('batches'),
    modelCalls: count('model_calls'),
    inputTokens: count('input_tokens'),
    outputTokens: count('output_tokens'),
    costUsd: amount('total_cost_usd'),
    durationSeconds: amount('duration_seconds'),
    conflicts: {
      critical: count('critical_conflicts'),
      important: count('important_conflicts'),
      informational: count('informational_conflicts'),
    },
    decisions: {
      user: count('user_decisions'),
      system: count('system_decisions'),
      degradedAutomatic: count('degraded_automatic_decisions'),
    },
  };
}

async function tryLoadDurableTotals(
  context: AnalysisContext,
  overrides?: DocumentEvidencePhaseOverrides
): Promise<Stage4DurableTotals | undefined> {
  try {
    return await (overrides?.loadDurableTotals ?? (() => loadDurableStage4Totals(context)))();
  } catch {
    return undefined;
  }
}

/** Runs after Phase 1 and before the existing Phase 0.5 pause/resume boundary. */
export async function runDocumentEvidencePhase(
  context: AnalysisContext,
  overrides?: DocumentEvidencePhaseOverrides
): Promise<void> {
  if (!evidenceEnabled(overrides) || context.originalDocumentSummaries.length === 0) return;
  const startedAt = Date.now();
  const mode =
    overrides?.mode ?? (process.env.DOCUMENT_EVIDENCE_MODE === 'active' ? 'active' : 'shadow');
  const publishMetrics = overrides?.publishMetrics ?? publishDocumentEvidenceMetricsSafely;
  try {
    const metric = await runDocumentEvidencePhaseCore(context, overrides, mode, startedAt);
    await publishMetrics(metric, context.orchestrationLogger);
  } catch (error) {
    const durableTotals = await tryLoadDurableTotals(context, overrides);
    const failureDeltas =
      error instanceof ConflictDetectionExecutionError ? error.metricDeltas : undefined;
    await publishMetrics(
      failedStage4Metric(
        mode,
        Math.max(0, (Date.now() - startedAt) / 1000),
        context.originalDocumentSummaries.length,
        durableTotals,
        failureDeltas
      ),
      context.orchestrationLogger
    );
    throw error;
  }
}

async function runDocumentEvidencePhaseCore(
  context: AnalysisContext,
  overrides: DocumentEvidencePhaseOverrides | undefined,
  mode: 'shadow' | 'active',
  startedAt: number
): Promise<DocumentEvidenceMetricEvent> {
  if (!context.phase1Output) throw new Error('Phase 1 output required for document evidence');

  const allocationById = new Map(
    context.budgetAllocation?.documents.map(document => [document.file_id, document]) ?? []
  );
  const sources = context.originalDocumentSummaries.map(document => {
    if (!document.source_version_hash) {
      throw new Error(`Document ${document.document_id} is missing a source version hash`);
    }
    const allocatedPriority = allocationById.get(document.document_id)?.priority;
    return {
      documentId: document.document_id,
      documentName: document.file_name,
      sourceVersionHash: document.source_version_hash,
      priority: document.stage3_priority ?? allocatedPriority ?? 'SUPPLEMENTARY',
      authorityScope: 'course_source' as const,
      contentQuality: document.summary_metadata.quality_score,
      originalTokens: document.summary_metadata.original_tokens,
      summaryTokens: document.summary_metadata.summary_tokens,
      stage3Summary: document.processed_content || undefined,
      stage3SummaryVersionHash: document.summary_source_version_hash,
      importanceScore: document.stage3_importance_score ?? document.summary_metadata.quality_score,
    };
  });

  const decisionMode =
    overrides?.decisionMode ??
    (mode === 'active' &&
    !overrides?.preflightDependencies &&
    (await getClarifyingConfig(context.courseId)).isAutomatic
      ? 'automatic'
      : 'manual');
  const evidenceRepository = createDocumentEvidenceRepository(
    context.supabase as unknown as DocumentEvidenceDatabaseClient
  );
  const dependencies =
    overrides?.preflightDependencies ??
    (() => {
      const modelId = context.budgetAllocation?.modelSelection.modelId;
      if (!modelId) throw new Error('Configured Stage 4 model is required for document evidence');
      return {
        repository: evidenceRepository,
        structuredPort: createProductionStructuredEvidencePort(modelId),
        extractor: createProductionEvidenceExtractor(modelId),
        verifyTargetedSources: verifyEvidenceSourcesWithQdrant,
        loadSourceContents: async ({ documentIds }) =>
          fetchFullTextDocuments(documentIds, context.courseId),
      } satisfies DocumentEvidencePreflightDependencies;
    })();
  const retryCoordinator = overrides?.retryCoordinator ?? evidenceRepository;
  const pendingRetryDirectives = overrides?.retryDirective
    ? [overrides.retryDirective]
    : mode === 'active' && (!overrides?.preflightDependencies || overrides.retryCoordinator)
      ? await retryCoordinator.getPendingRetryDirectives(context.courseId, 2)
      : [];
  const runPreflight = overrides?.runPreflight ?? runDocumentEvidencePreflight;
  const preflightInput: DocumentEvidencePreflightInput = {
    courseId: context.courseId,
    organizationId: context.organizationId,
    topic: context.input.topic,
    language: context.input.language === 'en' ? 'en' : 'ru',
    evidenceVersion: 'document-evidence-v1',
    modelId: context.budgetAllocation?.modelSelection.modelId,
    classificationContext: context.phase1Output,
    sources,
    modelContext: context.budgetAllocation?.modelSelection.maxContext ?? 700_000,
    promptReserve: 10_000,
    outputReserve: 16_000,
    maxBatchTokens: 32_000,
    maxRetries: 2,
    maxVerificationDocumentIds: 100,
    requireBoundedDownstreamContext: mode === 'active' && context.legacyBudgetFits === false,
    ...(pendingRetryDirectives.length > 0 ? { retryDirectives: pendingRetryDirectives } : {}),
  };
  let result = await runPreflight(preflightInput, dependencies);
  if (result.status === 'accepted' && result.runId && pendingRetryDirectives.length > 0) {
    await retryCoordinator.consumeRetryDirectives({
      courseId: context.courseId,
      organizationId: context.organizationId,
      targetRunId: result.runId,
      decisionIds: pendingRetryDirectives.map(value => value.decisionId),
    });
  }
  if (mode === 'active' && decisionMode === 'automatic') {
    const maxAutomaticRetryRounds = sources.length * 2;
    for (let round = 0; round < maxAutomaticRetryRounds; round += 1) {
      if (result.status !== 'accepted' || !result.runId) break;
      const directives: NonNullable<DocumentEvidencePreflightInput['retryDirectives']> = [];
      for (const card of result.cards
        .filter(card => card.coverage_status === 'degraded' || card.coverage_status === 'failed')
        .sort((left, right) => left.document_id.localeCompare(right.document_id))) {
        const state = await retryCoordinator.getDegradedRetryState({
          runId: result.runId,
          documentId: card.document_id,
          configuredMaxAttempts: 2,
        });
        if (state.attempt >= state.maxAttempts) continue;
        directives.push(
          await retryCoordinator.recordAutomaticRetry({
            runId: result.runId,
            courseId: context.courseId,
            organizationId: context.organizationId,
            documentId: card.document_id,
            configuredMaxAttempts: state.maxAttempts,
            idempotencyKey: stableUuidV8(
              `document-evidence-auto-retry-v1:${result.runId}:${card.document_id}:${state.attempt + 1}`
            ),
          })
        );
      }
      if (directives.length === 0) break;
      const durableDirectives = await retryCoordinator.getPendingRetryDirectives(
        context.courseId,
        2
      );
      if (
        durableDirectives.length !== directives.length ||
        durableDirectives.some(
          (directive, index) => directive.decisionId !== directives[index]?.decisionId
        )
      ) {
        throw new Error('Durable evidence retry set changed before preflight');
      }
      result = await runPreflight(
        {
          ...preflightInput,
          retryDirective: undefined,
          retryDirectives: durableDirectives,
        },
        dependencies
      );
      if (result.status !== 'accepted' || !result.runId) break;
      await retryCoordinator.consumeRetryDirectives({
        courseId: context.courseId,
        organizationId: context.organizationId,
        targetRunId: result.runId,
        decisionIds: durableDirectives.map(value => value.decisionId),
      });
    }
  }
  context.documentEvidencePreflight = result;
  context.documentEvidenceMode = mode;
  let conflictResult: Awaited<ReturnType<typeof detectDocumentConflicts>> | undefined;
  if (result.status === 'accepted' && result.runId) {
    const repository = evidenceRepository;
    const modelId = context.budgetAllocation?.modelSelection.modelId;
    const conflictDependencies =
      overrides?.conflictDependencies ??
      ({
        repository,
        port: createProductionConflictDetectionPort({ modelId, maxRetries: 2 }),
        verifyMaterialSources: verifyEvidenceSourcesWithQdrant,
        log: context.orchestrationLogger,
      } satisfies DetectDocumentConflictsDependencies);
    const conflictInput: DetectDocumentConflictsInput = {
      runId: result.runId,
      courseId: context.courseId,
      organizationId: context.organizationId,
      language: context.input.language === 'en' ? 'en' : 'ru',
      detectionModel: modelId ?? 'custom-conflict-port',
      detectionVersion: 'document-conflict-v1',
      maxClaimsPerMapBatch: 128,
      maxValueGroupsPerComparison: 16,
      reductionFanIn: 8,
      maxModelCalls: 256,
      maxInputTokens: 32_000,
      maxOutputTokens: 8_000,
    };
    conflictResult = await (overrides?.detectConflicts ?? detectDocumentConflicts)(
      conflictInput,
      conflictDependencies
    );
    if (mode === 'active') {
      const decisionInput: ResolveDocumentEvidenceDecisionsInput = {
        runId: result.runId,
        courseId: context.courseId,
        organizationId: context.organizationId,
        language: context.input.language === 'en' ? 'en' : 'ru',
        mode: decisionMode,
        maxUiExcerptChars: 600,
        maxSourceRefsPerSide: 8,
        maxDocumentsInMetadata: 16,
        maxEvidenceRetryAttempts: 2,
        automaticCapacityPolicy: 'continue_limited',
      };
      context.documentEvidenceDecisions = await (
        overrides?.resolveDecisions ?? resolveDocumentEvidenceDecisions
      )(
        decisionInput,
        overrides?.decisionDependencies ?? { repository, log: context.orchestrationLogger }
      );
    }
  }
  context.orchestrationLogger.info(
    {
      evidenceMode: mode,
      evidenceStatus: result.status,
      sourceCount: result.coverage.source_count,
      assessedCount: result.coverage.assessed_count,
      degradedCount: result.coverage.degraded_count,
      failedCount: result.coverage.failed_count,
    },
    'Document evidence preflight complete'
  );
  const processingModes = {
    full_text: 0,
    hierarchical_summary: 0,
    summary: 0,
    targeted_retrieval: 0,
    metadata_only: 0,
  };
  for (const card of result.cards) {
    if (card.processing_mode in processingModes) {
      processingModes[card.processing_mode] += 1;
    }
  }
  const conflicts = conflictResult?.conflicts ?? [];
  const preflightMetricDeltas = result.metricDeltas ?? {
    acceptedRun: 1 as const,
    documents: {
      source: result.coverage.source_count,
      assessed: result.coverage.assessed_count,
      degraded: result.coverage.degraded_count,
      failed: result.coverage.failed_count,
    },
    processingModes,
    batches: result.batchDocumentIds.length,
    generationMetrics: result.generationMetrics,
  };
  const conflictMetricDeltas = conflictResult?.metricDeltas ?? {
    batches: conflictResult?.batchCount ?? 0,
    usage: conflictResult?.usage,
    conflicts: {
      critical: conflicts.filter(conflict => conflict.severity === 'critical').length,
      important: conflicts.filter(conflict => conflict.severity === 'important').length,
      informational: conflicts.filter(conflict => conflict.severity === 'informational').length,
    },
  };
  const conflictUsage = conflictMetricDeltas.usage;
  let criticalConflictState:
    | { unresolved: number; oldestUnixSeconds: number; observedAtUnixMilliseconds: number }
    | undefined;
  try {
    criticalConflictState = await (
      overrides?.loadCriticalConflictState ?? (() => loadDurableCriticalConflictState(context))
    )();
  } catch {
    // A failed reconciliation must never clear a previously published unresolved state.
  }
  const durableTotals = await tryLoadDurableTotals(context, overrides);
  let decisionTotals = durableTotals?.decisions;
  if (!decisionTotals && overrides?.loadDecisionTotals) {
    try {
      decisionTotals = await overrides.loadDecisionTotals();
    } catch {
      // A failed totals reconciliation must not change monotonic decision counters.
    }
  }
  return {
    stage: 'stage4',
    status: 'accepted',
    mode,
    runDelta: preflightMetricDeltas.acceptedRun,
    observedAtUnixMilliseconds: performance.timeOrigin + performance.now(),
    coverage: {
      source: result.coverage.source_count,
      assessed: result.coverage.assessed_count,
      degraded: result.coverage.degraded_count,
      failed: result.coverage.failed_count,
    },
    documentDeltas: preflightMetricDeltas.documents,
    processingModes: preflightMetricDeltas.processingModes,
    batches: preflightMetricDeltas.batches + conflictMetricDeltas.batches,
    inputTokens:
      preflightMetricDeltas.generationMetrics.inputTokens + (conflictUsage?.input_tokens ?? 0),
    outputTokens:
      preflightMetricDeltas.generationMetrics.outputTokens + (conflictUsage?.output_tokens ?? 0),
    modelCalls:
      preflightMetricDeltas.generationMetrics.modelCalls + (conflictUsage?.model_calls ?? 0),
    costUsd:
      preflightMetricDeltas.generationMetrics.totalCostUsd + (conflictUsage?.total_cost_usd ?? 0),
    durationSeconds:
      preflightMetricDeltas.acceptedRun === 1 ? Math.max(0, (Date.now() - startedAt) / 1000) : 0,
    conflicts: conflictMetricDeltas.conflicts,
    ...(decisionTotals ? { decisions: decisionTotals } : {}),
    ...(durableTotals ? { durableTotals } : {}),
    ...(criticalConflictState ? { criticalConflictState } : {}),
  };
}

/**
 * Complete a phase and log its trace data
 *
 * Consolidates the repeated completePhase + getAndClearTraceData + logTrace pattern
 * used by phases 2, 3, and 4.
 *
 * @param phaseNumber - Phase number (2, 3, or 4)
 * @param tracePhaseName - Phase name for trace lookup (e.g., 'stage_4_scope')
 * @param stepName - Step name for trace logging (e.g., 'scope_analysis')
 * @param context - Analysis context
 * @param output - Phase output with phase_metadata
 * @param completionMetadata - Metadata to pass to completePhase
 * @param inputData - Input data for trace logging
 */
async function completePhaseWithTrace<
  T extends {
    phase_metadata: {
      tokens: { input: number; output: number };
      model_used: string;
      duration_ms: number;
    };
  },
>(
  phaseNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  tracePhaseName: string,
  stepName: string,
  context: AnalysisContext,
  output: T,
  completionMetadata: Record<string, unknown>,
  inputData: Record<string, unknown>
): Promise<void> {
  const { courseId, supabase, orchestrationLogger } = context;

  await completePhase(phaseNumber, courseId, supabase, orchestrationLogger, completionMetadata);

  const traceData = getAndClearTraceData(courseId, tracePhaseName);

  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: tracePhaseName,
    stepName,
    inputData,
    outputData: output,
    promptText: traceData?.promptText,
    completionText: traceData?.completionText,
    tokensUsed: output.phase_metadata.tokens.input + output.phase_metadata.tokens.output,
    modelUsed: output.phase_metadata.model_used,
    durationMs: output.phase_metadata.duration_ms,
  });
}

/**
 * Run Phase 1 classification
 * Phase 1: Basic Classification (12-25%)
 */
export async function runClassificationPhase(context: AnalysisContext): Promise<void> {
  const { courseId, input, supabase, orchestrationLogger, originalDocumentSummaries } = context;
  const phase1CacheKey = `phase1_cache:${courseId}`;
  const redis = getRedisClient();

  let phase1Output!: Phase1Output;
  let usedCache = false;

  // Check Redis cache
  let cachedPhase1: string | null = null;
  try {
    cachedPhase1 = await redis.get(phase1CacheKey);
  } catch (redisError) {
    orchestrationLogger.warn(
      { error: getErrorMessage(redisError) },
      'Redis get failed for Phase 1 cache'
    );
  }

  if (cachedPhase1) {
    try {
      const parsed = JSON.parse(cachedPhase1) as Phase1Output;
      if (!parsed?.course_category?.primary || !parsed?.topic_analysis) {
        throw new Error('Invalid cached Phase1Output structure');
      }
      phase1Output = parsed;
      usedCache = true;
      orchestrationLogger.info(
        { category: phase1Output.course_category.primary, source: 'redis_cache' },
        'Phase 1: Using cached classification'
      );
    } catch (parseError) {
      orchestrationLogger.warn(
        { error: getErrorMessage(parseError) },
        'Phase 1 cache corrupted, re-executing'
      );
      try {
        await redis.del(phase1CacheKey);
      } catch {
        /* ignore */
      }
    }
  }

  if (!usedCache) {
    await startPhase(1, courseId, supabase, orchestrationLogger);

    phase1Output = await executePhaseWithRetry(
      'phase1_classification',
      () =>
        runPhase1Classification({
          course_id: courseId,
          language: input.language,
          topic: input.topic,
          document_summaries:
            originalDocumentSummaries?.map(ds => ({
              document_id: ds.document_id,
              file_name: ds.file_name,
              processed_content: ds.processed_content,
            })) || null,
          target_audience: input.target_audience,
          lesson_duration_minutes: input.lesson_duration_minutes,
          course_description: input.course_description,
        }),
      orchestrationLogger
    );

    await completePhase(1, courseId, supabase, orchestrationLogger, {
      category: phase1Output.course_category.primary,
      confidence: phase1Output.course_category.confidence,
      complexity: phase1Output.topic_analysis.complexity,
      duration_ms: phase1Output.phase_metadata.duration_ms,
      model_used: phase1Output.phase_metadata.model_used,
    });

    // Cache in Redis
    try {
      await redis.set(phase1CacheKey, JSON.stringify(phase1Output), 'EX', 86400);
    } catch (cacheError) {
      orchestrationLogger.warn(
        { error: getErrorMessage(cacheError) },
        'Failed to cache Phase 1 output'
      );
    }

    const phase1TraceData = getAndClearTraceData(courseId, 'stage_4_classification');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_classification',
      stepName: 'classify',
      inputData: { topic: input.topic },
      outputData: phase1Output,
      promptText: phase1TraceData?.promptText,
      completionText: phase1TraceData?.completionText,
      tokensUsed:
        phase1Output.phase_metadata.tokens.input + phase1Output.phase_metadata.tokens.output,
      modelUsed: phase1Output.phase_metadata.model_used,
      durationMs: phase1Output.phase_metadata.duration_ms,
    });
  }

  context.phase1Output = phase1Output;
}

/**
 * Run Phase 0.5 clarifying questions
 * Phase 0.5: Clarifying Questions (25-28%)
 */
async function transitionToClarifyingStatus(context: AnalysisContext): Promise<void> {
  const { courseId, supabase, orchestrationLogger } = context;
  const { data: currentCourse } = await supabase
    .from('courses')
    .select('generation_progress')
    .eq('id', courseId)
    .single();
  const currentProgress = (currentCourse?.generation_progress ?? {}) as Record<string, unknown>;
  const { error: statusError } = await supabase
    .from('courses')
    .update({
      generation_status: 'stage_4_clarifying',
      generation_progress: {
        ...currentProgress,
        message: PROGRESS_MESSAGES.step_0_5_waiting,
      },
      last_progress_update: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);
  if (statusError) {
    orchestrationLogger.error(
      { error: statusError.message },
      'Failed to transition to stage_4_clarifying'
    );
    throw new Error('Failed to persist the clarifying question boundary');
  }
}

export async function runClarifyingPhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    budgetAllocation,
    phase1Output,
    resolvedDocumentSummaries,
  } = context;

  if (!phase1Output) {
    throw new Error('Phase 1 output required for clarifying phase');
  }

  const clarifyingConfig = await getClarifyingConfig(courseId);

  const conflictPauseRequired = context.documentEvidenceDecisions?.pauseRequired === true;
  if ((!clarifyingConfig.enabled || clarifyingConfig.skipped) && !conflictPauseRequired) {
    orchestrationLogger.info('Clarifying questions disabled or skipped');
    return;
  }

  orchestrationLogger.info(
    { isAutomatic: clarifyingConfig.isAutomatic },
    'Clarifying questions enabled'
  );

  const pendingQuestions = await getPendingQuestions(courseId);
  const answeredQuestions = await getAnsweredQuestions(courseId);
  const ordinaryPendingQuestions = pendingQuestions.filter(
    question => question.question_category !== 'document_conflicts'
  );
  const ordinaryAnsweredQuestions = answeredQuestions.filter(
    question => question.question_category !== 'document_conflicts'
  );
  const hasExistingQuestions =
    ordinaryPendingQuestions.length > 0 || ordinaryAnsweredQuestions.length > 0;

  if (clarifyingConfig.enabled && !clarifyingConfig.skipped && !hasExistingQuestions) {
    // Generate questions
    orchestrationLogger.info('Generating clarifying questions');
    await updateCourseProgress(
      courseId,
      'in_progress',
      PROGRESS_RANGES.step_0_5.start,
      PROGRESS_MESSAGES.step_0_5_start,
      supabase
    );

    await runPhase05Clarifying({
      course_id: courseId,
      budgetAllocation: budgetAllocation,
      courseContext: {
        title: input.topic,
        description: input.course_description,
        target_audience: input.target_audience,
      },
      language: input.language,
      document_summaries: resolvedDocumentSummaries?.map(ds => ({
        file_name: ds.file_name,
        processed_content: ds.processed_content,
      })),
      phase1_output: phase1Output,
    });

    if (clarifyingConfig.isAutomatic) {
      const answeredCount = await autoAnswerAllQuestions(courseId);
      orchestrationLogger.info({ answeredCount }, 'Automatic mode: auto-answered questions');
      await updateCourseProgress(
        courseId,
        'in_progress',
        PROGRESS_RANGES.step_0_5.end,
        PROGRESS_MESSAGES.step_0_5_complete,
        supabase
      );
    } else {
      // The status/progress write is the durable resume boundary. It must also be
      // used when ordinary clarifying generation is disabled but evidence added
      // required questions.
      await transitionToClarifyingStatus(context);

      const generatedQuestions = await getPendingQuestions(courseId);
      const criticalCount = generatedQuestions.filter(
        q => q.question_priority === 'critical' || q.question_priority === 'important'
      ).length;

      throw new ClarifyingQuestionsInterrupt(criticalCount, generatedQuestions.length, courseId);
    }
  } else if (pendingQuestions.length > 0) {
    const criticalPending = pendingQuestions.filter(
      q => q.question_priority === 'critical' || q.question_priority === 'important'
    );

    if (criticalPending.length > 0) {
      if (clarifyingConfig.isAutomatic) {
        const answeredCount = await autoAnswerAllQuestions(courseId);
        orchestrationLogger.info({ answeredCount }, 'Automatic mode: auto-answered remaining');
      } else {
        await transitionToClarifyingStatus(context);
        throw new ClarifyingQuestionsInterrupt(
          criticalPending.length,
          pendingQuestions.length,
          courseId
        );
      }
    }
  }

  // Collect answered questions
  const clarifyingAnswers = await getAnsweredQuestions(courseId);
  context.clarifyingAnswers = clarifyingAnswers.map(q => ({
    question: q.question_text,
    answer: extractAnswerString(q.user_answer),
    priority: q.question_priority,
    category: q.question_category || 'general',
  }));

  if (context.clarifyingAnswers.length > 0) {
    orchestrationLogger.info(
      { answeredCount: context.clarifyingAnswers.length },
      'Clarifying answers available'
    );
  }

  await updateCourseProgress(
    courseId,
    'in_progress',
    PROGRESS_RANGES.step_0_5.end,
    PROGRESS_MESSAGES.step_0_5_complete,
    supabase
  );
}

/**
 * Run Phase 2 scope analysis
 * Phase 2: Scope Analysis (28-45%)
 */
export async function runScopePhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    phase1Output,
    clarifyingAnswers,
    resolvedDocumentSummaries,
  } = context;

  if (!phase1Output) {
    throw new Error('Phase 1 output required for scope phase');
  }
  const downstreamDocumentSummaries = resolveDownstreamDocumentSummaries(
    resolvedDocumentSummaries,
    context.documentEvidenceMode === 'active'
      ? context.documentEvidencePreflight?.downstreamRepresentation
      : undefined
  );

  await startPhase(2, courseId, supabase, orchestrationLogger);

  const MAX_OVERLAP_RETRIES = 2;
  let overlapFeedback: string | undefined;
  let phase2Output: Phase2Output | undefined;

  for (let overlapAttempt = 0; overlapAttempt <= MAX_OVERLAP_RETRIES; overlapAttempt++) {
    phase2Output = await executePhaseWithRetry(
      'phase2_scope',
      () =>
        runPhase2Scope({
          course_id: courseId,
          language: input.language,
          topic: input.topic,
          document_summaries: downstreamDocumentSummaries.map(ds => ds.processed_content),
          phase1_output: phase1Output,
          course_size: input.course_size,
          target_lessons: input.target_lessons,
          target_sections: input.target_sections,
          size_guidance: input.size_guidance,
          min_lessons: input.min_lessons,
          max_lessons: input.max_lessons,
          clarifying_answers: clarifyingAnswers,
          course_description: input.course_description,
          learning_outcomes: input.learning_outcomes,
          overlap_feedback: overlapFeedback,
        }),
      orchestrationLogger
    );

    // Detect semantic overlap in generated sections
    try {
      const overlapResult = await detectSectionBreakdownOverlap(
        phase2Output.recommended_structure.sections_breakdown,
        input.language
      );

      if (overlapResult.hasOverlap) {
        orchestrationLogger.warn(
          {
            phase: 'phase2_scope',
            overlapAttempt,
            overlappingPairs: overlapResult.overlappingPairs.map(p => ({
              sections: [p.sectionIndexA, p.sectionIndexB],
              areas: [p.areaA, p.areaB],
              similarity: Math.round(p.similarity * 100) + '%',
            })),
          },
          `Phase 2 overlap detected (attempt ${overlapAttempt + 1}/${MAX_OVERLAP_RETRIES + 1})`
        );

        if (overlapAttempt < MAX_OVERLAP_RETRIES) {
          overlapFeedback = buildOverlapFeedback(overlapResult);
          continue; // Retry with overlap feedback
        }

        // Final attempt still has overlap - log but proceed
        orchestrationLogger.error(
          {
            phase: 'phase2_scope',
            overlapPairs: overlapResult.overlappingPairs.length,
            maxRetries: MAX_OVERLAP_RETRIES,
          },
          'Phase 2 overlap persists after all retries, proceeding with overlapping sections'
        );
      } else {
        if (overlapAttempt > 0) {
          orchestrationLogger.info(
            { phase: 'phase2_scope', resolvedAfterAttempts: overlapAttempt + 1 },
            'Phase 2 overlap resolved after retry'
          );
        }
      }
    } catch (overlapError) {
      // Overlap detection failed (e.g., Jina API down) - non-blocking, proceed
      orchestrationLogger.warn(
        {
          phase: 'phase2_scope',
          error: overlapError instanceof Error ? overlapError.message : String(overlapError),
        },
        'Overlap detection failed, proceeding without overlap check'
      );
    }

    break; // No overlap or detection failed - proceed
  }

  // phase2Output is guaranteed to be set here (at least one iteration runs)
  await completePhaseWithTrace(
    2,
    'stage_4_scope',
    'scope_analysis',
    context,
    phase2Output!,
    {
      total_lessons: phase2Output!.recommended_structure.total_lessons,
      total_sections: phase2Output!.recommended_structure.total_sections,
      estimated_hours: phase2Output!.recommended_structure.estimated_content_hours,
      duration_ms: phase2Output!.phase_metadata.duration_ms,
      model_used: phase2Output!.phase_metadata.model_used,
    },
    { topic: input.topic }
  );

  context.phase2Output = phase2Output!;
}

/**
 * Run Phase 3 expert analysis
 * Phase 3: Deep Expert Analysis (45-70%)
 */
export async function runExpertPhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    phase1Output,
    phase2Output,
    clarifyingAnswers,
    resolvedDocumentSummaries,
  } = context;

  if (!phase1Output || !phase2Output) {
    throw new Error('Phase 1 and 2 outputs required for expert phase');
  }

  await startPhase(3, courseId, supabase, orchestrationLogger);

  const downstreamDocumentSummaries = resolveDownstreamDocumentSummaries(
    resolvedDocumentSummaries,
    context.documentEvidenceMode === 'active'
      ? context.documentEvidencePreflight?.downstreamRepresentation
      : undefined
  );
  const documentSummariesText = downstreamDocumentSummaries.map(ds => ds.processed_content);
  const boundedRepresentation =
    context.documentEvidenceMode === 'active'
      ? context.documentEvidencePreflight?.downstreamRepresentation
      : undefined;

  const phase3Output: Phase3Output = await executePhaseWithRetry(
    'phase3_expert',
    () =>
      runPhase3Expert({
        course_id: courseId,
        language: input.language,
        topic: input.topic,
        document_summaries: documentSummariesText,
        phase1_output: phase1Output,
        phase2_output: phase2Output,
        clarifying_answers: clarifyingAnswers,
        budget_context: boundedRepresentation
          ? {
              documents: [
                {
                  file_name: 'Synthetic advisory evidence digest (not an uploaded document)',
                  mode: 'summary',
                  priority: 'SUPPLEMENTARY',
                  tokens: boundedRepresentation.tokenCount,
                },
              ],
              totalTokens: boundedRepresentation.tokenCount,
            }
          : context.budgetAllocation
            ? {
                documents: context.budgetAllocation.documents.map(d => {
                  const docSummary = downstreamDocumentSummaries.find(
                    ds => ds.document_id === d.file_id
                  );
                  if (!docSummary) {
                    orchestrationLogger.warn(
                      { file_id: d.file_id, priority: d.priority },
                      'Budget document not found in resolvedDocumentSummaries, using file_id as name'
                    );
                  }
                  return {
                    file_name: docSummary?.file_name || d.file_id,
                    mode: d.mode,
                    priority: d.priority,
                    tokens: d.tokens,
                  };
                }),
                totalTokens: context.budgetAllocation.totalTokens,
              }
            : undefined,
      }),
    orchestrationLogger
  );

  await completePhaseWithTrace(
    3,
    'stage_4_expert',
    'expert_analysis',
    context,
    phase3Output,
    {
      research_flags_count: phase3Output.research_flags.length,
      duration_ms: phase3Output.phase_metadata.duration_ms,
      model_used: phase3Output.phase_metadata.model_used,
    },
    { topic: input.topic }
  );

  context.phase3Output = phase3Output;
}

/**
 * Run Phase 4 synthesis
 * Phase 4: Document Synthesis (70-85%)
 */
export async function runSynthesisPhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    phase1Output,
    phase2Output,
    phase3Output,
    clarifyingAnswers,
    resolvedDocumentSummaries,
  } = context;

  if (!phase1Output || !phase2Output || !phase3Output) {
    throw new Error('Phase 1, 2, and 3 outputs required for synthesis phase');
  }
  const downstreamDocumentSummaries = resolveDownstreamDocumentSummaries(
    resolvedDocumentSummaries,
    context.documentEvidenceMode === 'active'
      ? context.documentEvidencePreflight?.downstreamRepresentation
      : undefined
  );

  await startPhase(4, courseId, supabase, orchestrationLogger);

  const phase4Output: Phase4Output = await executePhaseWithRetry(
    'phase4_synthesis',
    () =>
      runPhase4Synthesis({
        course_id: courseId,
        language: input.language,
        topic: input.topic,
        document_summaries: downstreamDocumentSummaries,
        phase1_output: phase1Output,
        phase2_output: phase2Output,
        phase3_output: phase3Output,
        clarifying_answers: clarifyingAnswers,
      }),
    orchestrationLogger
  );

  await completePhaseWithTrace(
    4,
    'stage_4_synthesis',
    'document_synthesis',
    context,
    phase4Output,
    {
      generation_guidance_tone: phase4Output.generation_guidance.tone,
      duration_ms: phase4Output.phase_metadata.duration_ms,
      model_used: phase4Output.phase_metadata.model_used,
      document_count: phase4Output.phase_metadata.document_count,
    },
    { documentCount: phase4Output.phase_metadata.document_count }
  );

  // Log parameter storage
  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: 'completion',
    stepName: 'parameter_store',
    inputData: {
      source: 'phase_4_synthesis',
      hasGenerationGuidance: !!phase4Output.generation_guidance,
    },
    outputData: {
      generation_guidance: phase4Output.generation_guidance,
    },
    durationMs: 0,
  });

  if (phase4Output.generation_guidance) {
    orchestrationLogger.info(
      {
        tone: phase4Output.generation_guidance.tone,
        use_analogies: phase4Output.generation_guidance.use_analogies,
      },
      'Phase 4: Generation guidance created'
    );
  }

  context.phase4Output = phase4Output;
}

/**
 * Errors that indicate structural/input problems — retrying won't help.
 * Aligned with Stage 5/6 non-retryable bail-out pattern.
 */
function isNonRetryablePhaseError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('validation failed') ||
    msg.includes('validation error') ||
    msg.includes('schema validation') ||
    msg.includes('zod') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid phase') ||
    msg.includes('mismatch')
  );
}

/**
 * Execute phase with retry and exponential backoff
 */
export async function executePhaseWithRetry<T>(
  phaseName: string,
  phaseFunc: () => Promise<T>,
  phaseLogger: pino.Logger
): Promise<T> {
  const RETRY_CONFIG = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        phaseLogger.info(
          {
            phase: phaseName,
            attempt,
            maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          },
          `Retry attempt ${attempt} for ${phaseName}`
        );
      }

      return await phaseFunc();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry structural/validation errors — they'll fail again
      if (isNonRetryablePhaseError(lastError)) {
        phaseLogger.warn(
          { phase: phaseName, attempt, error: lastError.message },
          `Phase ${phaseName} hit non-retryable error, bailing out`
        );
        throw lastError;
      }

      phaseLogger.warn(
        {
          phase: phaseName,
          attempt,
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          error: lastError.message,
        },
        `Phase ${phaseName} attempt ${attempt} failed`
      );

      if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
        const delayMs = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        phaseLogger.debug(
          {
            phase: phaseName,
            delayMs,
            nextAttempt: attempt + 1,
          },
          `Waiting ${delayMs}ms before retry`
        );
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(
    `Phase ${phaseName} failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
