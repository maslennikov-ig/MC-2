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
      /(?<![\p{L}\p{N}_])\d+(?:[.,]\d+)?\s?(?:дней|дня|день|недель|недели|неделя|месяцев|месяца|месяц|hours?|days?|weeks?|months?)(?![\p{L}\p{N}_])/giu,
  },
  { kind: 'count', pattern: /\b\d+(?:[.,]\d+)?\b/g },
];

const METHOD_STRUCTURAL_VALUES = new Set(['30-60-90']);

const NUMERIC_CONTEXT_KEYWORDS = [
  'arr',
  'budget',
  'cac',
  'conversion',
  'coverage',
  'cvr',
  'kpi',
  'lead',
  'leads',
  'ltv',
  'mql',
  'mrr',
  'nps',
  'okr',
  'pipeline',
  'revenue',
  'roi',
  'sales',
  'sla',
  'sql',
  'win rate',
  'выруч',
  'бюдж',
  'конвер',
  'лид',
  'метрик',
  'продаж',
  'руб',
  'точност',
];

const CONTEXT_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'this',
  'that',
  'есть',
  'или',
  'как',
  'для',
  'при',
  'что',
  'это',
  'этот',
  'эта',
  'эти',
  'раздел',
  'шаг',
  'день',
  'дня',
  'дней',
  'неделя',
  'недели',
  'недель',
  'месяц',
  'месяца',
  'месяцев',
  'квартал',
  'квартала',
  'кварталов',
]);

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

function blocksEvidenceBoundary(char: string, kind: NumericMatch['kind']): boolean {
  if (!char) return false;
  if (kind === 'count') return /[\p{L}\p{N}%.,+-]/u.test(char);
  return /[\p{L}\p{N}]/u.test(char);
}

function evidenceValueMatches(
  evidence: string,
  rawText: string,
  kind: NumericMatch['kind']
): Array<{ start: number; end: number }> {
  const matches: Array<{ start: number; end: number }> = [];
  for (const variant of numericSearchVariants(rawText)) {
    let startIndex = 0;
    while (startIndex < evidence.length) {
      const matchIndex = evidence.indexOf(variant, startIndex);
      if (matchIndex < 0) break;
      const endIndex = matchIndex + variant.length;
      if (
        !blocksEvidenceBoundary(evidence[matchIndex - 1] ?? '', kind) &&
        !blocksEvidenceBoundary(evidence[endIndex] ?? '', kind)
      ) {
        matches.push({ start: matchIndex, end: endIndex });
      }
      startIndex = endIndex;
    }
  }
  return matches;
}

function evidenceWindowsForRaw(
  evidence: string,
  rawText: string,
  kind: NumericMatch['kind']
): string[] {
  return evidenceValueMatches(evidence, rawText, kind).map(match =>
    evidence.slice(Math.max(0, match.start - 48), Math.min(evidence.length, match.end + 48))
  );
}

function evidenceContainsRawValue(
  evidence: string,
  rawText: string,
  kind: NumericMatch['kind']
): boolean {
  return evidenceValueMatches(evidence, rawText, kind).length > 0;
}

function meaningfulContextTokens(value: string): Set<string> {
  const normalized = normalizeForSearch(value);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    tokens.filter(token => {
      if (token.length < 3) return false;
      if (/^\d+$/.test(token)) return false;
      return !CONTEXT_STOP_WORDS.has(token);
    })
  );
}

function hasSharedContext(left: string, right: string): boolean {
  const leftTokens = meaningfulContextTokens(left);
  if (leftTokens.size === 0) return false;
  for (const token of meaningfulContextTokens(right)) {
    if (leftTokens.has(token)) return true;
  }
  return false;
}

function hasBusinessNumericContext(value: string): boolean {
  const normalized = normalizeForSearch(value);
  return (
    /[%$€₽]/u.test(value) || NUMERIC_CONTEXT_KEYWORDS.some(keyword => normalized.includes(keyword))
  );
}

function evidenceHasContextualRawValue(input: {
  evidence: string;
  rawText: string;
  surroundingText: string;
  kind: NumericMatch['kind'];
}): boolean {
  if (!evidenceContainsRawValue(input.evidence, input.rawText, input.kind)) return false;

  return evidenceWindowsForRaw(input.evidence, input.rawText, input.kind).some(window => {
    if (!hasSharedContext(input.surroundingText, window)) return false;
    if (input.kind !== 'count') return true;
    return hasBusinessNumericContext(input.surroundingText) || hasBusinessNumericContext(window);
  });
}

