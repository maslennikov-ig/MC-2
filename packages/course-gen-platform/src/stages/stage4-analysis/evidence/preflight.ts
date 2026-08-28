import type { LanguageCode } from '@/shared/workspace-utils';
import {
  type DocumentAuthorityScope,
  type DocumentEvidenceCard,
  type DocumentEvidenceCoverageSummary,
  type DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';
import {
  allocateEvidenceBudget,
  type EvidenceBudgetOptions,
  type EvidenceDocumentAllocation,
} from './budget';
import {
  createFailedEvidenceCard,
  createPendingEvidenceCard,
  emptyGenerationMetrics,
  EvidenceCheckpointError,
  EvidenceExtractionScopeError,
  generateDocumentEvidenceCard,
  type EvidenceCheckpointEvent,
  type EvidenceExtractionPort,
  type EvidenceGenerationMetrics,
  type GenerateEvidenceCardInput,
  type GeneratedEvidenceCard,
  type StructuredEvidenceCheckpoint,
  type StructuredEvidencePort,
} from './card-generator';
import {
  buildDownstreamEvidenceRepresentation,
  type DownstreamEvidenceRepresentation,
} from './downstream-context';

export interface DocumentEvidencePreflightSource {
  documentId: string;
  documentName: string;
  sourceVersionHash: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  authorityScope: DocumentAuthorityScope;
  contentQuality: number;
  originalTokens: number;
  summaryTokens: number;
  fullText?: string;
  stage3Summary?: string;
  stage3SummaryVersionHash?: string;
  importanceScore?: number;
  sourceFailure?: {
    reason: 'source_file_unrecoverable';
    recoveryRunId: string;
  };
}

export interface DocumentEvidencePreflightInput extends EvidenceBudgetOptions {
  courseId: string;
  organizationId: string;
  topic: string;
  language?: LanguageCode;
  evidenceVersion: string;
  modelId?: string;
  sources: DocumentEvidencePreflightSource[];
  maxRetries: number;
  maxVerificationDocumentIds?: number;
  requireBoundedDownstreamContext?: boolean;
  /** Immutable user retry decision that must produce a distinct, replayable run identity. */
  retryDirective?: {
    decisionId: string;
    documentId: string;
    attempt: number;
    maxAttempts: number;
  };
  retryDirectives?: Array<{
    decisionId: string;
    documentId: string;
    attempt: number;
    maxAttempts: number;
  }>;
}

export interface RunRecord {
  id?: unknown;
  status?: unknown;
  batch_count?: unknown;
  model_calls?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_cost_usd?: unknown;
}

export interface DocumentEvidencePreflightRepository {
  getOrCreateRun(input: {
    courseId: string;
    organizationId: string;
    inputFingerprint: string;
    evidenceVersion: string;
    sourceManifest: DocumentEvidenceSourceManifestEntry[];
  }): Promise<{ run: RunRecord; reused: boolean }>;
  listItems(runId: string): Promise<DocumentEvidenceCard[]>;
  listBatchCheckpoints(runId: string): Promise<Array<Record<string, unknown>>>;
  commitBatch(input: {
    runId: string;
    courseId: string;
    organizationId: string;
    cards: DocumentEvidenceCard[];
    batchKey: string;
    inputHash: string;
    structuredCheckpoint: Record<string, unknown>;
    cursor: Record<string, unknown>;
    batchCount: number;
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  }): Promise<Record<string, unknown>>;
  finalizeRun(input: {
    runId: string;
    courseId: string;
    organizationId: string;
    status: 'accepted' | 'failed';
  }): Promise<Record<string, unknown>>;
}

export interface TargetedVerificationInput {
  query: string;
  organizationId: string;
  courseId: string;
  documentIds: string[];
  groupByDocument: true;
}

export interface TargetedVerificationResult {
  verifiedDocumentIds: string[];
  sourceRefs?: Array<{ documentId: string; chunkId?: string }>;
}

export interface DocumentEvidencePreflightDependencies {
  repository: DocumentEvidencePreflightRepository;
  generateCard?: (
    input: GenerateEvidenceCardInput
  ) => Promise<DocumentEvidenceCard | GeneratedEvidenceCard>;
  structuredPort?: StructuredEvidencePort;
  extractor?: EvidenceExtractionPort;
  verifyTargetedSources?: (input: TargetedVerificationInput) => Promise<TargetedVerificationResult>;
  loadSourceContents?: (input: {
    courseId: string;
    organizationId: string;
    documentIds: string[];
  }) => Promise<Map<string, string>>;
  afterCheckpoint?: (input: { batchIndex: number; runId: string }) => Promise<void>;
}

export interface DocumentEvidencePreflightResult {
  status: 'skipped' | 'accepted';
  runId?: string;
  inputFingerprint?: string;
  coverage: DocumentEvidenceCoverageSummary;
  cards: DocumentEvidenceCard[];
  candidateConflicts: [];
  batchDocumentIds: string[][];
  batchAllocatedTokens: number[];
  reductionLevelWidths: number[];
  generationMetrics: EvidenceGenerationMetrics;
  metricDeltas: {
    acceptedRun: 0 | 1;
    documents: { source: number; assessed: number; degraded: number; failed: number };
    processingModes: Record<DocumentEvidenceCard['processing_mode'], number>;
    batches: number;
    generationMetrics: EvidenceGenerationMetrics;
  };
  downstreamRepresentation?: DownstreamEvidenceRepresentation;
}

const DEFAULT_VERIFICATION_BATCH_SIZE = 100;
const DOWNSTREAM_PHASE_DOCUMENT_TOKEN_LIMIT = 24_000;

// The pure helpers live next door; re-exported so that no import path changes.
export * from './preflight-support';
import {
  addMetrics,
  coverage,
  emptyMetricDeltas,
  exactCards,
  inputFingerprint,
  latestStructuredCheckpoints,
  manifest,
  metric,
  metricDeltasForAcceptedCards,
  planBatches,
  reductionWidths,
  runMetrics,
  sortedSources,
  subtractMetrics,
  attachVerifiedRefsToClaim,
  degradeVerification,
  sha256,
} from './preflight-support';

export async function verifyEvidenceSourcesWithQdrant(
  input: TargetedVerificationInput
): Promise<TargetedVerificationResult> {
  const { searchChunks } = await import('@/shared/qdrant/search');
  const response = await searchChunks(input.query, {
    enable_hybrid: true,
    enable_priority_boost: true,
    group_by_document: input.groupByDocument,
    group_size: 2,
    limit: Math.max(input.documentIds.length, 1),
    filters: {
      organization_id: input.organizationId,
      course_id: input.courseId,
      document_ids: input.documentIds,
    },
    cost_context: { courseId: input.courseId, stage: 'stage_4', phase: 'evidence_preflight' },
  });
  return {
    verifiedDocumentIds: [...new Set(response.results.map(result => result.document_id))].sort(),
    sourceRefs: response.results.map(result => ({
      documentId: result.document_id,
      chunkId: result.chunk_id,
    })),
  };
}

/**
 * Refuse an input that cannot produce a trustworthy run, before any of it is paid for.
 *
 * The retry-directive check is the strict one, deliberately. A directive names a decision to
 * retry, so it must be a real UUID, must name a document IN THIS EXACT SOURCE SET, must not
 * repeat a document, and must not claim an attempt beyond its own maximum. A directive slipping
 * past any of those retries something the caller did not ask about, at model prices.
 */
function assertPreflightInputValid(
  input: DocumentEvidencePreflightInput,
  sources: DocumentEvidencePreflightSource[],
  dependencies: DocumentEvidencePreflightDependencies
): void {
  if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0) {
    throw new Error('maxRetries must be a non-negative integer');
  }

  const retryDirectives = [
    ...(input.retryDirectives ?? []),
    ...(input.retryDirective ? [input.retryDirective] : []),
  ];
  const documentIds = new Set(sources.map(source => source.documentId));
  const isValidDirective = (directive: (typeof retryDirectives)[number]): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      directive.decisionId
    ) &&
    documentIds.has(directive.documentId) &&
    Number.isSafeInteger(directive.attempt) &&
    directive.attempt >= 1 &&
    Number.isSafeInteger(directive.maxAttempts) &&
    directive.attempt <= directive.maxAttempts;

  if (
    retryDirectives.length > sources.length ||
    new Set(retryDirectives.map(value => value.documentId)).size !== retryDirectives.length ||
    !retryDirectives.every(isValidDirective)
  ) {
    throw new Error('Evidence retry directive is invalid or outside the exact source set');
  }

  if (!input.modelId && !dependencies.generateCard) {
    throw new Error('Configured Stage 4 model ID is required for production evidence preflight');
  }
}

