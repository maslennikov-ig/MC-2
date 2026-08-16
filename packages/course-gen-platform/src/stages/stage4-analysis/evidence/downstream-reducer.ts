import { createHash } from 'node:crypto';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import {
  emptyGenerationMetrics,
  EvidenceCheckpointError,
  type EvidenceGenerationMetrics,
} from './card-generator';
import {
  buildCardMaterialUnits,
  CARD_REDUCE_TOPIC,
  CROSS_DOCUMENT_REDUCE_TOPIC,
  DOWNSTREAM_TOKENIZER,
  estimateDownstreamReduceInputTokens,
  groupDownstreamUnits,
  splitDownstreamUnit,
  type DownstreamSummaryUnit,
} from './downstream-hierarchy';
import type {
  BuildDownstreamEvidenceRepresentationInput,
  DownstreamEvidenceRepresentation,
} from './downstream-context';

interface StoredReduction {
  unitIds: string[];
  summary: string;
}

export interface DownstreamRestoredState {
  reductions: Map<string, StoredReduction>;
  materialChunks: Set<string>;
  complete: DownstreamEvidenceRepresentation | undefined;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function restoreDownstreamState(
  rows: Array<Record<string, unknown>> | undefined,
  identityHash: string
): DownstreamRestoredState {
  const reductions = new Map<string, StoredReduction>();
  const materialChunks = new Set<string>();
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
      value.kind === 'downstream_context_material_chunk' &&
      typeof row.batch_key === 'string' &&
      typeof row.input_hash === 'string'
    ) {
      materialChunks.add(`${row.batch_key}\n${row.input_hash}`);
    }
    if (
      value.kind === 'downstream_context_reduction' &&
      typeof row.batch_key === 'string' &&
      typeof row.input_hash === 'string' &&
      Array.isArray(value.unit_ids) &&
      typeof value.summary === 'string'
    ) {
      reductions.set(`${row.batch_key}\n${row.input_hash}`, {
        unitIds: value.unit_ids as string[],
        summary: value.summary,
      });
    }
  }
  return { reductions, materialChunks, complete };
}

