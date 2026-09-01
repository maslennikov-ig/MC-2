import { describe, expect, it, vi } from 'vitest';
import { createCareerPlaybookProofreaderNode } from '@/stages/stage-career-playbook/nodes/final-proofreader';
import type { CareerPlaybookGraphStateType } from '@/stages/stage-career-playbook/state';

/**
 * The response that lost run db9d3ff9 its proofreading pass.
 *
 * The Russian guide's block 22 is titled `README: "Как со мной работать"`, and
 * the model quoted that title inside a JSON string value. The inner straight
 * quotes end the string four words early — `Expected ',' or '}' after property
 * value` — and no repair strategy can tell a quote that closes a value from a
 * quote inside one. Three calls answered this way; the whole pass was skipped
 * and the run reported success.
 */
const RESPONSE_WITH_QUOTED_TITLE = `\`\`\`json
{
  "pass": true,
  "score": 88,
  "issues": [
    {
      "block_id": "block_10",
      "severity": "critical",
      "category": "contradiction",
      "description": "Ссылка «см. раздел 22» не совпадает с названием раздела — «"Как со мной работать" (заполняется сотрудником)».",
      "suggestion": "Привести ссылку к фактическому названию раздела 22."
    }
  ],
  "needs_regeneration": ["block_10"]
}
\`\`\``;

const VALID_VERDICT = JSON.stringify({
  pass: false,
  score: 72,
  issues: [
    {
      block_id: 'block_10',
      severity: 'critical',
      category: 'contradiction',
      description: 'Ссылка на раздел 22 не совпадает с его названием.',
      suggestion: 'Привести ссылку к фактическому названию раздела.',
    },
  ],
  needs_regeneration: ['block_10'],
});

function llmResult(content: string, overrides: Record<string, unknown> = {}) {
  return {
    content,
    model: 'mock-proofreader-model',
    inputTokens: 29_000,
    outputTokens: 3_600,
    costUsd: 0.0031,
    durationMs: 42_000,
    attemptCount: 1,
    abortedAttempts: [],
    generationId: 'gen-mock',
    ...overrides,
  };
}

function proofreaderState(): CareerPlaybookGraphStateType {
  return {
    finalMarkdown: '# Роль\n\nСодержимое документа.',
    roleProfileSpec: { generated_on: '2026-09-01' },
    language: 'ru',
  } as unknown as CareerPlaybookGraphStateType;
}

describe('career playbook final proofreader', () => {
  it('asks the provider for the verdict shape instead of hoping the prose parses', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(VALID_VERDICT));

    await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(proofreaderState());

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    const options = invokeLLM.mock.calls[0][1];
    expect(options.structuredOutputSchema).toBeDefined();
    expect(options.structuredOutputMethod).toBe('jsonSchema');
    expect(options.node).toBe('finalProofreader');
    expect(options.phaseName).toBe('stage_career_playbook_proofreader');
    // On the phase's own configured model. Which endpoint of it can serve a
    // schema is a routing question, answered in `pickCheapestUntriedEndpoint`
    // from `supported_parameters` — not by moving this node to another model.
    expect(options.preferFallbackModel).toBeUndefined();
  });

  it('repairs a response whose Russian quotation broke the JSON, instead of skipping the pass', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce(llmResult(RESPONSE_WITH_QUOTED_TITLE))
      .mockResolvedValueOnce(llmResult(VALID_VERDICT));

    const update = await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(
      proofreaderState()
    );

    expect(update.warnings ?? []).toEqual([]);
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_10']);
    expect(update.nodeCosts).toHaveLength(2);
  });

  it('records both paid calls when the pass is skipped anyway', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(RESPONSE_WITH_QUOTED_TITLE));

    const update = await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(
      proofreaderState()
    );

    expect(update.warnings?.[0]).toContain('finalProofreader skipped');
    // Run db9d3ff9 paid for three proofreader responses that reached no receipt
    // at all: the old catch recorded aborted attempts, and these calls were not
    // aborted — they answered, and the answer could not be read.
    expect(update.nodeCosts).toHaveLength(2);
    expect(update.nodeCosts?.every(cost => cost.node === 'finalProofreader')).toBe(true);
    expect(update.nodeCosts?.reduce((sum, cost) => sum + cost.cost_usd, 0)).toBeCloseTo(0.0062, 6);
  });
});
