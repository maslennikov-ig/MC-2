import { createHash } from 'node:crypto';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import { get_encoding, type Tiktoken } from 'tiktoken';
import { STRUCTURED_REDUCE_SYSTEM_PROMPT } from './card-generator';

export interface DownstreamSummaryUnit {
  unitId: string;
  summary: string;
}

export const CARD_REDUCE_TOPIC = 'Per-document advisory evidence digest';
export const CROSS_DOCUMENT_REDUCE_TOPIC = 'Cross-document advisory evidence digest';

export const DOWNSTREAM_TOKENIZER = {
  package: 'tiktoken',
  version: '1.0.22',
  encoding: 'cl100k_base',
  // Conservative reserve for role separators, message framing and assistant priming.
  chatEnvelopeTokens: 16,
} as const;
const MAX_PART_COUNT_SENTINEL = 999_999;

function withEncoder<T>(operation: (encoder: Tiktoken) => T): T {
  const encoder = get_encoding(DOWNSTREAM_TOKENIZER.encoding);
  try {
    return operation(encoder);
  } finally {
    encoder.free();
  }
}

const STRUCTURED_REDUCE_SYSTEM_TOKENS = withEncoder(
  encoder => encoder.encode(STRUCTURED_REDUCE_SYSTEM_PROMPT).length
);

