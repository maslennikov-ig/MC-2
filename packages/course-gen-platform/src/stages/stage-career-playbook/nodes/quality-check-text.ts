/**
 * Career Playbook — shared text primitives for the deterministic quality checks
 * @module stages/stage-career-playbook/nodes/quality-check-text
 *
 * Every check in this family reads block markdown the same way: fenced blocks
 * are not prose, a list item is the unit a modifier belongs to, and a ledger row
 * is found in the text by its own label words. Those three answers were derived
 * once, each of them from a defect — a Mermaid node label read as a claim about
 * the role, "daily triage, forecast submission" read as a daily forecast, a
 * label matched exactly while the prose used a shorter form.
 *
 * They live here rather than in `quality-checks.ts` because the milestone check
 * needs all three. A second hand-rolled copy would let one checker see a line the
 * other cannot, which is precisely how a fact escapes comparison.
 */

import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookJudgeIssue,
} from '@megacampus/shared-types';

/**
 * Strip fenced blocks (Mermaid, code) before any prose scan. A diagram label
 * like `A["3x coverage"]` is not a claim about the role and must not be read as
 * one.
 */
export function stripFencedBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '\n');
}

export function proseLines(markdown: string): string[] {
  return stripFencedBlocks(markdown)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function issue(
  blockId: string,
  category: CareerPlaybookJudgeIssue['category'],
  description: string,
  suggestion: string,
  severity: CareerPlaybookJudgeIssue['severity'] = 'critical'
): CareerPlaybookJudgeIssue {
  return { block_id: blockId, severity, category, description, suggestion };
}

export function truncateLine(line: string): string {
  return line.length <= 160 ? line : `${line.slice(0, 159)}…`;
}

/** Collapse repeats of the same finding in the same block to one issue. */
export function dedupeIssues(issues: CareerPlaybookJudgeIssue[]): CareerPlaybookJudgeIssue[] {
  const seen = new Set<string>();
  return issues.filter(item => {
    const key = `${item.block_id}|${item.category}|${item.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Enumeration items inside one line.
 *
 * Run `88fc2368` published "(pipeline and forecast reviews, daily triage,
 * coaching, forecast submission, CRM configuration)" — a checklist where every
 * item carries its own modifier. "daily" belongs to triage, but it is the
 * nearest such word to "forecast submission", so the guide was told it runs its
 * forecast review daily against a weekly ledger, and block_26 was regenerated
 * twice and shipped the critical anyway: no rewrite of a correct sentence can
 * satisfy it.
 *
 * The accepted cost is the mirror case: a modifier stated across a separator
 * ("the pipeline review, held monthly, ...") is no longer read. That direction
 * loses a finding; the other spends a paid regeneration on a block that is right.
 */
const ENUMERATION_SEPARATOR = /[,;()]|\s[–—-]\s/;

/** The list item containing `index`, as text plus its offset in the line. */
export function enumerationSegmentAt(line: string, index: number): { text: string; start: number } {
  const separators = new RegExp(ENUMERATION_SEPARATOR.source, 'g');
  let start = 0;

  for (const match of line.matchAll(separators)) {
    const at = match.index ?? 0;
    if (at >= index) return { text: line.slice(start, at), start };
    start = at + match[0].length;
  }

  return { text: line.slice(start), start };
}

/**
 * Does this line name a ledger row with the label's own words, in any order?
 *
 * Words shorter than four characters are dropped: "B2B", "win" and "of" carry no
 * evidence that the sentence is about this role's commitment rather than the
 * market. A label left with no long word matches nothing, which is the safe
 * direction. The match has no trailing boundary, so a Russian label survives
 * inflection — "прогноз" finds "прогноза".
 */
export function lineNamesLabelLoosely(line: string, label: string): boolean {
  const words = label
    .split(/[\s/]+/)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(word => word.length >= 4);
  if (words.length === 0) return false;

  return words.every(word =>
    new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(line)
  );
}

/** Publication order, so "which block said it first" is answerable. */
const BLOCK_POSITION = new Map<string, number>(
  CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => [block.blockId as string, block.position])
);

export function blockPosition(blockId: string): number {
  return BLOCK_POSITION.get(blockId) ?? Number.MAX_SAFE_INTEGER;
}
