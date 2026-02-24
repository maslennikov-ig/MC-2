import { describe, expect, it } from 'vitest';
import { TWO_STAGE_ENRICHMENT_TYPES, isTwoStageType } from '../src/enrichment-on-demand';

describe('enrichment-on-demand two-stage type guards', () => {
  it('keeps only video and presentation in TWO_STAGE_ENRICHMENT_TYPES', () => {
    expect(TWO_STAGE_ENRICHMENT_TYPES).toEqual(['video', 'presentation']);
  });

  it.each(['video', 'presentation'])('returns true for %s', enrichmentType => {
    expect(isTwoStageType(enrichmentType)).toBe(true);
  });

  it.each(['nlm_audio', 'nlm_video', 'quiz', 'audio'])(
    'returns false for single-stage type %s',
    enrichmentType => {
      expect(isTwoStageType(enrichmentType)).toBe(false);
    }
  );
});
