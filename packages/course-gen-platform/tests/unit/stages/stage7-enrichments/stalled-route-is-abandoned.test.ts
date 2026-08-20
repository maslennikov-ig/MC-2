/**
 * Contract: a route that stops answering is abandoned, not asked again.
 *
 * On 2026-08-17 a quiz was asked for six times in a row on the same model, each
 * ask bounded at 238s. The route never answered, the worker was held for 32
 * minutes, the provider billed every attempt, the user got no quiz, and the
 * configured fallback model was never tried (mc2-b7olk.8).
 *
 * Three separate things had to be wrong for that. The abort was not recognised
 * as a timeout, so the retry policy read the failure as `unknown`. The fallback
 * was unreachable by construction: it only applied from the third attempt, and
 * an `unknown` failure stops at the second. And the model came from a constant
 * in this package rather than from `llm_model_config`, so the configured model
 * and its `fallback_model_id` were both ignored.
 *
 * The measurement that frames all of it: the same prompt, same model, reasoning
 * off, answered in 31s from inside the dev worker on 2026-08-17.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  categorizeError,
  getFallbackModel,
  getModelForAttempt,
  shouldRetry,
} from '@/stages/stage7-enrichments';
import {
  MODEL_CONFIG,
  ENRICHMENT_PHASE_NAMES,
  LLM_CALL_BUDGET,
} from '@/stages/stage7-enrichments/config';

class AbortError extends Error {
  override name = 'AbortError';
}

describe('an aborted call is a timeout', () => {
  it('recognises the wording the runtime actually produces', () => {
    expect(categorizeError(new AbortError('This operation was aborted'))).toBe('timeout');
  });

  it('still recognises the wording that was already handled', () => {
    expect(categorizeError(new Error('Request timed out'))).toBe('timeout');
    expect(categorizeError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe('timeout');
  });

  it('reads the wrapped message the handler rethrows', () => {
    const wrapped = new Error(
      'Quiz generation failed: Failed after 3 retries: This operation was aborted'
    );
    expect(categorizeError(wrapped)).toBe('timeout');
  });

  it('retries a timeout instead of giving up after two attempts', () => {
    const error = new AbortError('This operation was aborted');
    expect(shouldRetry({ enrichmentType: 'quiz', attempt: 2, error })).toBe(true);
  });
});

describe('the model for the next attempt', () => {
  it('leaves the first attempt to the configured phase model', () => {
    expect(getModelForAttempt('quiz', 1, 'openai/gpt-5.6-luna')).toBeNull();
  });

  it('forces the configured fallback once the configured route has failed', () => {
    expect(getModelForAttempt('quiz', 2, 'openai/gpt-5.6-luna')).toBe('openai/gpt-5.6-luna');
    expect(getModelForAttempt('presentation', 3, 'openai/gpt-5.6-luna')).toBe(
      'openai/gpt-5.6-luna'
    );
  });

  it('uses the built-in fallback when the phase config names none', () => {
    expect(getModelForAttempt('quiz', 2, null)).toBe(MODEL_CONFIG.quiz.fallback);
  });

  it('does not pick a model for enrichments that do not call an LLM', () => {
    expect(getModelForAttempt('cover', 2, 'openai/gpt-5.6-luna')).toBeNull();
  });

  it('names the phase whose fallback it reads, in a form grep can find', () => {
    // A `stage_7_${type}` built at runtime has hidden a live phase from search
    // twice in this repository.
    expect(ENRICHMENT_PHASE_NAMES.quiz).toBe('stage_7_quiz');
    expect(ENRICHMENT_PHASE_NAMES.presentation).toBe('stage_7_presentation');
  });
});

describe('an enrichment call is bounded by what one actually takes', () => {
  function handlerSource(name: string): string {
    return readFileSync(
      join(__dirname, `../../../../src/stages/stage7-enrichments/handlers/${name}`),
      'utf8'
    );
  }

  it('spends less than the shared default on one attempt', () => {
    // Measured 31s; the shared default is 238s. Room for a slow provider,
    // without a stalled one costing a quarter of an hour.
    expect(LLM_CALL_BUDGET.timeoutMs).toBeGreaterThan(60_000);
    expect(LLM_CALL_BUDGET.timeoutMs).toBeLessThan(238_000);
  });

  it('retries the transport once rather than the client default of three', () => {
    expect(LLM_CALL_BUDGET.transportRetries).toBe(1);
  });

  it('passes that budget to every LLM enrichment call, presentation included', () => {
    // The budget was quiz-only at first, which left the same stalled route
    // reachable through presentation — the other enrichment that calls an LLM,
    // and the one that calls it twice (mc2-d4og2).
    for (const name of ['quiz-handler.ts', 'presentation-handler.ts']) {
      const source = handlerSource(name);
      const calls = source.split('llmClient.generateCompletion(').slice(1);
      expect(calls.length, name).toBeGreaterThan(0);
      for (const call of calls) {
        const options = call.slice(0, call.indexOf('});'));
        expect(options, name).toContain('timeout: LLM_CALL_BUDGET.timeoutMs');
        expect(options, name).toContain('maxRetries: LLM_CALL_BUDGET.transportRetries');
      }
    }
  });

  it('keeps the primary to a single attempt before the fallback', () => {
    expect(MODEL_CONFIG.maxPrimaryAttempts).toBe(1);
  });
});

describe('the fallback rule is written once', () => {
  it('agrees with getModelForAttempt about the first attempt', () => {
    // The two read `maxPrimaryAttempts` with opposite comparisons, so with one
    // primary attempt this reported a fallback for attempt 1 while
    // getModelForAttempt returned null by design (mc2-qp7dl).
    expect(getFallbackModel({ enrichmentType: 'quiz', attempt: 1 })).toBeNull();
    expect(getModelForAttempt('quiz', 1)).toBeNull();
  });

  it('still offers a fallback once the configured route has failed', () => {
    // What the context_overflow branch of shouldRetry decides for attempts >= 2
    // is unchanged.
    expect(getFallbackModel({ enrichmentType: 'quiz', attempt: 2 })).toBe(
      MODEL_CONFIG.quiz.fallback
    );
    expect(
      shouldRetry({
        enrichmentType: 'quiz',
        attempt: 2,
        error: new Error('maximum context length exceeded'),
      })
    ).toBe(true);
  });

  it('has nothing further to offer a call already on the fallback', () => {
    expect(
      getFallbackModel({
        enrichmentType: 'quiz',
        attempt: 2,
        currentModel: MODEL_CONFIG.quiz.fallback,
      })
    ).toBeNull();
  });

  it('does not fall back for an enrichment that calls no LLM', () => {
    expect(getFallbackModel({ enrichmentType: 'cover', attempt: 2 })).toBeNull();
  });
});

describe('a deliberate cancellation is not a stalled route', () => {
  it('reads only the wording a wall-clock abort produces', () => {
    // 'abort' as a bare substring made any error that merely mentions it a
    // retryable timeout; nothing should be paid for again on that basis.
    expect(categorizeError(new Error('Job aborted by the operator'))).not.toBe('timeout');
    expect(categorizeError(new Error('This operation was aborted'))).toBe('timeout');
  });
});
