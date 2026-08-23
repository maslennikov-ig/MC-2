/**
 * `generate-config-seed` must not report success without reading the database
 * (mc2-s1vg5).
 *
 * Reproduced 2026-08-13 and again 2026-08-23: with no SUPABASE_URL /
 * SUPABASE_SERVICE_KEY the script printed "Generation complete!", exited 0 and
 * copied the old seed. The only signal that nothing happened was an empty
 * `git diff`. Fail-open belongs to a build that needs the seed to exist; an
 * explicit refresh must fail loudly.
 *
 * The decision is tested directly rather than through a subprocess: what is
 * worth holding is "which mode refuses", not how the process exits.
 */
import { describe, expect, it } from 'vitest';

import {
  ALLOW_STALE_FLAG,
  StaleSeedRefusedError,
  assertStaleSeedAllowed,
  parseAllowStale,
} from '../../../src/build/generate-config-seed';

describe('generate-config-seed refuses a silent no-op', () => {
  it('is strict by default: an unreachable database ends the run', () => {
    expect(() =>
      assertStaleSeedAllowed(false, 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    ).toThrow(StaleSeedRefusedError);
  });

  it('names the reason it could not read, not just that it failed', () => {
    // The 2026-08-13 loss was that the reason existed and never reached anyone
    // who could act on it.
    expect(() => assertStaleSeedAllowed(false, 'DB returned empty config list')).toThrow(
      /DB returned empty config list/
    );
  });

  it('says how to proceed on purpose, so the flag is a choice and not a guess', () => {
    expect(() => assertStaleSeedAllowed(false, 'whatever')).toThrow(
      new RegExp(ALLOW_STALE_FLAG.replace(/-/g, '\\-'))
    );
  });

  it('allows a stale seed only when the caller asked for it', () => {
    expect(() => assertStaleSeedAllowed(true, 'Missing SUPABASE_URL')).not.toThrow();
  });

  it('reads the concession from argv and nothing else', () => {
    expect(parseAllowStale([ALLOW_STALE_FLAG])).toBe(true);
    expect(parseAllowStale([])).toBe(false);
    // Not NODE_ENV, not a heuristic: a mode inferred from the environment is
    // exactly what made the two cases indistinguishable.
    expect(parseAllowStale(['--allow-stale-please'])).toBe(false);
  });
});
