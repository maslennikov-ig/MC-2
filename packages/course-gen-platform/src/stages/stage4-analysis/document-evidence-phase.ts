/**
 * Stage 4's document-evidence phase: the one that reads the user's uploads.
 *
 * @module document-evidence-phase
 *
 * Split out of `orchestrator-phase-helpers.ts` at 1219 lines of code. That file held two things:
 * this phase, which is a pipeline of its own — preflight, generation, conflict detection,
 * decisions, metrics — and the four ordinary analysis phases, which are each one model call and
 * a trace row. Keeping them together meant the four short ones were unfindable behind the long
 * one.
 *
 * Re-exported by `orchestrator-phase-helpers.ts`, so no import path changes.
 */

/**
 * Stage 4 Analysis Orchestrator Phase Helpers
 *
 * Individual phase execution functions extracted from orchestrator-helpers.ts
 * to comply with ESLint max-lines rule.
 *
 * @module stages/stage4-analysis/orchestrator-phase-helpers
 */

import { getClarifyingConfig } from './phases/phase-0.5-clarifying';
import type { AnalysisContext } from './orchestrator-helpers';
import {
  runDocumentEvidencePreflight,
  verifyEvidenceSourcesWithQdrant,
  type DocumentEvidencePreflightDependencies,
  type DocumentEvidencePreflightInput,
  type DocumentEvidencePreflightResult,
  type DocumentEvidencePreflightSource,
} from './evidence/preflight';
import {
  createDocumentEvidenceRepository,
  type DocumentEvidenceDatabaseClient,
} from './evidence/repository';
import { fetchFullTextDocuments, type DocumentSummaryResult } from './handler-helpers';
import {
  createProductionEvidenceExtractor,
  createProductionStructuredEvidencePort,
} from './evidence/card-generator';
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

export function buildPhase1DocumentSummaries(documents: DocumentSummaryResult[]): Array<{
  document_id: string;
  file_name: string;
  processed_content: string;
}> {
  return documents
    .filter(document => document.sourceFailure === undefined)
    .map(document => ({
      document_id: document.document_id,
      file_name: document.file_name,
      processed_content: document.processed_content,
    }));
}

