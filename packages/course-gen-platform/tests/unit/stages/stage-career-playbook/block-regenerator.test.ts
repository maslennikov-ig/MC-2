import { describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  buildOtherBlocksBrief,
  CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS,
  CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS,
  createBlockRegeneratorNode,
  regenerateCareerPlaybookBlock,
  selectPendingCareerPlaybookRegeneration,
  selectPendingCareerPlaybookRegenerations,
} from '@/stages/stage-career-playbook/nodes/block-regenerator';

const spec: CareerPlaybookRoleProfileSpec = {
  position: {
    title: 'B2B Sales Manager',
    slug: 'b2b-sales-manager',
    department: 'sales',
    level: 'senior',
  },
  context: {
    company_stage: 'growth',
    team_size: '51-200',
    reports_to: 'CRO',
    has_subordinates: true,
    subordinates_description: '3 SDRs',
  },
  focus_areas: {
    primary_kpis: ['Qualified pipeline', 'Closed revenue', 'Win rate'],
    key_tools: ['CRM', 'Sales engagement'],
    critical_competencies: ['Discovery', 'Negotiation', 'Forecasting'],
    anti_goals: ['Own product roadmap', 'Approve legal terms'],
    failure_patterns: ['Poor CRM hygiene', 'Discount-first selling'],
  },
  research: null,
  block_boundaries: {
    block_6: { primary_topics: ['metrics'], do_not_repeat: ['duties'] },
  },
  content_language: 'ru',
};

function generatedBlock(content: string, attempt = 1): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: '2026-05-13T00:00:00.000Z',
    llm_model: 'mock-career-model',
    attempt,
  };
}

