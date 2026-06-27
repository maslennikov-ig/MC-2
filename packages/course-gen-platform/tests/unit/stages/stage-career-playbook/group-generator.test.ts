import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookQAData, CareerPlaybookRoleProfileSpec } from '@megacampus/shared-types';
import {
  generateCareerPlaybookGroup,
  getCareerPlaybookGroupSpec,
  splitCareerPlaybookGroupMarkdown,
} from '@/stages/stage-career-playbook/nodes/group-generator';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';

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

const groupSixMarkdown = `## 18. FAQ

| Вопрос | Ответ |
| --- | --- |
| Как понять успех? | По KPI и Definition of Done |

## 22. "Как со мной работать" (заполняется сотрудником)

**Мой стиль общения:** {заполните}

## 23. Протокол непрерывности ("Hit by a Bus")

| Функция | Основной | Дублёр | Последнее обучение |
| --- | --- | --- | --- |
| CRM handoff | Эта роль | Sales Ops | {дата} |

## 24. Role Canvas

| Миссия | Метрики |
| --- | --- |
| Рост выручки | Pipeline |

## 25. Когда пересматривать эту инструкцию

Версия: 1.0

## 26. Implementation checklist

- Manager reviews role canvas
- HR schedules calibration
`;

const businessContextQaData: CareerPlaybookQAData = {
  fixed: [],
  followups: [],
  freeform: [],
  business_context: {
    mode: 'company_specific',
    status: 'ready',
    digest: {
      product: ['B2B SaaS платформа для корпоративного обучения и генерации курсов.'],
      customers: ['ICP: HRD, L&D, руководители отделов продаж и поддержки.'],
      sales_channels: ['Блог, вебинары, email, VK/Telegram, YouTube, кейсы.'],
      processes: ['SLA обратной связи продаж: 24-48 часов.'],
      metrics: [
        'Целевой объём: 80 MQL/месяц.',
        'CVR контент → лид: 2.5%.',
        'Pipeline influenced revenue: 12%.',
      ],
      org_structure: ['Контент-менеджер руководит 1-3 контент-специалистами.'],
      constraints: ['Не использовать неподтверждённые KPI как факт, если их нет в источниках.'],
      source_ids: ['00000000-0000-4000-8000-000000000301'],
      missing_signals: [],
      user_edited: true,
    },
    source_ids: ['00000000-0000-4000-8000-000000000301'],
  },
};

