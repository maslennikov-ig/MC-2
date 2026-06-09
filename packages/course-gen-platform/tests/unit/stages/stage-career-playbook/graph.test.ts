import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookQAData, CareerPlaybookRoleProfileSpec } from '@megacampus/shared-types';
import { createCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';

const qaData: CareerPlaybookQAData = {
  fixed: [
    { question_key: 'position', value: 'B2B Sales Manager' },
    { question_key: 'department', value: 'sales' },
    { question_key: 'level', value: 'senior' },
    { question_key: 'team_size', value: '51-200' },
    { question_key: 'reporting', value: 'Reports to CRO. Leads 3 SDRs.' },
  ],
  followups: [],
  freeform: [{ text: 'Enterprise sales, consultative deals, CRM discipline.' }],
};

const roleProfileSpec: CareerPlaybookRoleProfileSpec = {
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
    anti_goals: ['Own product roadmap', 'Approve legal terms', 'Own support', 'Approve legal'],
    failure_patterns: ['Poor CRM hygiene', 'Discount-first selling', 'Weak forecasting'],
  },
  research: null,
  block_boundaries: {},
  content_language: 'ru',
};

const groupMarkdownByPromptKey: Record<string, string> = {
  career_playbook_group_1_foundation: `## Header

# B2B Sales Manager

## 1. Миссия и ключевые результаты

Mission

## 2. Анти-цели: что эта роль НЕ делает

- Product roadmap
- Legal approval
- Support ownership
- Hiring plan

## 5. Матрица решений (Decision Authority)

| Decision | Owner |
| --- | --- |
| Daily priority | Role |
| Discount 10% | Role |
| Discount 20% | CRO |
| Legal terms | Legal |`,
  career_playbook_group_2_operations: `## 3. Ключевые зоны ответственности

Responsibilities

## 4. Обязанности

Duties

## 6. KPI и метрики

KPIs

## 8. Инструменты и технологии

Tools`,
  career_playbook_group_3_people: `## 7. Компетенции

Competencies

## 9. Human-AI Collaboration

AI collaboration

## 12. Candidate profile

Candidate

## 13. Day in the life

Day`,
  career_playbook_group_4_growth: `## 11. Карьерная траектория

Career path

### Career Path Diagram

\`\`\`mermaid
flowchart LR
  Seller --> Manager
\`\`\`

## 14. Онбординг

Onboarding

## 15. Мотивация

Motivation

## 17. Red flags

Red flags`,
  career_playbook_group_5_system: `## 10. Зависимости

Dependencies

### Dependencies Diagram

\`\`\`mermaid
flowchart LR
  CRO --> Sales
\`\`\`

## 16. Процессы

Processes

### Main Process Diagram

\`\`\`mermaid
flowchart TD
  Lead --> Deal
\`\`\`

## 19. Industry context

Industry

## 20. Business model

Business

## 21. Failure modes

- Poor CRM hygiene
- Discount-first selling
- Weak forecasting`,
  career_playbook_group_6_wrap: `## 18. FAQ

FAQ

## 22. Role README

README

## 23. Continuity plan

Continuity

## 24. Role Canvas

Canvas

## 25. Footer

Footer

## 26. Implementation checklist

Checklist`,
};

const groupPromptKeys = [
  'career_playbook_group_1_foundation',
  'career_playbook_group_2_operations',
  'career_playbook_group_3_people',
  'career_playbook_group_4_growth',
  'career_playbook_group_5_system',
  'career_playbook_group_6_wrap',
];

function initialGraphState() {
  return {
    playbookId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000003',
    language: 'ru',
    qaData,
    currentNode: 'specBuilder' as const,
  };
}