/**
 * An identical run was already accepted: return its cards without generating anything.
 *
 * The one thing that can still cost money here is the downstream representation, and only when
 * the caller asked for a bounded one — `requireRestoredComplete` then makes a partially restored
 * representation an error rather than a quietly shorter context.
 */
async function reuseAcceptedRun(args: {
  preflightInput: DocumentEvidencePreflightInput;
  dependencies: DocumentEvidencePreflightDependencies;
  sources: DocumentEvidencePreflightSource[];
  runId: string;
  fingerprint: string;
  plan: ReturnType<typeof planBatches>;
  metrics: EvidenceGenerationMetrics;
  budget: { effectiveBudget: number };
  checkpointRows: Array<Record<string, unknown>>;
}): Promise<DocumentEvidencePreflightResult> {
  const {
    preflightInput,
    dependencies,
    sources,
    runId,
    fingerprint,
    plan,
    metrics,
    budget,
    checkpointRows,
  } = args;

  const cards = exactCards(await dependencies.repository.listItems(runId), sources);
  const acceptedCoverage = coverage(cards);
  const downstreamRepresentation = preflightInput.requireBoundedDownstreamContext
    ? await buildDownstreamEvidenceRepresentation({
        runId,
        cards,
        coverage: acceptedCoverage,
        language: preflightInput.language ?? 'en',
        modelId: preflightInput.modelId ?? 'custom-generator',
        evidenceVersion: preflightInput.evidenceVersion,
        targetTokens: Math.min(budget.effectiveBudget, DOWNSTREAM_PHASE_DOCUMENT_TOKEN_LIMIT),
        maxBatchTokens: preflightInput.maxBatchTokens,
        maxRetries: preflightInput.maxRetries,
        port: dependencies.structuredPort!,
        checkpointRows,
        requireRestoredComplete: true,
      })
    : undefined;

  return {
    status: 'accepted',
    runId,
    inputFingerprint: fingerprint,
    coverage: acceptedCoverage,
    cards,
    candidateConflicts: [],
    batchDocumentIds: plan.map(batch => batch.documentIds),
    batchAllocatedTokens: plan.map(batch => batch.allocatedTokens),
    reductionLevelWidths: reductionWidths(plan.length),
    generationMetrics: metrics,
    metricDeltas: emptyMetricDeltas(),
    ...(downstreamRepresentation ? { downstreamRepresentation } : {}),
  };
}

