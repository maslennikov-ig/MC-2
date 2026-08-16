/**
 * Contract: a whole course does not fail Stage 4 over the shape of a word list.
 *
 * On 2026-08-15 a live run (mc2-2pplo) died before Stage 5. The system prompt
 * spelled out the shape of `claims` and only named `terminology`, `constraints`
 * and `limitations`, so `~deepseek/deepseek-v4-flash-latest` answered the
 * natural way — a term with its meaning. Zod wanted `string[]` and rejected all
 * three attempts; the document was marked
 * `structured_evidence_generation_failed_after_retries`, and the decision gate
 * then refused it, which surfaced as "materialize_decision_gate" (mc2-xn82t).
 */

import { describe, expect, it, vi } from 'vitest';

const generateCompletion = vi.fn();
vi.mock('@/shared/llm/client', () => ({
  createLLMClient: vi.fn(async () => ({
    generateCompletion,
    estimateCost: () => 0.0001,
  })),
}));

import { createProductionStructuredEvidencePort } from '@/stages/stage4-analysis/evidence/card-generator';

const unit = {
  unitId: 'unit-1',
  documentId: '40000000-0000-4000-8000-000000000001',
  sourceVersionHash: 'sha256:source',
  sourceRef: {
    document_id: '40000000-0000-4000-8000-000000000001',
    version_hash: 'sha256:source',
    chunk_id: 'unit-1',
  },
  text: 'Фотосинтез — процесс преобразования света.',
  inputHash: 'sha256:input',
};

function respond(
  terminology: unknown,
  constraints: unknown = [],
  limitations: unknown = [],
  scores: { confidence?: unknown; courseRelevance?: unknown } = {}
) {
  generateCompletion.mockResolvedValueOnce({
    content: JSON.stringify({
      unit_id: 'unit-1',
      summary: 'Краткое содержание фрагмента.',
      claims: [
        {
          statement: 'Растения используют свет.',
          confidence: scores.confidence ?? 0.9,
          unit_ids: ['unit-1'],
        },
      ],
      terminology,
      constraints,
      limitations,
      course_relevance: scores.courseRelevance ?? 0.8,
    }),
    inputTokens: 100,
    outputTokens: 50,
  });
}

async function extract() {
  const port = createProductionStructuredEvidencePort('~deepseek/deepseek-v4-flash-latest');
  return port.extractMap({ unit, topic: 'Фотосинтез', language: 'ru', maxOutputTokens: 2_000 });
}

describe('structured evidence payload shapes', () => {
  it('accepts terminology returned as a term-to-meaning object', async () => {
    // The exact shape of the first live attempt.
    respond({
      Фотосинтез: 'преобразование световой энергии в химическую',
      Хлорофилл: 'основной пигмент',
    });

    const { value } = await extract();

    expect(value.terminology).toEqual([
      'Фотосинтез — преобразование световой энергии в химическую',
      'Хлорофилл — основной пигмент',
    ]);
  });

  it('accepts terminology returned as a list of term objects', async () => {
    // The exact shape of the second live attempt.
    respond([
      { term: 'Фотосинтез', definition: 'преобразование световой энергии' },
      { name: 'Строма', description: 'внутреннее пространство хлоропласта' },
      { text: 'Тилакоид' },
    ]);

    const { value } = await extract();

    expect(value.terminology).toEqual([
      'Фотосинтез — преобразование световой энергии',
      'Строма — внутреннее пространство хлоропласта',
      'Тилакоид',
    ]);
  });

  it('applies the same tolerance to constraints and limitations', async () => {
    respond(['Фотосинтез'], { Свет: 'нужен постоянный источник' }, [
      { text: 'Статья не покрывает C4-растения' },
    ]);

    const { value } = await extract();

    expect(value.constraints).toEqual(['Свет — нужен постоянный источник']);
    expect(value.limitations).toEqual(['Статья не покрывает C4-растения']);
  });

  it('leaves a plain list of strings exactly as it is', async () => {
    respond(['Фотосинтез', 'Хлорофилл']);

    const { value } = await extract();

    expect(value.terminology).toEqual(['Фотосинтез', 'Хлорофилл']);
  });

  it('still rejects a payload that carries no terms at all', async () => {
    respond([{ confidence: 0.5 }]);

    await expect(extract()).rejects.toThrow();
  });

  it('accepts a score written as a numeric string', async () => {
    // The second live attempt, once terminology was accepted: "0.8".
    respond(['Фотосинтез'], [], [], { confidence: '0.9', courseRelevance: '0.8' });

    const { value } = await extract();

    expect(value.courseRelevance).toBe(0.8);
    expect(value.claims[0].confidence).toBe(0.9);
  });

  it('still rejects a score that is not a number at all', async () => {
    respond(['Фотосинтез'], [], [], { courseRelevance: 'высокая' });

    await expect(extract()).rejects.toThrow();
  });

  it('still rejects a score outside the allowed range', async () => {
    respond(['Фотосинтез'], [], [], { courseRelevance: '1.4' });

    await expect(extract()).rejects.toThrow();
  });

  it('tells the model the shape instead of leaving it to guess', async () => {
    respond(['Фотосинтез']);

    await extract();

    const [, options] = generateCompletion.mock.calls.at(-1) as [string, { systemPrompt: string }];
    expect(options.systemPrompt).toContain('terminology (array of strings');
    expect(options.systemPrompt).toContain('constraints (array of strings)');
    expect(options.systemPrompt).toContain('limitations (array of strings)');
    expect(options.systemPrompt).toContain('never a string');
  });
});
