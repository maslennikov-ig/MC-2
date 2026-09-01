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
 * the five things a later block can actually contradict: anti-goals, decision
 * authority, numeric commitments, promised cadences, and the career steps and
 * ramp milestones a summary block would otherwise re-author.
 *
 * Sections are emitted in that order and the ceiling cuts from the tail, so the
 * order is a priority ranking: a wrong number is worse than a wrong rhythm, and
 * a wrong rhythm is worse than a job title the ladder does not contain.
 */

import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';

/**
 * Token ceiling for the digest, applied by priority rather than by truncation at
 * the tail.
 *
 * 3,500 is the smallest measured ceiling at which numeric commitments — the
 * second thing section 5 of the quality contract says is never dropped — reach
 * at least 97% in every group across the 14 stored completed playbooks. At 1,500
 * the last group delivered 40% of them and no cadence at all. The whole digest
 * costs about 3,000 more input tokens per playbook, spread over five generator
 * calls. A larger ceiling buys only cadences, the lowest priority of the four,
 * and stops binding at all — which is not a ceiling.
 */
export const CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS = 3_500;

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

/**
 * A number that can be contradicted: one carrying a comparator, a unit, a
 * currency or a scale.
 *
 * The previous rule accepted any line containing a digit, which on the 14 stored
 * playbooks was 33% of every line — table row ordinals, list numbering, clock
 * times, source ids. Those crowded the real thresholds out of a shared ceiling.
 * It also missed a threshold written in bold (`**>=90%**`), because it required
 * whitespace before the comparator and found an asterisk.
 */
const NUMERIC_COMMITMENT_SIGNAL = new RegExp(
  [
    // A comparator on either side of the number.
    '(?:[<>]=?|≥|≤|±)\\s*\\d',
    '\\d(?:[.,]\\d+)?\\s*(?:[<>]=?|≥|≤)',
    // A number carrying a unit.
    '\\d(?:[.,]\\d+)?\\s*(?:%|[xх×](?![\\p{L}])|ч(?![\\p{L}])|h(?![\\p{L}])|мин|min(?![\\p{L}])|hours?|days?|дн\\p{L}*|недел\\p{L}*|месяц\\p{L}*|балл\\p{L}*|points?)',
    '[$€₽]\\s*\\d|\\d\\s*[$€₽]',
    // A scale: "4 из 5", "4 out of 5".
    '\\d\\s*(?:из|out of)\\s*\\d',
    // A comparator spelled as a word.
    '(?:не менее|не более|не ниже|не выше|не позднее|минимум|максимум|at least|at most|no more than|no less than|below|above|under|over|within)\\s+\\D{0,4}\\d',
  ].join('|'),
  'iu'
);

/** Numbers that are structure, not commitment, and must not decide the line. */
function withoutStructuralNumbers(line: string): string {
  return line
    .replace(/\bblocks?\s*\d+/giu, ' ')
    .replace(/\bблок\p{L}*\s*\d+/giu, ' ')
    .replace(/\[S\d+\]/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/^\|?\s*\*{0,2}\d+\*{0,2}\s*(?=\|)/u, ' ')
    .replace(/^\d+[.)]\s/u, ' ');
}

function hasNumericCommitment(line: string): boolean {
  return NUMERIC_COMMITMENT_SIGNAL.test(withoutStructuralNumbers(line));
}

/**
 * `\b` is an ASCII word boundary, so it never matched a Cyrillic stem: for two
 * months every Russian playbook shipped an empty cadence section. The Russian
 * entries are stems that must keep matching their inflected endings
 * («ежедневно», «ежеквартальный»), so only the English words take a closing
 * boundary.
 */
const CADENCE =
  /(?<![\p{L}\p{N}])(?:(?:daily|weekly|monthly|quarterly)(?![\p{L}\p{N}])|ежедневн|еженедельн|ежемесячн|ежекварт|каждый день|каждую неделю)/iu;

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
      if (!hasNumericCommitment(line)) continue;

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

/**
 * Decision-authority rows already published in block 5.
 *
 * Block 5 is to authority what the metric ledger is to numbers: one canonical
 * statement that later blocks cite rather than paraphrase. Without this the
 * 2026-08-11 guide said three different things about the same decision — block 5
 * granted act-alone hiring authority with "no approval required", block 16
 * routed hiring through "CRO sign-off", and block 24 said "full authority, CRO
 * for exceptions". Blocks 16 and 24 are generated by later groups that could not
 * see block 5 at all.
 */
