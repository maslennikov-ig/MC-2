/**
 * What the database actually said, not only its first line.
 *
 * PostgREST puts the useful part in `details`, `hint` and `code`, and often
 * leaves `message` as something like "Bad Request". Stage 5 spent a paid live
 * run on exactly that: a 10 KB filter value in the URL came back as
 * `400 Bad Request` and the code threw `Failed to save structure: Bad Request`,
 * which names the http status and no fact at all (mc2-2pplo, 2026-08-15).
 *
 * The original sentence is kept verbatim and the rest is appended, so a message
 * that someone already greps for stays findable.
 *
 * @module shared/supabase/describe-error
 */

/** The shape every PostgREST and RPC error arrives in. */
export interface DatabaseErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * One sentence naming everything the database reported.
 *
 * @example
 * ```typescript
 * if (error) throw new Error(`Failed to store summary: ${describeDatabaseError(error)}`);
 * // Failed to store summary: Bad Request (database said: PGRST102 failed to
 * // parse filter (eq.{"a":1...}))
 * ```
 */
export function describeDatabaseError(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return 'no error reported';

  const message = error.message?.trim() || 'no message';
  const said = [error.code, error.details, error.hint]
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return said ? `${message} (database said: ${said})` : message;
}
