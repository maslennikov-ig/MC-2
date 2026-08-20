/**
 * Contract: a rejected progress row says which field was wrong.
 *
 * Stage 6 finalize logged 'Invalid generation_progress data' with the whole
 * object attached and no hint at the failing key. The row looked well-formed -
 * percentage 80, three lessons done, a token breakdown - so the warning read as
 * noise, and the third instance of a validator printing its input instead of
 * its answer went unread (mc2-g3v9c).
 */

import { describe, expect, it } from 'vitest';
import {
  explainGenerationProgress,
  parseGenerationProgress,
} from '@/shared/schemas/generation-progress.schema';

const VALID = { percentage: 80, message: 'Generating lessons', lessons_completed: 3 };

describe('generation progress rejection', () => {
  it('says nothing when there is nothing wrong', () => {
    expect(explainGenerationProgress(VALID)).toEqual([]);
    expect(parseGenerationProgress(VALID)).toMatchObject(VALID);
  });

  it('names a missing field', () => {
    const { message: _dropped, ...withoutMessage } = VALID;

    expect(explainGenerationProgress(withoutMessage)).toEqual(['message: Required']);
  });

  it('names a field of the wrong shape, and every one of them', () => {
    const reasons = explainGenerationProgress({
      ...VALID,
      percentage: '80',
      lessons_completed: 1.5,
    });

    expect(reasons).toHaveLength(2);
    expect(reasons.join(' ')).toContain('percentage');
    expect(reasons.join(' ')).toContain('lessons_completed');
  });

  it('keeps letting the extra keys other stages write through', () => {
    expect(
      explainGenerationProgress({ ...VALID, total_tokens_used: 60_615, tokens_by_key: {} })
    ).toEqual([]);
  });
});
