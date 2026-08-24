/**
 * Whether a `prompt_templates` row may be retired.
 *
 * @module shared/prompts/prompt-deactivation
 *
 * A row whose key has no `PROMPT_REGISTRY` entry is invisible to
 * `checkOverrideContract`: there is nothing to compare it against, so the guard
 * that keeps every other row honest cannot say a word about this one. Measured
 * on the live database 2026-08-23 and again 2026-08-24, five of twenty-one
 * active rows were in that state, and all five were dead — three left behind
 * when Stage 4 split its phases into `_system`/`_user` pairs,
 * `stage5_sections_generator` renamed to `stage5_batch_section_generator`, and
 * `clarifying_questions`, whose phase never asked the prompt service at all and
 * uses a constant in code. None of it broke anything; all of it was editable
 * from the pipeline-admin screen, where changing it would have looked like
 * changing the pipeline (mc2-jraut).
 *
 * Retiring one clears `is_active` and keeps the template text, so the move is
 * one flag away from reversible. What it must never be is automatic. The
 * pipeline-admin screen can create a prompt under a key the registry has never
 * heard of, and that row is an orphan by exactly the same test — so "retire
 * every orphan" would take somebody's new prompt off the air the moment it was
 * saved. The keys are therefore named explicitly, and this decides each one.
 */

/** What a caller should do with one requested key. */
export type DeactivationDecision =
  | { action: 'deactivate' }
  | { action: 'skip'; reason: string }
  | { action: 'refuse'; reason: string };

export interface DeactivationRequest {
  /** The `prompt_key` named on the command line. */
  key: string;
  /** Whether `PROMPT_REGISTRY` declares this key. */
  declaredInRegistry: boolean;
  /** Whether an active `prompt_templates` row carries this key. */
  activeInDatabase: boolean;
}

// The key itself decides nothing — it is on `DeactivationRequest` so a caller
// cannot mix up which answer belongs to which key, and so the reason strings
// stay printable next to it.
export function decideDeactivation({
  declaredInRegistry,
  activeInDatabase,
}: DeactivationRequest): DeactivationDecision {
  // A declared key is live by definition: `getPrompt` resolves it, so a caller
  // can ask for it today. Retiring it does not fall back to the registry — the
  // registry is what the row was overriding — but it does throw away whatever
  // deliberate edit the row carried. Refuse, loudly, rather than guess.
  if (declaredInRegistry) {
    return {
      action: 'refuse',
      reason: 'the registry still declares it, so a caller can ask for it',
    };
  }

  // Already retired, or never existed. Saying "done" here would report work
  // that did not happen and hide a typo in the key.
  if (!activeInDatabase) {
    return { action: 'skip', reason: 'no active row with that key' };
  }

  return { action: 'deactivate' };
}
