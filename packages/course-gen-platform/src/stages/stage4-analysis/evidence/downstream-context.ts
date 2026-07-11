import { createHash } from 'node:crypto';
import type {
  DocumentEvidenceCard,
  DocumentEvidenceCoverageSummary,
} from '@megacampus/shared-types';
import { tokenEstimator } from '@/shared/llm/token-estimator';
import type { EvidenceGenerationMetrics, StructuredEvidencePort } from './card-generator';
import { emptyGenerationMetrics, EvidenceCheckpointError } from './card-generator';
import type { DocumentSummaryResult } from '../handler-helpers';

const DOWNSTREAM_CONTEXT_SCHEMA_VERSION = 'document-evidence-downstream-v1';

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

interface SummaryUnit {
  unitId: string;
  summary: string;
}

interface StoredReduction {
  batchKey: string;
  inputHash: string;
  unitIds: string[];
  summary: string;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function estimate(value: string, language: 'ru' | 'en'): number {
  return tokenEstimator.estimateTokens(value, language);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort();
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

function groupUnits(
  units: SummaryUnit[],
  maxBatchTokens: number,
  language: 'ru' | 'en'
): SummaryUnit[][] {
  const groups: SummaryUnit[][] = [];
  let group: SummaryUnit[] = [];
  let tokens = 0;
  for (const unit of units) {
    const unitTokens = estimate(unit.summary, language);
    if (unitTokens > maxBatchTokens) {
      throw new Error(`Downstream evidence unit ${unit.unitId} exceeds the bounded reduce input`);
    }
    if (group.length > 0 && tokens + unitTokens > maxBatchTokens) {
      groups.push(group);
      group = [];
      tokens = 0;
    }
    group.push(unit);
    tokens += unitTokens;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

function restoredState(rows: Array<Record<string, unknown>> | undefined, identityHash: string) {
  const reductions = new Map<string, StoredReduction>();
  let complete: DownstreamEvidenceRepresentation | undefined;
  for (const row of rows ?? []) {
    const checkpoint = row.structured_checkpoint;
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) continue;
    const value = checkpoint as Record<string, unknown>;
    if (value.identity_hash !== identityHash) continue;
    if (value.kind === 'downstream_context_complete') {
      complete = value.representation as DownstreamEvidenceRepresentation;
    }
    if (
      value.kind === 'downstream_context_reduction' &&
      typeof row.batch_key === 'string' &&
      typeof row.input_hash === 'string' &&
      Array.isArray(value.unit_ids) &&
      typeof value.summary === 'string'
    ) {
      reductions.set(`${row.batch_key}\n${row.input_hash}`, {
        batchKey: row.batch_key,
        inputHash: row.input_hash,
        unitIds: value.unit_ids as string[],
        summary: value.summary,
      });
    }
  }
  return { reductions, complete };
}

function validateCompleteRepresentation(
  representation: DownstreamEvidenceRepresentation,
  identityHash: string,
  sourceDocumentIds: string[],
  language: 'ru' | 'en',
  targetTokens: number
): DownstreamEvidenceRepresentation {
  const outcomeIds = representation.sourceOutcomes.map(outcome => outcome.documentId);
  if (
    representation.kind !== 'synthetic_advisory' ||
    representation.representationHash !== identityHash ||
    representation.sourceCount !== sourceDocumentIds.length ||
    JSON.stringify(representation.sourceDocumentIds) !== JSON.stringify(sourceDocumentIds) ||
    JSON.stringify(outcomeIds) !== JSON.stringify(sourceDocumentIds) ||
    representation.targetTokens !== targetTokens ||
    representation.tokenCount !== estimate(representation.promptContent, language) ||
    representation.tokenCount > targetTokens
  ) {
    throw new Error('Stored downstream representation failed identity, coverage, or token checks');
  }
  return representation;
}

async function reduceWithRetry(
  input: BuildDownstreamEvidenceRepresentationInput,
  units: SummaryUnit[],
  level: number
) {
  const attempts = input.port.retryOwner === 'port' ? 1 : input.maxRetries + 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await input.port.reduceSummary({
        units,
        topic: 'Cross-document advisory evidence digest',
        language: input.language,
        level,
        maxOutputTokens: Math.max(64, Math.floor(input.maxBatchTokens / 2)),
      });
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function metrics(
  usage: { inputTokens: number; outputTokens: number; costUsd: number },
  attempts: number,
  level: number
): EvidenceGenerationMetrics {
  return {
    ...emptyGenerationMetrics(),
    modelCalls: attempts,
    retryCount: attempts - 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.costUsd,
    reduceLevels: level,
  };
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
  const restored = restoredState(input.checkpointRows, identityHash);
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

  let units = cards.map(card => ({ unitId: card.document_id, summary: unitText(card) }));
  let promptContent = renderPrompt(input, identityHash, units);
  let level = 0;
  while (estimate(promptContent, input.language) > input.targetTokens) {
    level += 1;
    if (level > 8) throw new Error('Downstream evidence hierarchy did not converge');
    const previousTokens = units.reduce(
      (total, unit) => total + estimate(unit.summary, input.language),
      0
    );
    const groups = groupUnits(units, input.maxBatchTokens, input.language);
    const reduced: SummaryUnit[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const unitIds = group.map(unit => unit.unitId).sort();
      const inputHash = sha256(JSON.stringify(group));
      const batchKey = `downstream:${identityHash}:reduce:${level}:${index}`;
      const prior = restored.reductions.get(`${batchKey}\n${inputHash}`);
      let summary: string;
      if (prior) {
        if (JSON.stringify(prior.unitIds) !== JSON.stringify(unitIds)) {
          throw new Error('Stored downstream reduction changed the allowlisted unit set');
        }
        summary = prior.summary;
      } else {
        const called = await reduceWithRetry(input, group, level);
        const returnedIds = [...called.result.value.unitIds].sort();
        if (JSON.stringify(returnedIds) !== JSON.stringify(unitIds)) {
          throw new Error('Downstream reduction changed the allowlisted unit set');
        }
        summary = called.result.value.summary;
        try {
          await input.onCheckpoint?.({
            batchKey,
            inputHash,
            structuredCheckpoint: {
              kind: 'downstream_context_reduction',
              identity_hash: identityHash,
              level,
              index,
              unit_ids: unitIds,
              summary,
            },
            cursor: { kind: 'downstream_context', level, index, source_count: cards.length },
            usageDelta: metrics(called.result.usage, called.attempts, level),
          });
        } catch (error) {
          throw new EvidenceCheckpointError(error);
        }
      }
      reduced.push({ unitId: sha256(`${level}\n${unitIds.join('\n')}`), summary });
    }
    const nextTokens = reduced.reduce(
      (total, unit) => total + estimate(unit.summary, input.language),
      0
    );
    units = reduced;
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
