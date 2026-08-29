import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import { createCrossBlockJudgeNode } from '@/stages/stage-career-playbook/nodes/cross-block-judge';

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

describe('Career Playbook cross-block judge — block audiences', () => {
  // mc2-9d2ji: block_audiences_md was added to the group generators but never
  // reached the judge, so it could flag a repetition between two blocks that
  // share no reader — a defect the owner explicitly allows.
  it('renders the judge prompt with a block-to-reader map', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered judge prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify({ pass: true, score: 100, issues: [], needs_regeneration: [] }),
      model: 'mock-judge-model',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    const node = createCrossBlockJudgeNode({
      currentBlockIds: ['block_2', 'block_5'],
      useLLMJudge: true,
      runtime: { renderPrompt, invokeLLM },
    });

    await node({
      playbookId: 'playbook-audience',
      userId: 'user-1',
      organizationId: 'org-1',
      language: 'ru',
      qaData: { fixed: [], followups: [], freeform: [] },
      roleProfileSpec,
      webResearch: null,
      generatedGroups: {},
      generatedBlocks: blocks([
        ['block_2', '## 2. Анти-цели\n\n- Никогда не менять план вознаграждения задним числом.'],
        ['block_5', '## 5. Матрица решений\n\n| Решение | Автономия |\n| --- | --- |'],
      ]),
      nodeCosts: [],
      errors: [],
      currentNode: 'group1Generator',
    });

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_cross_block_judge',
      expect.objectContaining({
        // block_2 and block_5 both read "employee, manager"; block_12 is HR-only.
        // The map must name a wide reader spread, not just the two blocks under review.
        block_audiences_md: expect.stringContaining('block_2: employee, manager'),
      })
    );
    const [, renderedVariables] = renderPrompt.mock.calls[0];
    expect(renderedVariables.block_audiences_md).toContain('block_12: hr');
  });
});
