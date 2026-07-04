import { describe, expect, it, vi } from 'vitest';
import { END } from '@langchain/langgraph';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookQAData,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  CAREER_PLAYBOOK_GRAPH_BASE_STEP_COUNT,
  DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT,
  createCareerPlaybookGraph,
  getCareerPlaybookGraphRecursionLimit,
  routeAfterBlockRegeneration,
} from '@/stages/stage-career-playbook/graph';
import { CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS } from '@/stages/stage-career-playbook/nodes/block-regenerator';
import { CAREER_PLAYBOOK_FINAL_BLOCK_ORDER } from '@/stages/stage-career-playbook/nodes/final-assembler';
import { getCareerPlaybookGroupSpec } from '@/stages/stage-career-playbook/nodes/group-generator';
import type { CareerPlaybookGraphStateType } from '@/stages/stage-career-playbook/state';

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

## 13. Один день из жизни роли

День`,
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
  it('derives a recursion limit that covers bounded block regeneration loops', () => {
    const expectedLimit =
      CAREER_PLAYBOOK_GRAPH_BASE_STEP_COUNT +
      CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.length *
        CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS *
        2 +
      5;

    expect(DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT).toBe(expectedLimit);
    expect(DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT).toBeGreaterThan(25);
    expect(getCareerPlaybookGraphRecursionLimit('26')).toBe(
      DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT
    );
    expect(getCareerPlaybookGraphRecursionLimit('200')).toBe(200);
  });

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

  it('stops after specBuilder failure instead of advancing without roleProfileSpec', async () => {
    const progressReporter = vi.fn();
    const runtime = {
      renderPrompt: vi.fn().mockImplementation((promptKey: string) => Promise.resolve(promptKey)),
      invokeLLM: vi.fn().mockResolvedValue({
        content: JSON.stringify({ position: 'B2B Sales Manager', block_boundaries: [] }),
        model: 'mock-career-model',
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
      progressReporter,
    });

    const result = await graph.invoke(initialGraphState());

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('specBuilder failed');
    expect(result.errors[0]).not.toContain('group1Generator');
    expect(result.currentNode).toBe('specBuilder');
    expect(progressReporter).toHaveBeenCalledTimes(1);
    expect(progressReporter).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'building_profile', percent: 72 })
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
    expect(
      result.warnings.filter(warning => warning.includes('blockRegenerator retained block_2'))
    ).toHaveLength(2);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('crossBlockJudge advanced after max regeneration attempts')
    );
    expect(result.errors).toEqual([]);
  });

  it('caps repeated regeneration within one judge window before advancing', async () => {
    const invokedPrompts: string[] = [];
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
            content: groupMarkdownByPromptKey.career_playbook_group_1_foundation,
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_block_regenerator') {
          return Promise.resolve({
            content: `## 5. Матрица решений (Decision Authority)

| Decision | Owner |
| --- | --- |
| Daily priority | Role |
| Discount 10% | Role |
| Discount 20% | CRO |
| Legal terms | Legal |`,
            model: 'mock-career-model',
            inputTokens: 10,
            outputTokens: 20,
            costUsd: 0.001,
          });
        }
        if (prompt === 'career_playbook_cross_block_judge') {
          return Promise.resolve({
            content: JSON.stringify({
              pass: false,
              score: 60,
              issues: [
                {
                  block_id: 'block_5',
                  severity: 'critical',
                  description: 'Decision matrix is still too generic.',
                  suggestion: 'Regenerate block 5.',
                },
              ],
              needs_regeneration: ['block_5'],
            }),
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
    expect(result.warnings).toContainEqual(
      expect.stringContaining('crossBlockJudge advanced after max regeneration attempts')
    );
    expect(result.errors).toEqual([]);
  });

  it('registers the full data-driven node topology derived from the group pipeline', async () => {
    const runtime = {
      renderPrompt: vi.fn().mockResolvedValue(''),
      invokeLLM: vi.fn().mockResolvedValue({
        content: '',
        model: 'mock-career-model',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      }),
    };
    const graph = createCareerPlaybookGraph({ runtime });
    const drawable = await graph.getGraphAsync();
    const nodeNames = new Set(Object.values(drawable.nodes).map(node => node.name));

    const expectedNodeNames = [
      'specBuilder',
      'group1Generator',
      'group2Generator',
      'group3Generator',
      'group4Generator',
      'group5Generator',
      'group6Generator',
      'group1Judge',
      'group2Judge',
      'group3Judge',
      'group4Judge',
      'group5Judge',
      'group6Judge',
      'blockRegenerator',
      'finalAssembler',
      'finalJudge',
    ];

    for (const expectedNodeName of expectedNodeNames) {
      expect(nodeNames.has(expectedNodeName)).toBe(true);
    }
  });

  it('re-derives finalMarkdown after a post-assembly finalJudge regeneration', async () => {
    const regeneratedFaqBlock = `## 18. FAQ