function countRequestWithEncoder(
  encoder: Tiktoken,
  units: DownstreamSummaryUnit[],
  topic: string
): number {
  const userPrompt = JSON.stringify({ topic, units });
  return (
    STRUCTURED_REDUCE_SYSTEM_TOKENS +
    encoder.encode(userPrompt).length +
    DOWNSTREAM_TOKENIZER.chatEnvelopeTokens
  );
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function estimateDownstreamReduceInputTokens(
  units: DownstreamSummaryUnit[],
  topic: string,
  _language: 'ru' | 'en'
): number {
  return withEncoder(encoder => countRequestWithEncoder(encoder, units, topic));
}

export function downstreamUnitsFitBatch(
  units: DownstreamSummaryUnit[],
  topic: string,
  maxBatchTokens: number
): boolean[] {
  return withEncoder(encoder =>
    units.map(unit => countRequestWithEncoder(encoder, [unit], topic) <= maxBatchTokens)
  );
}

export function groupDownstreamUnits(
  units: DownstreamSummaryUnit[],
  topic: string,
  maxBatchTokens: number,
  _language: 'ru' | 'en'
): DownstreamSummaryUnit[][] {
  return withEncoder(encoder => {
    const groups: DownstreamSummaryUnit[][] = [];
    let group: DownstreamSummaryUnit[] = [];
    for (const unit of units) {
      if (countRequestWithEncoder(encoder, [unit], topic) > maxBatchTokens) {
        throw new Error(`Downstream evidence unit ${unit.unitId} exceeds the bounded reduce input`);
      }
      const candidate = [...group, unit];
      if (group.length > 0 && countRequestWithEncoder(encoder, candidate, topic) > maxBatchTokens) {
        groups.push(group);
        group = [unit];
      } else {
        group = candidate;
      }
    }
    if (group.length > 0) groups.push(group);
    return groups;
  });
}

export function splitDownstreamUnit(
  unit: DownstreamSummaryUnit,
  topic: string,
  maxBatchTokens: number,
  _language: 'ru' | 'en'
): DownstreamSummaryUnit[] {
  return withEncoder(encoder => {
    if (countRequestWithEncoder(encoder, [unit], topic) <= maxBatchTokens) {
      return [unit];
    }
    const characters = Array.from(unit.summary);
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < characters.length) {
      let low = 1;
      let high = characters.length - cursor;
      let accepted = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = {
          unitId: `${unit.unitId}:part:${MAX_PART_COUNT_SENTINEL}`,
          summary: characters.slice(cursor, cursor + middle).join(''),
        };
        if (countRequestWithEncoder(encoder, [candidate], topic) <= maxBatchTokens) {
          accepted = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (accepted === 0) {
        throw new Error(`Downstream reduce framing exceeds the batch limit for ${unit.unitId}`);
      }
      chunks.push(characters.slice(cursor, cursor + accepted).join(''));
      cursor += accepted;
    }
    return chunks.map((summary, index) => ({
      unitId: `${unit.unitId}:part:${index + 1}`,
      summary,
    }));
  });
}

interface MaterialItem {
  itemId: string;
  type: 'summary' | 'claim' | 'constraint' | 'limitation' | 'coverage';
  content: string;
  sourceTrace: string;
}

function materialItems(card: DocumentEvidenceCard): MaterialItem[] {
  return [
    {
      itemId: 'summary',
      type: 'summary',
      content: card.summary ?? '[no assessed summary]',
      sourceTrace: hash(`${card.document_id}:summary`),
    },
    ...card.key_claims.map(claim => ({
      itemId: claim.claim_id,
      type: 'claim' as const,
      content: claim.statement,
      sourceTrace: hash(JSON.stringify(claim.source_refs)),
    })),
    ...card.constraints.map((content, index) => ({
      itemId: `${index.toString().padStart(6, '0')}-${hash(content).slice(0, 16)}`,
      type: 'constraint' as const,
      content,
      sourceTrace: hash(`${card.document_id}:constraint:${index}`),
    })),
    ...card.limitations.map((content, index) => ({
      itemId: `${index.toString().padStart(6, '0')}-${hash(content).slice(0, 16)}`,
      type: 'limitation' as const,
      content,
      sourceTrace: hash(`${card.document_id}:limitation:${index}`),
    })),
    {
      itemId: 'coverage',
      type: 'coverage',
      content: `${card.coverage_status} (${card.coverage_reason})`,
      sourceTrace: hash(`${card.document_id}:coverage`),
    },
  ];
}

function unitId(card: DocumentEvidenceCard, item: MaterialItem, partIndex: number): string {
  return `${card.document_id}:material:${item.type}:${item.itemId}:part:${partIndex}`;
}

function renderMaterialPart(
  card: DocumentEvidenceCard,
  item: MaterialItem,
  content: string,
  partIndex: number,
  partCount: number
): string {
  return [
    `document_id=${card.document_id}`,
    `material_type=${item.type}`,
    `material_id=${item.itemId}`,
    `source_trace=sha256:${item.sourceTrace}`,
    `part=${partIndex}/${partCount}`,
    `content=${content}`,
  ].join('\n');
}

function splitMaterialItem(
  card: DocumentEvidenceCard,
  item: MaterialItem,
  maxBatchTokens: number,
  encoder: Tiktoken
): DownstreamSummaryUnit[] {
  const characters = Array.from(item.content);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < characters.length) {
    let low = 1;
    let high = characters.length - cursor;
    let accepted = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const content = characters.slice(cursor, cursor + middle).join('');
      const candidate = {
        unitId: unitId(card, item, MAX_PART_COUNT_SENTINEL),
        summary: renderMaterialPart(
          card,
          item,
          content,
          MAX_PART_COUNT_SENTINEL,
          MAX_PART_COUNT_SENTINEL
        ),
      };
      if (countRequestWithEncoder(encoder, [candidate], CARD_REDUCE_TOPIC) <= maxBatchTokens) {
        accepted = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (accepted === 0) {
      throw new Error(`Downstream material metadata ${item.itemId} exceeds the batch limit`);
    }
    chunks.push(characters.slice(cursor, cursor + accepted).join(''));
    cursor += accepted;
  }
  if (chunks.length > MAX_PART_COUNT_SENTINEL) {
    throw new Error(`Downstream material ${item.itemId} requires too many deterministic parts`);
  }
  return chunks.map((content, index) => ({
    unitId: unitId(card, item, index + 1),
    summary: renderMaterialPart(card, item, content, index + 1, chunks.length),
  }));
}

export function buildCardMaterialUnits(
  card: DocumentEvidenceCard,
  maxBatchTokens: number,
  _language: 'ru' | 'en'
): DownstreamSummaryUnit[] {
  return withEncoder(encoder =>
    materialItems(card).flatMap(item => splitMaterialItem(card, item, maxBatchTokens, encoder))
  );
}
