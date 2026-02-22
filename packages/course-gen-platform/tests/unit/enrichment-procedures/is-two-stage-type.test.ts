import { describe, it, expect } from 'vitest';
import { isTwoStageType } from '../../../src/server/routers/enrichment/helpers';

describe('isTwoStageType', () => {
  it.each(['video', 'presentation'])('returns true for two-stage type %s', enrichmentType => {
    expect(isTwoStageType(enrichmentType)).toBe(true);
  });

  it.each(['quiz', 'audio', 'cover', 'card', 'banner', 'document', 'nlm_audio', 'nlm_video'])(
    'returns false for single-stage type %s',
    enrichmentType => {
      expect(isTwoStageType(enrichmentType)).toBe(false);
    }
  );
});
