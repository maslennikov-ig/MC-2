/**
 * Contract: when structured evidence generation fails, the cause is recorded.
 *
 * Both catch blocks used to rethrow or swallow the original error without
 * writing it anywhere, so an ordinary Russian teaching DOCX produced an empty
 * failed card and the worker log held no line explaining why — provider refusal,
 * invalid JSON and a schema overflow all reduced to the same `coverage_reason`
 * (mc2-s2x84). The document's own content must never reach the log.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/shared/logger';

// Spy on the shared pino instance rather than replacing the module: a spread
// copy of a pino logger loses its internal symbols and breaks every other
// importer of this module.
const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

afterAll(() => {
  warn.mockRestore();
  error.mockRestore();
});

const SECRET_CONTENT = 'Фотосинтез превращает свет в химическую энергию растений.';

const source = {
  documentId: '41000000-0000-4000-8000-000000000001',
  documentName: 'photosynthesis.docx',
  sourceVersionHash: 'hash-photosynthesis',
  priority: 'CORE' as const,
  authorityScope: 'course_source' as const,
  contentQuality: 0.83,
  originalTokens: 8310,
  summaryTokens: 0,
  fullText: SECRET_CONTENT.repeat(20),
};

/** A structured port whose map call always refuses, like the live run's did. */
function refusingStructuredPort(message: string) {
  return {
    retryOwner: 'port' as const,
    extractMap: vi.fn(async () => {
      throw new Error(message);
    }),
    reduceSummary: vi.fn(async () => {
      throw new Error('unreachable');
    }),
    reduceExtraction: vi.fn(async () => {
      throw new Error('unreachable');
    }),
  };
}

function workingExtractor() {
  return {
    retryOwner: 'port' as const,
    extract: vi.fn(async () => ({
      courseRelevance: 0.7,
      claims: [{ statement: 'Свет запускает фотосинтез', confidence: 0.9 }],
      terminology: [],
      constraints: [],
      limitations: [],
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    })),
  };
}

function failingExtractor(message: string) {
  return {
    retryOwner: 'port' as const,
    extract: vi.fn(async () => {
      throw new Error(message);
    }),
  };
}

const baseInput = {
  source,
  allocatedTokens: 512,
  processingMode: 'summary' as const,
  topic: 'Фотосинтез',
  language: 'ru' as const,
  maxRetries: 0,
  modelId: 'openai/gpt-5.6-luna',
};

/** Everything the two log calls were handed, flattened for content checks. */
function loggedText(): string {
  return JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
}

describe('generateEvidenceCard failure logging', () => {
  beforeEach(() => {
    warn.mockClear();
    error.mockClear();
  });

  it('records both causes when both paths fail, and marks the card failed', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );

    const result = await generateDocumentEvidenceCard({
      ...baseInput,
      structuredPort: refusingStructuredPort('provider refused: 429 rate limited'),
      extractor: failingExtractor('invalid JSON from extractor'),
    });

    expect(result.card.coverage_status).toBe('failed');
    expect(result.card.coverage_reason).toBe('structured_evidence_generation_failed_after_retries');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    const [warnContext] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(warnContext).toMatchObject({
      documentId: source.documentId,
      modelId: baseInput.modelId,
      phase: 'hierarchical_structured_evidence',
      error: { message: expect.stringContaining('429 rate limited') },
    });

    const [errorContext] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(errorContext).toMatchObject({
      documentId: source.documentId,
      phase: 'excerpt_fallback_extraction',
      error: { message: expect.stringContaining('invalid JSON') },
      hierarchicalError: { message: expect.stringContaining('429 rate limited') },
    });
  });

  it('records the primary cause when the excerpt fallback saves the card', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );

    const result = await generateDocumentEvidenceCard({
      ...baseInput,
      structuredPort: refusingStructuredPort('map call timed out'),
      extractor: workingExtractor(),
    });

    expect(result.card.coverage_status).toBe('degraded');
    expect(result.card.coverage_reason).toBe('hierarchical_evidence_failed_excerpt_fallback');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    const [warnContext] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(warnContext).toMatchObject({
      phase: 'hierarchical_structured_evidence',
      error: { message: expect.stringContaining('timed out') },
    });
  });

  it('never writes document content into the log', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );

    await generateDocumentEvidenceCard({
      ...baseInput,
      structuredPort: refusingStructuredPort('provider refused'),
      extractor: failingExtractor('extractor refused'),
    });

    expect(loggedText()).not.toContain(SECRET_CONTENT);
  });
});
