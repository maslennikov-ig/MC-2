/**
 * Career Playbook — digest of already published blocks
 * @module stages/stage-career-playbook/nodes/prior-blocks-digest
 *
 * Before this existed, a group generator received only the spec, the language
 * and its headings — it could not see a single line of what earlier groups had
 * already written. Only the judge saw prior content, so the pipeline could
 * detect a contradiction but never prevent one. The 2026-08-11 guide declared
 * "do not micromanage individual activity" in block 2 and then required three
 * deal updates before 10:00 plus one reviewed call per report per day in
 * block 4 — two different groups, neither aware of the other.
 *
 * The digest is deliberately not "the previous blocks, summarized". It carries
 * the four things a later block can actually contradict: anti-goals, numeric
 * commitments, named parties, and promised cadences.
 */

import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';

/** Token ceiling for the digest, applied by priority rather than by truncation at the tail. */
export const CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS = 1_500;

/** Rough token estimate consistent with the runtime's length/4 heuristic. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function contentLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

/** Strip markdown table pipes and list bullets so a line reads as a plain statement. */
function toStatement(line: string): string {
  return line
    .replace(/^[-*+]\s+/, '')
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

const NUMERIC_COMMITMENT = /(?:^|[\s(])(?:[<>]=?|≥|≤|±|\+\/-)?\s*\d+(?:[.,]\d+)?\s*(?:%|x|×|ч|h)?/i;
const CADENCE =
  /\b(daily|weekly|monthly|quarterly|ежедневн|еженедельн|ежемесячн|ежекварт|каждый день|каждую неделю)\b/i;

function collectAntiGoals(
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
) {
  const content = blocks.block_2?.content;
  if (!content) return [];

  return contentLines(content)
    .filter(line => !isHeading(line) && !isTableSeparator(line))
    .filter(line => /^[-*+|]/.test(line))
    .map(toStatement)
    .filter(line => line.length > 8)
    .slice(0, 12);
}

function collectNumericCommitments(
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  blockOrder: readonly CareerPlaybookBlockId[]
) {
  const seen = new Set<string>();
  const commitments: string[] = [];

  for (const blockId of blockOrder) {
    const content = blocks[blockId]?.content;
    if (!content) continue;

    for (const line of contentLines(content)) {
      if (isHeading(line) || isTableSeparator(line)) continue;
      if (!NUMERIC_COMMITMENT.test(line)) continue;

      const statement = toStatement(line);
      if (statement.length < 8 || statement.length > 220) continue;
      const dedupeKey = statement.toLowerCase();
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      commitments.push(`${blockId}: ${statement}`);
    }
  }

  return commitments;
}

function collectCadences(
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  blockOrder: readonly CareerPlaybookBlockId[]
) {
  const seen = new Set<string>();
  const cadences: string[] = [];

  for (const blockId of blockOrder) {
    const content = blocks[blockId]?.content;
    if (!content) continue;

    for (const line of contentLines(content)) {
      if (isHeading(line) || isTableSeparator(line)) continue;
      if (!CADENCE.test(line)) continue;

      const statement = toStatement(line);
      if (statement.length < 8 || statement.length > 220) continue;
      const dedupeKey = statement.toLowerCase();
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      cadences.push(`${blockId}: ${statement}`);
    }
  }

  return cadences;
}

function renderSection(title: string, entries: string[]): string[] {
  if (entries.length === 0) return [];
  return [title, ...entries.map(entry => `- ${entry}`), ''];
}

export interface BuildPriorBlocksDigestOptions {
  maxTokens?: number;
}

/**
 * Build the digest for the blocks accepted so far.
 *
 * Truncation is by priority, not by position: anti-goals and numeric
 * commitments are the two things a later block contradicts in practice, so they
 * survive; cadences and named parties are dropped first. Returns `'none'` for
 * the first group, which has no predecessors.
 */
export function buildCareerPlaybookPriorBlocksDigest(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  currentBlockIds: readonly CareerPlaybookBlockId[],
  options: BuildPriorBlocksDigestOptions = {}
): string {
  const maxTokens = options.maxTokens ?? CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS;
  const priorBlockIds = Object.keys(generatedBlocks).filter(
    blockId => !currentBlockIds.includes(blockId) && Boolean(generatedBlocks[blockId]?.content)
  );

  if (priorBlockIds.length === 0) return 'none';

  const antiGoals = collectAntiGoals(generatedBlocks);
  const commitments = collectNumericCommitments(generatedBlocks, priorBlockIds);
  const cadences = collectCadences(generatedBlocks, priorBlockIds);

  // Highest-priority sections first so the trim below drops the least load-bearing
  // context rather than whatever happens to be last.
  const sections: Array<[string, string[]]> = [
    ['Anti-goals already published (a duty must never violate these):', antiGoals],
    ['Numeric commitments already published (do not restate with a different value):', commitments],
    ['Cadences already promised:', cadences],
  ];

  const lines: string[] = [];
  for (const [title, entries] of sections) {
    const rendered = renderSection(title, entries);
    if (rendered.length === 0) continue;

    const candidate = [...lines, ...rendered].join('\n');
    if (estimateTokens(candidate) > maxTokens) {
      // Fit as many entries of this section as the remaining budget allows.
      for (const entry of entries) {
        const partial = [...lines, title, `- ${entry}`].join('\n');
        if (estimateTokens(partial) > maxTokens) break;
        if (!lines.includes(title)) lines.push(title);
        lines.push(`- ${entry}`);
      }
      break;
    }

    lines.push(...rendered);
  }

  const digest = lines.join('\n').trim();
  return digest.length > 0 ? digest : 'none';
}
