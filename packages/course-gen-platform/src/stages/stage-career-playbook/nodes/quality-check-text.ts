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
 *
 * A dash is NOT one of them, and treating it as one hid most of the ramp. In this
 * corpus " — " attaches a value to its item rather than separating two items:
 * block 14 writes every milestone as "Complete team and stakeholder orientation —
 * **Week 1**", and each commitment was therefore cut from its own date. Measured
 * over the three stored runs with a milestone ledger, dropping the dash raised the
 * commitments the checks can see from 5/8 to 8/8 on b7925b1d (block_14 alone from
 * 1 to 6) and from 7/7 to 7/7 with 30 sightings instead of 26 on 4e355bf4, and
 * produced no new contradiction on any of them (mc2-nedcb).
 *
 * A sentence terminator separates at least as strongly as a comma. Run
 * b7925b1d ended a paragraph "…by Day 60 you own one complete management and
 * forecasting cycle. From Week 2 onward, you are in the seat", and because the
 * full stop was not a boundary, the next sentence's "Week 2" sat closer to the
 * anchor than the "Day 60" in its own clause. Block 18 was regenerated twice
 * against a date it had stated correctly.
 *
 * A comma with a digit on BOTH sides is not a separator at all: it is a Russian
 * decimal point. Run 7bd743bd wrote its red band as "Customer effort score
 * >3,5", the comma cut the number in half, and the surviving ">3" read as a
 * threshold competing with the ledger's "<=2,5". The same guard keeps an English
 * thousands separator whole. Both sides have to be digits, or the exemption
 * swallows an ordinary list: "orientation — Week 1, 2 days later submit the
 * forecast" would hand the second commitment the first one's date.
 */
const ENUMERATION_SEPARATOR = /,(?!\d)|(?<!\d),|[;()]|[.!?]\s/;

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
 * The words of a label that carry evidence, punctuation and all.
 *
 * Words shorter than four characters are dropped: "B2B", "win" and "of" carry no
 * evidence that the sentence is about this role's commitment rather than the
 * market. Length is measured on the letters, so a hyphen does not push a short
 * word over the bar.
 */
export function labelWords(label: string): string[] {
  return label.split(/[\s/]+/).filter(word => word.replace(/[^\p{L}\p{N}]/gu, '').length >= 4);
}

/**
 * A label word as a pattern that tolerates the punctuation inside it.
 *
 * Stripping the punctuation instead — which this family did until 2026-09-01 —
 * turns "evidence-based" into "evidencebased", a string no line contains, so the
 * commitment "Submit the first evidence-based forecast" was invisible to every
 * check that reads a ledger label. One hyphen in a label silently removed that
 * row from the comparison, and a run whose only hyphenated commitment is the one
 * a block got wrong shows no symptom at all (mc2-nx9lx).
 *
 * The runs are rejoined by an optional dash-or-space, so the pattern matches the
 * hyphenated form, the spaced form and the closed-up form, and nothing else that
 * the stripped version did not already match.
 */
export function labelWordPattern(word: string, flags = 'iu'): RegExp {
  const runs = word
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(run => run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(`(?<![\\p{L}\\p{N}])${runs.join('[\\p{Pd}\\s]?')}`, flags);
}

/**
 * Does this line name a ledger row with the label's own words, in any order?
 *
 * A label left with no long word matches nothing, which is the safe direction.
 * The match has no trailing boundary, so a Russian label survives inflection —
 * "прогноз" finds "прогноза".
 */
export function lineNamesLabelLoosely(line: string, label: string): boolean {
  const words = labelWords(label);
  if (words.length === 0) return false;

  return words.every(word => labelWordPattern(word).test(line));
}

/** Publication order, so "which block said it first" is answerable. */
const BLOCK_POSITION = new Map<string, number>(
  CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => [block.blockId as string, block.position])
);

export function blockPosition(blockId: string): number {
  return BLOCK_POSITION.get(blockId) ?? Number.MAX_SAFE_INTEGER;
}
