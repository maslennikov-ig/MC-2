import { describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  buildOtherBlocksBrief,
  regenerateCareerPlaybookBlock,
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
});
