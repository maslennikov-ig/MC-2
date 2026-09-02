import { describe, expect, it, vi } from 'vitest';
import {
  buildCareerPlaybookDocumentOutline,
  createCareerPlaybookProofreaderNode,
  deriveProofreaderRegenerations,
} from '@/stages/stage-career-playbook/nodes/final-proofreader';
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

  // mc2-nfyyo. Runs 422471a2 and 208746e3 (2026-09-01) paid for this pass and
  // the stored row kept, between them, one line naming a block id. The handler
  // builds q_a_data.quality_issues by walking generatedBlocks for a per-block
  // judge_verdict, and a whole-document reader has no block to hang one on.
  it('puts its findings where the stored row will keep them', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(VALID_VERDICT));

    const update = await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(
      proofreaderState()
    );

    expect(update.qualityIssues).toEqual([
      {
        id: 'final_proofreader:block_10:0',
        source: 'final_proofreader',
        severity: 'critical',
        blockId: 'block_10',
        category: 'contradiction',
        title: 'Проблема качества документа',
        message: 'Ссылка на раздел 22 не совпадает с его названием.',
        suggestion: 'Привести ссылку к фактическому названию раздела.',
        action: 'regenerate',
      },
    ]);
  });

  // The cap decides what gets regenerated; it must not decide what gets
  // recorded. A finding the cap drops is the one nothing downstream will act on,
  // so it is the one the row most needs to keep.
  it('records a finding the regeneration cap dropped', async () => {
    const overCap = JSON.stringify({
      pass: false,
      score: 60,
      issues: ['block_1', 'block_2', 'block_3', 'block_4'].map(blockId => ({
        block_id: blockId,
        severity: 'critical',
        category: 'contradiction',
        description: `${blockId} contradicts the ledger.`,
        suggestion: 'Align it with the ledger.',
      })),
      needs_regeneration: ['block_1', 'block_2', 'block_3', 'block_4'],
    });
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(overCap));

    const update = await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(
      proofreaderState()
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_1', 'block_2', 'block_3']);
    expect(update.warnings?.[0]).toContain('unaddressed blocks remain in the verdict: block_4');
    expect(update.qualityIssues?.map(issue => issue.blockId)).toEqual([
      'block_1',
      'block_2',
      'block_3',
      'block_4',
    ]);
  });

  // mc2-jqvf4. The pass reported sections missing from documents that provably
  // contain them, in both languages, on all three runs of 2026-09-02. It is
  // given the inventory rather than asked to recall it.
  it('hands the reader the section inventory it kept guessing at', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(VALID_VERDICT));

    await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })({
      ...proofreaderState(),
      finalMarkdown: '# Guide\n\n## Header\n\ntext\n\n## 1. Mission\n\ntext\n\n## 2. Anti-goals\n',
    } as CareerPlaybookGraphStateType);

    expect(renderPrompt.mock.calls[0][1].document_outline).toBe(
      '1. Header\n2. 1. Mission\n3. 2. Anti-goals'
    );
  });

  it('reads headings out of the document and not out of its diagrams', () => {
    const markdown = [
      '## 1. Role canvas',
      '',
      '```mermaid',
      'graph TD',
      '## not a heading',
      '```',
      '',
      '## 2. Continuity',
      '',
      '### 2.1 A subsection is not a section',
    ].join('\n');

    expect(buildCareerPlaybookDocumentOutline(markdown)).toBe(
      '1. 1. Role canvas\n2. 2. Continuity'
    );
  });

  it('returns an empty inventory for a document with no headings, rather than throwing', () => {
    expect(buildCareerPlaybookDocumentOutline('just prose, no headings at all')).toBe('');
  });

  // The model writes `needs_regeneration` freehand, and nothing made it agree
  // with the findings above it. `mergeJudgeVerdicts` already derives the judge's
  // equivalent list from that judge's own criticals.
  it('regenerates only the blocks it filed a critical against', () => {
    const verdict = {
      pass: false,
      score: 55,
      issues: [
        { block_id: 'block_5', severity: 'critical', category: 'contradiction', description: 'x' },
        { block_id: 'block_9', severity: 'warning', category: 'contradiction', description: 'y' },
      ],
      needs_regeneration: ['block_5', 'block_9', 'block_13'],
    } as never;

    expect(deriveProofreaderRegenerations(verdict)).toEqual(['block_5']);
  });

  // The intersection may not widen the list either: a block with a critical the
  // model deliberately left out of `needs_regeneration` stays out, because the
  // model may have judged it unfixable by regeneration.
  it('never adds a block the model chose not to send back', () => {
    const verdict = {
      pass: false,
      score: 55,
      issues: [
        { block_id: 'block_5', severity: 'critical', category: 'contradiction', description: 'x' },
        { block_id: 'block_7', severity: 'critical', category: 'contradiction', description: 'y' },
      ],
      needs_regeneration: ['block_5'],
    } as never;

    expect(deriveProofreaderRegenerations(verdict)).toEqual(['block_5']);
  });

  it('does not promise a regeneration for a finding that cannot drive one', async () => {
    const mixed = JSON.stringify({
      pass: false,
      score: 70,
      issues: [
        {
          block_id: 'block_5',
          severity: 'warning',
          category: 'contradiction',
          description: 'The guide does not include a typical working day section.',
        },
      ],
      needs_regeneration: ['block_5'],
    });
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue(llmResult(mixed));

    const update = await createCareerPlaybookProofreaderNode({ renderPrompt, invokeLLM })(
      proofreaderState()
    );

    expect(update.qualityIssues?.[0]?.action).toBe('review');
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
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