function checkpointIdentity(
  input: BuildDownstreamEvidenceRepresentationInput,
  identityHash: string,
  schemaVersion: string
) {
  return {
    identity_hash: identityHash,
    schema_version: schemaVersion,
    model_id: input.modelId,
    language: input.language,
    target_tokens: input.targetTokens,
    max_batch_tokens: input.maxBatchTokens,
    tokenizer: DOWNSTREAM_TOKENIZER,
  };
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

/**
 * Says which unit ids a reduction added or dropped, or nothing when it kept
 * exactly the set it was given.
 */
function describeUnitSetDrift(expected: string[], actual: string[]): string | null {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const dropped = expected.filter(id => !actualSet.has(id));
  const invented = actual.filter(id => !expectedSet.has(id));
  const repeated = actual.length !== actualSet.size;
  if (!dropped.length && !invented.length && !repeated) return null;
  return [
    dropped.length ? `dropped ${dropped.join(', ')}` : '',
    invented.length ? `invented ${invented.join(', ')}` : '',
    repeated ? 'repeated a unit' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * A reduction that loses a unit is a bad answer, not a bad stage.
 *
 * The set check used to run after this function returned, outside the retry
 * budget written for exactly this kind of answer, so one dropped id ended the
 * stage with attempts still in hand — the same shape as the conflict detector's
 * allowlist check (mc2-2pplo, f05fd9435).
 */
async function reduceWithRetry(
  input: BuildDownstreamEvidenceRepresentationInput,
  units: DownstreamSummaryUnit[],
  level: number,
  topic: string
) {
  const expectedIds = units.map(unit => unit.unitId).sort();
  const attempts = input.port.retryOwner === 'port' ? 1 : input.maxRetries + 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await input.port.reduceSummary({
        units,
        topic,
        language: input.language,
        level,
        maxOutputTokens: Math.max(64, Math.floor(input.maxBatchTokens / 2)),
      });
      const drift = describeUnitSetDrift(expectedIds, [...result.value.unitIds].sort());
      if (drift) {
        throw new Error(`Downstream reduction changed the allowlisted unit set: ${drift}`);
      }
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function persistMaterialChunks(
  input: BuildDownstreamEvidenceRepresentationInput,
  identityHash: string,
  schemaVersion: string,
  documentId: string,
  units: DownstreamSummaryUnit[],
  restored: DownstreamRestoredState,
  sourceCount: number
): Promise<void> {
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const batchKey = `downstream:${identityHash}:card:${documentId}:material:${index}`;
    const inputHash = sha256(JSON.stringify(unit));
    if (restored.materialChunks.has(`${batchKey}\n${inputHash}`)) continue;
    try {
      await input.onCheckpoint?.({
        batchKey,
        inputHash,
        structuredCheckpoint: {
          kind: 'downstream_context_material_chunk',
          ...checkpointIdentity(input, identityHash, schemaVersion),
          stage: 'card',
          document_id: documentId,
          index,
          unit,
        },
        cursor: {
          kind: 'downstream_context_material_chunk',
          document_id: documentId,
          index,
          source_count: sourceCount,
        },
        usageDelta: emptyGenerationMetrics(),
      });
    } catch (error) {
      throw new EvidenceCheckpointError(error);
    }
  }
}

export async function reduceDownstreamGroup(
  input: BuildDownstreamEvidenceRepresentationInput,
  identityHash: string,
  schemaVersion: string,
  restored: DownstreamRestoredState,
  stage: 'card' | 'cross',
  documentId: string | undefined,
  group: DownstreamSummaryUnit[],
  level: number,
  index: number,
  sourceCount: number
): Promise<DownstreamSummaryUnit> {
  const unitIds = group.map(unit => unit.unitId).sort();
  const inputHash = sha256(JSON.stringify(group));
  const scope = stage === 'card' ? `card:${documentId}` : 'cross';
  const batchKey = `downstream:${identityHash}:${scope}:reduce:${level}:${index}`;
  const prior = restored.reductions.get(`${batchKey}\n${inputHash}`);
  let summary: string;
  if (prior) {
    // A stored reduction cannot be retried into shape, so this one stays here.
    const drift = describeUnitSetDrift(unitIds, [...prior.unitIds].sort());
    if (drift) {
      throw new Error(`Stored downstream reduction changed the allowlisted unit set: ${drift}`);
    }
    summary = prior.summary;
  } else {
    const topic = stage === 'card' ? CARD_REDUCE_TOPIC : CROSS_DOCUMENT_REDUCE_TOPIC;
    const called = await reduceWithRetry(input, group, level, topic);
    summary = called.result.value.summary;
    try {
      await input.onCheckpoint?.({
        batchKey,
        inputHash,
        structuredCheckpoint: {
          kind: 'downstream_context_reduction',
          ...checkpointIdentity(input, identityHash, schemaVersion),
          stage,
          document_id: documentId,
          level,
          index,
          unit_ids: unitIds,
          summary,
        },
        cursor: {
          kind: 'downstream_context',
          stage,
          document_id: documentId,
          level,
          index,
          source_count: sourceCount,
        },
        usageDelta: metrics(called.result.usage, called.attempts, level),
      });
    } catch (error) {
      throw new EvidenceCheckpointError(error);
    }
  }
  return {
    unitId: sha256(`${stage}\n${documentId ?? ''}\n${level}\n${unitIds.join('\n')}`),
    summary,
  };
}

export async function reduceOversizedCard(
  input: BuildDownstreamEvidenceRepresentationInput,
  identityHash: string,
  schemaVersion: string,
  restored: DownstreamRestoredState,
  card: DocumentEvidenceCard,
  sourceCount: number
): Promise<DownstreamSummaryUnit> {
  let units = buildCardMaterialUnits(card, input.maxBatchTokens, input.language);
  await persistMaterialChunks(
    input,
    identityHash,
    schemaVersion,
    card.document_id,
    units,
    restored,
    sourceCount
  );
  for (let level = 1; level <= 16; level += 1) {
    const groups = groupDownstreamUnits(
      units,
      CARD_REDUCE_TOPIC,
      input.maxBatchTokens,
      input.language
    );
    const reduced: DownstreamSummaryUnit[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const result = await reduceDownstreamGroup(
        input,
        identityHash,
        schemaVersion,
        restored,
        'card',
        card.document_id,
        groups[index],
        level,
        index,
        sourceCount
      );
      reduced.push(
        ...splitDownstreamUnit(result, CARD_REDUCE_TOPIC, input.maxBatchTokens, input.language)
      );
    }
    if (reduced.length === 1) {
      const cardUnit = { unitId: card.document_id, summary: reduced[0].summary };
      if (
        estimateDownstreamReduceInputTokens(
          [cardUnit],
          CROSS_DOCUMENT_REDUCE_TOPIC,
          input.language
        ) <= input.maxBatchTokens
      ) {
        return cardUnit;
      }
    }
    if (JSON.stringify(reduced) === JSON.stringify(units)) {
      throw new Error(`Downstream per-card hierarchy made no progress for ${card.document_id}`);
    }
    units = reduced;
  }
  throw new Error(`Downstream per-card hierarchy did not converge for ${card.document_id}`);
}
