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
  it('flags Phase 3 minimum item failures for anti-goals, decisions, and failure modes', async () => {
    const verdict = await runCareerPlaybookDeterministicChecks({
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

  it('treats invalid Mermaid syntax as a deterministic quality failure', async () => {
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_10',
          `## 10. Dependencies

\`\`\`mermaid
flowchart LR
  Sales -->
\`\`\``,
        ],
      ]),
    });

    expect(verdict.pass).toBe(false);
    expect(verdict.needs_regeneration).toEqual(['block_10']);
    expect(verdict.issues).toEqual([
      expect.objectContaining({
        block_id: 'block_10',
        severity: 'critical',
        description: expect.stringContaining('invalid Mermaid syntax'),
        suggestion: expect.stringContaining('Fix or replace the Mermaid diagram'),
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

  it('normalizes common LLM judge block id variants and drops invalid references', () => {
    const parsed = parseCareerPlaybookJudgeVerdict(
      JSON.stringify({
        pass: false,
        score: 70,
        issues: [
          {
            block_id: 'Block 5',
            severity: 'warning',
            description: 'Decision matrix needs owner clarity.',
            suggestion: '',
          },
          {
            block_id: 'group_3',
            severity: 'critical',
            description: 'Invalid group-level reference should not fail parsing.',
          },
        ],
        needs_regeneration: ['5', 'block_05', 'group_3', 'header'],
      })
    );

    expect(parsed.issues).toEqual([
      {
        block_id: 'block_5',
        severity: 'warning',
        description: 'Decision matrix needs owner clarity.',
      },
    ]);
    expect(parsed.needs_regeneration).toEqual(['block_5', 'header']);
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
            severity: 'critical',
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
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered judge prompt',
      expect.objectContaining({
        structuredOutputName: 'career_playbook_cross_block_judge',
        structuredOutputMethod: 'jsonSchema',
        structuredOutputStrict: true,
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

  it('repairs an empty structured judge response once before merging verdicts', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        model: 'mock-judge-model',
        inputTokens: 50,
        outputTokens: 1,
        costUsd: 0.001,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          pass: false,
          score: 84,
          issues: [
            {
              block_id: 'block_5',
              severity: 'critical',
              description: 'Approval boundaries need clearer escalation.',
              suggestion: null,
            },
          ],
          needs_regeneration: ['block_5'],
        }),
        model: 'mock-judge-repair-model',
        inputTokens: 70,
        outputTokens: 35,
        costUsd: 0.002,
      });

    const node = createCrossBlockJudgeNode({
      currentBlockIds: ['block_5'],
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

    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(invokeLLM.mock.calls[1][0]).toContain('SYSTEM REPAIR');
    expect(update.warnings).toBeUndefined();
    expect(update.lastJudgeVerdict).toMatchObject({
      pass: false,
      score: 84,
      needs_regeneration: ['block_5'],
    });
    expect(update.nodeCosts).toEqual([
      expect.objectContaining({ model: 'mock-judge-model' }),
      expect.objectContaining({ model: 'mock-judge-repair-model' }),
    ]);
  });

  it('keeps LLM warning findings visible without forcing block regeneration', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        pass: false,
        score: 82,
        issues: [
          {
            block_id: 'block_5',
            severity: 'warning',
            description: 'Decision matrix wording can be more specific.',
            suggestion: 'Clarify approval language, but do not regenerate the whole block.',
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
      currentBlockIds: ['block_5'],
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

    expect(update.lastJudgeVerdict).toMatchObject({
      pass: false,
      score: 82,
      needs_regeneration: [],
    });
    expect(update.lastJudgeVerdict?.issues).toEqual([
      expect.objectContaining({
        block_id: 'block_5',
        severity: 'warning',
      }),
    ]);
  });

  it('falls back to deterministic verdict when LLM judge output is unparsable', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: '',
      model: 'mock-judge-model',
      inputTokens: 50,
      outputTokens: 1,
      costUsd: 0.001,
    });

    const node = createCrossBlockJudgeNode({
      currentBlockIds: ['block_5'],
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

    expect(update.errors).toBeUndefined();
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(update.warnings?.[0]).toContain(
      'crossBlockJudge degraded to deterministic checks after LLM structured verdict failed'
    );
    expect(update.lastJudgeVerdict).toMatchObject({ pass: true, score: 100 });
    expect(update.judgeVerdicts).toEqual([expect.objectContaining({ pass: true })]);
    expect(update.generatedBlocks?.block_5?.judge_verdict).toMatchObject({ pass: true });
    expect(update.nodeCosts).toEqual([
      {
        node: 'crossBlockJudge',
        model: 'mock-judge-model',
        input_tokens: 50,
        output_tokens: 1,
        cost_usd: 0.001,
      },
      {
        node: 'crossBlockJudge',
        model: 'mock-judge-model',
        input_tokens: 50,
        output_tokens: 1,
        cost_usd: 0.001,
      },
    ]);
  });

  it('flags a block whose text is not in the target content language', async () => {
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_13',
          `## 13. Один день из жизни роли

Please choose the decision authority for each item before you start.`,
        ],
      ]),
      contentLanguage: 'ru',
    });

    expect(verdict.pass).toBe(false);
    expect(verdict.needs_regeneration).toContain('block_13');
    expect(verdict.issues).toContainEqual(
      expect.objectContaining({
        block_id: 'block_13',
        severity: 'critical',
        description: expect.stringContaining('not in the target content language'),
      })
    );
  });

  it('does not flag legitimate Russian content, and skips the language check when omitted', async () => {
    const russianBlock = blocks([
      [
        'block_13',
        `## 13. Один день из жизни роли

Утро начинается с приоритизации задач и синхронизации с командой.`,
      ],
    ]);

    const withLanguage = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: russianBlock,
      contentLanguage: 'ru',
    });
    expect(withLanguage.pass).toBe(true);

    // English-heavy content is untouched when contentLanguage is not provided
    // (backward-compatible with existing deterministic-check callers).
    const withoutLanguage = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([['block_13', '## 13. Day in the life\n\nA day in the life.']]),
    });
    expect(withoutLanguage.pass).toBe(true);
  });

  it('flags unresolved fillable placeholders while sparing Markdown links and Mermaid nodes', async () => {
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_22',
          `## 22. Role README

- Дедлайн: [дата]
- Ответственный: {заполните}`,
        ],
        [
          'block_23',
          `## 23. Continuity plan

Смотрите [дата](https://example.com/calendar) для планирования.

\`\`\`mermaid
flowchart LR
  Start["дата"] --> Done["ссылка"]
\`\`\``,
        ],
      ]),
    });

    expect(verdict.pass).toBe(false);
    expect(verdict.needs_regeneration).toContain('block_22');
    expect(verdict.needs_regeneration).not.toContain('block_23');
    expect(verdict.issues).toContainEqual(
      expect.objectContaining({
        block_id: 'block_22',
        severity: 'critical',
        description: expect.stringContaining('unresolved fillable placeholder'),
      })
    );
    const block22Issue = verdict.issues.find(issue => issue.block_id === 'block_22');
    expect(block22Issue?.description).toContain('[дата]');
    expect(block22Issue?.description).toContain('{заполните}');
  });
});