REGENERATED_FAQ_TOKEN_N1: обновлённый ответ, сформированный уже после финальной сборки.`;
    const passVerdict = JSON.stringify({
      pass: true,
      score: 95,
      issues: [],
      needs_regeneration: [],
    });
    const failFinalVerdict = JSON.stringify({
      pass: false,
      score: 60,
      issues: [
        {
          block_id: 'block_18',
          severity: 'critical',
          description: 'FAQ block is too generic and must be regenerated.',
          suggestion: 'Rewrite the FAQ with concrete answers.',
        },
      ],
      needs_regeneration: ['block_18'],
    });

    let finalJudgeCalls = 0;
    const runtime = {
      renderPrompt: vi
        .fn()
        .mockImplementation((promptKey: string, variables?: Record<string, string>) =>
          Promise.resolve(
            promptKey === 'career_playbook_cross_block_judge'
              ? `career_playbook_cross_block_judge::${variables?.group_id ?? ''}`
              : promptKey
          )
        ),
      invokeLLM: vi.fn().mockImplementation((prompt: string) => {
        const build = (content: string) => ({
          content,
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        });

        if (prompt === 'career_playbook_spec_builder') {
          return Promise.resolve(build(JSON.stringify(roleProfileSpec)));
        }
        if (prompt === 'career_playbook_block_regenerator') {
          return Promise.resolve(build(regeneratedFaqBlock));
        }
        if (prompt.startsWith('career_playbook_cross_block_judge')) {
          // Only the final judge spans the whole document (header .. block_26);
          // group judges scope to a single group.
          const isFinalJudge = prompt.includes('header') && prompt.includes('block_26');
          if (!isFinalJudge) {
            return Promise.resolve(build(passVerdict));
          }
          finalJudgeCalls += 1;
          return Promise.resolve(build(finalJudgeCalls === 1 ? failFinalVerdict : passVerdict));
        }

        return Promise.resolve(build(groupMarkdownByPromptKey[prompt] ?? passVerdict));
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    const result = await graph.invoke(initialGraphState());
    const graphResult = result as typeof result & { finalMarkdown?: string | null };
    const regeneratedBlock = result.generatedBlocks.block_18;

    // The final judge requested one post-assembly regeneration and then passed.
    expect(finalJudgeCalls).toBe(2);
    expect(result.blockRegenerationAttempts.block_18).toBe(1);
    expect(result.errors).toEqual([]);

    // generatedBlocks holds the regenerated FAQ content ...
    expect(regeneratedBlock?.content).toContain('REGENERATED_FAQ_TOKEN_N1');
    // ... and finalMarkdown was re-derived from it instead of staying stale.
    expect(graphResult.finalMarkdown).toContain('REGENERATED_FAQ_TOKEN_N1');
    expect(graphResult.finalMarkdown).toContain(regeneratedBlock?.content.trim() ?? '');
  });

  it('regenerates every block a single judge flags in one batch before the next judge call', async () => {
    // Group 1 comes back with both block_2 (2 anti-goals) and block_5 (2 decision rows)
    // below the deterministic minimum, so one judge verdict flags both blocks at once.
    const groupOneWithTwoWeakBlocks = `## Header

# B2B Sales Manager

## 1. Миссия и ключевые результаты

Mission

## 2. Анти-цели: что эта роль НЕ делает

- Product roadmap
- Legal approval

## 5. Матрица решений (Decision Authority)

| Decision | Owner |
| --- | --- |
| Daily priority | Role |
| Discount 10% | Role |`;
    const regeneratedBlock2 = `## 2. Анти-цели: что эта роль НЕ делает

- Product roadmap
- Legal approval
- Support ownership
- Hiring plan`;
    const regeneratedBlock5 = `## 5. Матрица решений (Decision Authority)