function collectDecisionAuthority(
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
) {
  const content = blocks.block_5?.content;
  if (!content) return [];

  // Drop the header row: it names the axes rather than a decision. Detect it as
  // the row a separator follows, which is what makes it a header in Markdown.
  // Matching its wording did not work in either language: `\b` is defined on
  // ASCII word characters, so `^решение\b` never fired on a Cyrillic table and
  // the axis row was handed to the model as a decision, while `^decision\b` also
  // swallowed any English row that happened to begin with the word "Decision".
  const lines = contentLines(content);
  const tableRows = lines.filter(line => line.startsWith('|'));
  const headerRows = new Set(
    tableRows.filter((_row, index) => isTableSeparator(tableRows[index + 1] ?? ''))
  );

  return tableRows
    .filter(line => !isTableSeparator(line) && !headerRows.has(line))
    .map(toStatement)
    .filter(line => line.length > 20)
    .slice(0, 12);
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

/** "Day 60", "Week 2", "Days 31-60", and their Russian forms. */
const RELATIVE_MILESTONE =
  /\b(?:days?|weeks?|sprint)\s*\d+(?:\s*[-–—]\s*\d+)?\b|\b(?:день|дня|дней|недел\p{L}*)\s*\d+/iu;

/**
 * Named career steps and dated ramp milestones already published.
 *
 * A summary block re-authors what it summarizes, and it is generated by a later
 * group that cannot see the block it is summarizing. Run `88fc2368`'s Role
 * Canvas — one of the five blocks EVERY reader receives — offered "growth
 * toward director of sales / head of revenue" against a ladder that publishes
 * Head of Sales, VP of Sales and two IC steps, and promised "a forecast number
 * the CRO accepts" within the first month against an onboarding plan that puts
 * the first forecast on Day 60. Neither is caught by any check: a job title is
 * not a ledger metric and a ramp milestone is not a cadence.
 *
 * This is the same shape the other four sections answer — a later block
 * contradicting an earlier one — so it is carried the same way.
 */
function collectStepsAndMilestones(
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  const push = (blockId: CareerPlaybookBlockId, statement: string): void => {
    const key = statement.toLowerCase();
    if (statement.length < 4 || statement.length > 120 || seen.has(key)) return;
    seen.add(key);
    entries.push(`${blockId}: ${statement}`);
  };

  // The ladder: the first cell of every row is the step's published title.
  const ladder = blocks.block_11?.content;
  if (ladder) {
    const rows = contentLines(ladder).filter(line => line.startsWith('|'));
    const headers = new Set(rows.filter((_row, index) => isTableSeparator(rows[index + 1] ?? '')));

    for (const row of rows) {
      if (isTableSeparator(row) || headers.has(row)) continue;
      const title = toStatement(row).split(' — ')[0];
      if (title) push('block_11', title);
    }
  }

  // The ramp: any line carrying a relative milestone, which is how the
  // onboarding plan states every deadline it owns.
  const onboarding = blocks.block_14?.content;
  if (onboarding) {
    for (const line of contentLines(onboarding)) {
      if (isHeading(line) || isTableSeparator(line)) continue;
      if (!RELATIVE_MILESTONE.test(line)) continue;
      push('block_14', toStatement(line));
    }
  }

  return entries.slice(0, 24);
}

function renderSection(title: string, entries: string[]): string[] {
  if (entries.length === 0) return [];
  return [title, ...entries.map(entry => `- ${entry}`), ''];
}

export interface BuildPriorBlocksDigestOptions {
  maxTokens?: number;
}

/**
 * The digest one target would receive. Exported for the invariant test that
 * every target of a group receives the same lines — the property that lets
 * {@link buildCareerPlaybookPriorBlocksDigest} render one section instead of one
 * copy per target.
 */
export function buildCareerPlaybookTargetPriorDigest(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  currentBlockIds: readonly CareerPlaybookBlockId[],
  targetBlockId: CareerPlaybookBlockId,
  maxTokens: number
): string {
  // All four sections below are contradiction guards over the single assembled
  // document (anti-goals, decision authority, numeric commitments, cadences),
  // not repetition-avoidance guidance — so selection is document-wide and does
  // NOT scope by shared audience. Audience scoping answers "may I repeat this",
  // which is a different question from "may I contradict this", and the owner
  // ruling is that contradiction is never allowed anywhere. Scoping this by
  // audience previously dropped 66 of 702 directed pairs, including block_12
  // (HR-only) losing block_2's anti-goals and block_5's authority matrix — the
  // two things this file's own module comment calls what a later block
  // contradicts in practice.
  const priorBlockIds = Object.keys(generatedBlocks).filter(
    blockId =>
      !currentBlockIds.includes(blockId) &&
      Boolean(generatedBlocks[blockId]?.content) &&
      generatedBlocks[blockId]?.status === 'generated'
  );

  if (priorBlockIds.length === 0) return 'none';

  const eligiblePriorBlocks = Object.fromEntries(
    priorBlockIds.map(blockId => [blockId, generatedBlocks[blockId]])
  );

  const antiGoals = collectAntiGoals(eligiblePriorBlocks);
  const authority =
    targetBlockId === 'block_5' ? [] : collectDecisionAuthority(eligiblePriorBlocks);
  const commitments = collectNumericCommitments(eligiblePriorBlocks, priorBlockIds);
  const cadences = collectCadences(eligiblePriorBlocks, priorBlockIds);
  const stepsAndMilestones = collectStepsAndMilestones(eligiblePriorBlocks);

  // The titles name what the list holds and nothing else. Each one used to
  // carry the writing rule as well — "never restate an approval level in other
  // words", "do not restate with a different value" — and the model wrote the
  // rule down for the reader. Six leaks in three stored documents, five of them
  // about restating a published fact, and one of them ("Do not restate these
  // levels in different words anywhere else in this guide", d5137bc5 block_26)
  // a near-verbatim echo. GROUP_OUTPUT_CONTRACT already states every one of
  // those rules, under NUMBERS, RHYTHMS, DEADLINES and CONSISTENCY, where they
  // sit among construction rules rather than beside reader-facing content.
  const sections: Array<[string, string[]]> = [
    ['Anti-goals already published, by block:', antiGoals],
    ['Decision authority already published, by block:', authority],
    ['Numeric commitments already published, by block:', commitments],
    ['Cadences already promised, by block:', cadences],
    ['Career steps and ramp milestones already published, by block:', stepsAndMilestones],
  ];

  const lines: string[] = [];
  for (const [title, entries] of sections) {
    const rendered = renderSection(title, entries);
    if (rendered.length === 0) continue;

    const candidate = [...lines, ...rendered].join('\n');
    if (estimateTokens(candidate) > maxTokens) {
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
  const hasPublishedPriorBlock = Object.keys(generatedBlocks).some(
    blockId =>
      !currentBlockIds.includes(blockId) &&
      Boolean(generatedBlocks[blockId]?.content) &&
      generatedBlocks[blockId]?.status === 'generated'
  );

  if (!hasPublishedPriorBlock || currentBlockIds.length === 0) return 'none';

  // One section for the whole group, because every target receives the same
  // lines. While selection was audience-scoped each target really did see a
  // different digest, and a section per target was the only honest shape. Once
  // scoping was removed the sections became byte-identical — measured across the
  // 14 stored completed playbooks, 70 of 70 groups — yet the ceiling was still
  // divided N ways to print the same text N times. The late groups paid for it:
  // in group_6_wrap only 3% of the collected block 5 authority rows and none of
  // the published numeric commitments reached the model, and 66 of 84 targets
  // lost a published anti-goal that section 5 of the quality contract says is
  // never dropped. Spending the same budget once buys distinct constraints
  // instead of copies. `buildCareerPlaybookTargetPriorDigest` is exported and
  // tested for that sameness, so reintroducing a per-target difference fails
  // loudly here rather than being silently dropped.
  const heading = 'For every output block in this group:';
  const contentCharacters = Math.max(4, maxTokens * 4 - (heading.length + 1));
  const digest = buildCareerPlaybookTargetPriorDigest(
    generatedBlocks,
    currentBlockIds,
    currentBlockIds[0],
    Math.max(1, Math.floor(contentCharacters / 4))
  );

  return `${heading}\n${digest}`;
}
