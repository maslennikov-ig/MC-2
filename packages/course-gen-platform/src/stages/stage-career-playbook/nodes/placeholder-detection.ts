/**
 * Deterministic detection of unresolved fillable placeholders in generated
 * Career Playbook block content.
 *
 * The final assembler (`normalizeFillablePlaceholders` in `final-assembler.ts`)
 * rewrites raw bracketed and braced fill-in placeholders such as `[дата]` or
 * `{заполните}` into an explicit "field to fill" phrase — but that runs only at
 * final assembly, AFTER the cross-block judge loop. This module surfaces the
 * same placeholders DURING judging so the regeneration loop can resolve them,
 * instead of the assembler silently patching over them.
 *
 * The matching logic intentionally mirrors `normalizeFillablePlaceholders` so
 * detection and normalization stay in lock-step and the detector matches real
 * fill-ins without false-positives:
 *  - fenced code (```) is skipped, so Mermaid nodes like `["node"]` never match
 *  - `shouldTreatBracketAsFillableField` owns the bracket rule for both, and
 *    since 2026-08-30 it recognises any bracket that is not markdown rather than
 *    a list of six known labels. The list saw 11 of 158 bracketed tokens across
 *    the stored playbooks; the rest shipped raw to readers.
 *
 * This module also decides how much a judge complaint about a placeholder is
 * worth: `downgradeUnconfirmedPlaceholderIssues` demotes any the detector cannot
 * confirm, so a blind spot here silently becomes a defect nobody reports.
 */

import {
  shouldTreatBracketAsFillableField,
  shouldTreatBraceAsFillableField,
} from './final-assembler';

/**
 * Returns the raw placeholder tokens (e.g. `[дата]`, `{заполните}`) that remain
 * unresolved in `content`. Empty array means the block has no fill-in leftovers.
 */
export function findUnresolvedFillablePlaceholders(content: string): string[] {
  const lines = content.split('\n');
  let insideFence = false;
  const matches: string[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const bracketPattern = /\[([^\]\n]{2,80})\]/g;
    let bracketMatch: RegExpExecArray | null;
    while ((bracketMatch = bracketPattern.exec(line)) !== null) {
      const [full, label] = bracketMatch;
      const nextChar = line[bracketMatch.index + full.length];
      const previousChar = line[bracketMatch.index - 1];
      if (!shouldTreatBracketAsFillableField(label, nextChar, previousChar)) {
        continue;
      }
      matches.push(full);
    }

    const bracePattern = /\{([^}\n]{2,100})\}/g;
    let braceMatch: RegExpExecArray | null;
    while ((braceMatch = bracePattern.exec(line)) !== null) {
      const [full, label] = braceMatch;
      if (!shouldTreatBraceAsFillableField(label)) {
        continue;
      }
      matches.push(full);
    }
  }

  return matches;
}