describe('Career Playbook block regenerator', () => {
  it('renders the regenerator prompt and returns one generated block with incremented attempt', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered regenerator prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: '## 6. KPI и метрики\n\n| Metric | Target |\n| --- | --- |',
      model: 'mock-career-model',
      inputTokens: 120,
      outputTokens: 80,
      costUsd: 0.02,
    });

    const result = await regenerateCareerPlaybookBlock(
      {
        blockId: 'block_6',
        roleProfileSpec: spec,
        language: 'ru',
        originalBlock: generatedBlock('## 6. KPI и метрики\n\nOld KPI text', 2),
        issue: {
          description: 'The KPI block repeats duties instead of measurable metrics.',
          suggestion: 'Use concrete CRM metrics.',
        },
        userInstruction: 'Keep the traffic-light table.',
        otherBlocksBrief: 'block_3: responsibility zones are already covered',
        now: () => new Date('2026-05-13T10:15:30.000Z'),
      },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_block_regenerator',
      expect.objectContaining({
        block_id: 'block_6',
        block_name: 'KPI and metrics',
        original_content: expect.stringContaining('Old KPI text'),
        issue_description: 'The KPI block repeats duties instead of measurable metrics.',
        suggestion: 'Use concrete CRM metrics.',
        user_instruction: 'Keep the traffic-light table.',
        other_blocks_brief: 'block_3: responsibility zones are already covered',
        content_language: 'ru',
        spec_json: expect.stringContaining('B2B Sales Manager'),
      })
    );
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered regenerator prompt',
      expect.objectContaining({
        phaseName: 'stage_career_playbook_regenerator',
        promptKey: 'career_playbook_block_regenerator',
        node: 'blockRegenerator',
      })
    );
    expect(result.blockId).toBe('block_6');
    expect(result.block).toEqual({
      content: '## 6. KPI и метрики\n\n| Metric | Target |\n| --- | --- |',
      status: 'generated',
      judge_verdict: null,
      numeric_facts: [],
      generated_at: '2026-05-13T10:15:30.000Z',
      llm_model: 'mock-career-model',
      attempt: 3,
    });
    expect(result.nodeCost).toEqual({
      node: 'blockRegenerator',
      model: 'mock-career-model',
      input_tokens: 120,
      output_tokens: 80,
      cost_usd: 0.02,
    });
  });

  it('builds an ordered brief of other blocks and omits the target block', () => {
    const brief = buildOtherBlocksBrief(
      {
        block_2: generatedBlock('## 2. Anti-goals\n\nDo not own product roadmap.'),
        block_6: generatedBlock('## 6. KPI\n\nTarget block must be omitted.'),
        header: generatedBlock('## Header\n\nSales role guide.'),
      },
      'block_6'
    );

    expect(brief).toBe(
      'header: ## Header Sales role guide.\nblock_2: ## 2. Anti-goals Do not own product roadmap.'
    );
  });

  it.each([
    ['empty output', '   ', 'empty markdown'],
    ['wrong heading', '## 7. Competencies\n\nWrong block.', 'expected heading for block_6'],
    [
      'multiple blocks',
      '## 6. KPI и метрики\n\nValid block.\n\n## 7. Competencies\n\nExtra block.',
      'exactly one top-level Career Playbook block',
    ],
  ])('rejects %s from the LLM', async (_caseName, content, expectedMessage) => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered regenerator prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content,
      model: 'mock-career-model',
      inputTokens: 120,
      outputTokens: 80,
      costUsd: 0.02,
    });

    await expect(
      regenerateCareerPlaybookBlock(
        {
          blockId: 'block_6',
          roleProfileSpec: spec,
          language: 'ru',
          originalBlock: generatedBlock('## 6. KPI и метрики\n\nOld KPI text', 2),
          issue: {
            description: 'The KPI block repeats duties instead of measurable metrics.',
            suggestion: 'Use concrete CRM metrics.',
          },
        },
        { renderPrompt, invokeLLM }
      )
    ).rejects.toThrow(expectedMessage);
  });

  it('chooses the flagged block with the fewest attempts before repeating another block', () => {
    const pending = selectPendingCareerPlaybookRegeneration({
      verdict: {
        pass: false,
        score: 45,
        issues: [
          {
            block_id: 'block_4',
            severity: 'critical',
            description: 'Block 4 is fallback content.',
            suggestion: 'Regenerate block 4.',
          },
          {
            block_id: 'block_6',
            severity: 'critical',
            description: 'Block 6 is fallback content.',
            suggestion: 'Regenerate block 6.',
          },
        ],
        needs_regeneration: ['block_4', 'block_6'],
      },
      blockIds: ['block_4', 'block_6'],
      attempts: { block_4: 1, block_6: 0 },
      maxAttempts: CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS,
      maxWindowAttempts: 4,
    });

    expect(pending?.blockId).toBe('block_6');
    expect(pending?.attempts).toBe(0);
  });

  it('pins the regeneration cap constants that bound the judge<->regenerator loop', () => {
    expect(CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS).toBe(2);
    expect(CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS).toBe(8);
  });

  it('batch-selects every flagged block within caps, fewest-attempts-first', () => {
    const pending = selectPendingCareerPlaybookRegenerations({
      verdict: {
        pass: false,
        score: 30,
        issues: [
          { block_id: 'block_4', severity: 'critical', description: 'x', suggestion: 'y' },
          { block_id: 'block_6', severity: 'critical', description: 'x', suggestion: 'y' },
          { block_id: 'block_2', severity: 'critical', description: 'x', suggestion: 'y' },
        ],
        needs_regeneration: ['block_4', 'block_6', 'block_2'],
      },
      blockIds: ['block_2', 'block_4', 'block_6'],
      // block_2 is already at the per-block cap and is filtered out of the batch.
      attempts: { block_4: 1, block_6: 0, block_2: 2 },
      maxAttempts: 2,
      maxWindowAttempts: 8,
    });

    expect(pending.map(candidate => candidate.blockId)).toEqual(['block_6', 'block_4']);
    expect(pending.map(candidate => candidate.attempts)).toEqual([0, 1]);
  });

  it('trims the batch to the remaining judge-window budget', () => {
    const pending = selectPendingCareerPlaybookRegenerations({
      verdict: {
        pass: false,
        score: 30,
        issues: [
          { block_id: 'block_4', severity: 'critical', description: 'x', suggestion: 'y' },
          { block_id: 'block_6', severity: 'critical', description: 'x', suggestion: 'y' },
        ],
        needs_regeneration: ['block_4', 'block_6'],
      },
      blockIds: ['block_2', 'block_4', 'block_6'],
      // 7 of 8 window attempts already consumed -> only one regeneration slot remains.
      attempts: { block_2: 7 },
      maxAttempts: 2,
      maxWindowAttempts: 8,
    });

    expect(pending).toHaveLength(1);
    expect(pending[0].blockId).toBe('block_4');
  });

  it('regenerates a flagged batch, recording costs for successes and warnings for failures', async () => {
    const renderPrompt = vi
      .fn()
      .mockImplementation((_key: string, variables: Record<string, string>) =>
        Promise.resolve(`regen::${variables.block_id}`)
      );
    const invokeLLM = vi.fn().mockImplementation((prompt: string) => {
      if (prompt === 'regen::block_2') {
        return Promise.resolve({
          content: '## 2. Анти-цели\n\n- Product roadmap\n- Legal terms\n- Support\n- Hiring',
          model: 'mock-career-model',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.02,
          durationMs: 1500,
          attemptCount: 1,
        });
      }
      // block_5 regeneration returns the wrong heading -> validation rejects it.
      return Promise.resolve({
        content: '## 7. Wrong block\n\nInvalid regenerated markdown.',
        model: 'mock-career-model',
        inputTokens: 80,
        outputTokens: 40,
        costUsd: 0.01,
        durationMs: 900,
        attemptCount: 1,
      });
    });

    const node = createBlockRegeneratorNode({ renderPrompt, invokeLLM });
    const update = await node(
      baseRegeneratorState({
        generatedBlocks: {
          block_2: generatedBlock('## 2. Анти-цели\n\n- Product roadmap\n- Legal terms', 1),
          block_5: generatedBlock('## 5. Матрица решений\n\n| a | b |\n| --- | --- |', 1),
        },
        lastJudgedBlockIds: ['block_2', 'block_5'],
        lastJudgeVerdict: {
          pass: false,
          score: 40,
          issues: [
            { block_id: 'block_2', severity: 'critical', description: 'x', suggestion: 'y' },
            { block_id: 'block_5', severity: 'critical', description: 'x', suggestion: 'y' },
          ],
          needs_regeneration: ['block_2', 'block_5'],
        },
        blockRegenerationAttempts: {},
      })
    );

    // Both attempted blocks consume exactly one attempt (success and failure alike).
    expect(update.blockRegenerationAttempts).toEqual({ block_2: 1, block_5: 1 });
    // Only the successful block lands in generatedBlocks and emits a node cost ...
    expect(Object.keys(update.generatedBlocks ?? {})).toEqual(['block_2']);
    expect(update.nodeCosts).toHaveLength(1);
    expect(update.nodeCosts?.[0]).toMatchObject({
      node: 'blockRegenerator',
      duration_ms: 1500,
      attempts: 1,
    });
    // ... while the failed block is retained with a warning and no error.
    expect(update.warnings).toHaveLength(1);
    expect(update.warnings?.[0]).toContain('blockRegenerator retained block_5');
    expect(update.errors).toBeUndefined();
  });

  it('threads duration and attempt telemetry into the regeneration node cost', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered regenerator prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: '## 6. KPI и метрики\n\n| Metric | Target |\n| --- | --- |',
      model: 'mock-career-model',
      inputTokens: 120,
      outputTokens: 80,
      costUsd: 0.02,
      durationMs: 4321,
      attemptCount: 2,
    });

    const result = await regenerateCareerPlaybookBlock(
      {
        blockId: 'block_6',
        roleProfileSpec: spec,
        language: 'ru',
        originalBlock: generatedBlock('## 6. KPI и метрики\n\nOld KPI text', 1),
        issue: { description: 'The KPI block repeats duties.', suggestion: 'Use metrics.' },
      },
      { renderPrompt, invokeLLM }
    );

    expect(result.nodeCost).toEqual({
      node: 'blockRegenerator',
      model: 'mock-career-model',
      input_tokens: 120,
      output_tokens: 80,
      cost_usd: 0.02,
      duration_ms: 4321,
      attempts: 2,
    });
  });
});

function baseRegeneratorState(overrides: {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  lastJudgedBlockIds: CareerPlaybookBlockId[];
  lastJudgeVerdict: NonNullable<
    Parameters<typeof selectPendingCareerPlaybookRegenerations>[0]['verdict']
  >;
  blockRegenerationAttempts: Partial<Record<CareerPlaybookBlockId, number>>;
}) {
  return {
    playbookId: 'playbook-1',
    userId: 'user-1',
    organizationId: 'org-1',
    language: 'ru',
    qaData: { fixed: [], followups: [], freeform: [] },
    roleProfileSpec: spec,
    webResearch: null,
    generatedGroups: {},
    generatedBlocks: overrides.generatedBlocks,
    judgeVerdicts: [],
    lastJudgeVerdict: overrides.lastJudgeVerdict,
    lastJudgedBlockIds: overrides.lastJudgedBlockIds,
    blockRegenerationAttempts: overrides.blockRegenerationAttempts,
    finalMarkdown: null,
    nodeCosts: [],
    errors: [],
    warnings: [],
    qualityIssues: [],
    currentNode: 'crossBlockJudge' as const,
  };
}
