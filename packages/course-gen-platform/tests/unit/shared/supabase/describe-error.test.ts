/**
 * Contract: a database failure repeats what the database said.
 *
 * PostgREST puts the useful part in `details`, `hint` and `code` and often
 * leaves `message` as "Bad Request". Stage 5 spent a paid live run on that: a
 * 10 KB filter value in the URL came back as `400 Bad Request` and the thrown
 * error said `Failed to save structure: Bad Request` — an http status and no
 * fact (mc2-2pplo, 2026-08-15).
 */

import { describe, expect, it } from 'vitest';

import { describeDatabaseError } from '@/shared/supabase/describe-error';

describe('describeDatabaseError', () => {
  it('repeats the code, the details and the hint after the original sentence', () => {
    const said = describeDatabaseError({
      message: 'Bad Request',
      code: 'PGRST102',
      details: 'failed to parse filter',
      hint: 'shorten the filter',
    });

    expect(said).toBe(
      'Bad Request (database said: PGRST102 failed to parse filter shorten the filter)'
    );
  });

  it('leaves a message that stands on its own alone, so grep still finds it', () => {
    expect(describeDatabaseError({ message: 'duplicate key value' })).toBe('duplicate key value');
  });

  it('says plainly when there is no message at all', () => {
    expect(describeDatabaseError({ code: '23505' })).toBe('no message (database said: 23505)');
    expect(describeDatabaseError(null)).toBe('no error reported');
  });

  it('ignores fields that are present but empty', () => {
    expect(describeDatabaseError({ message: 'nope', details: '   ', hint: null })).toBe('nope');
  });
});
