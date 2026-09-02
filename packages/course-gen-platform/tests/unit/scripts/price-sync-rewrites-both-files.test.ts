/**
 * The nightly price sync edits source, so the edit is worth pinning.
 *
 * Until 2026-08-27 the job opened a GitHub issue asking a person to retype two
 * numbers it already had. It writes them now — which turns a reporting script
 * into one that rewrites `model-catalog.ts` and the snapshot beside it, and a
 * regex loose enough to hit the wrong entry would silently misprice a model
 * every night at 03:20.
 *
 * These run against strings rather than the real files: the real ones change
 * whenever a tariff does, and a test that has to be updated by the thing it
 * guards guards nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyRateToCatalogue,
  applyRateToSnapshot,
  formatRate,
  readPublishedChatEndpointPricing,
} from '../../../scripts/check-model-catalog-drift';

afterEach(() => {
  vi.unstubAllGlobals();
});

const CATALOGUE = `export const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  'vendor/first': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.13,
    contextLength: 1024,
  },
  'vendor/second': {
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.13,
    imageOutputPricePerMillion: 30,
  },
};
`;

describe('the nightly price sync, where it writes', () => {
  it('changes the entry it was asked for and leaves its twin alone', () => {
    const next = applyRateToCatalogue(CATALOGUE, 'vendor/second', 'inputPricePerMillion', 0.42);

    // Both entries carry the identical `inputPricePerMillion: 0.05`. An
    // unanchored replace would take the first one and misprice a model that
    // nothing had reported as drifting.
    expect(next).toContain(`'vendor/first': {\n    inputPricePerMillion: 0.05,`);
    expect(next).toContain(`'vendor/second': {\n    inputPricePerMillion: 0.42,`);
  });

  it('does not touch a neighbouring field with an overlapping name', () => {
    const next = applyRateToCatalogue(
      CATALOGUE,
      'vendor/second',
      'imageOutputPricePerMillion',
      12.5
    );

    expect(next).toContain('imageOutputPricePerMillion: 12.5');
    expect(next).toContain(`'vendor/second': {\n    inputPricePerMillion: 0.05,`);
    expect(next).toContain('outputPricePerMillion: 0.13');
  });

  it('leaves the source untouched when the model or the field is not there', () => {
    expect(applyRateToCatalogue(CATALOGUE, 'vendor/absent', 'inputPricePerMillion', 1)).toBe(
      CATALOGUE
    );
    // An entry that quotes no such rate is not one to invent a rate for.
    expect(applyRateToCatalogue(CATALOGUE, 'vendor/first', 'imagePriceFlatUsd', 1)).toBe(CATALOGUE);
  });

  it('rewrites the correct half of a snapshot tuple', () => {
    const snapshot = `      'vendor/first': [0.06, 0.12],\n      'vendor/second': [0.06, 0.12],\n`;

    expect(applyRateToSnapshot(snapshot, 'vendor/first', 'inputPricePerMillion', 0.9)).toContain(
      `'vendor/first': [0.9, 0.12]`
    );
    expect(applyRateToSnapshot(snapshot, 'vendor/first', 'outputPricePerMillion', 0.9)).toContain(
      `'vendor/first': [0.06, 0.9]`
    );
  });

  it('updates every table that states the same published fact', () => {
    // The live table and the retired one both claim what OpenRouter charges for
    // `deepseek/deepseek-v4-flash`. Updating one would leave the pair disagreeing
    // about the same number.
    const snapshot = `      'vendor/first': [0.06, 0.12],\n      // retired\n      'vendor/first': [0.06, 0.12],\n`;
    const next = applyRateToSnapshot(snapshot, 'vendor/first', 'inputPricePerMillion', 0.9);

    expect(next.match(/\[0\.9, 0\.12\]/gu)).toHaveLength(2);
  });

  it('writes a price rather than a float artefact', () => {
    // Published figures are per-token decimals multiplied by a million here, so
    // they arrive as 0.09999999999999999 and 0.07798000000000001.
    expect(formatRate(0.09999999999999999)).toBe('0.1');
    expect(formatRate(0.07798000000000001)).toBe('0.07798');
    expect(formatRate(30)).toBe('30');
  });
});

/**
 * The ids `GET /api/v1/models` does not list, read from their own pages.
 *
 * The Batch API variants are separately billed models and the list omits every
 * one of them, so for two months the gate called them "delisted, or the id is
 * misspelled" and skipped them: four catalogued entries whose only check was a
 * number somebody had typed by hand (mc2-rhyac).
 */
describe('the nightly price sync, where the model list is silent', () => {
  const answerWith = (body: unknown, ok = true): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) } as Response)
    );
  };

  it('quotes the ordinary tariff, not the flex or priority one beside it', async () => {
    // A model page carries every tier. `/flex` is half the ordinary rate and
    // `/priority` nearly double it; catalogue the flex figure and
    // `provider.max_price`, built at 1.5x, sits under the tariff the call
    // actually runs at the first time flex has no capacity.
    answerWith({
      data: {
        endpoints: [
          { tag: 'google-vertex/global/priority', pricing: { prompt: '0.00000135' } },
          {
            tag: 'google-vertex/global',
            pricing: { prompt: '0.00000075', completion: '0.00000375' },
          },
          { tag: 'google-vertex/global/flex', pricing: { prompt: '0.000000375' } },
        ],
      },
    });

    const published = await readPublishedChatEndpointPricing('google/gemini-3.7-flash:batch');

    expect(published).toEqual({
      kind: 'rates',
      pricing: {
        inputPricePerMillion: 0.75,
        outputPricePerMillion: 3.75,
        imageOutputPricePerMillion: null,
      },
    });
  });

  it('separates "nobody is serving it" from "no such model"', async () => {
    // An alias answers 200 with an empty endpoint list, and so does a model
    // whose only provider has withdrawn. Neither is a price fact, and reading
    // either as "delisted" would retire a live id.
    answerWith({ data: { endpoints: [] } });
    expect(await readPublishedChatEndpointPricing('z-ai/glm-5.2:batch')).toEqual({
      kind: 'unserved',
    });

    answerWith({}, false);
    expect(await readPublishedChatEndpointPricing('vendor/absent')).toEqual({ kind: 'unknown' });
  });
});
