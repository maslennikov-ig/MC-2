import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookNumericFact,
  CareerPlaybookNumericFactSource,
  CareerPlaybookNumericFactStatus,
} from '@megacampus/shared-types';

interface ExtractCareerPlaybookNumericFactsInput {
  blockId: CareerPlaybookBlockId;
  content: string;
  evidenceText?: string;
  language?: string;
  now?: () => Date;
}

interface NumericMatch {
  rawText: string;
  start: number;
  end: number;
  kind: 'date' | 'range' | 'percent' | 'money' | 'multiplier' | 'duration' | 'count';
}

const NUMERIC_PATTERNS: Array<{
  kind: NumericMatch['kind'];
  pattern: RegExp;
}> = [
  { kind: 'date', pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
  { kind: 'range', pattern: /\b\d{1,3}(?:-\d{1,3}){1,3}\b/g },
  { kind: 'percent', pattern: /\b\d+(?:[.,]\d+)?\s?%/g },
  {
    kind: 'money',
    pattern:
      /(?:[$€₽]\s?\d+(?:[.,]\d+)?\s?(?:k|m|млн|тыс)?|\b\d+(?:[.,]\d+)?\s?(?:млн|тыс|k|m)\s?(?:₽|руб(?:\.|лей)?|USD|EUR|\$))/giu,
  },
  { kind: 'multiplier', pattern: /\b\d+(?:[.,]\d+)?x\b/gi },
  {
    kind: 'duration',
    pattern:
      /\b\d+(?:[.,]\d+)?\s?(?:дней|дня|день|недель|недели|неделя|месяцев|месяца|месяц|hours?|days?|weeks?|months?)\b/giu,
  },
  { kind: 'count', pattern: /\b\d+(?:[.,]\d+)?\b/g },
];

const METHOD_STRUCTURAL_VALUES = new Set(['30-60-90']);

function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim();
}

function normalizeNumericSearchValue(value: string): string {
  return normalizeForSearch(value).replace(/[–—]/g, '-');
}

function numericSearchVariants(rawText: string): string[] {
  const normalized = normalizeNumericSearchValue(rawText);
  const variants = new Set([normalized]);
  if (normalized.includes(',')) variants.add(normalized.replace(/,/g, '.'));
  if (normalized.includes('.')) variants.add(normalized.replace(/\./g, ','));
  return [...variants].filter(Boolean);
}

function evidenceWindowsForRaw(evidence: string, rawText: string): string[] {
  const windows: string[] = [];
  for (const variant of numericSearchVariants(rawText)) {
    let startIndex = 0;
    while (startIndex < evidence.length) {
      const matchIndex = evidence.indexOf(variant, startIndex);
      if (matchIndex < 0) break;
      windows.push(
        evidence.slice(
          Math.max(0, matchIndex - 48),
          Math.min(evidence.length, matchIndex + variant.length + 48)
        )
      );
      startIndex = matchIndex + variant.length;
    }
  }
  return windows;
}

function evidenceContainsRawValue(evidence: string, rawText: string): boolean {
  return numericSearchVariants(rawText).some(variant => evidence.includes(variant));
}

function evidenceHasBenchmarkContext(evidence: string, rawText: string): boolean {
  return evidenceWindowsForRaw(evidence, rawText).some(
    window =>
      window.includes('benchmark') ||
      window.includes('бенчмарк') ||
      window.includes('industry') ||
      window.includes('рынок')
  );
}

function stableId(
  blockId: CareerPlaybookBlockId,
  rawText: string,
  occurrenceIndex: number
): string {
  const slug = rawText
    .toLocaleLowerCase('en')
    .replace(/%/g, 'percent')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${blockId}-${slug || 'number'}-${occurrenceIndex}`;
}

function codeRanges(markdown: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const fenced = /```[\s\S]*?```/g;
  let fencedMatch: RegExpExecArray | null;
  while ((fencedMatch = fenced.exec(markdown))) {
    ranges.push({ start: fencedMatch.index, end: fencedMatch.index + fencedMatch[0].length });
  }

  const inline = /`[^`\n]+`/g;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inline.exec(markdown))) {
    ranges.push({ start: inlineMatch.index, end: inlineMatch.index + inlineMatch[0].length });
  }

  return ranges;
}

function isInsideRange(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(range => index >= range.start && index < range.end);
}

function lineAt(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index - 1) + 1;
  const nextBreak = content.indexOf('\n', index);
  const end = nextBreak === -1 ? content.length : nextBreak;
  return content.slice(start, end);
}

function isHeadingIndex(content: string, index: number): boolean {
  return /^#{1,6}\s+/.test(lineAt(content, index).trimStart());
}

function matchSurroundingText(content: string, start: number, end: number): string {
  return content
    .slice(Math.max(0, start - 80), Math.min(content.length, end + 80))
    .replace(/\s+/g, ' ')
    .trim();
}

function overlaps(candidate: NumericMatch, existing: NumericMatch[]): boolean {
  return existing.some(match => candidate.start < match.end && candidate.end > match.start);
}

