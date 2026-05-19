import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookRoleProfileSpec } from '@megacampus/shared-types';
import {
  generateCareerPlaybookGroup,
  getCareerPlaybookGroupSpec,
  splitCareerPlaybookGroupMarkdown,
} from '@/stages/stage-career-playbook/nodes/group-generator';

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
    block_1: { primary_topics: ['mission'], do_not_repeat: ['decision authority'] },
    block_2: { primary_topics: ['anti-goals'], do_not_repeat: ['duties'] },
    block_5: { primary_topics: ['decision authority'], do_not_repeat: ['competencies'] },
  },
  content_language: 'ru',
};

const groupOneMarkdown = `## Header

# B2B Sales Manager: операционный playbook

**North Star Metric:** Qualified pipeline

## 1. Миссия и ключевые результаты

| KR | Метрика |
| --- | --- |
| Pipeline quality | 3x coverage |

## 2. Анти-цели: что эта роль НЕ делает

| Анти-цель | Чья ответственность |
| --- | --- |
| Product roadmap | Product |
| Legal approvals | Legal |
| Support tickets | Support |
| Hiring plan | CRO |

## 5. Матрица решений (Decision Authority)

| Решение | Уровень автономии | Действие |
| --- | --- | --- |
| Daily priorities | Full autonomy | Decide |
| Discount 10% | Inform | Use policy |
| Discount 20% | Recommend | Ask CRO |
| Legal terms | Approval | Ask Legal |
`;

describe('Career Playbook group generator', () => {
  it('defines group 1 as Header + blocks 1, 2, and 5', () => {
    const group = getCareerPlaybookGroupSpec('group_1_foundation');

    expect(group.promptKey).toBe('career_playbook_group_1_foundation');
    expect(group.blocks.map(block => block.blockId)).toEqual([
      'header',
      'block_1',
      'block_2',
      'block_5',
    ]);
  });

  it('generates group 1 blocks through the prompt service and mock LLM', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: groupOneMarkdown,
      model: 'mock-career-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.012,
    });

    const result = await generateCareerPlaybookGroup(
      {
        groupKey: 'group_1_foundation',
        roleProfileSpec: spec,
        language: 'ru',
      },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_group_1_foundation',
      expect.objectContaining({
        spec_json: expect.stringContaining('B2B Sales Manager'),
        content_language: 'ru',
      })
    );
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered prompt',
      expect.objectContaining({
        phaseName: 'stage_career_playbook_group_1',
        promptKey: 'career_playbook_group_1_foundation',
      })
    );
    expect(result.blocks.header.content).toContain('операционный playbook');
    expect(result.blocks.block_2.content).toContain('Анти-цели');
    expect(result.blocks.block_5.status).toBe('generated');
    expect(result.nodeCost).toEqual({
      node: 'group1Generator',
      model: 'mock-career-model',
      input_tokens: 100,
      output_tokens: 200,
      cost_usd: 0.012,
    });
  });

  it('passes localized English heading labels into group prompts', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: `## Header

# B2B Sales Manager

## 1. Mission and key results

Mission text

## 2. Anti-goals: what this role does NOT do

Anti-goals text

## 5. Decision authority matrix

Decision text`,
      model: 'mock-career-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.012,
    });

    await generateCareerPlaybookGroup(
      {
        groupKey: 'group_1_foundation',
        roleProfileSpec: { ...spec, content_language: 'en' },
        language: 'en',
      },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_group_1_foundation',
      expect.objectContaining({
        heading_header: '## Header',
        heading_block_1: '## 1. Mission and key results',
        heading_block_2: '## 2. Anti-goals: what this role does NOT do',
        heading_block_5: '## 5. Decision authority matrix',
      })
    );
  });

  it('rejects group markdown that omits required block headings', () => {
    const group = getCareerPlaybookGroupSpec('group_1_foundation');

    expect(() =>
      splitCareerPlaybookGroupMarkdown(
        `## Header

# B2B Sales Manager

## 1. Миссия и ключевые результаты

Mission text

## 5. Матрица решений (Decision Authority)

Decision text`,
        group
      )
    ).toThrow('Career Playbook group group_1_foundation is missing blocks: block_2');
  });
});
