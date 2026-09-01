import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  countMermaidDiagrams,
  createCrossBlockJudgeNode,
  isCareerPlaybookDeltaReJudgeEnabled,
  downgradeUnconfirmedPlaceholderIssues,
  parseCareerPlaybookJudgeVerdict,
  runCareerPlaybookDeterministicChecks,
  selectDeltaReJudgeBlockIds,
  validateMermaidCoverage,
} from '@/stages/stage-career-playbook/nodes/cross-block-judge';
import { resolveJudgeFallbackTokenThreshold } from '@/stages/stage-career-playbook/nodes/cross-block-judge-structured';

const { generateEmbeddingsMock } = vi.hoisted(() => ({
  generateEmbeddingsMock: vi.fn(),
}));

vi.mock('@/shared/embeddings/jina-client', () => ({
  generateEmbeddings: generateEmbeddingsMock,
}));

beforeEach(() => {
  generateEmbeddingsMock.mockReset();
  generateEmbeddingsMock.mockImplementation((texts: string[]) =>
    texts.map((_, index) =>
      Array.from({ length: 768 }, (_unused, coordinate) => (index === coordinate ? 1 : 0))
    )
  );
});

function identicalEmbedding(): number[] {
  return [1, ...Array.from({ length: 767 }, () => 0)];
}

