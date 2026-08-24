/**
 * The small, pure pieces of the document-evidence preflight: hashing, fingerprinting, budget
 * bookkeeping, batch planning and the shape of an empty result.
 *
 * @module preflight-support
 *
 * Split out of `preflight.ts` at 848 lines of code. None of these decides anything about a run —
 * they are the arithmetic and the canonical forms it decides WITH — so keeping them next door
 * leaves `runDocumentEvidencePreflight` reading as the sequence it is.
 *
 * Two are load-bearing beyond their size. `inputFingerprint` is what makes a rerun with identical
 * inputs REUSE an accepted run instead of paying for it again, so anything that changes the
 * result has to change the fingerprint. `subtractMetrics` exists so that metrics already
 * committed to a checkpoint are not counted a second time when the card that produced them
 * completes.
 */

import { createHash } from 'node:crypto';
import {
  DocumentEvidenceCardsSchema,
  DocumentEvidenceCoverageSummarySchema,
  type DocumentEvidenceCard,
  type DocumentEvidenceCoverageSummary,
  type DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';
import type { EvidenceDocumentAllocation } from './budget';
import {
  emptyGenerationMetrics,
  type EvidenceGenerationMetrics,
  type StructuredEvidenceCheckpoint,
} from './card-generator';
import { parseLowerCaseUuidV4 } from './source-failure';
import type {
  DocumentEvidencePreflightInput,
  DocumentEvidencePreflightResult,
  DocumentEvidencePreflightSource,
  RunRecord,
} from './preflight';

export function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sortedSources(
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

export function manifest(
  sources: DocumentEvidencePreflightSource[]
): DocumentEvidenceSourceManifestEntry[] {
  return sources.map(source => ({
    document_id: source.documentId,
    source_version_hash: source.sourceVersionHash,
    document_name: source.documentName,
  }));
}

export function inputFingerprint(
  input: DocumentEvidencePreflightInput,
  sources: DocumentEvidencePreflightSource[],
  sourceManifest: DocumentEvidenceSourceManifestEntry[]
): string {
  const retryDirectives = [
    ...(input.retryDirectives ?? []),
    ...(input.retryDirective ? [input.retryDirective] : []),
  ].sort((left, right) => left.documentId.localeCompare(right.documentId));
  // The classification projection is deliberately absent. It is an LLM output,
  // so it varies between job attempts on identical inputs; including it gave a
  // retry a different fingerprint, which created a second accepted run instead
  // of reusing the first, and left the user's answer keyed to the older run
  // (mc2-fqbrj). Run identity now covers only what evidence generation reads:
  // the sources, their versions and the evidence schema.
  return sha256(
    JSON.stringify({
      topic: input.topic,
      language: input.language,
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

export function exactCards(
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

export function coverage(cards: DocumentEvidenceCard[]): DocumentEvidenceCoverageSummary {
  return DocumentEvidenceCoverageSummarySchema.parse({
    source_count: cards.length,
    assessed_count: cards.filter(card => card.coverage_status === 'assessed').length,
    degraded_count: cards.filter(card => card.coverage_status === 'degraded').length,
    failed_count: cards.filter(card => card.coverage_status === 'failed').length,
  });
}

export function metric(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function runMetrics(run: RunRecord): EvidenceGenerationMetrics {
  return {
    ...emptyGenerationMetrics(),
    modelCalls: metric(run.model_calls),
    inputTokens: metric(run.input_tokens),
    outputTokens: metric(run.output_tokens),
    totalCostUsd: metric(run.total_cost_usd),
  };
}

export function addMetrics(
  target: EvidenceGenerationMetrics,
  delta: EvidenceGenerationMetrics
): void {
  target.modelCalls += delta.modelCalls;
  target.retryCount += delta.retryCount;
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.totalCostUsd += delta.totalCostUsd;
  target.mapChunks += delta.mapChunks;
  target.reduceLevels = Math.max(target.reduceLevels, delta.reduceLevels);
}

export function emptyProcessingModeCounts(): Record<
  DocumentEvidenceCard['processing_mode'],
  number
> {
  return {
    full_text: 0,
    hierarchical_summary: 0,
    summary: 0,
    targeted_retrieval: 0,
    metadata_only: 0,
  };
}

export function metricDeltasForAcceptedCards(
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

export function emptyMetricDeltas(): DocumentEvidencePreflightResult['metricDeltas'] {
  return {
    acceptedRun: 0,
    documents: { source: 0, assessed: 0, degraded: 0, failed: 0 },
    processingModes: emptyProcessingModeCounts(),
    batches: 0,
    generationMetrics: emptyGenerationMetrics(),
  };
}

export function subtractMetrics(
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

export function planBatches(
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

export function reductionWidths(batchCount: number): number[] {
  if (batchCount === 0) return [];
  const widths = [batchCount];
  while (widths.at(-1)! > 1) widths.push(Math.ceil(widths.at(-1)! / 4));
  return widths;
}

export function latestStructuredCheckpoints(rows: Array<Record<string, unknown>>) {
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

export function attachVerifiedRefsToClaim(
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

export function degradeVerification(card: DocumentEvidenceCard): DocumentEvidenceCard {
  if (card.coverage_status !== 'assessed') return card;
  return {
    ...card,
    coverage_status: 'degraded',
    coverage_reason: 'targeted_verification_unavailable',
    limitations: [...card.limitations, 'Targeted material-claim verification was unavailable.'],
  };
}
