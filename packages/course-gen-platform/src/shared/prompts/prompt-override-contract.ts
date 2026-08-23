/**
 * Whether a database prompt row is a usable override of the code registry.
 *
 * @module shared/prompts/prompt-override-contract
 *
 * `prompt_templates` wins over `PROMPT_REGISTRY` at runtime, which is the point:
 * a prompt can be changed without a deploy. Nothing checked that the row still
 * fits the caller, though, and the callers moved on. Measured on the live
 * database 2026-08-23, 7 of 21 active rows no longer fit; two of them are on a
 * live path:
 *
 * - `stage4_phase3_expert` — a 2025-12-04 row, 1440 characters against 2585 in
 *   code. It asks for `{{userRequirements}}`, which no caller has ever passed,
 *   so the literal `{{userRequirements}}` reached the model. That is the
 *   `Prompt has unresolved placeholders` line of mc2-51epl. The row also drops
 *   `{{schemaDescription}}` and says "matching the Phase3Output schema" instead
 *   — naming a schema the model cannot see — and drops the rule that forbids
 *   translating enum values.
 * - `stage7_cover_user` — a 2026-01-05 row that ignores `colorScheme`,
 *   `aesthetic`, `visualElements` and `mood`. The caller has passed all four
 *   since; every lesson cover has been drawn without its visual style. That one
 *   printed NOTHING: an unused variable leaves no unresolved placeholder, so
 *   the silent half of this class costs more than the loud half.
 *
 * Two rules, both derived from the registry entry rather than from a list that
 * would rot the same way:
 *
 * 1. A placeholder the registry does not declare can never be filled, because
 *    the caller is typed against the registry's variables.
 * 2. A required variable the registry's own template uses, and the row does not,
 *    is a capability the row silently drops.
 *
 * A row that breaks either is not an override, and the registry is used instead.
 * A row that respects both still wins — editing prompts without a deploy is the
 * feature this guard protects, not the one it removes.
 */

import type { HardcodedPrompt } from './types';

/** Every `{{name}}` in a template, trimmed, deduplicated. */
export function extractPlaceholders(template: string): Set<string> {
  const matches = template.match(/\{\{[^}]+\}\}/gu) ?? [];
  return new Set(matches.map(match => match.slice(2, -2).trim()));
}

export interface OverrideContractViolation {
  /** Placeholders the registry does not declare, so no caller can fill them. */
  unknownPlaceholders: string[];
  /** Required registry variables the row drops while the registry's own text uses them. */
  droppedRequiredVariables: string[];
}

/**
 * Check a database template against the registry entry for the same key.
 *
 * @returns null when the row is a usable override, or what is wrong with it.
 */
export function checkOverrideContract(
  databaseTemplate: string,
  registryPrompt: HardcodedPrompt
): OverrideContractViolation | null {
  const rowPlaceholders = extractPlaceholders(databaseTemplate);
  const registryPlaceholders = extractPlaceholders(registryPrompt.promptTemplate);
  const declared = new Set(registryPrompt.variables.map(variable => variable.name));

  // Measured against the declared variables AND the registry's own text, not
  // against the variable list alone. A template legitimately contains braces
  // that are not variables — Mustache sections (`{{#name}}`, `{{/name}}`), and
  // the Helm and Jinja fragments that arrive inside RAG context — and
  // `stage6_planner` carries a real `{{#userRefinementPrompt}}` pair. Judging
  // those by a list of allowed prefixes means keeping a second list of every
  // templating language a source document might use; judging them by what the
  // maintained template itself contains needs no list at all.
  const unknownPlaceholders = [...rowPlaceholders].filter(
    name => !declared.has(name) && !registryPlaceholders.has(name)
  );
  const droppedRequiredVariables = registryPrompt.variables
    .filter(variable => variable.required)
    .map(variable => variable.name)
    // Only what the registry itself renders: a variable declared required but
    // unused in the maintained text is a bookkeeping mismatch, not a capability
    // the row dropped.
    .filter(name => registryPlaceholders.has(name) && !rowPlaceholders.has(name));

  if (unknownPlaceholders.length === 0 && droppedRequiredVariables.length === 0) {
    return null;
  }

  return { unknownPlaceholders, droppedRequiredVariables };
}