function evidenceHasBenchmarkContext(
  evidence: string,
  rawText: string,
  kind: NumericMatch['kind']
): boolean {
  return evidenceWindowsForRaw(evidence, rawText, kind).some(
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

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length > 3;
}

function markdownTableCellAt(
  line: string,
  indexInLine: number
): { column: number; text: string } | null {
  if (!isMarkdownTableLine(line)) return null;

  let cellStart = -1;
  let column = -1;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '|') continue;

    if (cellStart >= 0) {
      column += 1;
      const cellEnd = index;
      if (indexInLine >= cellStart && indexInLine < cellEnd) {
        return { column, text: line.slice(cellStart, cellEnd).trim() };
      }
    }

    cellStart = index + 1;
  }

  return null;
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

function isStandaloneSmallCount(rawText: string): boolean {
  return /^[1-9]$/.test(rawText.trim());
}

function hasOrdinalSuffix(content: string, end: number): boolean {
  return /^\s*-?(?:я|й|ю|е|ая|ой|ый|ое|го|st|nd|rd|th)\b/iu.test(content.slice(end, end + 8));
}

function isRangeTailDuration(content: string, start: number): boolean {
  return /\d\s*[-–—]\s*$/u.test(content.slice(Math.max(0, start - 8), start));
}

function isLikelyTableRowNumber(content: string, line: string, candidate: NumericMatch): boolean {
  if (candidate.kind !== 'count') return false;
  if (!isStandaloneSmallCount(candidate.rawText)) return false;

  const lineStart = content.lastIndexOf('\n', candidate.start - 1) + 1;
  const cell = markdownTableCellAt(line, candidate.start - lineStart);
  return cell?.column === 0 && cell.text === candidate.rawText.trim();
}

function isActionableMarkdownTableMatch(content: string, candidate: NumericMatch): boolean {
  if (candidate.kind === 'date') return true;
  if (candidate.kind === 'duration') return !isRangeTailDuration(content, candidate.start);
  return false;
}

function shouldSkipNumericMatch(content: string, candidate: NumericMatch): boolean {
  const line = lineAt(content, candidate.start);
  const surroundingText = matchSurroundingText(content, candidate.start, candidate.end);
  if (isMethodologyNumber(candidate.rawText, surroundingText)) return false;

  const isTableLine = isMarkdownTableLine(line);
  if (isTableLine && isLikelyTableRowNumber(content, line, candidate)) return true;
  if (candidate.kind === 'duration' && isRangeTailDuration(content, candidate.start)) return true;

  if (
    isTableLine &&
    !hasBusinessNumericContext(line) &&
    !isActionableMarkdownTableMatch(content, candidate)
  ) {
    return true;
  }

  if (candidate.kind === 'count') {
    if (hasOrdinalSuffix(content, candidate.end)) return true;
    if (isStandaloneSmallCount(candidate.rawText) && !hasBusinessNumericContext(surroundingText)) {
      return true;
    }
  }

  if (candidate.kind === 'range' && isMarkdownTableLine(line) && !hasBusinessNumericContext(line)) {
    return true;
  }

  return false;
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
      if (shouldSkipNumericMatch(content, candidate)) continue;
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
  kind: NumericMatch['kind'];
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

  if (evidence && evidenceContainsRawValue(evidence, input.rawText, input.kind)) {
    if (evidenceHasBenchmarkContext(evidence, input.rawText, input.kind)) {
      return {
        status: 'benchmark',
        source: 'web_benchmark',
        confidence: 0.75,
        explanation: 'Число найдено в benchmark- или исследовательском контексте.',
      };
    }

    if (
      evidenceHasContextualRawValue({
        evidence,
        rawText: input.rawText,
        surroundingText: surrounding,
        kind: input.kind,
      })
    ) {
      return {
        status: 'verified',
        source: 'source_document',
        confidence: 0.9,
        explanation: 'Число найдено в пользовательском контексте или загруженных материалах.',
      };
    }
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
      kind: match.kind,
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