function promptHeadingLines(promptKey: string): string[] {
  const prompt = careerPlaybookPrompts.find(entry => entry.promptKey === promptKey);
  if (!prompt) {
    return [];
  }

  const headingsSection = prompt.promptTemplate.match(
    /Use exactly these top-level headings:\n(?<headings>(?:(?:## .+|\{\{heading_[^}]+}})\n?)+)\nUSER:/
  );

  return (
    headingsSection?.groups?.headings
      .trim()
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed === '{{heading_header}}') return '## Header';
        const variableMatch = /^\{\{heading_block_(\d+)}}$/.exec(trimmed);
        return variableMatch ? `## ${variableMatch[1]}. Heading` : trimmed;
      }) ?? []
  );
}

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

  it('defines group 3 as People with deterministic node and phase names', () => {
    const group = getCareerPlaybookGroupSpec('group_3_people');

    expect(group.promptKey).toBe('career_playbook_group_3_people');
    expect(group.phaseName).toBe('stage_career_playbook_group_3');
    expect(group.node).toBe('group3Generator');
    expect(group.blocks.map(block => block.blockId)).toEqual([
      'block_7',
      'block_9',
      'block_12',
      'block_13',
    ]);
  });

  it('defines group 6 as Wrap with deterministic node and phase names', () => {
    const group = getCareerPlaybookGroupSpec('group_6_wrap');

    expect(group.promptKey).toBe('career_playbook_group_6_wrap');
    expect(group.phaseName).toBe('stage_career_playbook_group_6');
    expect(group.node).toBe('group6Generator');
    expect(group.blocks.map(block => block.blockId)).toEqual([
      'block_18',
      'block_22',
      'block_23',
      'block_24',
      'block_25',
      'block_26',
    ]);
  });

  it('registers group 3-6 prompts with headings that match their group specs', () => {
    for (const groupKey of [
      'group_3_people',
      'group_4_growth',
      'group_5_system',
      'group_6_wrap',
    ] as const) {
      const group = getCareerPlaybookGroupSpec(groupKey);
      const headings = promptHeadingLines(group.promptKey);

      expect(headings).toHaveLength(group.blocks.length);
      expect(headings).toEqual(
        group.blocks.map(block => expect.stringMatching(block.headingPattern))
      );
    }
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

  it('annotates generated numeric facts with business-context provenance', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: `## Header

# Контент-менеджер: должностная инструкция

## 1. Миссия и ключевые результаты

| KR | Метрика |
| --- | --- |
| Лидогенерация через контент | 80 MQL/месяц |
| Конверсия контента | CVR контент → лид 2.5% |
| Улучшение воронки | Рост CVR на 25% |

## 2. Анти-цели: что эта роль НЕ делает

| Анти-цель | Чья ответственность |
| --- | --- |
| Product roadmap | Product |
| Legal approvals | Legal |

## 5. Матрица решений (Decision Authority)

| Решение | Уровень автономии | Действие |
| --- | --- | --- |
| Обычные материалы | Full autonomy | Утвердить |
| Чувствительные темы | Approval | Legal/Product review |
`,
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
        qaData: businessContextQaData,
      } as Parameters<typeof generateCareerPlaybookGroup>[0],
      { renderPrompt, invokeLLM }
    );

    expect(result.blocks.block_1.numeric_facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw_text: '80',
          status: 'verified',
          source: 'source_document',
        }),
        expect.objectContaining({
          raw_text: '2.5%',
          status: 'verified',
          source: 'source_document',
        }),
        expect.objectContaining({
          raw_text: '25%',
          status: 'needs_review',
          source: 'model_suggestion',
        }),
      ])
    );
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

  it('passes localized heading labels into later group prompts', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: groupSixMarkdown,
      model: 'mock-career-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.012,
    });

    await generateCareerPlaybookGroup(
      {
        groupKey: 'group_6_wrap',
        roleProfileSpec: spec,
        language: 'ru',
      },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_group_6_wrap',
      expect.objectContaining({
        heading_block_18: '## 18. Частые вопросы',
        heading_block_23: '## 23. Протокол непрерывности',
        heading_block_24: '## 24. Карта роли',
        heading_block_26: '## 26. Чеклист внедрения',
      })
    );
  });

  it('fills missing model-output blocks with safe fallback content and quality issues', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: groupSixMarkdown.replace(
        `## 18. FAQ

| Вопрос | Ответ |
| --- | --- |
| Как понять успех? | По KPI и Definition of Done |

`,
        ''
      ),
      model: 'mock-career-model',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.012,
    });

    const result = await generateCareerPlaybookGroup(
      {
        groupKey: 'group_6_wrap',
        roleProfileSpec: spec,
        language: 'ru',
      },
      { renderPrompt, invokeLLM }
    );

    expect(result.blocks.block_18.content).toContain('## 18. Частые вопросы');
    expect(result.blocks.block_18.content).toContain('восстановлен автоматически');
    expect(result.qualityIssues).toContainEqual(
      expect.objectContaining({
        source: 'system',
        severity: 'critical',
        blockId: 'block_18',
        action: 'regenerate',
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

  it('rejects later group markdown that omits required block headings', () => {
    const group = getCareerPlaybookGroupSpec('group_6_wrap');

    expect(() =>
      splitCareerPlaybookGroupMarkdown(
        groupSixMarkdown.replace(
          `## 24. Role Canvas

| Миссия | Метрики |
| --- | --- |
| Рост выручки | Pipeline |

`,
          ''
        ),
        group
      )
    ).toThrow('Career Playbook group group_6_wrap is missing blocks: block_24');
  });
});
