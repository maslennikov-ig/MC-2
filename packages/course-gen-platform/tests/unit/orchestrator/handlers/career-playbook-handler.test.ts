import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JobType,
  type CareerPlaybookBlockState,
  type CareerPlaybookJobData,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateCareerPlaybookFollowups: vi.fn(),
  regenerateCareerPlaybookBlock: vi.fn(),
  processCareerPlaybookSource: vi.fn(),
  getCareerPlaybookGraphRecursionLimit: vi.fn(() => 128),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
  })),
}));

vi.mock('@/stages/stage-career-playbook/nodes/followup-questions', () => ({
  generateCareerPlaybookFollowups: mocks.generateCareerPlaybookFollowups,
}));

vi.mock('@/stages/stage-career-playbook/nodes/block-regenerator', () => ({
  regenerateCareerPlaybookBlock: mocks.regenerateCareerPlaybookBlock,
}));

vi.mock('@/stages/stage-career-playbook/source-processing', () => ({
  processCareerPlaybookSource: mocks.processCareerPlaybookSource,
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: vi.fn(),
  getCareerPlaybookGraphRecursionLimit: mocks.getCareerPlaybookGraphRecursionLimit,
}));

import { getCareerPlaybookGraph } from '@/stages/stage-career-playbook/graph';
import { CareerPlaybookHandler } from '@/orchestrator/handlers/career-playbook-handler';

const getCareerPlaybookGraphMock = vi.mocked(getCareerPlaybookGraph);
const playbookId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const organizationId = '00000000-0000-4000-8000-000000000003';

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
    primary_kpis: ['Qualified pipeline'],
    key_tools: ['CRM'],
    critical_competencies: ['Discovery'],
    anti_goals: ['Own product roadmap'],
    failure_patterns: ['Poor CRM hygiene'],
  },
  research: null,
  block_boundaries: {},
  content_language: 'ru',
};

const originalBlock: CareerPlaybookBlockState = {
  content: '## 6. KPI\n\nOld content',
  status: 'generated',
  judge_verdict: null,
  generated_at: '2026-05-13T00:00:00.000Z',
  llm_model: 'mock-model',
  attempt: 1,
};

function job(
  data: CareerPlaybookJobData,
  overrides: Partial<Job<CareerPlaybookJobData>> = {}
): Job<CareerPlaybookJobData> {
  return {
    data,
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as Job<CareerPlaybookJobData>;
}

function baseJobData() {
  return {
    jobType: JobType.CAREER_PLAYBOOK,
    playbookId,
    userId,
    organizationId,
    language: 'ru' as const,
    locale: 'ru' as const,
    createdAt: '2026-05-19T00:00:00.000Z',
  };
}

function createBuilder(singleResults: Array<{ data: unknown; error: unknown }> = []) {
  const builder = {
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => {
      const result = singleResults.shift();
      return Promise.resolve(result ?? { data: { id: playbookId }, error: null });
    }),
  };

  return builder;
}

