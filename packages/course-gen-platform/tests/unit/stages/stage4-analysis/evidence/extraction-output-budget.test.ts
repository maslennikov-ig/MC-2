/**
 * Contract: the standalone extraction's output budget is set by the answer it
 * has to produce, not by the length of the document it read.
 *
 * The budget used to be the source's own token count. On the live run of
 * 2026-08-22 (course 09286fc6) a 339-token source gave the fallback 339 output
 * tokens; the call returned `finish_reason: "length"` with exactly 339
 * completion tokens and its truncated JSON could not parse. This is the last
 * resort — the hierarchical path fell through to it — so the card was written
 * `failed` and Stage 4 carried on with no evidence for that document at all.
 * The two calls that did succeed emitted 1184 and 1277 tokens for that same
 * source, which is what the shape actually costs.
 *
 * The failure got worse as the document got smaller, which is why no test with
 * a realistic fixture caught it.
 */

import { describe, expect, it, vi } from 'vitest';

const source = {
  documentId: '41000000-0000-4000-8000-000000000009',
  documentName: 'rezervnyy-fond-metodicheskie-ukazaniya.txt',
  sourceVersionHash: 'hash-reserve-fund',
  priority: 'CORE' as const,
  authorityScope: 'course_source' as const,
  contentQuality: 0.9,
  originalTokens: 339,
  summaryTokens: 339,
  fullText: 'Резервный фонд покрывает от трёх до шести месяцев обязательных расходов. ',
};

/** Records what the caller allowed it to emit, then answers successfully. */
function recordingExtractor() {
  const seen: Array<{ maxOutputTokens: number; maxInputTokens: number }> = [];
  return {
    seen,
    port: {
      retryOwner: 'port' as const,
      extract: vi.fn((request: { maxOutputTokens: number; maxInputTokens: number }) => {
        seen.push({
          maxOutputTokens: request.maxOutputTokens,
          maxInputTokens: request.maxInputTokens,
        });
        return Promise.resolve({
          courseRelevance: 0.8,
          claims: [{ statement: 'Резерв — от трёх до шести месяцев расходов', confidence: 0.9 }],
          terminology: [],
          constraints: [],
          limitations: [],
          inputTokens: 532,
          outputTokens: 1184,
          costUsd: 0.0001,
        });
      }),
    },
  };
}

describe('standalone extraction output budget', () => {
  it('gives a 339-token source far more than 339 tokens to answer in', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );
    const extractor = recordingExtractor();

    await generateDocumentEvidenceCard({
      source,
      allocatedTokens: 339,
      processingMode: 'summary',
      reusableSummary: source.fullText,
      maxBatchTokens: 8_000,
      topic: 'Финансовая подушка безопасности',
      language: 'ru',
      maxRetries: 0,
      modelId: 'deepseek/deepseek-v4-flash',
      extractor: extractor.port,
    });

    expect(extractor.seen).toHaveLength(1);
    // 1277 is the largest completion the live run needed for this exact source.
    expect(extractor.seen[0].maxOutputTokens).toBeGreaterThan(1_277);
  });

  // Without this, the fix could be read as "always 2048" and quietly cap a long
  // document's answer below what the batch budget already allows.
  it('rises with the batch budget and stops at the provider ceiling', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );

    const wide = recordingExtractor();
    await generateDocumentEvidenceCard({
      source,
      allocatedTokens: 339,
      processingMode: 'summary',
      reusableSummary: source.fullText,
      maxBatchTokens: 60_000,
      language: 'ru',
      maxRetries: 0,
      modelId: 'deepseek/deepseek-v4-flash',
      extractor: wide.port,
    });

    expect(wide.seen[0].maxOutputTokens).toBe(4_096);
  });

  // `maxBatchTokens` is optional on the input, and the old expression fell back
  // to `allocatedTokens` when it was absent. That fallback is what has to stay
  // gone: an absent batch budget must not reintroduce a source-sized cap.
  it('does not fall back to the source size when no batch budget is given', async () => {
    const { generateDocumentEvidenceCard } = await import(
      '@/stages/stage4-analysis/evidence/card-generator'
    );

    const bare = recordingExtractor();
    await generateDocumentEvidenceCard({
      source,
      allocatedTokens: 339,
      processingMode: 'summary',
      reusableSummary: source.fullText,
      language: 'ru',
      maxRetries: 0,
      modelId: 'deepseek/deepseek-v4-flash',
      extractor: bare.port,
    });

    expect(bare.seen[0].maxOutputTokens).toBeGreaterThan(1_277);
  });
});