function collectNumericMatches(content: string): NumericMatch[] {
  const ignoredRanges = codeRanges(content);
  const matches: NumericMatch[] = [];

  for (const { kind, pattern } of NUMERIC_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      const rawText = match[0].trim();
      const start = match.index + match[0].indexOf(rawText);
      const end = start + rawText.length;
      const candidate = { rawText, start, end, kind };
      if (isInsideRange(start, ignoredRanges)) continue;
      if (isHeadingIndex(content, start)) continue;
      if (overlaps(candidate, matches)) continue;
      matches.push(candidate);
    }
  }

  return matches.sort((left, right) => left.start - right.start);
}

function isMethodologyNumber(rawText: string, surroundingText: string): boolean {
  const normalizedRaw = normalizeForSearch(rawText);
  const normalizedContext = normalizeForSearch(surroundingText);
  if (METHOD_STRUCTURAL_VALUES.has(normalizedRaw)) return true;

  return (
    normalizedRaw === '5' &&
    (normalizedContext.includes('first 5 wins') ||
      normalizedContext.includes('первые 5 побед') ||
      normalizedContext.includes('план 5 побед'))
  );
}

function classifyNumericFact(input: {
  rawText: string;
  surroundingText: string;
  evidenceText: string;
}): {
  status: CareerPlaybookNumericFactStatus;
  source: CareerPlaybookNumericFactSource;
  confidence: number;
  explanation: string;
} {
  const evidence = normalizeNumericSearchValue(input.evidenceText);
  const surrounding = normalizeForSearch(input.surroundingText);

  if (isMethodologyNumber(input.rawText, input.surroundingText)) {
    return {
      status: 'structural',
      source: 'methodology',
      confidence: 1,
      explanation: 'Структурная цифра из методики Career Playbook.',
    };
  }

  if (evidence && evidenceContainsRawValue(evidence, input.rawText)) {
    if (evidenceHasBenchmarkContext(evidence, input.rawText)) {
      return {
        status: 'benchmark',
        source: 'web_benchmark',
        confidence: 0.75,
        explanation: 'Число найдено в benchmark- или исследовательском контексте.',
      };
    }

    return {
      status: 'verified',
      source: 'source_document',
      confidence: 0.9,
      explanation: 'Число найдено в пользовательском контексте или загруженных материалах.',
    };
  }

  if (surrounding.includes('пример') || surrounding.includes('example')) {
    return {
      status: 'suggested',
      source: 'model_suggestion',
      confidence: 0.5,
      explanation: 'Число выглядит как пример или рекомендация и требует проверки.',
    };
  }

  return {
    status: 'needs_review',
    source: 'model_suggestion',
    confidence: 0.45,
    explanation: 'Точное значение не найдено в источниках.',
  };
}

export function extractCareerPlaybookNumericFacts(
  input: ExtractCareerPlaybookNumericFactsInput
): CareerPlaybookNumericFact[] {
  const matches = collectNumericMatches(input.content);
  const evidenceText = input.evidenceText ?? '';
  const seen = new Map<string, number>();

  return matches.map(match => {
    const occurrenceIndex = seen.get(match.rawText) ?? 0;
    seen.set(match.rawText, occurrenceIndex + 1);
    const surroundingText = matchSurroundingText(input.content, match.start, match.end);
    const classification = classifyNumericFact({
      rawText: match.rawText,
      surroundingText,
      evidenceText,
    });

    return {
      id: stableId(input.blockId, match.rawText, occurrenceIndex),
      block_id: input.blockId,
      raw_text: match.rawText,
      normalized_value: match.rawText.replace(/\s+/g, ' ').trim(),
      unit: match.kind,
      occurrence_index: occurrenceIndex,
      surrounding_text: surroundingText,
      ...classification,
    };
  });
}

export function findCareerPlaybookNumericFactOccurrences(
  content: string,
  rawText: string
): Array<{ start: number; end: number }> {
  return collectNumericMatches(content)
    .filter(match => match.rawText === rawText)
    .map(match => ({ start: match.start, end: match.end }));
}

export function annotateCareerPlaybookBlockNumericFacts(input: {
  blockId: CareerPlaybookBlockId;
  block: CareerPlaybookBlockState;
  evidenceText?: string;
  language?: string;
}): CareerPlaybookBlockState {
  return {
    ...input.block,
    numeric_facts: extractCareerPlaybookNumericFacts({
      blockId: input.blockId,
      content: input.block.content,
      evidenceText: input.evidenceText,
      language: input.language,
    }),
  };
}

export function annotateCareerPlaybookBlocksNumericFacts(input: {
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  evidenceText?: string;
  language?: string;
}): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  const annotated: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {};

  for (const [blockId, block] of Object.entries(input.blocks)) {
    if (!block) continue;
    annotated[blockId] = annotateCareerPlaybookBlockNumericFacts({
      blockId: blockId,
      block,
      evidenceText: input.evidenceText,
      language: input.language,
    });
  }

  return annotated;
}
