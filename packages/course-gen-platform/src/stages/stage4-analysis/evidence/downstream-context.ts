import { createHash } from 'node:crypto';
import type {
  DocumentEvidenceCard,
  DocumentEvidenceCoverageSummary,
} from '@megacampus/shared-types';
import { tokenEstimator } from '@/shared/llm/token-estimator';
import type { EvidenceGenerationMetrics, StructuredEvidencePort } from './card-generator';
import { emptyGenerationMetrics, EvidenceCheckpointError } from './card-generator';
import type { DocumentSummaryResult } from '../handler-helpers';
import {
  CROSS_DOCUMENT_REDUCE_TOPIC,
  estimateDownstreamReduceInputTokens,
  groupDownstreamUnits,
  splitDownstreamUnit,
  type DownstreamSummaryUnit,
} from './downstream-hierarchy';
import {
  reduceDownstreamGroup,
  reduceOversizedCard,
  restoreDownstreamState,
} from './downstream-reducer';

export { estimateDownstreamReduceInputTokens } from './downstream-hierarchy';

const DOWNSTREAM_CONTEXT_SCHEMA_VERSION = 'document-evidence-downstream-v2';

export interface DownstreamEvidenceRepresentation {
  kind: 'synthetic_advisory';
  runId: string;
  representationHash: string;
  promptContent: string;
  tokenCount: number;
  targetTokens: number;
  sourceCount: number;
  sourceDocumentIds: string[];
  sourceOutcomes: Array<{
    documentId: string;
    coverageStatus: DocumentEvidenceCard['coverage_status'];
    coverageReason: string;
  }>;
  sourceMaterials: Array<{
    documentId: string;
    keyClaims: DocumentEvidenceCard['key_claims'];
    constraints: string[];
    limitations: string[];
  }>;
  coverage: DocumentEvidenceCoverageSummary;
  materialSourceRefs: DocumentEvidenceCard['key_claims'][number]['source_refs'];
  claims: string[];
  constraints: string[];
  limitations: string[];
}

export interface DownstreamContextCheckpointEvent {
  batchKey: string;
  inputHash: string;
  structuredCheckpoint: Record<string, unknown>;
  cursor: Record<string, unknown>;
  usageDelta: EvidenceGenerationMetrics;
}

export interface BuildDownstreamEvidenceRepresentationInput {
  runId: string;
  cards: DocumentEvidenceCard[];
  coverage: DocumentEvidenceCoverageSummary;
  language: 'ru' | 'en';
  modelId: string;
  evidenceVersion: string;
  targetTokens: number;
  maxBatchTokens: number;
  maxRetries: number;
  port: StructuredEvidencePort;
  checkpointRows?: Array<Record<string, unknown>>;
  requireRestoredComplete?: boolean;
  onCheckpoint?: (event: DownstreamContextCheckpointEvent) => Promise<void>;
}

export function resolveDownstreamDocumentSummaries(
  resolvedDocumentSummaries: DocumentSummaryResult[],
  representation: DownstreamEvidenceRepresentation | undefined
): DocumentSummaryResult[] {
  if (!representation) return resolvedDocumentSummaries;
  return [
    {
      document_id: representation.runId,
      file_name: 'Synthetic advisory evidence digest (not an uploaded document)',
      source_version_hash: representation.representationHash,
      summary_source_version_hash: representation.representationHash,
      processed_content: representation.promptContent,
      processing_method: 'balanced',
      summary_metadata: {
        original_tokens: representation.tokenCount,
        summary_tokens: representation.tokenCount,
        compression_ratio: 1,
        quality_score: 1,
      },
      stage3_priority: null,
      stage3_importance_score: null,
    },
  ];
}

type SummaryUnit = DownstreamSummaryUnit;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function estimate(value: string, language: 'ru' | 'en'): number {
  return tokenEstimator.estimateTokens(value, language);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))].sort();
}

