import { describe, expect, it } from 'vitest';
import { TRUNCATION_CONTINUATION_MAX_TOKENS } from '@/stages/stage6-lesson-content/nodes/generator/generator-constants';

describe('stage6 generator constants', () => {
  it('uses a safe continuation token budget for truncation repair', () => {
    expect(TRUNCATION_CONTINUATION_MAX_TOKENS).toBe(4096);
  });
});
