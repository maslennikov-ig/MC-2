import { createHash } from 'node:crypto';
import type { DocumentEvidenceCard } from '@megacampus/shared-types';
import { tokenEstimator } from '@/shared/llm/token-estimator';
import { STRUCTURED_REDUCE_SYSTEM_PROMPT } from './card-generator';

export interface DownstreamSummaryUnit {
  unitId: string;
  summary: string;
}

export const CARD_REDUCE_TOPIC = 'Per-document advisory evidence digest';
export const CROSS_DOCUMENT_REDUCE_TOPIC = 'Cross-document advisory evidence digest';

// Covers chat role separators and provider framing outside the exact user/system strings.
const CHAT_FORMAT_RESERVE_TOKENS = 16;
const MAX_PART_COUNT_SENTINEL = 999_999;

function estimate(value: string, language: 'ru' | 'en'): number {
  return tokenEstimator.estimateTokens(value, language);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function estimateDownstreamReduceInputTokens(
  units: DownstreamSummaryUnit[],
  topic: string,
  language: 'ru' | 'en'
): number {
  const userPrompt = JSON.stringify({ topic, units });
  return (
    estimate(`${STRUCTURED_REDUCE_SYSTEM_PROMPT}\n${userPrompt}`, language) +
    CHAT_FORMAT_RESERVE_TOKENS
  );
}

export function groupDownstreamUnits(
  units: DownstreamSummaryUnit[],
  topic: string,
  maxBatchTokens: number,
  language: 'ru' | 'en'
): DownstreamSummaryUnit[][] {
  const groups: DownstreamSummaryUnit[][] = [];
  let group: DownstreamSummaryUnit[] = [];
  for (const unit of units) {
    if (estimateDownstreamReduceInputTokens([unit], topic, language) > maxBatchTokens) {
      throw new Error(`Downstream evidence unit ${unit.unitId} exceeds the bounded reduce input`);
    }
    const candidate = [...group, unit];
    if (
      group.length > 0 &&
      estimateDownstreamReduceInputTokens(candidate, topic, language) > maxBatchTokens
    ) {
      groups.push(group);
      group = [unit];
    } else {
      group = candidate;
    }
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

export function splitDownstreamUnit(
  unit: DownstreamSummaryUnit,
  topic: string,
  maxBatchTokens: number,
  language: 'ru' | 'en'
): DownstreamSummaryUnit[] {
  if (estimateDownstreamReduceInputTokens([unit], topic, language) <= maxBatchTokens) {
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
      if (estimateDownstreamReduceInputTokens([candidate], topic, language) <= maxBatchTokens) {
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
  language: 'ru' | 'en'
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
      if (
        estimateDownstreamReduceInputTokens([candidate], CARD_REDUCE_TOPIC, language) <=
        maxBatchTokens
      ) {
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
  language: 'ru' | 'en'
): DownstreamSummaryUnit[] {
  return materialItems(card).flatMap(item =>
    splitMaterialItem(card, item, maxBatchTokens, language)
  );
}
