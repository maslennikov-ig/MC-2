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
  generateCareerPlaybookImage: vi.fn(),
  addJob: vi.fn(),
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

vi.mock('@/stages/stage-career-playbook/image-generation', () => ({
  generateCareerPlaybookImage: mocks.generateCareerPlaybookImage,
}));

vi.mock('@/stages/stage-career-playbook/graph', () => ({
  getCareerPlaybookGraph: vi.fn(),
  getCareerPlaybookGraphRecursionLimit: mocks.getCareerPlaybookGraphRecursionLimit,
}));

vi.mock('@/orchestrator/queue', () => ({
  addJob: mocks.addJob,
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
    mocks.addJob.mockResolvedValue(undefined);
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
        quality_issues: [],
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

  it('routes GENERATE_IMAGE through the Career Playbook image generator', async () => {
    mocks.generateCareerPlaybookImage.mockResolvedValue({
      imageUrl: 'https://cdn.example.test/career-playbooks/card.webp',
      storagePath: 'career-playbooks/00000000-0000-4000-8000-000000000001/card.webp',
    });

    const result = await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_IMAGE',
      })
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Generated Career Playbook image');
    expect(mocks.generateCareerPlaybookImage).toHaveBeenCalledWith(
      expect.objectContaining({
        ...baseJobData(),
        operation: 'GENERATE_IMAGE',
        force: false,
      })
    );
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
          quality_issues: [],
        },
        completed_at: expect.any(String),
      })
    );
    expect(builder.eq).toHaveBeenCalledWith('id', playbookId);
    expect(mocks.addJob).toHaveBeenCalledWith(
      JobType.CAREER_PLAYBOOK,
      expect.objectContaining({
        jobType: JobType.CAREER_PLAYBOOK,
        operation: 'GENERATE_IMAGE',
        playbookId,
        userId,
        organizationId,
      }),
      expect.objectContaining({
        jobId: `career-playbook-image-${playbookId}`,
      })
    );
  });

  it('persists judge quality issues while keeping internal retry warnings diagnostic-only', async () => {
    const generatedBlocks = {
      block_10: {
        content: '## 10. Dependencies',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 2,
        judge_verdict: {
          pass: false,
          score: 75,
          issues: [
            {
              block_id: 'block_10' as const,
              severity: 'critical' as const,
              description: 'Dependency diagram is too generic.',
              suggestion: 'Add named stakeholder handoffs.',
            },
          ],
          needs_regeneration: ['block_10' as const],
        },
      },
    };
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
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks,
        finalMarkdown: '# B2B Sales Manager',
        roleProfileSpec,
        warnings: [
          'crossBlockJudge advanced after max regeneration attempts (2/2) for block_10; unresolved issues remain in judge verdict.',
        ],
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        q_a_data: expect.objectContaining({
          generation_warnings: [
            'crossBlockJudge advanced after max regeneration attempts (2/2) for block_10; unresolved issues remain in judge verdict.',
          ],
          quality_issues: expect.arrayContaining([
            expect.objectContaining({
              source: 'cross_block_judge',
              severity: 'critical',
              blockId: 'block_10',
              title: 'Проблема качества блока',
              message: 'Dependency diagram is too generic.',
              suggestion: 'Add named stakeholder handoffs.',
              action: 'regenerate',
            }),
          ]),
        }),
      })
    );
    const persisted = builder.update.mock.calls.find(([payload]) =>
      Boolean((payload as { generated_blocks?: unknown }).generated_blocks)
    )?.[0] as {
      q_a_data?: { quality_issues?: Array<{ source?: string }> };
    };
    expect(persisted.q_a_data?.quality_issues).toHaveLength(1);
    expect(persisted.q_a_data?.quality_issues?.some(issue => issue.source === 'system')).toBe(
      false
    );
  });

  it('deduplicates copied cross-block judge issues by semantic content', async () => {
    const duplicatedJudgeVerdict = {
      pass: false,
      score: 45,
      issues: [
        {
          block_id: 'block_4' as const,
          severity: 'critical' as const,
          description: 'Block 4 was restored as fallback content.',
          suggestion: 'Regenerate block 4 with concrete duties.',
        },
        {
          block_id: 'block_6' as const,
          severity: 'warning' as const,
          description: 'Block 6 KPI content is too generic.',
          suggestion: 'Add measurable KPI examples.',
        },
      ],
      needs_regeneration: ['block_4' as const, 'block_6' as const],
    };
    const generatedBlocks = {
      block_1: {
        content: '## 1. Mission\n\nMission content',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
        judge_verdict: duplicatedJudgeVerdict,
      },
      block_2: {
        content: '## 2. Anti-goals\n\nAnti-goals content',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
        judge_verdict: duplicatedJudgeVerdict,
      },
      block_4: {
        content: '## 4. Duties\n\nFallback content',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
        judge_verdict: duplicatedJudgeVerdict,
      },
    };
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
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks,
        finalMarkdown: '# B2B Sales Manager',
        roleProfileSpec,
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    const persisted = builder.update.mock.calls.find(([payload]) =>
      Boolean((payload as { generated_blocks?: unknown }).generated_blocks)
    )?.[0] as {
      q_a_data?: {
        quality_issues?: Array<{ id: string; source: string; blockId?: string; message: string }>;
      };
    };

    expect(persisted.q_a_data?.quality_issues).toEqual([
      expect.objectContaining({
        id: 'cross_block_judge:block_1:block_4:0',
        source: 'cross_block_judge',
        blockId: 'block_4',
        message: 'Block 4 was restored as fallback content.',
      }),
      expect.objectContaining({
        id: 'cross_block_judge:block_1:block_6:1',
        source: 'cross_block_judge',
        blockId: 'block_6',
        message: 'Block 6 KPI content is too generic.',
      }),
    ]);
  });

  it('keeps unique ids for distinct cross-block judge issues targeting the same block', async () => {
    const generatedBlocks = {
      block_1: {
        content: '## 1. Mission\n\nMission content',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
        judge_verdict: {
          pass: false,
          score: 65,
          issues: [
            {
              block_id: 'block_4' as const,
              severity: 'critical' as const,
              description: 'Block 4 lacks concrete duty examples.',
              suggestion: 'Add duty examples from the role profile.',
            },
          ],
          needs_regeneration: ['block_4' as const],
        },
      },
      block_2: {
        content: '## 2. Anti-goals\n\nAnti-goals content',
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
        judge_verdict: {
          pass: false,
          score: 65,
          issues: [
            {
              block_id: 'block_4' as const,
              severity: 'warning' as const,
              description: 'Block 4 repeats anti-goals already covered elsewhere.',
              suggestion: 'Remove repeated anti-goal content from block 4.',
            },
          ],
          needs_regeneration: ['block_4' as const],
        },
      },
    };
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
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks,
        finalMarkdown: '# B2B Sales Manager',
        roleProfileSpec,
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    const persisted = builder.update.mock.calls.find(([payload]) =>
      Boolean((payload as { generated_blocks?: unknown }).generated_blocks)
    )?.[0] as {
      q_a_data?: {
        quality_issues?: Array<{ id: string; source: string; blockId?: string; message: string }>;
      };
    };

    expect(persisted.q_a_data?.quality_issues).toEqual([
      expect.objectContaining({
        id: 'cross_block_judge:block_1:block_4:0',
        source: 'cross_block_judge',
        blockId: 'block_4',
        message: 'Block 4 lacks concrete duty examples.',
      }),
      expect.objectContaining({
        id: 'cross_block_judge:block_2:block_4:0',
        source: 'cross_block_judge',
        blockId: 'block_4',
        message: 'Block 4 repeats anti-goals already covered elsewhere.',
      }),
    ]);
  });

  it('remediates invalid Mermaid from graph output before completed persistence', async () => {
    const invalidDiagram = `## 16. Main Process

\`\`\`mermaid
flowchart TD
  A[Секретарь (Senior)] --> B{Выбор сценария}
\`\`\``;
    const generatedBlocks = {
      block_16: {
        content: invalidDiagram,
        status: 'generated' as const,
        generated_at: '2026-05-19T00:01:00.000Z',
        llm_model: 'mock-model',
        attempt: 1,
      },
    };
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'Секретарь' }],
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
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        errors: [],
        generatedBlocks,
        finalMarkdown: invalidDiagram,
        roleProfileSpec,
      }),
    } as ReturnType<typeof getCareerPlaybookGraph>);

    await new CareerPlaybookHandler().process(
      job({
        ...baseJobData(),
        operation: 'GENERATE_PLAYBOOK',
        qaData: { fixed: [], followups: [], freeform: [] },
      })
    );

    const persisted = builder.update.mock.calls.find(([payload]) =>
      Boolean((payload as { generated_blocks?: unknown }).generated_blocks)
    )?.[0] as {
      generated_blocks?: Record<string, { content?: string }>;
      final_markdown?: string | null;
      q_a_data?: { quality_issues?: Array<{ source?: string; blockId?: string }> };
    };

    expect(persisted.generated_blocks?.block_16.content).not.toContain('A[Секретарь (Senior)]');
    expect(persisted.final_markdown).not.toContain('A[Секретарь (Senior)]');
    expect(persisted.final_markdown).not.toContain('Syntax error in text');
    expect(persisted.q_a_data?.quality_issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'mermaid',
          blockId: 'block_16',
        }),
      ])
    );
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

  it('does not persist lower active generation progress over a newer stored percent', async () => {
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
      followups: [],
      freeform: [],
      generation_progress: {
        stage: 'assembling',
        percent: 98,
        started_at: '2026-05-19T00:00:00.000Z',
        updated_at: '2026-05-19T00:02:00.000Z',
      },
    };
    const builder = createBuilder([
      { data: { q_a_data: existingQAData }, error: null },
      { data: { q_a_data: existingQAData }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockImplementation(((options: {
      progressReporter?: (progress: { stage: string; percent: number }) => Promise<void> | void;
    }) => ({
      invoke: vi.fn().mockImplementation(async () => {
        await options.progressReporter?.({ stage: 'building_profile', percent: 72 });
        throw new Error('retryable graph failure');
      }),
    })) as unknown as typeof getCareerPlaybookGraphMock);

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
    ).rejects.toThrow('retryable graph failure');

    const generatingUpdates = builder.update.mock.calls.filter(
      ([payload]) => (payload as { status?: string }).status === 'generating'
    );
    expect(generatingUpdates).toHaveLength(0);
  });

  it('allows active retry progress to clear stale generation_error after terminal failure', async () => {
    const existingQAData = {
      fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
      followups: [],
      freeform: [],
      generation_error: 'Previous failed attempt',
      generation_progress: {
        stage: 'failed',
        percent: 100,
        started_at: '2026-05-19T00:00:00.000Z',
        updated_at: '2026-05-19T00:02:00.000Z',
      },
    };
    const builder = createBuilder([
      { data: { q_a_data: existingQAData }, error: null },
      { data: { id: playbookId }, error: null },
    ]);
    mocks.from.mockReturnValue(builder);
    getCareerPlaybookGraphMock.mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('retryable graph failure')),
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
    ).rejects.toThrow('retryable graph failure');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'generating',
        q_a_data: {
          fixed: [{ question_key: 'position', value: 'B2B Sales Manager' }],
          followups: [],
          freeform: [],
          generation_progress: expect.objectContaining({
            stage: 'preparing_context',
            percent: 70,
          }),
        },
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