export function stableUuidV8(value: string): string {
  const chars = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars
    .slice(12, 16)
    .join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20).join('')}`;
}

export function evidenceEnabled(overrides?: DocumentEvidencePhaseOverrides): boolean {
  return overrides?.enabled ?? process.env.DOCUMENT_EVIDENCE_ENABLED === 'true';
}

export function failedStage4Metric(
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

export async function loadDurableCriticalConflictState(context: AnalysisContext): Promise<{
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

export async function loadDurableStage4Totals(
  context: AnalysisContext
): Promise<Stage4DurableTotals> {
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

export async function tryLoadDurableTotals(
  context: AnalysisContext,
  overrides?: DocumentEvidencePhaseOverrides
): Promise<Stage4DurableTotals | undefined> {
  try {
    return await (overrides?.loadDurableTotals ?? (() => loadDurableStage4Totals(context)))();
  } catch {
    return undefined;
  }
}

/**
 * Retry the documents whose evidence came back degraded, until they stop improving.
 *
 * Bounded by `sources.length * 2` rounds AND by a per-document attempt count held in the
 * database, because the round counter alone would let one stubborn document consume every round.
 *
 * The durable set is re-read and compared before each preflight: if another writer changed the
 * pending directives between recording them and using them, this throws rather than retrying a
 * set nobody agreed on. That check is the reason the directives are recorded durably at all —
 * an in-memory list would have nothing to disagree with.
 */
async function runAutomaticRetryRounds(args: {
  context: AnalysisContext;
  sources: DocumentEvidencePreflightInput['sources'];
  result: DocumentEvidencePreflightResult;
  preflightInput: DocumentEvidencePreflightInput;
  dependencies: DocumentEvidencePreflightDependencies;
  runPreflight: typeof runDocumentEvidencePreflight;
  /**
   * Just the four retry methods. `overrides.retryCoordinator` supplies a narrower object in
   * tests, and demanding the whole repository here would rule that out for no reason.
   */
  retryCoordinator: Pick<
    ReturnType<typeof createDocumentEvidenceRepository>,
    | 'getDegradedRetryState'
    | 'recordAutomaticRetry'
    | 'getPendingRetryDirectives'
    | 'consumeRetryDirectives'
  >;
}): Promise<DocumentEvidencePreflightResult> {
  const { context, sources, preflightInput, dependencies, runPreflight, retryCoordinator } = args;
  let result = args.result;

  const maxAutomaticRetryRounds = sources.length * 2;
  for (let round = 0; round < maxAutomaticRetryRounds; round += 1) {
    if (result.status !== 'accepted' || !result.runId) break;
    const directives: NonNullable<DocumentEvidencePreflightInput['retryDirectives']> = [];
    for (const card of result.cards
      .filter(
        card =>
          (card.coverage_status === 'degraded' || card.coverage_status === 'failed') &&
          card.coverage_reason !== 'source_file_unrecoverable'
      )
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
    const durableDirectives = await retryCoordinator.getPendingRetryDirectives(context.courseId, 2);
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

  return result;
}

/**
 * Find where the accepted evidence contradicts itself, and record what to do about it.
 *
 * Only runs on an accepted run with an id — there is nothing to compare otherwise. The decision
 * step is skipped outside `active` mode, because a shadow run must observe without writing
 * decisions a user would then see.
 */
async function detectAndResolveConflicts(args: {
  context: AnalysisContext;
  overrides: DocumentEvidencePhaseOverrides | undefined;
  mode: string;
  decisionMode: 'automatic' | 'manual';
  result: DocumentEvidencePreflightResult & { runId: string };
  evidenceRepository: ReturnType<typeof createDocumentEvidenceRepository>;
}): Promise<Awaited<ReturnType<typeof detectDocumentConflicts>>> {
  const { context, overrides, mode, decisionMode, result, evidenceRepository } = args;
  const repository = evidenceRepository;
  const modelId = context.budgetAllocation?.modelSelection.modelId;

  const conflictDependencies =
    overrides?.conflictDependencies ??
    ({
      repository,
      port: createProductionConflictDetectionPort({
        modelId,
        courseId: context.courseId,
        maxRetries: 2,
      }),
      verifyMaterialSources: verifyEvidenceSourcesWithQdrant,
      log: context.orchestrationLogger,
    } satisfies DetectDocumentConflictsDependencies);
  const conflictInput: DetectDocumentConflictsInput = {
    runId: result.runId,
    courseId: context.courseId,
    organizationId: context.organizationId,
    language: context.input.language,
    detectionModel: modelId ?? 'custom-conflict-port',
    detectionVersion: 'document-conflict-v1',
    maxClaimsPerMapBatch: 128,
    maxValueGroupsPerComparison: 16,
    reductionFanIn: 8,
    maxModelCalls: 256,
    maxInputTokens: 32_000,
    maxOutputTokens: 8_000,
  };
  const conflictResult = await (overrides?.detectConflicts ?? detectDocumentConflicts)(
    conflictInput,
    conflictDependencies
  );
  if (mode === 'active') {
    const decisionInput: ResolveDocumentEvidenceDecisionsInput = {
      runId: result.runId,
      courseId: context.courseId,
      organizationId: context.organizationId,
      language: context.input.language,
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

  return conflictResult;
}

/**
 * Turn Stage 3's document summaries into the sources the evidence preflight reads.
 *
 * A missing `source_version_hash` throws rather than defaulting: that hash is what ties a card
 * to the exact bytes it was made from, and a run whose provenance cannot be established is worse
 * than no run.
 *
 * Priority falls back through three sources — Stage 3's own, then the budget allocation's, then
 * SUPPLEMENTARY — because the two upstream values are independently optional and a document with
 * no priority at all would otherwise be dropped from the budget.
 */
function buildEvidenceSources(
  context: AnalysisContext,
  allocationById: Map<string, { priority: DocumentEvidencePreflightSource['priority'] }>
): DocumentEvidencePreflightInput['sources'] {
  return context.originalDocumentSummaries.map(document => {
    if (!document.source_version_hash) {
      throw new Error(`Document ${document.document_id} is missing a source version hash`);
    }
    const allocatedPriority = allocationById.get(document.document_id)?.priority;
    const source = {
      documentId: document.document_id,
      documentName: document.file_name,
      sourceVersionHash: document.source_version_hash,
      priority: document.stage3_priority ?? allocatedPriority ?? 'SUPPLEMENTARY',
      authorityScope: 'course_source' as const,
      contentQuality: document.summary_metadata.quality_score,
      originalTokens: document.summary_metadata.original_tokens,
      summaryTokens: document.summary_metadata.summary_tokens,
      importanceScore: document.stage3_importance_score ?? document.summary_metadata.quality_score,
    };
    if (document.sourceFailure) {
      return { ...source, sourceFailure: document.sourceFailure };
    }
    return {
      ...source,
      stage3Summary: document.processed_content || undefined,
      stage3SummaryVersionHash: document.summary_source_version_hash,
    };
  });
}

/**
 * Everything the phase reports upward: coverage, processing modes, conflicts, and what it cost.
 *
 * `preflightMetricDeltas` falls back to a whole-run shape when the preflight did not supply one,
 * which is the reused-run case — the deltas describe THIS invocation, and a reuse spent nothing.
 */
async function summarizeEvidencePhase(args: {
  context: AnalysisContext;
  overrides: DocumentEvidencePhaseOverrides | undefined;
  mode: 'shadow' | 'active';
  startedAt: number;
  result: DocumentEvidencePreflightResult;
  conflictResult: Awaited<ReturnType<typeof detectDocumentConflicts>> | undefined;
}): Promise<DocumentEvidenceMetricEvent> {
  const { context, overrides, mode, startedAt, result, conflictResult } = args;
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

export async function runDocumentEvidencePhaseCore(
  context: AnalysisContext,
  overrides: DocumentEvidencePhaseOverrides | undefined,
  mode: 'shadow' | 'active',
  startedAt: number
): Promise<DocumentEvidenceMetricEvent> {
  if (!context.phase1Output) throw new Error('Phase 1 output required for document evidence');

  const allocationById = new Map(
    context.budgetAllocation?.documents.map(document => [document.file_id, document]) ?? []
  );
  const sources = buildEvidenceSources(context, allocationById);

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
        structuredPort: createProductionStructuredEvidencePort(modelId, context.courseId),
        extractor: createProductionEvidenceExtractor(modelId, context.courseId),
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
    language: context.input.language,
    evidenceVersion: 'document-evidence-v1',
    modelId: context.budgetAllocation?.modelSelection.modelId,
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
    result = await runAutomaticRetryRounds({
      context,
      sources,
      result,
      preflightInput,
      dependencies,
      runPreflight,
      retryCoordinator,
    });
  }
  context.documentEvidencePreflight = result;
  context.documentEvidenceMode = mode;
  let conflictResult: Awaited<ReturnType<typeof detectDocumentConflicts>> | undefined;
  if (result.status === 'accepted' && result.runId) {
    conflictResult = await detectAndResolveConflicts({
      context,
      overrides,
      mode,
      decisionMode,
      result: result as DocumentEvidencePreflightResult & { runId: string },
      evidenceRepository,
    });
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
  return summarizeEvidencePhase({
    context,
    overrides,
    mode,
    startedAt,
    result,
    conflictResult,
  });
}