| Decision | Owner |
| --- | --- |
| Daily priority | Role |
| Discount 10% | Role |
| Discount 20% | CRO |
| Legal terms | Legal |`;

    const invokedPrompts: string[] = [];
    const runtime = {
      renderPrompt: vi
        .fn()
        .mockImplementation((promptKey: string, variables?: Record<string, string>) =>
          Promise.resolve(
            promptKey === 'career_playbook_block_regenerator'
              ? `career_playbook_block_regenerator::${variables?.block_id ?? ''}`
              : promptKey
          )
        ),
      invokeLLM: vi.fn().mockImplementation((prompt: string) => {
        invokedPrompts.push(prompt);
        const build = (content: string) => ({
          content,
          model: 'mock-career-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.001,
        });

        if (prompt === 'career_playbook_spec_builder') {
          return Promise.resolve(build(JSON.stringify(roleProfileSpec)));
        }
        if (prompt === 'career_playbook_group_1_foundation') {
          return Promise.resolve(build(groupOneWithTwoWeakBlocks));
        }
        if (prompt === 'career_playbook_block_regenerator::block_2') {
          return Promise.resolve(build(regeneratedBlock2));
        }
        if (prompt === 'career_playbook_block_regenerator::block_5') {
          return Promise.resolve(build(regeneratedBlock5));
        }
        if (prompt === 'career_playbook_cross_block_judge') {
          return Promise.resolve(build(JSON.stringify({ pass: true, score: 95 })));
        }

        return Promise.resolve(build(groupMarkdownByPromptKey[prompt]));
      }),
    };
    const graph = createCareerPlaybookGraph({
      runtime,
      specBuilder: { webResearch: { client: () => Promise.resolve([]) } },
    });

    const result = await graph.invoke(initialGraphState());

    const g1Index = invokedPrompts.indexOf('career_playbook_group_1_foundation');
    const g2Index = invokedPrompts.indexOf('career_playbook_group_2_operations');
    const windowPrompts = invokedPrompts.slice(g1Index + 1, g2Index);
    const judgeCallsInWindow = windowPrompts.filter(
      prompt => prompt === 'career_playbook_cross_block_judge'
    ).length;
    const block2RegenIndex = windowPrompts.indexOf('career_playbook_block_regenerator::block_2');
    const block5RegenIndex = windowPrompts.indexOf('career_playbook_block_regenerator::block_5');

    // Both blocks are regenerated ...
    expect(block2RegenIndex).toBeGreaterThan(-1);
    expect(block5RegenIndex).toBeGreaterThan(-1);
    // ... in one batch (adjacent, no judge call between them) ...
    expect(Math.abs(block2RegenIndex - block5RegenIndex)).toBe(1);
    // ... so the window needs only two judge calls (flag + re-judge), not three.
    expect(judgeCallsInWindow).toBe(2);
    expect(result.generatedBlocks.block_2?.content).toBe(regeneratedBlock2);
    expect(result.generatedBlocks.block_5?.content).toBe(regeneratedBlock5);
    expect(result.errors).toEqual([]);
  });
});

describe('routeAfterBlockRegeneration', () => {
  const group1BlockIds = getCareerPlaybookGroupSpec('group_1_foundation').blocks.map(
    block => block.blockId
  );

  function routeState(overrides: {
    lastRegenerationBatchSize: number;
    lastJudgedBlockIds: CareerPlaybookBlockId[];
  }): CareerPlaybookGraphStateType {
    return {
      lastRegenerationBatchSize: overrides.lastRegenerationBatchSize,
      lastJudgedBlockIds: overrides.lastJudgedBlockIds,
    } as CareerPlaybookGraphStateType;
  }

  it('advances a group window to the next generator when the regenerator pass changed nothing', () => {
    // Zero eligible blocks (all flagged blocks at their per-block/window cap) -> re-judging
    // identical content is redundant, so the group advances instead of returning to its judge.
    const next = routeAfterBlockRegeneration(
      routeState({ lastRegenerationBatchSize: 0, lastJudgedBlockIds: group1BlockIds })
    );

    expect(next).toBe('group2Generator');
    expect(next).not.toBe('group1Judge');
  });

  it('re-judges a group window when the regenerator pass regenerated at least one block', () => {
    const next = routeAfterBlockRegeneration(
      routeState({ lastRegenerationBatchSize: 1, lastJudgedBlockIds: group1BlockIds })
    );

    expect(next).toBe('group1Judge');
  });

  it('ends the final judge window when the post-assembly regenerator pass changed nothing', () => {
    // The final window spans the whole document, so no group matches; a zero-change pass
    // ends directly instead of re-assembling and re-judging identical content.
    const next = routeAfterBlockRegeneration(
      routeState({
        lastRegenerationBatchSize: 0,
        lastJudgedBlockIds: [...CAREER_PLAYBOOK_FINAL_BLOCK_ORDER],
      })
    );

    expect(next).toBe(END);
    expect(next).not.toBe('finalAssembler');
  });

  it('re-assembles the final window when the post-assembly regenerator pass changed a block', () => {
    const next = routeAfterBlockRegeneration(
      routeState({
        lastRegenerationBatchSize: 1,
        lastJudgedBlockIds: [...CAREER_PLAYBOOK_FINAL_BLOCK_ORDER],
      })
    );

    expect(next).toBe('finalAssembler');
  });
});
