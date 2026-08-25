/**
 * Contract: an estimate is taken from the endpoint that will serve the call, not
 * from the mainstream rate the call will not be billed at.
 *
 * `MODEL_CATALOG` holds what the mainstream providers charge, and the
 * per-attempt pin routes to the cheapest. Measured live on 2026-08-25 for
 * `deepseek-v4-flash-0731`: catalogue $0.14/$0.28, served $0.035/$0.100 by
 * `open-inference/fp4` — four times over on the input leg. The endpoint span for
 * that one model is 0.035 to 0.44, so "the catalogue price" is not a small
 * approximation of anything.
 *
 * It used to not matter, because `settleTraceCostFromProvider` overwrites the
 * estimate with the provider's receipt about ten seconds later. Then the ledger
 * was counted: over the previous fortnight 92 of 509 priced rows never got a
 * receipt — an aborted or failed call has no generation record to collect — and
 * those rows held 17% of the reported spend on the overstated number.
 */

import { describe, expect, it } from 'vitest';

import { calculateLlmCostUsd } from '@/shared/metrics/llm-cost';

const DEEPSEEK = 'deepseek/deepseek-v4-flash-0731';
/** `open-inference/fp4`, the endpoint the pin actually chose on 2026-08-25. */
const SERVED = { prompt: 0.035, completion: 0.1 };

describe('the estimate', () => {
  it('prices a pinned call at the endpoint rate, not the catalogue rate', () => {
    const usage = { model: DEEPSEEK, inputTokens: 1_000_000, outputTokens: 1_000_000 };

    // Catalogue: 0.14 + 0.28. Endpoint: 0.035 + 0.100.
    expect(calculateLlmCostUsd(usage)).toBeCloseTo(0.42, 10);
    expect(calculateLlmCostUsd({ ...usage, endpointRate: SERVED })).toBeCloseTo(0.135, 10);
  });

  it('does not halve an endpoint rate that already carries its tier', () => {
    // `openai/flex` is published at 0.10/0.60 — the discount is in the number.
    // Applying the flex multiplier on top would bill the call at a quarter.
    const flexEndpoint = { prompt: 0.1, completion: 0.6 };

    expect(
      calculateLlmCostUsd({
        model: 'openai/gpt-5.6-luna',
        inputTokens: 1_000_000,
        outputTokens: 0,
        serviceTier: 'flex',
        endpointRate: flexEndpoint,
      })
    ).toBeCloseTo(0.1, 10);
  });

  it('prices an alias the catalogue declines to price exactly', () => {
    // A `~` alias is priced from its base model, whose own tariff can differ, so
    // `hasExactModelPricing` refuses it — and nine such rows sat in the ledger
    // over the fortnight. The endpoint that served it has no such doubt.
    const alias = {
      model: '~deepseek/deepseek-v4-flash-latest',
      inputTokens: 1_000_000,
      outputTokens: 0,
    };

    expect(calculateLlmCostUsd({ ...alias, endpointRate: SERVED })).toBeCloseTo(0.035, 10);
  });

  it('still falls back to the catalogue when nothing was pinned', () => {
    // No pin means no endpoint list, which means we do not know who will serve
    // it. The catalogue estimate stands and waits for the receipt.
    expect(
      calculateLlmCostUsd({ model: DEEPSEEK, inputTokens: 1_000_000, outputTokens: 0 })
    ).toBeCloseTo(0.14, 10);
  });

  it('still halves an unpinned call the provider says it served at flex', () => {
    expect(
      calculateLlmCostUsd({
        model: 'openai/gpt-5.6-luna',
        inputTokens: 1_000_000,
        outputTokens: 0,
        serviceTier: 'flex',
      })
    ).toBeCloseTo(0.1, 10);
  });

  it('reports nothing rather than zero when neither source prices the model', () => {
    expect(
      calculateLlmCostUsd({ model: 'vendor/uncatalogued', inputTokens: 1_000, outputTokens: 1_000 })
    ).toBeUndefined();
  });
});
