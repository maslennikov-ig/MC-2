/**
 * Unit tests for the in-memory rate limiter
 * @module shared/logger/__tests__/rate-limiter.test
 *
 * Tests shouldWriteToDb with fake timers to control window expiry,
 * plus normalizeMessage behaviour (UUID, timestamp, and number stripping).
 *
 * Strategy for avoiding inter-test state leakage:
 *   - Every test uses a unique message prefix so it gets its own bucket.
 *   - Window-reset tests advance fake timers past WINDOW_MS (60 s).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldWriteToDb } from '@/shared/logger/rate-limiter';

// ---------------------------------------------------------------------------
// Constants mirrored from the module (kept in sync manually)
// ---------------------------------------------------------------------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a message that is unique to a specific test to avoid bucket reuse. */
function uniqueMsg(label: string, suffix = ''): string {
  return `[rate-limiter-test::${label}] Error occurred${suffix ? ' ' + suffix : ''}`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('shouldWriteToDb', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Basic allow / deny behaviour
  // -------------------------------------------------------------------------

  describe('basic allow / deny', () => {
    it('returns true on the very first call for a new message', () => {
      const result = shouldWriteToDb(uniqueMsg('first-call'));

      expect(result).toBe(true);
    });

    it('allows exactly MAX_PER_WINDOW (5) writes within the same window', () => {
      const msg = uniqueMsg('max-per-window');
      const results: boolean[] = [];

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        results.push(shouldWriteToDb(msg));
      }

      expect(results).toHaveLength(MAX_PER_WINDOW);
      expect(results.every(r => r === true)).toBe(true);
    });

    it('returns false on the 6th call within the same window (rate limited)', () => {
      const msg = uniqueMsg('sixth-call-blocked');

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msg);
      }

      const result = shouldWriteToDb(msg);

      expect(result).toBe(false);
    });

    it('continues returning false for all subsequent calls after the limit is hit', () => {
      const msg = uniqueMsg('sustained-block');

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msg);
      }

      const blocked = [shouldWriteToDb(msg), shouldWriteToDb(msg), shouldWriteToDb(msg)];

      expect(blocked.every(r => r === false)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Exact boundary
  // -------------------------------------------------------------------------

  describe('MAX_PER_WINDOW boundary (5th = true, 6th = false)', () => {
    it('5th call returns true and 6th call returns false', () => {
      const msg = uniqueMsg('boundary-check');

      // calls 1–4 (not the focus, just fill the bucket)
      for (let i = 0; i < MAX_PER_WINDOW - 1; i++) {
        shouldWriteToDb(msg);
      }

      const fifth = shouldWriteToDb(msg); // call 5
      const sixth = shouldWriteToDb(msg); // call 6

      expect(fifth).toBe(true);
      expect(sixth).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Window reset
  // -------------------------------------------------------------------------

  describe('window reset after WINDOW_MS (60 s)', () => {
    it('returns true again after the window expires', () => {
      const msg = uniqueMsg('window-reset');

      // Exhaust the bucket in the first window
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msg);
      }
      expect(shouldWriteToDb(msg)).toBe(false); // confirm blocked

      // Advance time past the window
      vi.advanceTimersByTime(WINDOW_MS + 1);

      const result = shouldWriteToDb(msg);

      expect(result).toBe(true);
    });

    it('starts a fresh count after window reset (allows another full window)', () => {
      const msg = uniqueMsg('window-reset-fresh-count');

      // Exhaust first window
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msg);
      }

      // Move to next window
      vi.advanceTimersByTime(WINDOW_MS + 1);

      // Should allow a full MAX_PER_WINDOW again
      const results: boolean[] = [];
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        results.push(shouldWriteToDb(msg));
      }

      expect(results.every(r => r === true)).toBe(true);
    });

    it('does NOT reset when time advanced is just under WINDOW_MS', () => {
      const msg = uniqueMsg('window-not-reset-yet');

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msg);
      }

      // Advance to 1 ms before the window ends
      vi.advanceTimersByTime(WINDOW_MS - 1);

      const result = shouldWriteToDb(msg);

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Independent buckets per message
  // -------------------------------------------------------------------------

  describe('independent buckets per message', () => {
    it('different messages have independent buckets', () => {
      const msgA = uniqueMsg('independent-A');
      const msgB = uniqueMsg('independent-B');

      // Exhaust bucket for A
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msgA);
      }
      expect(shouldWriteToDb(msgA)).toBe(false); // A is blocked

      // B should still be allowed
      expect(shouldWriteToDb(msgB)).toBe(true);
    });

    it('blocking one message does not affect writes for other messages', () => {
      const msgA = uniqueMsg('no-cross-contaminate-A');
      const msgB = uniqueMsg('no-cross-contaminate-B');
      const msgC = uniqueMsg('no-cross-contaminate-C');

      // Exhaust A
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msgA);
      }
      shouldWriteToDb(msgA); // blocked

      // B and C are unaffected
      expect(shouldWriteToDb(msgB)).toBe(true);
      expect(shouldWriteToDb(msgC)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // UUID normalisation
  // -------------------------------------------------------------------------

  describe('UUID normalisation', () => {
    it('maps messages that differ only in UUID to the same bucket', () => {
      const prefix = '[rate-limiter-test::uuid-norm] Request failed for user ';
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const uuid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

      // Exhaust bucket using one UUID variant
      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + uuid1);
      }

      // A message with a different UUID in the same template must be blocked
      const result = shouldWriteToDb(prefix + uuid2);

      expect(result).toBe(false);
    });

    it('allows a truly different message even when another UUID message is blocked', () => {
      const prefix = '[rate-limiter-test::uuid-unrelated] Request failed for user ';
      const uuid = '550e8400-e29b-41d4-a716-446655440001';
      const unrelated = uniqueMsg('uuid-unrelated-other');

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + uuid);
      }

      expect(shouldWriteToDb(unrelated)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp normalisation (10–13 digit numbers → <TS>)
  // -------------------------------------------------------------------------

  describe('timestamp normalisation', () => {
    it('maps messages with different epoch timestamps to the same bucket', () => {
      const prefix = '[rate-limiter-test::ts-norm] Job created at ';
      const ts1 = '1700000000000'; // 13 digits
      const ts2 = '1750000000000'; // 13 digits, different value

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + ts1);
      }

      const result = shouldWriteToDb(prefix + ts2);

      expect(result).toBe(false);
    });

    it('handles 10-digit Unix timestamps', () => {
      const prefix = '[rate-limiter-test::ts-10digit] Created at ';
      const ts1 = '1700000000'; // 10 digits
      const ts2 = '1750000000'; // 10 digits, different value

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + ts1);
      }

      expect(shouldWriteToDb(prefix + ts2)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Generic number normalisation (short numbers → <N>)
  // -------------------------------------------------------------------------

  describe('number normalisation', () => {
    it('maps messages with different small numbers to the same bucket', () => {
      const prefix = '[rate-limiter-test::num-norm] Retry attempt ';
      const suffix = ' of 3 failed';

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + i + suffix);
      }

      // The 6th variant should hit the same normalised fingerprint
      const result = shouldWriteToDb(prefix + '999' + suffix);

      expect(result).toBe(false);
    });

    it('maps job-id integers to the same bucket regardless of value', () => {
      const prefix = '[rate-limiter-test::job-id-norm] Job ';
      const suffix = ' not found';

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(prefix + (100 + i) + suffix);
      }

      expect(shouldWriteToDb(prefix + '9999' + suffix)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Message truncation at 200 chars
  // -------------------------------------------------------------------------

  describe('message truncation at 200 chars', () => {
    it('treats two messages that share the same first 200 chars as the same bucket', () => {
      // Build a base exactly 200 chars long (after normalisation — no dynamic parts)
      const base = '[rate-limiter-test::truncation] ' + 'X'.repeat(168); // 32 + 168 = 200
      const msgA = base + ' EXTRA-SUFFIX-A-THAT-IS-IGNORED';
      const msgB = base + ' EXTRA-SUFFIX-B-THAT-IS-IGNORED';

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msgA);
      }

      const result = shouldWriteToDb(msgB);

      expect(result).toBe(false);
    });

    it('treats messages whose first 200 chars differ as distinct buckets', () => {
      // Two messages whose first 200 chars are different
      const msgA = '[rate-limiter-test::truncation-distinct-A] ' + 'A'.repeat(157) + ' tail';
      const msgB = '[rate-limiter-test::truncation-distinct-B] ' + 'B'.repeat(157) + ' tail';

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(msgA);
      }

      expect(shouldWriteToDb(msgB)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Combined normalisation: UUID + number in the same message
  // -------------------------------------------------------------------------

  describe('combined normalisation', () => {
    it('normalises UUID and number in the same message to a single bucket', () => {
      const uuid1 = '11111111-2222-3333-4444-555555555555';
      const uuid2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const template = (uuid: string, n: number) =>
        `[rate-limiter-test::combined] User ${uuid} failed attempt ${n}`;

      for (let i = 0; i < MAX_PER_WINDOW; i++) {
        shouldWriteToDb(template(uuid1, i + 1));
      }

      // Different UUID AND different number — should still be the same fingerprint
      expect(shouldWriteToDb(template(uuid2, 99))).toBe(false);
    });
  });
});
