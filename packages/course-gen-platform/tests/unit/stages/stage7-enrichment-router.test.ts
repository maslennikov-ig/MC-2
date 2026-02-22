import { describe, expect, it } from 'vitest';
import {
  isTwoStageEnrichment,
  routeEnrichment,
} from '../../../src/stages/stage7-enrichments/services/enrichment-router';

describe('stage7 enrichment router', () => {
  it('routes nlm_audio to a single-stage handler', () => {
    const handler = routeEnrichment('nlm_audio' as any);

    expect(handler.generationFlow).toBe('single-stage');
    expect(typeof handler.generateDraft).toBe('function');
    expect(typeof handler.generateFinal).toBe('function');
  });

  it('routes nlm_video to a single-stage handler', () => {
    const handler = routeEnrichment('nlm_video' as any);

    expect(handler.generationFlow).toBe('single-stage');
    expect(typeof handler.generateDraft).toBe('function');
    expect(typeof handler.generateFinal).toBe('function');
  });

  it.each([
    ['video', true],
    ['presentation', true],
    ['nlm_audio', false],
    ['nlm_video', false],
    ['audio', false],
    ['quiz', false],
  ])('isTwoStageEnrichment(%s) === %s', (type, expected) => {
    expect(isTwoStageEnrichment(type as any)).toBe(expected);
  });
});