describe('CareerPlaybookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCareerPlaybookGraphRecursionLimit.mockReturnValue(128);
  });

  it('routes GENERATE_FOLLOWUPS through the follow-up helper', async () => {
    mocks.generateCareerPlaybookFollowups.mockResolvedValue({
      response: { questions: [], completeness_score: 1, stop_recommendation: 'ready_to_generate' },
      nodeCost: {
        node: 'followupGenerator',
        model: 'mock-model',
        input_tokens: 1,
        output_tokens: 1,
        cost_usd: 0,
      },
    });

    const result = await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_FOLLOWUPS',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      questions: [],
      completeness_score: 1,
      stop_recommendation: 'ready_to_generate',
    });
    expect(mocks.generateCareerPlaybookFollowups).toHaveBeenCalledWith({
      qaData: {
        fixed: [],
        followups: [],
        freeform: [],
        business_context: {
          mode: 'universal',
          status: 'not_started',
          digest: null,
          source_ids: [],
        },
        generation_warnings: [],
      },
      language: 'ru',
    });
  });

  it('routes REGENERATE_BLOCK through the block regenerator helper', async () => {
    mocks.regenerateCareerPlaybookBlock.mockResolvedValue({
      blockId: 'block_6',
      block: { ...originalBlock, content: '## 6. KPI\n\nNew content', attempt: 2 },
      nodeCost: {
        node: 'blockRegenerator',
        model: 'mock-model',
        input_tokens: 1,
        output_tokens: 1,
        cost_usd: 0,
      },
    });

    const result = await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'REGENERATE_BLOCK',
        blockId: 'block_6',
        instruction: 'Make metrics concrete',
        roleProfileSpec,
        originalBlock,
        generatedBlocks: { block_6: originalBlock },
      })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Regenerated Career Playbook block block_6');
    expect(mocks.regenerateCareerPlaybookBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: 'block_6',
        roleProfileSpec,
        originalBlock,
        userInstruction: 'Make metrics concrete',
        otherBlocks: { block_6: originalBlock },
      })
    );
  });

  it('routes PROCESS_SOURCE through the Career Playbook source processor', async () => {
    mocks.processCareerPlaybookSource.mockResolvedValue({
      sourceId: '00000000-0000-4000-8000-000000000015',
      fileId: '00000000-0000-4000-8000-000000000016',
      status: 'ready',
    });

    const sourceJob = job({
      ...baseJobData(),
      operation: 'PROCESS_SOURCE',
      sourceId: '00000000-0000-4000-8000-000000000015',
      fileId: '00000000-0000-4000-8000-000000000016',
      filePath: '/tmp/uploads/career-playbooks/context.pdf',
      mimeType: 'application/pdf',
    });

    const result = await new CareerPlaybookHandler().process(sourceJob);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Processed Career Playbook business context source');
    expect(result.data).toEqual({
      sourceId: '00000000-0000-4000-8000-000000000015',
      fileId: '00000000-0000-4000-8000-000000000016',
      status: 'ready',
    });
    expect(mocks.processCareerPlaybookSource).toHaveBeenCalledWith({
      playbookId,
      sourceId: '00000000-0000-4000-8000-000000000015',
      fileId: '00000000-0000-4000-8000-000000000016',
      filePath: '/tmp/uploads/career-playbooks/context.pdf',
      mimeType: 'application/pdf',
      organizationId,
      language: 'ru',
      job: sourceJob,
    });
  });

  it('does not fail playbook generation only because retained judge verdicts contain warnings', async () => {
    const builder = createBuilder([{ data: { id: playbookId }, error: null }]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        judgeVerdicts: [
          {
            pass: false,
            score: 80,
            issues: [
              {
                block_id: 'block_2',
                severity: 'warning',
                description: 'Regeneration budget exhausted; leave as warning.',
              },
            ],
            needs_regeneration: ['block_2'],
          },
        ],
        finalMarkdown: '## Header\n\n# B2B Sales Manager',
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    const result = await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Career Playbook generated');
    expect(result.error).toBeUndefined();
  });

  it('persists generated playbook output on GENERATE_PLAYBOOK success', async () => {
    const generatedBlocks = {
      header: {
        content: '# B2B Sales Manager',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
      },
    };
    const costBreakdown = {
      nodeCosts: [
        {
          node: 'specBuilder',
          model: 'mock-model',
          input_tokens: 10,
          output_tokens: 20,
          cost_usd: 0.01,
        },
      ],
      total_cost_usd: 0.01,
    };
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
      followups: [],
      freeform: [],
      generation_error: 'Previous failed attempt',
    };
    const builder = createBuilder([
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks,
        finalMarkdown: '# B2B Sales Manager',
        roleProfileSpec,
        costBreakdown,
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    const result = await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(result.success).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        generated_blocks: generatedBlocks,
        final_markdown: '# B2B Sales Manager',
        role_profile_spec: roleProfileSpec,
        cost_breakdown: costBreakdown,
        q_a_data: {
          fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
          followups: [],
          freeform: [],
          generation_progress: expect.objectContaining({
            stage: 'completed',
            percent: 100,
            updated_at: expect.any(String),
          }),
          generation_warnings: [],
        },
        completed_at: expect.any(String),
      })
    );
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
  });

  it('invokes the generation graph with the Career Playbook recursion limit', async () => {
    const invoke = vi.fn().mockResolvedValue({
      errors: [],
      generatedBlocks: {},
      finalMarkdown: '# B2B Sales Manager',
      roleProfileSpec,
    });
    const builder = createBuilder([
      { data: { q_a_data: { fixed: [], followups: [], freeform: [] } }, error: null },
      { data: { id: playbookId }, error: null },
      { data: { q_a_data: { fixed: [], followups: [], freeform: [] } }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    mocks.getCareerPlaybookGraphRecursionLimit.mockReturnValue(144);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke,
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId,
        currentNode: 'specBuilder',
      }),
      { recursionLimit: 144 }
    );
  });

  it('persists generation progress reported by the graph', async () => {
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
      followups: [],
      freeform: [],
    };
    const builder = createBuilder([
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockImplementation(((options: {
      progressReporter?: (progress: { stage: string; percent: number }) => Promise<void> | void;
    }) => ({
      invoke: vi.fn().mockImplementation(async () => {
        await options.progressReporter?.({ stage: 'building_profile', percent: 72 });
        return {
          errors: [],
          generatedBlocks: {},
          finalMarkdown: '# B2B Sales Manager',
          roleProfileSpec,
        };
      }),
    })) as unknown as typeof getCareerPlaybookGraphMock);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
        q_a_data: expect.objectContaining({
          generation_progress: expect.objectContaining({
            stage: 'building_profile',
            percent: 72,
            updated_at: expect.any(String),
          }),
        }),
      })
    );
  });

  it('retries playbook generation without persisting failed status before the final attempt', async () => {
    const builder = createBuilder([]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('LLM provider unavailable')),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await expect(
      new CareerPlaybookHandler().process(
        job(
          {
            ...baseJobData(),
            operation: 'GENERATE_PLAYBOOK',
            qaData: { fixed: [], followups: [], freeform: [] },
          },
          {
            attemptsMade: 0,
            opts: { attempts: 3 },
          } as Partial<Job<CareerPlaybookJobData>>
        )
      )
    ).rejects.toThrow('LLM provider unavailable');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
        q_a_data: expect.objectContaining({
          generation_progress: expect.objectContaining({
            stage: 'preparing_context',
            percent: 70,
          }),
        }),
      })
    );
    expect(builder.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('persists failed status and preserves existing QA data on final graph errors', async () => {
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
      followups: [],
      freeform: [],
      followup_generation_count: 1,
      followup_questions: [
        {
          question_id: '11111111-1111-4111-8111-111111111111',
          question_text: 'Which KPIs matter?',
          question_type: 'open',
          options: null,
          rationale: 'KPI context.',
        },
      ],
    };
    const builder = createBuilder([
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: ['specBuilder failed: missing role profile'],
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await expect(
      new CareerPlaybookHandler().process(
        job({
          ...baseJobData(),
          operation: 'GENERATE_PLAYBOOK',
          qaData: { fixed: [], followups: [], freeform: [] },
        })
      )
    ).rejects.toThrow('specBuilder failed: missing role profile');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        q_a_data: {
          ...existingQAData,
          generation_error: 'specBuilder failed: missing role profile',
          generation_progress: expect.objectContaining({
            stage: 'failed',
            percent: 100,
            updated_at: expect.any(String),
          }),
        },
      })
    );
  });

  it('persists failed status and generation_error when graph throws on the final attempt', async () => {
    const builder = createBuilder([
      { data: { q_a_data: { fixed: [], followups: [], freeform: [] } }, error: null },
      { data: { id: playbookId }, error: null },
      { data: { q_a_data: { fixed: [], followups: [], freeform: [] } }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('LLM provider unavailable')),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await expect(
      new CareerPlaybookHandler().process(
        job({
          ...baseJobData(),
          operation: 'GENERATE_PLAYBOOK',
          qaData: { fixed: [], followups: [], freeform: [] },
        })
      )
    ).rejects.toThrow('LLM provider unavailable');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        q_a_data: {
          fixed: [],
          followups: [],
          freeform: [],
          generation_error: 'LLM provider unavailable',
          generation_progress: expect.objectContaining({
            stage: 'failed',
            percent: 100,
            updated_at: expect.any(String),
          }),
        },
      })
    );
  });
});