describe('Career Playbook graph', () => {
  it('runs all six generation groups and assembles final markdown', async () => {
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockImplementation((prompt: string) =>
        Promise.resolve({
          content:
            prompt === 'career_playbook_spec_builder'
              ? JSON.stringify(roleProfileSpec)
              : (groupMarkdownByPromptKey[prompt] ?? JSON.stringify({ pass: true, score: 95 })),
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        })
      ),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    const result = await graph.invoke(initialGraphState());
    const generatedGroups = result.generatedGroups as Record<string, unknown>;
    const graphResult = result as typeof result & { finalMarkdown?: string | null };

    expect(generatedGroups.group_6_wrap).toBeDefined();
    expect(graphResult.finalMarkdown).toContain('## 26. Implementation checklist');
    expect(graphResult.finalMarkdown).toContain('```mermaid');
    expect(result.judgeVerdicts[0]?.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('runs the cross-block judge immediately after each group before advancing', async () => {
    const invokedPrompts: string[] = [];
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockImplementation((prompt: string) => {
        invokedPrompts.push(prompt);
        return Promise.resolve({
          content:
            prompt === 'career_playbook_spec_builder'
              ? JSON.stringify(roleProfileSpec)
              : (groupMarkdownByPromptKey[prompt] ?? JSON.stringify({ pass: true, score: 95 })),
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        });
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    await graph.invoke(initialGraphState());

    for (const groupPromptKey of groupPromptKeys) {
      const groupIndex = invokedPrompts.indexOf(groupPromptKey);
      expect(groupIndex).toBeGreaterThan(-1);
      expect(invokedPrompts[groupIndex + 1]).toBe('career_playbook_cross_block_judge');
    }
  });

  it('reports user-visible generation progress before long-running graph stages', async () => {
    const progressReporter = vi.fn();
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockImplementation((prompt: string) =>
        Promise.resolve({
          content:
            prompt === 'career_playbook_spec_builder'
              ? JSON.stringify(roleProfileSpec)
              : (groupMarkdownByPromptKey[prompt] ?? JSON.stringify({ pass: true, score: 95 })),
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        })
      ),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
      progressReporter,
    });

    await graph.invoke(initialGraphState());

    expect(progressReporter).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'building_profile', percent: 72 })
    );
    expect(progressReporter).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'generating_foundation', percent: 76 })
    );
    expect(progressReporter).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'assembling', percent: 98 })
    );
  });

  it('routes failed group judge verdicts through targeted block regeneration before the next group', async () => {
    const invokedPrompts: string[] = [];
    let judgeCalls = 0;
    const groupOneWithTooFewAntiGoals = groupMarkdownByPromptKey[
      'career_playbook_group_1_foundation'
    ].replace('- Support ownership\n- Hiring plan\n', '');
    const regeneratedAntiGoals = `## 2. Анти-цели: что эта роль НЕ делает

- Product roadmap
- Legal approval
- Support ownership
- Hiring plan`;
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockImplementation((prompt: string) => {
        invokedPrompts.push(prompt);
        if (prompt === 'career_playbook_spec_builder') {
          return Promise.resolve({
            content: JSON.stringify(roleProfileSpec),
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_group_1_foundation') {
          return Promise.resolve({
            content: groupOneWithTooFewAntiGoals,
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_block_regenerator') {
          return Promise.resolve({
            content: regeneratedAntiGoals,
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_cross_block_judge') {
          judgeCalls += 1;
          return Promise.resolve({
            content: JSON.stringify({ pass: true, score: 95 }),
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }

        return Promise.resolve({
          content: groupMarkdownByPromptKey[prompt],
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        });
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    const result = await graph.invoke(initialGraphState());
    const regeneratedIndex = invokedPrompts.indexOf('career_playbook_block_regenerator');
    const group2Index = invokedPrompts.indexOf('career_playbook_group_2_operations');

    expect(regeneratedIndex).toBeGreaterThan(-1);
    expect(regeneratedIndex).toBeLessThan(group2Index);
    expect(result.generatedBlocks.block_2?.content).toBe(regeneratedAntiGoals);
    expect(judgeCalls).toBeGreaterThanOrEqual(7);
  });

  it('consumes regeneration attempts when regenerated markdown is invalid and then advances with warning', async () => {
    const invokedPrompts: string[] = [];
    const groupOneWithTooFewAntiGoals = groupMarkdownByPromptKey[
      'career_playbook_group_1_foundation'
    ].replace('- Support ownership\n- Hiring plan\n', '');
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockImplementation((prompt: string) => {
        invokedPrompts.push(prompt);
        if (prompt === 'career_playbook_spec_builder') {
          return Promise.resolve({
            content: JSON.stringify(roleProfileSpec),
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_group_1_foundation') {
          return Promise.resolve({
            content: groupOneWithTooFewAntiGoals,
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_block_regenerator') {
          return Promise.resolve({
            content: '## 7. Wrong block\n\nInvalid regenerated markdown.',
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_cross_block_judge') {
          return Promise.resolve({
            content: JSON.stringify({ pass: true, score: 95 }),
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }

        return Promise.resolve({
          content: groupMarkdownByPromptKey[prompt],
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        });
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    const result = await graph.invoke(initialGraphState());
    const regenerationCalls = invokedPrompts.filter(
      prompt => prompt === 'career_playbook_block_regenerator'
    );

    expect(regenerationCalls).toHaveLength(2);
    expect(invokedPrompts.indexOf('career_playbook_group_2_operations')).toBeGreaterThan(
      invokedPrompts.lastIndexOf('career_playbook_block_regenerator')
    );
    expect(result.blockRegenerationAttempts.block_2).toBe(2);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('blockRegenerator retained block_2');
    expect(result.errors).toEqual([]);
  });
});