/** Exactly the shape `runDocumentEvidencePreflight` builds; kept loose for the same reason. */
type CommitCheckpoint = (event: {
  batchKey: string;
  inputHash: string;
  structuredCheckpoint: Record<string, unknown>;
  cursor: Record<string, unknown>;
  usageDelta?: EvidenceGenerationMetrics;
}) => Promise<void>;

/**
 * Produce one document's evidence card, and commit it exactly once.
 *
 * Three outcomes, and only one of them stops the run. A source with neither full text nor a
 * Stage 3 summary yields a FAILED card without a model call. A generator that throws yields a
 * failed card too, distinguishing out-of-scope evidence from exhausted retries — one card's
 * problem gets one card's outcome (mc2-gqhws). An `EvidenceCheckpointError` is the exception:
 * a bad checkpoint means the durable record is wrong, and continuing writes more of it.
 *
 * `subtractMetrics` at the end is what stops a card's tokens being counted twice — the
 * `onCheckpoint` callback has already committed some of them.
 */
async function generateCardForDocument(args: {
  documentId: string;
  input: DocumentEvidencePreflightInput;
  dependencies: DocumentEvidencePreflightDependencies;
  /** The injected generator when there is one, else the production card generator. */
  generator: NonNullable<DocumentEvidencePreflightDependencies['generateCard']>;
  sourceById: Map<string, DocumentEvidencePreflightSource>;
  allocationById: Map<string, EvidenceDocumentAllocation>;
  structuredByDocument: Map<string, StructuredEvidenceCheckpoint>;
  cardById: Map<string, DocumentEvidenceCard>;
  commit: CommitCheckpoint;
}): Promise<void> {
  const {
    documentId,
    input,
    dependencies,
    generator,
    sourceById,
    allocationById,
    structuredByDocument,
    cardById,
    commit,
  } = args;

  const source = sourceById.get(documentId)!;
  const allocation = allocationById.get(documentId)!;
  const checkpointedForCard = emptyGenerationMetrics();
  let generated: GeneratedEvidenceCard;
  if (!source.fullText && !source.stage3Summary) {
    generated = {
      card: createFailedEvidenceCard(
        source,
        { allocatedTokens: allocation.allocatedTokens, processingMode: allocation.mode },
        'source_content_unavailable'
      ),
      metrics: emptyGenerationMetrics(),
    };
  } else {
    try {
      const raw = await generator({
        source,
        allocatedTokens: allocation.allocatedTokens,
        processingMode: allocation.mode,
        topic: input.topic,
        language: input.language ?? 'en',
        maxBatchTokens: input.maxBatchTokens,
        maxRetries: input.maxRetries,
        modelId: input.modelId,
        structuredPort: dependencies.structuredPort,
        extractor: dependencies.extractor,
        initialCheckpoint: structuredByDocument.get(documentId),
        ...(source.stage3Summary && source.stage3SummaryVersionHash === source.sourceVersionHash
          ? { reusableSummary: source.stage3Summary }
          : {}),
        onCheckpoint: async (event: EvidenceCheckpointEvent) => {
          await commit({
            ...event,
            structuredCheckpoint: { ...event.structuredCheckpoint },
          });
          addMetrics(checkpointedForCard, event.usageDelta);
          structuredByDocument.set(documentId, event.structuredCheckpoint);
        },
      });
      generated = 'card' in raw ? raw : { card: raw, metrics: emptyGenerationMetrics() };
    } catch (error) {
      // Only a bad checkpoint still stops the run: see the same distinction
      // in `card-generator.ts`. An out-of-scope unit is one card's problem
      // and gets one card's outcome (mc2-gqhws).
      if (error instanceof EvidenceCheckpointError) {
        throw error;
      }
      generated = {
        card: createFailedEvidenceCard(
          source,
          { allocatedTokens: allocation.allocatedTokens, processingMode: allocation.mode },
          error instanceof EvidenceExtractionScopeError
            ? 'card_generation_returned_out_of_scope_evidence'
            : 'card_generation_failed_after_retries'
        ),
        metrics: emptyGenerationMetrics(),
      };
    }
  }
  cardById.set(documentId, generated.card);
  const uncheckpointed = subtractMetrics(generated.metrics, checkpointedForCard);
  await commit({
    batchKey: `${documentId}:card:complete`,
    inputHash: sha256(JSON.stringify(generated.card)),
    structuredCheckpoint: generated.structuredCheckpoint
      ? { ...generated.structuredCheckpoint }
      : structuredByDocument.has(documentId)
        ? { ...structuredByDocument.get(documentId)! }
        : { documentId, complete: true },
    cursor: { documentId, complete: true, sequence: Number.MAX_SAFE_INTEGER },
    usageDelta: uncheckpointed,
  });
}

