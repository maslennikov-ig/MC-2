/**
 * Career Playbook — ramp deadline consistency
 * @module stages/stage-career-playbook/nodes/milestone-checks
 *
 * The third check of its family, and it exists for the same reason as the other
 * two. Run 2896e72f published a Role Canvas promising the first forecast "by
 * week 4" while the onboarding plan put the first forecast input at week 2, and
 * a block_26 requiring two quarters of training against a block_23 that asks for
 * one shadowed handover. Both are contradictions a reader hits on the same day;
 * neither is a number in the metric ledger or a rhythm in the cadence ledger, so
 * nothing deterministic could see them and only the LLM judge ever did — late,
 * once per run, and without a way to confirm it.
 *
 * Unlike `validateCadenceConsistency` there is no consensus fallback. Rhythms
 * have six canonical words, so "most blocks say weekly" is a real measurement;
 * ramp deadlines are open numbers over four units, and a majority vote among
 * loosely-matched phrases would invent conflicts on blocks that are right. With
 * no ledger row governing a commitment, this check says nothing — which is also
 * what it does for every playbook generated before the ledger existed.
 */

import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookJudgeIssue,
  CareerPlaybookMilestoneLedgerEntry,
} from '@megacampus/shared-types';
import {
  dedupeIssues,
  enumerationSegmentAt,
  issue,
  lineNamesLabelLoosely,
  proseLines,
  truncateLine,
} from './quality-check-text';
import { normalizeCareerPlaybookMilestone, type CareerPlaybookMilestone } from './quality-ledger';

type BlockMap = Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;

export interface MilestoneCheckContext {
  /** Canonical ramp deadlines. Empty for a spec built before the ledger existed. */
  milestoneLedger?: readonly CareerPlaybookMilestoneLedgerEntry[];
}

/**
 * Every ramp phrase in a piece of text, with where it sits.
 *
 * A phrase is a number-and-unit pair in either order and either language, or an
 * ordinal standing in for the number. The window handed to the normalizer is
 * deliberately small: enough to carry "the first month", not enough to reach the
 * next list item.
 */
const MILESTONE_PHRASE =
  /(?:\b(?:first|second|third|fourth|1st|2nd|3rd|4th)\b|\d{1,3})\s*(?:-|–|—)?\s*(?:days?|weeks?|months?|quarters?|дн(?:ей|я|ю)?|день|недел\p{L}*|месяц\p{L}*|квартал\p{L}*)|(?:days?|weeks?|months?|quarters?|день|недел\p{L}*|месяц\p{L}*|квартал\p{L}*)\s*(?:№\s*)?\d{1,3}|(?:перв|втор|трет|четв[её]рт)\p{L}*\s+(?:дн\p{L}*|день|недел\p{L}*|месяц\p{L}*|квартал\p{L}*)/giu;

interface MilestoneMention {
  milestone: CareerPlaybookMilestone;
  distance: number;
}

/**
 * The ramp deadline that governs a commitment mentioned at `commitmentIndex`.
 *
 * Nearest-wins within the enumeration item, the answer the cadence check arrived
 * at the expensive way: a checklist line packs several commitments each with its
 * own deadline, and reading across a comma attributes one item's date to its
 * neighbour. That misattribution is unrepairable by regeneration, because the
 * sentence being blamed is correct.
 */
function milestoneNear(line: string, commitmentIndex: number): MilestoneMention | null {
  const segment = enumerationSegmentAt(line, commitmentIndex);
  const relativeIndex = commitmentIndex - segment.start;
  let best: MilestoneMention | null = null;

  for (const match of segment.text.matchAll(MILESTONE_PHRASE)) {
    const milestone = normalizeCareerPlaybookMilestone(match[0]);
    if (!milestone) continue;

    const distance = Math.abs((match.index ?? 0) - relativeIndex);
    if (!best || distance < best.distance) best = { milestone, distance };
  }

  return best;
}

function wordPattern(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'giu');
}

/**
 * The label word that best locates THIS commitment in THIS line.
 *
 * The rarest one, longest breaking a tie. Taking the first long word instead
 * cost run 4e355bf4 five false criticals on one line: block_18 summarised the
 * whole ramp as "first forecast submitted …, first solo pipeline review …, first
 * quarterly business review …", and every ledger label there begins with
 * "First". Anchored on "first", each commitment's search started from five
 * places at once and found its neighbour's date. Anchored on "forecast" or
 * "coaching", each starts where it belongs.
 */
function locatingWord(line: string, label: string): string | null {
  const words = label
    .split(/[\s/]+/)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(word => word.length >= 4);
  if (words.length === 0) return null;

  let best: { word: string; count: number } | null = null;
  for (const word of words) {
    const count = [...line.matchAll(wordPattern(word))].length;
    if (count === 0) continue;
    if (!best || count < best.count || (count === best.count && word.length > best.word.length)) {
      best = { word, count };
    }
  }

  return best?.word ?? null;
}

/** Closest deadline to any mention of the commitment, within that mention's list item. */
function nearestMilestoneAcrossMentions(
  line: string,
  label: string
): CareerPlaybookMilestone | null {
  const anchor = locatingWord(line, label);
  if (!anchor) return null;

  let best: MilestoneMention | null = null;
  for (const mention of line.matchAll(wordPattern(anchor))) {
    const found = milestoneNear(line, mention.index ?? 0);
    if (found && (!best || found.distance < best.distance)) best = found;
  }

  return best?.milestone ?? null;
}

/**
 * Flag every block whose deadline for a ramp commitment differs from the one the
 * guide published for it.
 *
 * The ledger decides, always. That is the whole difference between this and the
 * defect it replaces: naming a disagreement without naming an authority produced
 * issues that moved the conflict from one block to the other on every
 * regeneration and never converged, which is what burned run 2896e72f's window
 * budget. Here the deviating block is told what to write and told explicitly not
 * to touch the others.
 */