function embeddingAtCosine(similarity: number): number[] {
  return [
    similarity,
    Math.sqrt(1 - similarity * similarity),
    ...Array.from({ length: 766 }, () => 0),
  ];
}

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
  it('routes a too-close shared-audience pair through the node regeneration verdict', async () => {
    generateEmbeddingsMock.mockImplementation(
      (
        texts: string[],
        _task: string,
        _costContext: unknown,
        onUsage?: (usage: {
          model: string;
          totalTokens: number;
          documentCount: number;
          durationMs: number;
        }) => void
      ) => {
        onUsage?.({
          model: 'jina-embeddings-v3',
          totalTokens: 200,
          documentCount: texts.length,
          durationMs: 12,
        });
        return texts.map(() => identicalEmbedding());
      }
    );
    const sharedAudienceBlocks = blocks([
      [
        'block_8',
        `## 8. Tools

${'The role uses a governed tool workflow with explicit review and measurable adoption. '.repeat(2)}`,
      ],
      [
        'block_9',
        `## 9. Human-AI collaboration

${'The role uses a governed AI workflow with explicit review and measurable adoption. '.repeat(2)}`,
      ],
    ]);
    const node = createCrossBlockJudgeNode({
      useLLMJudge: false,
    });

    const update = await node({
      playbookId: 'playbook-semantic-shared',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'en',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: sharedAudienceBlocks,
      nodeCosts: [],
      errors: [],
      currentNode: 'crossBlockJudge',
    });

    expect(generateEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_8', 'block_9']);
    expect(update.lastJudgeVerdict?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          block_id: 'block_8',
          category: 'contradiction',
          severity: 'critical',
          description: expect.stringContaining('block_9'),
        }),
        expect.objectContaining({
          block_id: 'block_9',
          category: 'contradiction',
          severity: 'critical',
          description: expect.stringContaining('block_8'),
        }),
      ])
    );
    expect(update.generatedBlocks?.block_8?.judge_verdict?.needs_regeneration).toEqual([
      'block_8',
      'block_9',
    ]);
    expect(update.nodeCosts).toEqual([
      expect.objectContaining({
        node: 'semanticRepetition',
        model: 'jina-embeddings-v3',
        input_tokens: 200,
        output_tokens: 0,
        cost_usd: 0.00001,
        provider_name: 'jina',
      }),
    ]);
  });

  it('does not spend on semantic checks in bounded group judge windows', async () => {
    generateEmbeddingsMock.mockImplementation((texts: string[]) =>
      texts.map(() => identicalEmbedding())
    );
    const node = createCrossBlockJudgeNode({
      currentBlockIds: ['block_8', 'block_9'],
      useLLMJudge: false,
    });

    const update = await node({
      playbookId: 'playbook-bounded-window',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'en',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: blocks([
        ['block_8', '## 8. Tools\n\nA concise governed tools workflow.'],
        ['block_9', '## 9. Human-AI collaboration\n\nA concise governed tools workflow.'],
      ]),
      nodeCosts: [],
      errors: [],
      currentNode: 'group2Generator',
    });

    expect(generateEmbeddingsMock).not.toHaveBeenCalled();
    expect(update.lastJudgeVerdict).toMatchObject({ pass: true, needs_regeneration: [] });
  });

  it('reuses unchanged hash-keyed embeddings on a final re-judge of the same playbook', async () => {
    const node = createCrossBlockJudgeNode({ useLLMJudge: false });
    const finalBlocks = blocks([
      ['block_8', '## 8. Tools\n\nA concise governed tools workflow.'],
      ['block_9', '## 9. Human-AI collaboration\n\nA distinct collaboration workflow.'],
    ]);
    const state = {
      playbookId: 'playbook-cache-reuse',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'en',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: finalBlocks,
      nodeCosts: [],
      errors: [],
      currentNode: 'crossBlockJudge' as const,
    };

    await node(state);
    await node(state);

    expect(generateEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(generateEmbeddingsMock.mock.calls[0][0]).toHaveLength(2);
  });

  it('does not reuse a semantic cache entry across different playbook ids', async () => {
    const node = createCrossBlockJudgeNode({ useLLMJudge: false });
    const finalBlocks = blocks([
      ['block_8', '## 8. Tools\n\nA concise governed tools workflow.'],
      ['block_9', '## 9. Human-AI collaboration\n\nA distinct collaboration workflow.'],
    ]);
    const state = {
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'en',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: finalBlocks,
      nodeCosts: [],
      errors: [],
      currentNode: 'crossBlockJudge' as const,
    };

    await node({ ...state, playbookId: 'playbook-cache-tenant-a' });
    await node({ ...state, playbookId: 'playbook-cache-tenant-b' });

    expect(generateEmbeddingsMock).toHaveBeenCalledTimes(2);
    expect(generateEmbeddingsMock.mock.calls[0][0]).toHaveLength(2);
    expect(generateEmbeddingsMock.mock.calls[1][0]).toHaveLength(2);
  });

  it('never flags an identical pair when the blocks share no audience view', async () => {
    generateEmbeddingsMock.mockImplementation((texts: string[]) =>
      texts.map(() => identicalEmbedding())
    );

    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_9',
          `## 9. Human-AI collaboration

${'This long paragraph describes a repeated workflow for the employee audience only. '.repeat(2)}`,
        ],
        [
          'block_23',
          `## 23. Continuity plan

${'This long paragraph describes a repeated workflow for the manager audience only. '.repeat(2)}`,
        ],
      ]),
    });

    expect(generateEmbeddingsMock).not.toHaveBeenCalled();
    expect(verdict.issues).toEqual([]);
    expect(verdict.needs_regeneration).toEqual([]);
    expect(verdict.pass).toBe(true);
  });

  it('uses the inclusive 0.85 baseline threshold for shared-audience pairs', async () => {
    generateEmbeddingsMock.mockResolvedValue([identicalEmbedding(), embeddingAtCosine(0.85)]);

    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        ['block_8', '## 8. Tools\n\nA concise governed tools workflow.'],
        ['block_9', '## 9. Human-AI collaboration\n\nA distinct collaboration workflow.'],
      ]),
    });

    expect(verdict.needs_regeneration).toEqual(['block_8', 'block_9']);
    expect(verdict.issues[0].description).toContain('threshold 0.85');
  });

  it('flags too-close semantic paragraphs inside one block using the baseline paragraph unit', async () => {
    generateEmbeddingsMock.mockImplementation((texts: string[]) =>
      texts.map(() => identicalEmbedding())
    );
    const firstParagraph =
      'The manager reviews the same readiness checklist, confirms every owner, and records the final handoff result. '.repeat(
        2
      );
    const secondParagraph =
      'The manager confirms every owner in the readiness checklist and records the final handoff result after review. '.repeat(
        2
      );

    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        ['block_26', `## 26. Implementation checklist\n\n${firstParagraph}\n\n${secondParagraph}`],
      ]),
    });

    expect(generateEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(verdict.needs_regeneration).toEqual(['block_26']);
    expect(verdict.issues).toContainEqual(
      expect.objectContaining({
        block_id: 'block_26',
        category: 'contradiction',
        severity: 'critical',
        description: expect.stringContaining('paragraphs 1 and 2'),
      })
    );
  });

  it('fails the final judge closed and carries paid receipts when Jina is exhausted', async () => {
    generateEmbeddingsMock.mockImplementation(
      (
        texts: string[],
        _task: string,
        _costContext: unknown,
        onUsage?: (usage: { model: string; totalTokens: number; documentCount: number }) => void
      ) => {
        onUsage?.({
          model: 'jina-embeddings-v3',
          totalTokens: 200,
          documentCount: texts.length,
        });
        throw new Error('Jina unavailable after retries');
      }
    );
    const node = createCrossBlockJudgeNode({
      useLLMJudge: false,
    });

    const result = node({
      playbookId: 'playbook-semantic-provider-failure',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'en',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: blocks([
        ['block_8', '## 8. Tools\n\nA concise tools summary.'],
        ['block_9', '## 9. Human-AI collaboration\n\nA concise collaboration summary.'],
      ]),
      nodeCosts: [],
      errors: [],
      currentNode: 'crossBlockJudge',
    });

    await expect(result).rejects.toMatchObject({
      name: 'CareerPlaybookSemanticRepetitionProviderError',
      message: expect.stringContaining(
        'semantic repetition checks unavailable: Jina unavailable after retries'
      ),
      warnings: [
        expect.stringContaining(
          'semantic repetition checks unavailable: Jina unavailable after retries'
        ),
      ],
      nodeCosts: [
        expect.objectContaining({
          node: 'semanticRepetition',
          input_tokens: 200,
          provider_name: 'jina',
        }),
      ],
    });
  });

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
            category: 'contradiction',
            description: 'Autonomy levels contradict the ownership defined in block_3.',
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
              category: 'contradiction',
              description: 'Approval boundaries contradict the decision owner named in block_3.',
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

  const validDecisionMatrix = `## 5. Матрица решений

| Решение | Автономия | Действие |
| --- | --- | --- |
| Daily priorities | Full | Decide |
| Discount 10% | Inform | Use policy |
| Discount 20% | Recommend | Ask CRO |
| Legal terms | Approval | Ask Legal |`;

  const validAntiGoals = `## 2. Анти-цели

| Анти-цель | Владелец |
| --- | --- |
| Product roadmap | Product |
| Legal terms | Legal |
| Support tickets | Support |
| Hiring plan | CRO |`;

  // Taxonomy-backed critical (category: contradiction) so the regeneration gate
  // keeps block_5 flagged and the cap/budget paths below are actually exercised.
  const criticalBlock5Judge = JSON.stringify({
    pass: false,
    score: 60,
    issues: [
      {
        block_id: 'block_5',
        severity: 'critical',
        category: 'contradiction',
        description:
          'Decision matrix repeats responsibility-zone ownership already defined in block_3.',
        suggestion: 'Regenerate block 5 to reference block_3 instead of restating its ownership.',
      },
    ],
    needs_regeneration: ['block_5'],
  });

  function baseJudgeState(overrides: {
    generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
    blockRegenerationAttempts: Partial<Record<CareerPlaybookBlockId, number>>;
  }) {
    return {
      playbookId: 'playbook-1',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'ru',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: overrides.generatedBlocks,
      judgeVerdicts: [],
      lastJudgeVerdict: null,
      lastJudgedBlockIds: [],
      blockRegenerationAttempts: overrides.blockRegenerationAttempts,
      finalMarkdown: null,
      nodeCosts: [],
      errors: [],
      warnings: [],
      qualityIssues: [],
      currentNode: 'group2Generator' as const,
    };
  }

  function semanticFinalJudgeState(attempts: Partial<Record<CareerPlaybookBlockId, number>>) {
    const firstParagraph =
      'The manager reviews the same readiness checklist, confirms every owner, and records the final handoff result. '.repeat(
        2
      );
    const secondParagraph =
      'The manager confirms every owner in the readiness checklist and records the final handoff result after review. '.repeat(
        2
      );

    return {
      ...baseJudgeState({
        generatedBlocks: blocks([
          ['block_8', '## 8. Tools\n\nDistinct tool categories.'],
          ['block_11', `## 11. Career path\n\n${firstParagraph}\n\n${secondParagraph}`],
        ]),
        blockRegenerationAttempts: attempts,
      }),
      language: 'en',
      roleProfileSpec: null,
      currentNode: 'finalJudge' as const,
    };
  }

  function mockOneWithinBlockSemanticRepeat() {
    generateEmbeddingsMock.mockImplementation((texts: string[]) =>
      texts.map((text, index) =>
        text.startsWith('The manager')
          ? identicalEmbedding()
          : Array.from({ length: 768 }, (_unused, coordinate) => (coordinate === index + 1 ? 1 : 0))
      )
    );
  }

  it('keeps the flagged block eligible while the window still has budget', async () => {
    mockOneWithinBlockSemanticRepeat();
    const node = createCrossBlockJudgeNode({ useLLMJudge: false });

    const update = await node(semanticFinalJudgeState({ block_8: 7, block_11: 0 }));

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_11']);
    expect(update.errors).toBeUndefined();
  });

  /**
   * The window-budget exemption is bookkeeping inside the judge;
   * `selectPendingCareerPlaybookRegenerations` refuses every block once the
   * window is spent, and `routeAfterBlockRegeneration` sends the empty batch to
   * END. Keeping the block in `needs_regeneration` therefore reserves nothing,
   * and asserting `errors: undefined` here once pinned a fail-open: the playbook
   * completed with an unremediated critical repetition, no error and no warning.
   *
   * Silence was the defect, not the missing throw. The gate now reports instead
   * of discarding the document, so the assertion is on the warning and on the
   * measurements inside it — a warning that names only a block id sent a real
   * 2026-08-30 failure back for another paid run before it could be diagnosed.
   */
  it('reports with measurements when the exhausted window leaves nothing to regenerate the block', async () => {
    mockOneWithinBlockSemanticRepeat();
    const node = createCrossBlockJudgeNode({ useLLMJudge: false });

    const update = await node(semanticFinalJudgeState({ block_8: 8, block_11: 0 }));

    expect(update.errors).toBeUndefined();
    const warning = update.warnings?.find(entry =>
      entry.includes('exhausted semantic repetition remediation')
    );
    expect(warning).toBeDefined();
    expect(warning).toMatch(/for [^;]*block_11[^;]*;/);
    expect(warning).toContain('cosine');
    expect(warning).toContain('threshold');
  });

  /**
   * The degraded-judge return sits above the semantic gate block, so a judge
   * model that fails to produce a verdict used to take the deterministic gate
   * down with it entirely: the repetition was found, nothing remediated it, and
   * nothing said so. Both reports must survive this path — the degradation and
   * the repetition are independent facts about the same run.
   */
  it('still reports the semantic gate when the LLM judge degrades', async () => {
    mockOneWithinBlockSemanticRepeat();
    const node = createCrossBlockJudgeNode({
      useLLMJudge: true,
      runtime: {
        renderPrompt: vi.fn().mockResolvedValue('rendered judge prompt'),
        invokeLLM: vi.fn().mockResolvedValue({
          content: '',
          model: 'mock-judge-model',
          inputTokens: 50,
          outputTokens: 1,
          costUsd: 0.001,
        }),
      },
    });

    const update = await node({
      ...semanticFinalJudgeState({ block_8: 8, block_11: 0 }),
      roleProfileSpec,
    });

    expect(update.warnings?.[0]).toContain('crossBlockJudge degraded to deterministic checks');
    expect(update.errors).toBeUndefined();
    expect(update.warnings).toContainEqual(
      expect.stringContaining('exhausted semantic repetition remediation')
    );
  });

  it('reports the final semantic gate after the repeated block exhausts its cap', async () => {
    mockOneWithinBlockSemanticRepeat();
    const node = createCrossBlockJudgeNode({ useLLMJudge: false });

    const update = await node(
      semanticFinalJudgeState({
        block_8: 0,
        block_11: 2,
      })
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
    expect(update.errors).toBeUndefined();
    expect(update.warnings).toContainEqual(
      expect.stringContaining('exhausted semantic repetition remediation')
    );
  });

  it('advances with a warning (not an error) when the judge window budget is exhausted', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: criticalBlock5Judge,
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
    // block_2 absorbs the whole 8-attempt window budget while block_5 (the flagged
    // block) is well under its per-block cap, isolating the window-cap path.
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([
          ['block_2', validAntiGoals],
          ['block_5', validDecisionMatrix],
        ]),
        blockRegenerationAttempts: { block_2: 8, block_5: 0 },
      })
    );

    expect(update.errors).toBeUndefined();
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
    expect(update.warnings?.[0]).toContain(
      'crossBlockJudge advanced after max regeneration attempts'
    );
    expect(update.warnings?.[0]).toContain('8/8');
  });

  it('advances with a warning when the per-block regeneration cap is exhausted', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: criticalBlock5Judge,
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
    // Window budget is nowhere near 8, but block_5 has already used its 2 per-block
    // attempts, so the per-block cap path clears it and warns.
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        blockRegenerationAttempts: { block_5: 2 },
      })
    );

    expect(update.errors).toBeUndefined();
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
    expect(update.warnings?.[0]).toContain(
      'crossBlockJudge advanced after max regeneration attempts'
    );
    expect(update.warnings?.[0]).toContain('per-block 2/2');
  });

  it('keeps the block flagged for regeneration while it is still under both caps', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: criticalBlock5Judge,
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
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        blockRegenerationAttempts: { block_5: 1 },
      })
    );

    expect(update.errors).toBeUndefined();
    expect(update.warnings).toBeUndefined();
    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_5']);
  });

  const insufficientAntiGoals = `## 2. Анти-цели

| Анти-цель | Владелец |
| --- | --- |
| Продуктовая дорожная карта | Продукт |
| Юридические условия | Юристы |
| Тикеты поддержки | Поддержка |`;

  function judgeVerdictContent(
    issue: Record<string, unknown>,
    needsRegeneration: string[]
  ): string {
    return JSON.stringify({
      pass: false,
      score: 78,
      issues: [issue],
      needs_regeneration: needsRegeneration,
    });
  }

  it('downgrades an LLM style-category critical to a warning and never regenerates it', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: judgeVerdictContent(
        {
          block_id: 'block_5',
          severity: 'critical',
          category: 'style',
          description: 'Reads like generic HR jargon; make it punchier.',
          suggestion: 'Tighten the wording.',
        },
        ['block_5']
      ),
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
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        blockRegenerationAttempts: {},
      })
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
    expect(update.lastJudgeVerdict?.issues).toContainEqual(
      expect.objectContaining({ block_id: 'block_5', severity: 'warning', category: 'style' })
    );
  });

  it('regenerates an LLM critical whose category is in the regeneration taxonomy', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: judgeVerdictContent(
        {
          block_id: 'block_5',
          severity: 'critical',
          category: 'contradiction',
          description: 'Decision matrix contradicts responsibility zones owned by block_3.',
          suggestion: null,
        },
        ['block_5']
      ),
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
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        blockRegenerationAttempts: {},
      })
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_5']);
    expect(update.lastJudgeVerdict?.issues).toContainEqual(
      expect.objectContaining({
        block_id: 'block_5',
        severity: 'critical',
        category: 'contradiction',
      })
    );
  });

  it('defensively downgrades an LLM critical that carries no category', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: judgeVerdictContent(
        {
          block_id: 'block_5',
          severity: 'critical',
          description: 'Uncategorized critical from a malformed judge response.',
          suggestion: null,
        },
        ['block_5']
      ),
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
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        blockRegenerationAttempts: {},
      })
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual([]);
    expect(update.lastJudgeVerdict?.issues).toContainEqual(
      expect.objectContaining({ block_id: 'block_5', severity: 'warning' })
    );
  });

  it('keeps deterministic criticals for regeneration even when the LLM critical is style-gated', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: judgeVerdictContent(
        {
          block_id: 'block_5',
          severity: 'critical',
          category: 'style',
          description: 'Tone could be crisper.',
          suggestion: null,
        },
        ['block_5']
      ),
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
    // block_2 fails the deterministic anti-goals minimum (3 < 4); the LLM adds only a
    // style critical on block_5. The deterministic regen must survive the gate while
    // the style critical is downgraded.
    const update = await node(
      baseJudgeState({
        generatedBlocks: blocks([
          ['block_2', insufficientAntiGoals],
          ['block_5', validDecisionMatrix],
        ]),
        blockRegenerationAttempts: {},
      })
    );

    expect(update.lastJudgeVerdict?.needs_regeneration).toEqual(['block_2']);
    expect(update.lastJudgeVerdict?.issues).toContainEqual(
      expect.objectContaining({ block_id: 'block_2', severity: 'critical' })
    );
    expect(update.lastJudgeVerdict?.issues).toContainEqual(
      expect.objectContaining({ block_id: 'block_5', severity: 'warning', category: 'style' })
    );
  });

  const acceptedVerdict = {
    pass: true,
    score: 95,
    issues: [],
    needs_regeneration: [],
  };

  function judgedBlock(content: string): CareerPlaybookBlockState {
    return { ...block(content), judge_verdict: acceptedVerdict };
  }

  describe('delta re-judge scoping', () => {
    it('returns the whole window on the first judge (every block still unjudged)', () => {
      const window: CareerPlaybookBlockId[] = ['block_2', 'block_5'];
      const generatedBlocks = blocks([
        ['block_2', validAntiGoals],
        ['block_5', validDecisionMatrix],
      ]);

      expect(selectDeltaReJudgeBlockIds(window, generatedBlocks)).toEqual(['block_2', 'block_5']);
    });

    it('narrows to regenerated blocks when a window sibling is already judged', () => {
      const window: CareerPlaybookBlockId[] = ['block_2', 'block_5'];
      // block_2 carries a prior verdict (accepted); block_5 was just regenerated (null verdict).
      const generatedBlocks = {
        block_2: judgedBlock(validAntiGoals),
        block_5: block(validDecisionMatrix),
      };

      expect(selectDeltaReJudgeBlockIds(window, generatedBlocks)).toEqual(['block_5']);
    });

    it('falls back to the whole window when no block was regenerated (all judged)', () => {
      const window: CareerPlaybookBlockId[] = ['block_2', 'block_5'];
      const generatedBlocks = {
        block_2: judgedBlock(validAntiGoals),
        block_5: judgedBlock(validDecisionMatrix),
      };

      expect(selectDeltaReJudgeBlockIds(window, generatedBlocks)).toEqual(['block_2', 'block_5']);
    });

    it('defaults on and honors the disable values for the env flag', () => {
      expect(isCareerPlaybookDeltaReJudgeEnabled(undefined)).toBe(true);
      expect(isCareerPlaybookDeltaReJudgeEnabled('')).toBe(true);
      expect(isCareerPlaybookDeltaReJudgeEnabled('1')).toBe(true);
      expect(isCareerPlaybookDeltaReJudgeEnabled('true')).toBe(true);
      expect(isCareerPlaybookDeltaReJudgeEnabled('0')).toBe(false);
      expect(isCareerPlaybookDeltaReJudgeEnabled('false')).toBe(false);
      expect(isCareerPlaybookDeltaReJudgeEnabled('OFF')).toBe(false);
      expect(isCareerPlaybookDeltaReJudgeEnabled('no')).toBe(false);
      expect(isCareerPlaybookDeltaReJudgeEnabled('disabled')).toBe(false);
    });

    it('shows the judge only the regenerated block and keeps siblings on their last verdict', async () => {
      const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
      const invokeLLM = vi.fn().mockResolvedValue({
        content: JSON.stringify({ pass: true, score: 95, issues: [], needs_regeneration: [] }),
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
      const update = await node(
        baseJudgeState({
          generatedBlocks: {
            block_2: judgedBlock(validAntiGoals),
            block_5: block(validDecisionMatrix),
          },
          blockRegenerationAttempts: { block_5: 1 },
        })
      );

      // Only block_5 (null verdict) reaches the judge; block_2's accepted content is excluded.
      const promptVars = renderPrompt.mock.calls[0][1] as Record<string, string>;
      expect(promptVars.group_id).toBe('block_5');
      expect(promptVars.current_group_content).toContain('Матрица решений');
      expect(promptVars.current_group_content).not.toContain('Анти-цели');

      // Only block_5 receives the new verdict; block_2 is absent from the update, so state
      // keeps the verdict its previous judge pass attached (delta merge semantics).
      expect(update.generatedBlocks?.block_5?.judge_verdict).toMatchObject({ pass: true });
      expect(update.generatedBlocks?.block_2).toBeUndefined();

      // Routing/cap accounting still spans the full window.
      expect(update.lastJudgedBlockIds).toEqual(['block_2', 'block_5']);
    });

    it('re-judges the whole window when delta re-judge is disabled', async () => {
      const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
      const invokeLLM = vi.fn().mockResolvedValue({
        content: JSON.stringify({ pass: true, score: 95, issues: [], needs_regeneration: [] }),
        model: 'mock-judge-model',
        inputTokens: 50,
        outputTokens: 40,
        costUsd: 0.004,
      });

      const node = createCrossBlockJudgeNode({
        currentBlockIds: ['block_2', 'block_5'],
        useLLMJudge: true,
        deltaReJudge: false,
        runtime: { renderPrompt, invokeLLM },
      });
      await node(
        baseJudgeState({
          generatedBlocks: {
            block_2: judgedBlock(validAntiGoals),
            block_5: block(validDecisionMatrix),
          },
          blockRegenerationAttempts: { block_5: 1 },
        })
      );

      const promptVars = renderPrompt.mock.calls[0][1] as Record<string, string>;
      expect(promptVars.group_id).toBe('block_2, block_5');
      expect(promptVars.current_group_content).toContain('Анти-цели');
      expect(promptVars.current_group_content).toContain('Матрица решений');
    });

    it('shows the whole group on the first judge even with delta re-judge enabled', async () => {
      const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
      const invokeLLM = vi.fn().mockResolvedValue({
        content: JSON.stringify({ pass: true, score: 95, issues: [], needs_regeneration: [] }),
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
      await node(
        baseJudgeState({
          // Both blocks freshly generated (null verdict) => first judge => full group.
          generatedBlocks: blocks([
            ['block_2', validAntiGoals],
            ['block_5', validDecisionMatrix],
          ]),
          blockRegenerationAttempts: {},
        })
      );

      const promptVars = renderPrompt.mock.calls[0][1] as Record<string, string>;
      expect(promptVars.group_id).toBe('block_2, block_5');
      expect(promptVars.current_group_content).toContain('Анти-цели');
      expect(promptVars.current_group_content).toContain('Матрица решений');
    });
  });

  it('passes the input-size fallback routing threshold to the judge LLM call', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({ pass: true, score: 95, issues: [], needs_regeneration: [] }),
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
    await node({
      playbookId: 'playbook-1',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'ru',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
      nodeCosts: [],
      errors: [],
      currentNode: 'group2Generator',
    });

    // The judge wires the (default 28k) size gate so the runtime can start the
    // large final-document judge on the fallback model instead of timing out.
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered judge prompt',
      expect.objectContaining({ preferFallbackModelAboveTokens: 28_000 })
    );
  });

  it('honors CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD when wiring the judge call', async () => {
    process.env.CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD = '20000';
    try {
      const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
      const invokeLLM = vi.fn().mockResolvedValue({
        content: JSON.stringify({ pass: true, score: 95, issues: [], needs_regeneration: [] }),
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
      await node({
        playbookId: 'playbook-1',
        userId: 'user-1',
        organizationId: 'org-1',
        language: 'ru',
        qaData: { fixed: [], followups: [], freeform: [] },
        roleProfileSpec,
        webResearch: null,
        generatedGroups: {},
        generatedBlocks: blocks([['block_5', validDecisionMatrix]]),
        nodeCosts: [],
        errors: [],
        currentNode: 'group2Generator',
      });

      expect(invokeLLM).toHaveBeenCalledWith(
        'rendered judge prompt',
        expect.objectContaining({ preferFallbackModelAboveTokens: 20_000 })
      );
    } finally {
      delete process.env.CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD;
    }
  });

  describe('resolveJudgeFallbackTokenThreshold', () => {
    it('defaults to 28000 when the env var is unset', () => {
      expect(resolveJudgeFallbackTokenThreshold(undefined)).toBe(28_000);
    });

    it('uses a valid positive override', () => {
      expect(resolveJudgeFallbackTokenThreshold('22000')).toBe(22_000);
    });

    it('falls back to the default for non-numeric or non-positive values', () => {
      expect(resolveJudgeFallbackTokenThreshold('not-a-number')).toBe(28_000);
      expect(resolveJudgeFallbackTokenThreshold('0')).toBe(28_000);
      expect(resolveJudgeFallbackTokenThreshold('-5')).toBe(28_000);
      expect(resolveJudgeFallbackTokenThreshold('')).toBe(28_000);
    });
  });

  // Verbatim from playbook d5137bc5 (2026-08-30). All eight of the run's
  // unresolved_placeholder criticals pointed at the marker the contract requires
  // an unverified company value to carry, and each one bought a regeneration
  // that could only make a correct block worse.
  describe('downgradeUnconfirmedPlaceholderIssues', () => {
    const contractedMarker =
      "| CRM (Salesforce, HubSpot) (example — replace with the company's actual CRM) | System of record |";

    function placeholderIssue(blockId: string, description: string) {
      return {
        block_id: blockId,
        severity: 'critical' as const,
        category: 'unresolved_placeholder' as const,
        description,
        suggestion: 'Remove the placeholder.',
      };
    }

    it('downgrades a placeholder critical the deterministic scan cannot confirm', () => {
      const [issue] = downgradeUnconfirmedPlaceholderIssues(
        [
          placeholderIssue(
            'block_8',
            "Tool entries contain unresolved replacement instructions such as “example — replace with the company's actual CRM.”"
          ),
        ],
        { block_8: { content: contractedMarker, status: 'generated', attempt: 1 } }
      );

      expect(issue.severity).toBe('warning');
      expect(issue.description).toContain('contracted output rather than a placeholder');
    });

    it('leaves a critical alone when a real fill-in field is present', () => {
      const [issue] = downgradeUnconfirmedPlaceholderIssues(
        [placeholderIssue('block_23', 'The backup contact table is not filled in.')],
        {
          block_23: {
            content: '| Backup contact | [name] | [date] |',
            status: 'generated',
            attempt: 1,
          },
        }
      );

      expect(issue.severity).toBe('critical');
      expect(issue.description).not.toContain('downgraded');
    });

    it('touches nothing outside a placeholder critical', () => {
      const issues = [
        {
          block_id: 'block_4',
          severity: 'critical' as const,
          category: 'contradiction' as const,
          description: 'The pipeline review cadence disagrees.',
          suggestion: 'Align it.',
        },
        placeholderIssue('block_8', 'Marker present.'),
      ];
      issues[1].severity = 'warning' as never;

      expect(downgradeUnconfirmedPlaceholderIssues(issues, {})).toEqual(issues);
    });
  });
});

/**
 * What the first Russian run since 2026-08-22 cost.
 *
 * Run db9d3ff9 (2026-09-01) shipped seven criticals against three in the English
 * run beside it, and two of the seven were the checks misreading a correct
 * document. Both fragments below are that run's own text.
 */
describe('a Russian guide is read by the same rules as an English one', () => {
  it('counts failure modes written as sub-headings, not only as rows and bullets', async () => {
    // Four failure modes, each a `###` section with prose under it, and not a
    // bullet or a table row in sight. The counter read 0 and block_21 spent both
    // its regeneration attempts on a minimum it already met.
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_21',
          `## 21. Как люди обычно проваливаются на этой роли

Режим: FMEA-подход — что идет не так, как это заметить рано, что сделать заранее.

### Режим отказа 1: Воронка существует формально

**Как проваливается:** стадии и суммы в CRM неактуальны.

### Режим отказа 2: Прогноз на оптимизме

**Как проваливается:** прогноз расходится с фактом.

### Режим отказа 3: Руководитель — узкое место

**Как проваливается:** планы пишет руководитель.

### Режим отказа 4: Активность без конверсии

**Как проваливается:** активность растет, конверсия падает.`,
        ],
      ]),
    });

    expect(verdict.issues.filter(issue => issue.description.includes('failure modes'))).toEqual([]);
  });

  it('does not read an English source title in a Russian guide as English prose', async () => {
    // The reading list carries the titles of the sources it cites, and an English
    // source keeps its English title. Block 25 was told it was in the wrong
    // language and spent an attempt on text it could not translate without
    // misquoting.
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_25',
          `## 25. Когда пересматривать эту инструкцию

**Версия:** 1.0 от 2026-09-01. Владелец документа — коммерческий директор.

Плановая ревизия всей инструкции — раз в квартал.

### Источники

- [S1] B2B Buying: How Top CSOs and CMOs Optimize the Journey — https://www.gartner.com/en/sales/insights/b2b-buying-journey (research)
- [S2] Use Science to Improve Sales Team Productivity — https://www.forrester.com/blogs/use-science-to-improve-sales-productivity (research)`,
        ],
      ]),
      contentLanguage: 'ru',
    });

    expect(verdict.issues.filter(issue => issue.category === 'wrong_language')).toEqual([]);
  });

  it('still catches an English paragraph the guide itself wrote', async () => {
    const verdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: blocks([
        [
          'block_25',
          `## 25. Когда пересматривать эту инструкцию

This guide should be reviewed every quarter, and the owner of the document is the commercial director who will initiate the update.`,
        ],
      ]),
      contentLanguage: 'ru',
    });

    expect(verdict.issues.filter(issue => issue.category === 'wrong_language')).toHaveLength(1);
  });
});