/**
 * Check each claim against the vector store, one document at a time.
 *
 * The per-claim scope assertions are the point: a verification that returns a ref from ANOTHER
 * document would attach evidence a claim was never checked against, so a stray document id is an
 * `EvidenceExtractionScopeError` rather than a filtered-out result.
 */
async function verifyPlanBatchClaims(args: {
  documentIds: string[];
  input: DocumentEvidencePreflightInput;
  dependencies: DocumentEvidencePreflightDependencies;
  cardById: Map<string, DocumentEvidenceCard>;
  sourceById: Map<string, DocumentEvidencePreflightSource>;
  existingBatchKeys: Set<string>;
  commit: CommitCheckpoint;
}): Promise<void> {
  const {
    documentIds: planDocumentIds,
    input,
    dependencies,
    cardById,
    sourceById,
    existingBatchKeys,
    commit,
  } = args;

  const verificationCards = planDocumentIds
    .map(documentId => cardById.get(documentId)!)
    .filter(card => card.coverage_status !== 'failed' && card.key_claims.length > 0);
  const verificationBatchSize = input.maxVerificationDocumentIds ?? DEFAULT_VERIFICATION_BATCH_SIZE;
  for (let offset = 0; offset < verificationCards.length; offset += verificationBatchSize) {
    const cards = verificationCards.slice(offset, offset + verificationBatchSize);
    const documentIds = cards.map(card => card.document_id).sort();
    const claimQueries = cards
      .flatMap(card =>
        card.key_claims.map(claim => ({
          documentId: card.document_id,
          claimId: claim.claim_id,
          statement: claim.statement,
        }))
      )
      .sort((left, right) =>
        `${left.documentId}\n${left.claimId}`.localeCompare(`${right.documentId}\n${right.claimId}`)
      );
    const verificationHash = sha256(JSON.stringify(claimQueries));
    const verificationBatchKey = `verification:${verificationHash}`;
    if (dependencies.verifyTargetedSources) {
      if (existingBatchKeys.has(verificationBatchKey)) continue;
      const failed = new Set<string>();
      for (const claimQuery of claimQueries) {
        try {
          const result = await dependencies.verifyTargetedSources({
            query: claimQuery.statement,
            organizationId: input.organizationId,
            courseId: input.courseId,
            documentIds: [claimQuery.documentId],
            groupByDocument: true,
          });
          if (
            result.verifiedDocumentIds.some(id => id !== claimQuery.documentId) ||
            (result.sourceRefs ?? []).some(ref => ref.documentId !== claimQuery.documentId)
          ) {
            throw new EvidenceExtractionScopeError(
              'Targeted verification returned an out-of-scope document or source ref'
            );
          }
          if (!result.verifiedDocumentIds.includes(claimQuery.documentId)) {
            failed.add(claimQuery.documentId);
            continue;
          }
          const card = cardById.get(claimQuery.documentId)!;
          const source = sourceById.get(claimQuery.documentId)!;
          cardById.set(
            claimQuery.documentId,
            attachVerifiedRefsToClaim(
              card,
              claimQuery.claimId,
              source.sourceVersionHash,
              result.sourceRefs ?? []
            )
          );
        } catch (error) {
          if (error instanceof EvidenceExtractionScopeError) throw error;
          failed.add(claimQuery.documentId);
        }
      }
      for (const documentId of failed) {
        cardById.set(documentId, degradeVerification(cardById.get(documentId)!));
      }
      await commit({
        batchKey: verificationBatchKey,
        inputHash: verificationHash,
        structuredCheckpoint: {
          kind: 'targeted_verification',
          document_ids: documentIds,
          verified_document_ids: documentIds.filter(id => !failed.has(id)),
          claim_ids: claimQueries.map(claim => claim.claimId),
        },
        cursor: { verification_offset: offset, document_ids: documentIds },
      });
    }
  }
}