export function validateMilestoneConsistency(
  blocks: BlockMap,
  context: MilestoneCheckContext
): CareerPlaybookJudgeIssue[] {
  const ledger = context.milestoneLedger ?? [];
  if (ledger.length === 0) return [];

  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const entry of ledger) {
    const canonical = normalizeCareerPlaybookMilestone(entry.offset);
    if (!canonical) continue;

    for (const [blockId, blockState] of Object.entries(blocks)) {
      const content = blockState?.content;
      if (!content) continue;

      for (const line of proseLines(content)) {
        if (!lineNamesLabelLoosely(line, entry.label)) continue;

        const stated = nearestMilestoneAcrossMentions(line, entry.label);
        if (!stated || stated.days === canonical.days) continue;

        issues.push(
          issue(
            blockId,
            'contradiction',
            `${blockId} puts "${entry.label}" at ${stated.canonical}, but this guide publishes it at ${canonical.canonical}: "${truncateLine(line)}".`,
            `Rewrite this mention in ${blockId} to ${canonical.canonical}. Change nothing in the other blocks: ${canonical.canonical} is the published deadline and this block is the deviation.`
          )
        );
        break;
      }
    }
  }

  return dedupeIssues(issues);
}

/**
 * The block whose job is answering, not scheduling.
 *
 * The one block id in this module, and it is the product decision itself: a FAQ
 * points at the ramp instead of reprinting it. Measured over the two stored runs
 * that have a milestone ledger, the alternatives are worse and not by a little.
 * Flagging every block that restates a published date costs 4 and 6 blocks per
 * run — blocks 22, 24 and 26 restate by design, and section 1ter says so.
 * Flagging the ones that cite the ramp block and copy it anyway still costs 4 and
 * 3. This costs exactly one per run, and it is the one in the issue.
 */
const RAMP_ANSWERING_BLOCK_ID: CareerPlaybookBlockId = 'block_18';

/** Every (block, commitment) pair where a block states that commitment's own published date. */
function restatementsOf(
  blocks: BlockMap,
  ledger: readonly CareerPlaybookMilestoneLedgerEntry[]
): { blockId: CareerPlaybookBlockId; label: string; offset: string; line: string }[] {
  const found: { blockId: CareerPlaybookBlockId; label: string; offset: string; line: string }[] =
    [];

  for (const [blockId, blockState] of Object.entries(blocks)) {
    const content = blockState?.content;
    if (!content) continue;

    for (const line of proseLines(content)) {
      for (const entry of ledger) {
        const canonical = normalizeCareerPlaybookMilestone(entry.offset);
        if (!canonical) continue;
        if (!lineNamesLabelLoosely(line, entry.label)) continue;

        const stated = nearestMilestoneAcrossMentions(line, entry.label);
        if (stated?.days !== canonical.days) continue;

        found.push({ blockId, label: entry.label, offset: canonical.canonical, line });
      }
    }
  }

  return found;
}

/**
 * Flag the FAQ for republishing a ramp deadline the ledger owns.
 *
 * The complement of `validateMilestoneConsistency`, and it fires on exactly what
 * that check passes: a date that AGREES with the ledger. Agreement is the whole
 * problem. The ledger exists because a fact restated in two places drifts, and
 * every restatement is correct right up until the run where it is not — at which
 * point the reader has two schedules and no way to tell which is the guide's.
 *
 * Nothing here reads prose. A line qualifies only when it names a ledger
 * commitment and states that commitment's own published deadline, decided by the
 * same anchor logic as the consistency check — the logic that cost run 4e355bf4
 * five false criticals before it learned to anchor on the rare word rather than
 * the first one.
 *
 * The issue names no owner block, and an earlier draft that did was wrong. It
 * ranked candidates the way `validateCadenceConsistency` ranks a rhythm — most
 * statements win — and on run b7925b1d that elected block_4, the duties block,
 * over block_14, which publishes the entire ramp. Not a tuning problem: the
 * matcher reads 5 commitments in block_4 and 1 of 8 in block_14, because block_14
 * publishes its ramp in tables and numbered lists this family reads badly
 * (mc2-nedcb). A remedy that names an authority must be sure of it, and this one
 * does not need to be — the fix is to delete the dates, not to move them.
 *
 * The one thing still asked of the document is whether the FAQ is alone in
 * carrying the ramp. If it is, these dates are the only place the reader gets
 * them and removing them loses the fact rather than the copy.
 */
export function validateRampOwnership(
  blocks: BlockMap,
  context: MilestoneCheckContext
): CareerPlaybookJudgeIssue[] {
  const ledger = context.milestoneLedger ?? [];
  if (ledger.length === 0) return [];

  const restatements = restatementsOf(blocks, ledger);
  const copied = restatements.filter(entry => entry.blockId === RAMP_ANSWERING_BLOCK_ID);
  const publishedElsewhere = restatements.some(entry => entry.blockId !== RAMP_ANSWERING_BLOCK_ID);
  if (copied.length === 0 || !publishedElsewhere) return [];

  const named = copied.map(entry => `"${entry.label}" (${entry.offset})`).join(', ');

  return [
    issue(
      RAMP_ANSWERING_BLOCK_ID,
      'contradiction',
      `${RAMP_ANSWERING_BLOCK_ID} republishes the ramp deadline for ${named}, and the guide publishes them elsewhere: "${truncateLine(copied[0].line)}". The dates agree today; the copy is what drifts.`,
      `Answer the question in ${RAMP_ANSWERING_BLOCK_ID} without the dates: say what the reader does and leave the schedule to the block that publishes the ramp. Change no other block.`
    ),
  ];
}
