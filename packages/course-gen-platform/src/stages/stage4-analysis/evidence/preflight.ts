import { createHash } from 'node:crypto';
import {
  DocumentEvidenceCardsSchema,
  DocumentEvidenceCoverageSummarySchema,
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
import { parseLowerCaseUuidV4 } from './source-failure';

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
  language?: 'ru' | 'en';
  evidenceVersion: string;
  modelId?: string;
  classificationContext?: unknown;
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

interface RunRecord {
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

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sortedSources(
  sources: DocumentEvidencePreflightSource[]
): DocumentEvidencePreflightSource[] {
  const sorted = sources
    .map(source => {
      if (!source.sourceFailure) return source;
      if (
        source.sourceFailure.reason !== 'source_file_unrecoverable' ||
        parseLowerCaseUuidV4(source.sourceFailure.recoveryRunId) === undefined ||
        JSON.stringify(Object.keys(source.sourceFailure).sort()) !==
          JSON.stringify(['reason', 'recoveryRunId'].sort())
      ) {
        throw new Error('Audited source failure is malformed');
      }
      const sanitized = {
        ...source,
        sourceFailure: {
          reason: source.sourceFailure.reason,
          recoveryRunId: source.sourceFailure.recoveryRunId,
        },
      };
      delete sanitized.fullText;
      delete sanitized.stage3Summary;
      delete sanitized.stage3SummaryVersionHash;
      return sanitized;
    })
    .sort((left, right) => left.documentId.localeCompare(right.documentId));
  const seen = new Set<string>();
  for (const source of sorted) {
    if (seen.has(source.documentId))
      throw new Error(`Duplicate source document ID: ${source.documentId}`);
    seen.add(source.documentId);
  }
  return sorted;
}

function manifest(
  sources: DocumentEvidencePreflightSource[]
): DocumentEvidenceSourceManifestEntry[] {
  return sources.map(source => ({
    document_id: source.documentId,
    source_version_hash: source.sourceVersionHash,
    document_name: source.documentName,
  }));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function semanticClassificationProjection(value: unknown): Record<string, unknown> | null {
  const classification = objectValue(value);
  if (!classification) return null;
  const category = objectValue(classification.course_category);
  const topic = objectValue(classification.topic_analysis);
  const projection = {
    course_category: category
      ? {
          primary: typeof category.primary === 'string' ? category.primary : null,
          secondary: typeof category.secondary === 'string' ? category.secondary : null,
        }
      : null,
    topic_analysis: topic
      ? {
          determined_topic:
            typeof topic.determined_topic === 'string' ? topic.determined_topic : null,
          complexity: typeof topic.complexity === 'string' ? topic.complexity : null,
          target_audience: typeof topic.target_audience === 'string' ? topic.target_audience : null,
        }
      : null,
  };
  return projection.course_category || projection.topic_analysis ? projection : null;
}

function inputFingerprint(
  input: DocumentEvidencePreflightInput,
  sources: DocumentEvidencePreflightSource[],
  sourceManifest: DocumentEvidenceSourceManifestEntry[]
): string {
  const retryDirectives = [
    ...(input.retryDirectives ?? []),
    ...(input.retryDirective ? [input.retryDirective] : []),
  ].sort((left, right) => left.documentId.localeCompare(right.documentId));
  return sha256(
    JSON.stringify({
      topic: input.topic,
      language: input.language,
      classification: semanticClassificationProjection(input.classificationContext),
      source_manifest: sourceManifest,
      evidence_shape: sources.map(source => ({
        document_id: source.documentId,
        priority: source.priority,
        authority_scope: source.authorityScope,
        content_quality: source.contentQuality,
        summary_artifact_version: source.stage3SummaryVersionHash ?? null,
        source_failure: source.sourceFailure ?? null,
      })),
      retry_directives: retryDirectives.map(directive => ({
        decision_id: directive.decisionId,
        document_id: directive.documentId,
        attempt: directive.attempt,
        max_attempts: directive.maxAttempts,
      })),
    })
  );
}

function exactCards(
  cards: DocumentEvidenceCard[],
  sources: DocumentEvidencePreflightSource[]
): DocumentEvidenceCard[] {
  const parsed = DocumentEvidenceCardsSchema.parse(cards).sort((left, right) =>
    left.document_id.localeCompare(right.document_id)
  );
  if (
    JSON.stringify(parsed.map(card => card.document_id)) !==
    JSON.stringify(sources.map(source => source.documentId))
  ) {
    throw new Error('Evidence cards do not equal the exact normalized source set');
  }
  return parsed;
}

function coverage(cards: DocumentEvidenceCard[]): DocumentEvidenceCoverageSummary {
  return DocumentEvidenceCoverageSummarySchema.parse({
    source_count: cards.length,
    assessed_count: cards.filter(card => card.coverage_status === 'assessed').length,
    degraded_count: cards.filter(card => card.coverage_status === 'degraded').length,
    failed_count: cards.filter(card => card.coverage_status === 'failed').length,
  });
}

function metric(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function runMetrics(run: RunRecord): EvidenceGenerationMetrics {
  return {
    ...emptyGenerationMetrics(),
    modelCalls: metric(run.model_calls),
    inputTokens: metric(run.input_tokens),
    outputTokens: metric(run.output_tokens),
    totalCostUsd: metric(run.total_cost_usd),
  };
}

function addMetrics(target: EvidenceGenerationMetrics, delta: EvidenceGenerationMetrics): void {
  target.modelCalls += delta.modelCalls;
  target.retryCount += delta.retryCount;
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.totalCostUsd += delta.totalCostUsd;
  target.mapChunks += delta.mapChunks;
  target.reduceLevels = Math.max(target.reduceLevels, delta.reduceLevels);
}

function emptyProcessingModeCounts(): Record<DocumentEvidenceCard['processing_mode'], number> {
  return {
    full_text: 0,
    hierarchical_summary: 0,
    summary: 0,
    targeted_retrieval: 0,
    metadata_only: 0,
  };
}

function metricDeltasForAcceptedCards(
  cards: DocumentEvidenceCard[],
  batches: number,
  generationMetrics: EvidenceGenerationMetrics
): DocumentEvidencePreflightResult['metricDeltas'] {
  const processingModes = emptyProcessingModeCounts();
  for (const card of cards) processingModes[card.processing_mode] += 1;
  return {
    acceptedRun: 1,
    documents: {
      source: cards.length,
      assessed: cards.filter(card => card.coverage_status === 'assessed').length,
      degraded: cards.filter(card => card.coverage_status === 'degraded').length,
      failed: cards.filter(card => card.coverage_status === 'failed').length,
    },
    processingModes,
    batches,
    generationMetrics,
  };
}

function emptyMetricDeltas(): DocumentEvidencePreflightResult['metricDeltas'] {
  return {
    acceptedRun: 0,
    documents: { source: 0, assessed: 0, degraded: 0, failed: 0 },
    processingModes: emptyProcessingModeCounts(),
    batches: 0,
    generationMetrics: emptyGenerationMetrics(),
  };
}

function subtractMetrics(
  total: EvidenceGenerationMetrics,
  checkpointed: EvidenceGenerationMetrics
): EvidenceGenerationMetrics {
  return {
    modelCalls: Math.max(0, total.modelCalls - checkpointed.modelCalls),
    retryCount: Math.max(0, total.retryCount - checkpointed.retryCount),
    inputTokens: Math.max(0, total.inputTokens - checkpointed.inputTokens),
    outputTokens: Math.max(0, total.outputTokens - checkpointed.outputTokens),
    totalCostUsd: Math.max(0, total.totalCostUsd - checkpointed.totalCostUsd),
    mapChunks: Math.max(0, total.mapChunks - checkpointed.mapChunks),
    reduceLevels: total.reduceLevels,
  };
}

function planBatches(
  allocations: EvidenceDocumentAllocation[],
  budgetBatches: Array<{ documentIds: string[]; allocatedTokens: number }>
) {
  const assigned = new Set(budgetBatches.flatMap(batch => batch.documentIds));
  return [
    ...budgetBatches,
    ...allocations
      .filter(allocation => !assigned.has(allocation.documentId))
      .map(allocation => ({ documentIds: [allocation.documentId], allocatedTokens: 0 })),
  ];
}

function reductionWidths(batchCount: number): number[] {
  if (batchCount === 0) return [];
  const widths = [batchCount];
  while (widths.at(-1)! > 1) widths.push(Math.ceil(widths.at(-1)! / 4));
  return widths;
}

function latestStructuredCheckpoints(rows: Array<Record<string, unknown>>) {
  const byDocument = new Map<string, StructuredEvidenceCheckpoint>();
  for (const row of rows) {
    const value = row.structured_checkpoint;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const checkpoint = value as Partial<StructuredEvidenceCheckpoint>;
    if (
      typeof checkpoint.documentId === 'string' &&
      typeof checkpoint.sourceVersionHash === 'string' &&
      typeof checkpoint.schemaVersion === 'string' &&
      typeof checkpoint.modelId === 'string' &&
      Array.isArray(checkpoint.units) &&
      Array.isArray(checkpoint.reductions)
    ) {
      byDocument.set(checkpoint.documentId, checkpoint as StructuredEvidenceCheckpoint);
    }
  }
  return byDocument;
}

function attachVerifiedRefsToClaim(
  card: DocumentEvidenceCard,
  claimId: string,
  sourceVersionHash: string,
  refs: Array<{ documentId: string; chunkId?: string }>
): DocumentEvidenceCard {
  if (refs.length === 0 || card.key_claims.length === 0) return card;
  return {
    ...card,
    key_claims: card.key_claims.map(claim =>
      claim.claim_id !== claimId
        ? claim
        : {
            ...claim,
            source_refs: [
              ...claim.source_refs,
              ...refs
                .map(ref => ({
                  document_id: ref.documentId,
                  version_hash: sourceVersionHash,
                  ...(ref.chunkId ? { chunk_id: ref.chunkId } : {}),
                }))
                .filter(
                  candidate =>
                    !claim.source_refs.some(
                      existing =>
                        existing.document_id === candidate.document_id &&
                        existing.chunk_id === candidate.chunk_id
                    )
                ),
            ],
          }
    ),
  };
}

function degradeVerification(card: DocumentEvidenceCard): DocumentEvidenceCard {
  if (card.coverage_status !== 'assessed') return card;
  return {
    ...card,
    coverage_status: 'degraded',
    coverage_reason: 'targeted_verification_unavailable',
    limitations: [...card.limitations, 'Targeted material-claim verification was unavailable.'],
  };
}

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
  });
  return {
    verifiedDocumentIds: [...new Set(response.results.map(result => result.document_id))].sort(),
    sourceRefs: response.results.map(result => ({
      documentId: result.document_id,
      chunkId: result.chunk_id,
    })),
  };
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
  if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0) {
    throw new Error('maxRetries must be a non-negative integer');
  }
  const retryDirectives = [
    ...(input.retryDirectives ?? []),
    ...(input.retryDirective ? [input.retryDirective] : []),
  ];
  if (
    retryDirectives.length > sources.length ||
    new Set(retryDirectives.map(value => value.documentId)).size !== retryDirectives.length ||
    retryDirectives.some(
      directive =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          directive.decisionId
        ) ||
        !sources.some(source => source.documentId === directive.documentId) ||
        !Number.isSafeInteger(directive.attempt) ||
        directive.attempt < 1 ||
        !Number.isSafeInteger(directive.maxAttempts) ||
        directive.attempt > directive.maxAttempts
    )
  ) {
    throw new Error('Evidence retry directive is invalid or outside the exact source set');
  }
  if (!input.modelId && !dependencies.generateCard) {
    throw new Error('Configured Stage 4 model ID is required for production evidence preflight');
  }

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
    const cards = exactCards(await dependencies.repository.listItems(runId), sources);
    const acceptedCoverage = coverage(cards);
    const downstreamRepresentation = input.requireBoundedDownstreamContext
      ? await buildDownstreamEvidenceRepresentation({
          runId,
          cards,
          coverage: acceptedCoverage,
          language: input.language ?? 'en',
          modelId: input.modelId ?? 'custom-generator',
          evidenceVersion: input.evidenceVersion,
          targetTokens: Math.min(budget.effectiveBudget, DOWNSTREAM_PHASE_DOCUMENT_TOKEN_LIMIT),
          maxBatchTokens: input.maxBatchTokens,
          maxRetries: input.maxRetries,
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
          if (
            error instanceof EvidenceExtractionScopeError ||
            error instanceof EvidenceCheckpointError
          ) {
            throw error;
          }
          generated = {
            card: createFailedEvidenceCard(
              source,
              { allocatedTokens: allocation.allocatedTokens, processingMode: allocation.mode },
              'card_generation_failed_after_retries'
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

    const verificationCards = plan[planIndex].documentIds
      .map(documentId => cardById.get(documentId)!)
      .filter(card => card.coverage_status !== 'failed' && card.key_claims.length > 0);
    const verificationBatchSize =
      input.maxVerificationDocumentIds ?? DEFAULT_VERIFICATION_BATCH_SIZE;
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
          `${left.documentId}\n${left.claimId}`.localeCompare(
            `${right.documentId}\n${right.claimId}`
          )
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
