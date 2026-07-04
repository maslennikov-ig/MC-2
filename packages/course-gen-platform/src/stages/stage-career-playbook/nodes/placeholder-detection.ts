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
 *  - a bracketed label immediately followed by `(` is treated as a Markdown link
 *  - only known fill-in labels (name/number/date/url/company name/...) match
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
      if (nextChar === '(' || !shouldTreatBracketAsFillableField(label)) {
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