export async function runDocumentEvidencePreflight(
  input: DocumentEvidencePreflightInput,
  dependencies: DocumentEvidencePreflightDependencies
): Promise<DocumentEvidencePreflightResult> {
  const sources = sortedSources(input.sources);
  if (sources.length === 0) {
    return {
      status: 'skipped',
      coverage: { source_count: 0, assessed_count: 0, degraded_count: 0, failed_count: 0 },
      cards: [],
      candidateConflicts: [],
      batchDocumentIds: [],
      batchAllocatedTokens: [],
      reductionLevelWidths: [],
      generationMetrics: emptyGenerationMetrics(),
      metricDeltas: emptyMetricDeltas(),
    };
  }
  assertPreflightInputValid(input, sources, dependencies);

  const sourceManifest = manifest(sources);
  const fingerprint = inputFingerprint(input, sources, sourceManifest);
  const processableSources = sources.filter(source => source.sourceFailure === undefined);
  const budget = allocateEvidenceBudget(
    processableSources.map(source => ({
      documentId: source.documentId,
      priority: source.priority,
      originalTokens: source.originalTokens,
      summaryTokens: source.summaryTokens,
      hasFullText: Boolean(source.fullText) || Boolean(dependencies.loadSourceContents),
      hasSummary: Boolean(source.stage3Summary),
      importanceScore: source.importanceScore,
    })),
    input
  );
  const auditedFailureAllocations: EvidenceDocumentAllocation[] = sources
    .filter(source => source.sourceFailure !== undefined)
    .map(source => ({
      documentId: source.documentId,
      priority: source.priority,
      mode: 'metadata_only',
      allocatedTokens: 0,
      reason: 'content_unavailable',
    }));
  const allocations = [...budget.allocations, ...auditedFailureAllocations];
  const plan = planBatches(allocations, budget.batches);
  const allocationById = new Map(
    allocations.map(allocation => [allocation.documentId, allocation])
  );
  const sourceById = new Map(sources.map(source => [source.documentId, source]));
  const { run, reused } = await dependencies.repository.getOrCreateRun({
    courseId: input.courseId,
    organizationId: input.organizationId,
    inputFingerprint: fingerprint,
    evidenceVersion: input.evidenceVersion,
    sourceManifest,
  });
  if (typeof run.id !== 'string') throw new Error('Evidence repository returned an invalid run ID');
  const runId = run.id;
  const metrics = runMetrics(run);
  const invocationMetrics = emptyGenerationMetrics();
  let invocationBatchCount = 0;
  let batchCount = metric(run.batch_count);
  const checkpointRows = reused ? await dependencies.repository.listBatchCheckpoints(runId) : [];
  const existingBatchKeys = new Set(
    checkpointRows
      .map(row => row.batch_key)
      .filter((value): value is string => typeof value === 'string')
  );
  const structuredByDocument = latestStructuredCheckpoints(checkpointRows);

  if (reused && run.status === 'accepted') {
    return reuseAcceptedRun({
      preflightInput: input,
      dependencies,
      sources,
      runId,
      fingerprint,
      plan,
      metrics,
      budget,
      checkpointRows,
    });
  }

  let durableCards = reused ? await dependencies.repository.listItems(runId) : [];
  if (durableCards.length === 0) {
    durableCards = exactCards(
      sources.map(source => {
        const allocation = allocationById.get(source.documentId)!;
        return source.sourceFailure
          ? createFailedEvidenceCard(
              source,
              { allocatedTokens: 0, processingMode: 'metadata_only' },
              source.sourceFailure.reason
            )
          : createPendingEvidenceCard(source, allocation);
      }),
      sources
    );
  } else durableCards = exactCards(durableCards, sources);
  const cardById = new Map(durableCards.map(card => [card.document_id, card]));

  const commit = async (event: {
    batchKey: string;
    inputHash: string;
    structuredCheckpoint: Record<string, unknown>;
    cursor: Record<string, unknown>;
    usageDelta?: EvidenceGenerationMetrics;
  }) => {
    if (existingBatchKeys.has(event.batchKey)) return;
    if (event.usageDelta) addMetrics(metrics, event.usageDelta);
    batchCount += 1;
    await dependencies.repository.commitBatch({
      runId,
      courseId: input.courseId,
      organizationId: input.organizationId,
      cards: exactCards([...cardById.values()], sources),
      batchKey: event.batchKey,
      inputHash: event.inputHash,
      structuredCheckpoint: event.structuredCheckpoint,
      cursor: event.cursor,
      batchCount,
      modelCalls: metrics.modelCalls,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      totalCostUsd: metrics.totalCostUsd,
    });
    if (event.usageDelta) addMetrics(invocationMetrics, event.usageDelta);
    invocationBatchCount += 1;
    existingBatchKeys.add(event.batchKey);
  };

  await commit({
    batchKey: 'run:initial-full-ledger',
    inputHash: fingerprint,
    structuredCheckpoint: { kind: 'initial_full_ledger', source_count: sources.length },
    cursor: { sequence: 0 },
  });

  const generator = dependencies.generateCard ?? generateDocumentEvidenceCard;
  for (let planIndex = 0; planIndex < plan.length; planIndex += 1) {
    const pendingIds = plan[planIndex].documentIds.filter(
      documentId => cardById.get(documentId)?.coverage_reason === 'pending_evidence_processing'
    );
    const needsContent = pendingIds.filter(documentId => {
      const source = sourceById.get(documentId)!;
      return (
        !source.fullText &&
        !(source.stage3Summary && source.stage3SummaryVersionHash === source.sourceVersionHash)
      );
    });
    if (needsContent.length > 0 && dependencies.loadSourceContents) {
      const loaded = await dependencies.loadSourceContents({
        courseId: input.courseId,
        organizationId: input.organizationId,
        documentIds: needsContent,
      });
      for (const [documentId, content] of loaded) {
        if (!needsContent.includes(documentId)) {
          throw new Error(`Source loader returned an out-of-scope document: ${documentId}`);
        }
        if (content) sourceById.get(documentId)!.fullText = content;
      }
    }

    for (const documentId of pendingIds) {
      await generateCardForDocument({
        documentId,
        input,
        dependencies,
        generator,
        sourceById,
        allocationById,
        structuredByDocument,
        cardById,
        commit,
      });
    }

    await verifyPlanBatchClaims({
      documentIds: plan[planIndex].documentIds,
      input,
      dependencies,
      cardById,
      sourceById,
      existingBatchKeys,
      commit,
    });

    await dependencies.afterCheckpoint?.({ batchIndex: planIndex, runId });
  }

  durableCards = exactCards([...cardById.values()], sources);
  const durableCoverage = coverage(durableCards);
  let downstreamRepresentation: DownstreamEvidenceRepresentation | undefined;
  if (input.requireBoundedDownstreamContext) {
    if (!dependencies.structuredPort) {
      throw new Error('Structured evidence port is required for bounded downstream context');
    }
    downstreamRepresentation = await buildDownstreamEvidenceRepresentation({
      runId,
      cards: durableCards,
      coverage: durableCoverage,
      language: input.language ?? 'en',
      modelId: input.modelId ?? 'custom-generator',
      evidenceVersion: input.evidenceVersion,
      targetTokens: Math.min(budget.effectiveBudget, DOWNSTREAM_PHASE_DOCUMENT_TOKEN_LIMIT),
      maxBatchTokens: input.maxBatchTokens,
      maxRetries: input.maxRetries,
      port: dependencies.structuredPort,
      checkpointRows,
      onCheckpoint: async event => commit(event),
    });
  }
  await dependencies.repository.finalizeRun({
    runId,
    courseId: input.courseId,
    organizationId: input.organizationId,
    status: 'accepted',
  });
  return {
    status: 'accepted',
    runId,
    inputFingerprint: fingerprint,
    coverage: durableCoverage,
    cards: durableCards,
    candidateConflicts: [],
    batchDocumentIds: plan.map(batch => batch.documentIds),
    batchAllocatedTokens: plan.map(batch => batch.allocatedTokens),
    reductionLevelWidths: reductionWidths(plan.length),
    generationMetrics: metrics,
    metricDeltas: metricDeltasForAcceptedCards(
      durableCards,
      invocationBatchCount,
      invocationMetrics
    ),
    ...(downstreamRepresentation ? { downstreamRepresentation } : {}),
  };
}
