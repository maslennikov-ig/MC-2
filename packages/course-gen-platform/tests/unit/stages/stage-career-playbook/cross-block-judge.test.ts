import { describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  countMermaidDiagrams,
  createCrossBlockJudgeNode,
  parseCareerPlaybookJudgeVerdict,
  runCareerPlaybookDeterministicChecks,
  validateMermaidCoverage,
} from '@/stages/stage-career-playbook/nodes/cross-block-judge';

function block(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: '2026-05-13T00:00:00.000Z',
    llm_model: 'mock-model',
    attempt: 1,
  };
}

function blocks(
  entries: Array<[CareerPlaybookBlockId, string]>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(entries.map(([blockId, content]) => [blockId, block(content)]));
}

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
  },
  focus_areas: {
    primary_kpis: ['Qualified pipeline', 'Closed revenue', 'Win rate'],
    key_tools: ['CRM', 'Sales engagement'],
    critical_competencies: ['Discovery', 'Negotiation', 'Forecasting'],
    anti_goals: ['Own product roadmap', 'Approve legal terms', 'Handle support', 'Own hiring'],
    failure_patterns: ['Poor CRM hygiene', 'Discount-first selling', 'Weak discovery'],
  },
  research: null,
  block_boundaries: {},
  content_language: 'ru',
};

describe('Career Playbook cross-block judge', () => {
  it('flags Phase 3 minimum item failures for anti-goals, decisions, and failure modes', () => {
    const verdict = runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_2',
          `## 2. Анти-цели

| Анти-цель | Владелец |
| --- | --- |
| Product roadmap | Product |
| Legal terms | Legal |
| Support tickets | Support |`,
        ],
        [
          'block_5',
          `## 5. Матрица решений

| Решение | Автономия | Действие |
| --- | --- | --- |
| Daily priorities | Full | Decide |
| Discount 10% | Inform | Use policy |
| Legal terms | Approval | Ask Legal |`,
        ],
        [
          'block_21',
          `## 21. Failure Modes

- Poor CRM hygiene
- Discount-first selling`,
        ],
      ]),
    });

    expect(verdict.pass).toBe(false);
    expect(verdict.needs_regeneration).toEqual(['block_2', 'block_5', 'block_21']);
    expect(verdict.issues.map(issue => issue.block_id)).toEqual(['block_2', 'block_5', 'block_21']);
    expect(verdict.issues[0].description).toContain('at least 4 anti-goals');
  });

  it('checks Mermaid diagram count and required block coverage only for present applicable blocks', () => {
    const generatedBlocks = blocks([
      [
        'block_10',
        `## 10. Dependencies

\`\`\`mermaid
flowchart LR
  Sales --> Product
\`\`\``,
      ],
      [
        'block_11',
        `## 11. Career path

No diagram yet.`,
      ],
      [
        'block_16',
        `## 16. Main process

\`\`\`mermaid
flowchart TB
  Lead --> Deal
\`\`\``,
      ],
    ]);

    const coverage = validateMermaidCoverage(generatedBlocks);

    expect(
      countMermaidDiagrams(
        Object.values(generatedBlocks)
          .map(item => item?.content)
          .join('\n')
      )
    ).toBe(2);
    expect(coverage).toEqual([
      expect.objectContaining({
        block_id: 'block_11',
        severity: 'critical',
        description: expect.stringContaining('career path'),
      }),
    ]);
  });

  it('parses fenced LLM judge JSON with pass, score, issues, and needs_regeneration', () => {
    const parsed = parseCareerPlaybookJudgeVerdict(`\`\`\`json
{
  "pass": false,
  "score": 72,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "warning",
      "description": "Decision matrix lacks legal escalation.",
      "suggestion": "Add a Legal owner row."
    }
  ],
  "needs_regeneration": ["block_5"]
}
\`\`\``);

    expect(parsed.pass).toBe(false);
    expect(parsed.score).toBe(72);
    expect(parsed.issues[0]).toMatchObject({
      block_id: 'block_5',
      severity: 'warning',
    });
    expect(parsed.needs_regeneration).toEqual(['block_5']);
  });

  it('attaches deterministic and optional LLM verdicts to judged blocks', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        pass: false,
        score: 81,
        issues: [
          {
            block_id: 'block_5',
            severity: 'warning',
            description: 'Autonomy levels are too generic.',
          },
        ],
        needs_regeneration: ['block_5'],
      }),
      model: 'mock-judge-model',
      inputTokens: 50,
      outputTokens: 40,
      costUsd: 0.004,
    });

    const node = createCrossBlockJudgeNode({
      currentBlockIds: ['block_2', 'block_5'],
      useLLMJudge: true,
      runtime: { renderPrompt, invokeLLM },
    });
    const update = await node({
      playbookId: 'playbook-1',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'ru',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: blocks([
        [
          'block_2',
          `## 2. Анти-цели

| Анти-цель | Владелец |
| --- | --- |
| Product roadmap | Product |
| Legal terms | Legal |
| Support tickets | Support |
| Hiring plan | CRO |`,
        ],
        [
          'block_5',
          `## 5. Матрица решений

| Решение | Автономия | Действие |
| --- | --- | --- |
| Daily priorities | Full | Decide |
| Discount 10% | Inform | Use policy |
| Discount 20% | Recommend | Ask CRO |
| Legal terms | Approval | Ask Legal |`,
        ],
      ]),
      nodeCosts: [],
      errors: [],
      currentNode: 'group2Generator',
    });

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_cross_block_judge',
      expect.objectContaining({
        spec_json: expect.stringContaining('B2B Sales Manager'),
        current_group_content: expect.stringContaining('Матрица решений'),
      })
    );
    expect(update.generatedBlocks?.block_5?.judge_verdict).toMatchObject({
      pass: false,
      score: 81,
      needs_regeneration: ['block_5'],
    });
    expect(update.generatedBlocks?.block_2?.judge_verdict?.pass).toBe(false);
    expect(update.nodeCosts).toEqual([
      {
        node: 'crossBlockJudge',
        model: 'mock-judge-model',
        input_tokens: 50,
        output_tokens: 40,
        cost_usd: 0.004,
      },
    ]);
  });
});