function materialRefs(cards: DocumentEvidenceCard[]) {
  const byValue = new Map<
    string,
    DocumentEvidenceCard['key_claims'][number]['source_refs'][number]
  >();
  for (const ref of cards.flatMap(card => card.key_claims.flatMap(claim => claim.source_refs))) {
    byValue.set(JSON.stringify(ref), ref);
  }
  return [...byValue.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
}

function unitText(card: DocumentEvidenceCard): string {
  return [
    `summary: ${card.summary ?? '[no assessed summary]'}`,
    `claims: ${card.key_claims.map(claim => claim.statement).join(' | ') || '[none]'}`,
    `constraints: ${card.constraints.join(' | ') || '[none]'}`,
    `limitations: ${card.limitations.join(' | ') || '[none]'}`,
    `coverage: ${card.coverage_status} (${card.coverage_reason})`,
  ].join('\n');
}

function renderPrompt(
  input: Pick<BuildDownstreamEvidenceRepresentationInput, 'runId' | 'coverage'>,
  provenanceHandle: string,
  summaries: SummaryUnit[]
): string {
  return [
    'SYNTHETIC ADVISORY DOCUMENT EVIDENCE — NOT AN UPLOADED DOCUMENT',
    'This digest supplements the baseline topic and classification. It must not replace baseline curriculum requirements.',
    `accepted_run_id=${input.runId}`,
    `provenance_handle=${provenanceHandle}`,
    `source_count=${input.coverage.source_count}`,
    `coverage=assessed:${input.coverage.assessed_count},degraded:${input.coverage.degraded_count},failed:${input.coverage.failed_count}`,
    'BOUNDED ADVISORY DIGEST:',
    ...summaries.map(unit => unit.summary),
  ].join('\n');
}

function validateCompleteRepresentation(
  representation: DownstreamEvidenceRepresentation,
  identityHash: string,
  sourceDocumentIds: string[],
  language: 'ru' | 'en',
  targetTokens: number
): DownstreamEvidenceRepresentation {
  const outcomeIds = representation.sourceOutcomes.map(outcome => outcome.documentId);
  const materialIds = representation.sourceMaterials.map(material => material.documentId);
  if (
    representation.kind !== 'synthetic_advisory' ||
    representation.representationHash !== identityHash ||
    representation.sourceCount !== sourceDocumentIds.length ||
    JSON.stringify(representation.sourceDocumentIds) !== JSON.stringify(sourceDocumentIds) ||
    JSON.stringify(outcomeIds) !== JSON.stringify(sourceDocumentIds) ||
    JSON.stringify(materialIds) !== JSON.stringify(sourceDocumentIds) ||
    representation.targetTokens !== targetTokens ||
    representation.tokenCount !== estimate(representation.promptContent, language) ||
    representation.tokenCount > targetTokens
  ) {
    throw new Error('Stored downstream representation failed identity, coverage, or token checks');
  }
  return representation;
}

export async function buildDownstreamEvidenceRepresentation(
  input: BuildDownstreamEvidenceRepresentationInput
): Promise<DownstreamEvidenceRepresentation> {
  if (input.cards.length !== input.coverage.source_count) {
    throw new Error('Downstream evidence cards do not match durable coverage');
  }
  if (input.targetTokens <= 0 || input.maxBatchTokens <= 0) {
    throw new Error('Downstream evidence token limits must be positive');
  }
  const cards = [...input.cards].sort((left, right) =>
    left.document_id.localeCompare(right.document_id)
  );
  const sourceDocumentIds = cards.map(card => card.document_id);
  if (new Set(sourceDocumentIds).size !== cards.length) {
    throw new Error('Downstream evidence source IDs must be unique');
  }
  const cardHash = sha256(JSON.stringify(cards));
  const identityHash = sha256(
    JSON.stringify({
      schemaVersion: DOWNSTREAM_CONTEXT_SCHEMA_VERSION,
      runId: input.runId,
      cardHash,
      modelId: input.modelId,
      evidenceVersion: input.evidenceVersion,
      language: input.language,
      targetTokens: input.targetTokens,
      maxBatchTokens: input.maxBatchTokens,
    })
  );
  const restored = restoreDownstreamState(input.checkpointRows, identityHash);
  if (restored.complete) {
    return validateCompleteRepresentation(
      restored.complete,
      identityHash,
      sourceDocumentIds,
      input.language,
      input.targetTokens
    );
  }
  if (input.requireRestoredComplete) {
    throw new Error('Accepted evidence run is missing its durable downstream representation');
  }

  const units: SummaryUnit[] = [];
  for (const card of cards) {
    const cardUnit = { unitId: card.document_id, summary: unitText(card) };
    if (
      estimateDownstreamReduceInputTokens(
        [cardUnit],
        CROSS_DOCUMENT_REDUCE_TOPIC,
        input.language
      ) <= input.maxBatchTokens
    ) {
      units.push(cardUnit);
    } else {
      units.push(
        await reduceOversizedCard(
          input,
          identityHash,
          DOWNSTREAM_CONTEXT_SCHEMA_VERSION,
          restored,
          card,
          cards.length
        )
      );
    }
  }
  let promptContent = renderPrompt(input, identityHash, units);
  let level = 0;
  while (estimate(promptContent, input.language) > input.targetTokens) {
    level += 1;
    if (level > 8) throw new Error('Downstream evidence hierarchy did not converge');
    const previousTokens = units.reduce(
      (total, unit) => total + estimate(unit.summary, input.language),
      0
    );
    const groups = groupDownstreamUnits(
      units,
      CROSS_DOCUMENT_REDUCE_TOPIC,
      input.maxBatchTokens,
      input.language
    );
    const reduced: SummaryUnit[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const result = await reduceDownstreamGroup(
        input,
        identityHash,
        DOWNSTREAM_CONTEXT_SCHEMA_VERSION,
        restored,
        'cross',
        undefined,
        groups[index],
        level,
        index,
        cards.length
      );
      reduced.push(
        ...splitDownstreamUnit(
          result,
          CROSS_DOCUMENT_REDUCE_TOPIC,
          input.maxBatchTokens,
          input.language
        )
      );
    }
    const nextTokens = reduced.reduce(
      (total, unit) => total + estimate(unit.summary, input.language),
      0
    );
    units.splice(0, units.length, ...reduced);
    promptContent = renderPrompt(input, identityHash, units);
    if (
      estimate(promptContent, input.language) > input.targetTokens &&
      nextTokens >= previousTokens
    ) {
      throw new Error('Downstream evidence hierarchy made no token progress');
    }
  }

  const representation: DownstreamEvidenceRepresentation = {
    kind: 'synthetic_advisory',
    runId: input.runId,
    representationHash: identityHash,
    promptContent,
    tokenCount: estimate(promptContent, input.language),
    targetTokens: input.targetTokens,
    sourceCount: cards.length,
    sourceDocumentIds,
    sourceOutcomes: cards.map(card => ({
      documentId: card.document_id,
      coverageStatus: card.coverage_status,
      coverageReason: card.coverage_reason,
    })),
    sourceMaterials: cards.map(card => ({
      documentId: card.document_id,
      keyClaims: card.key_claims,
      constraints: card.constraints,
      limitations: card.limitations,
    })),
    coverage: input.coverage,
    materialSourceRefs: materialRefs(cards),
    claims: sortedUnique(cards.flatMap(card => card.key_claims.map(claim => claim.statement))),
    constraints: sortedUnique(cards.flatMap(card => card.constraints)),
    limitations: sortedUnique(cards.flatMap(card => card.limitations)),
  };
  try {
    await input.onCheckpoint?.({
      batchKey: `downstream:${identityHash}:complete`,
      inputHash: identityHash,
      structuredCheckpoint: {
        kind: 'downstream_context_complete',
        identity_hash: identityHash,
        schema_version: DOWNSTREAM_CONTEXT_SCHEMA_VERSION,
        model_id: input.modelId,
        language: input.language,
        target_tokens: input.targetTokens,
        max_batch_tokens: input.maxBatchTokens,
        source_document_ids: sourceDocumentIds,
        representation,
      },
      cursor: { kind: 'downstream_context_complete', source_count: cards.length },
      usageDelta: emptyGenerationMetrics(),
    });
  } catch (error) {
    throw new EvidenceCheckpointError(error);
  }
  return representation;
}
