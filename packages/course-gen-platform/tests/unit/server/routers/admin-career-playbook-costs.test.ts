import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mocks.from,
  })),
}));

vi.mock('@/shared/logger/index.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { adminRouter } from '@/server/routers/admin';
import type { Context } from '@/server/trpc';

const orgA = '22222222-2222-4222-8222-222222222222';
const orgB = '99999999-9999-4999-8999-999999999999';

const superadminContext: Context = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'root@example.com',
    role: 'superadmin',
    organizationId: orgA,
  },
  req: new Request('http://localhost/trpc'),
};

const adminContext: Context = {
  user: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@example.com',
    role: 'admin',
    organizationId: orgA,
  },
  req: new Request('http://localhost/trpc'),
};

function playbookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    user_id: '55555555-5555-4555-8555-555555555555',
    organization_id: orgA,
    status: 'completed',
    language: 'ru',
    position_title: 'Sales Manager B2B',
    cost_breakdown: {
      nodeCosts: [
        {
          node: 'specBuilder',
          model: 'anthropic/claude-sonnet-4.5',
          input_tokens: 1200,
          output_tokens: 400,
          cost_usd: 0.012,
        },
        {
          node: 'group2Generator',
          model: 'anthropic/claude-sonnet-4.5',
          input_tokens: 2200,
          output_tokens: 900,
          cost_usd: 0.031,
        },
      ],
      total_cost_usd: 0.043,
    },
    created_at: '2026-05-19T10:00:00.000Z',
    completed_at: '2026-05-19T10:10:00.000Z',
    ...overrides,
  };
}

function createCareerPlaybookCostsBuilder(data: unknown[], count = data.length) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => Promise.resolve({ data, count, error: null })),
  };

  return builder;
}

describe('admin Career Playbook cost evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates Career Playbook cost breakdown by playbook and node', async () => {
    const builder = createCareerPlaybookCostsBuilder([playbookRow()]);
    mocks.from.mockReturnValue(builder);

    const caller = adminRouter.createCaller(superadminContext);
    const result = await caller.getCareerPlaybookCostEvidence({ limit: 10 });

    expect(mocks.from).toHaveBeenCalledWith('career_playbooks');
    expect(builder.select).toHaveBeenCalledWith(
      'id, user_id, organization_id, status, language, position_title, cost_breakdown, created_at, completed_at',
      { count: 'exact' }
    );
    expect(result).toMatchObject({
      totalCount: 1,
      pageCount: 1,
      totalCostUsd: 0.043,
      totalInputTokens: 3400,
      totalOutputTokens: 1300,
      playbooks: [
        {
          playbookId: '44444444-4444-4444-8444-444444444444',
          title: 'Sales Manager B2B',
          costBreakdownValid: true,
          totalCostUsd: 0.043,
          totalInputTokens: 3400,
          totalOutputTokens: 1300,
          totalTokens: 4700,
          nodes: [
            {
              stage: 'spec',
              node: 'specBuilder',
              model: 'anthropic/claude-sonnet-4.5',
              inputTokens: 1200,
              outputTokens: 400,
              totalTokens: 1600,
              costUsd: 0.012,
            },
            {
              stage: 'group_2',
              node: 'group2Generator',
              inputTokens: 2200,
              outputTokens: 900,
              totalTokens: 3100,
              costUsd: 0.031,
            },
          ],
        },
      ],
    });
  });

  it('scopes organization admins to their own organization even without an input filter', async () => {
    const builder = createCareerPlaybookCostsBuilder([playbookRow()]);
    mocks.from.mockReturnValue(builder);

    const caller = adminRouter.createCaller(adminContext);
    await caller.getCareerPlaybookCostEvidence({});

    expect(builder.eq).toHaveBeenCalledWith('organization_id', orgA);
  });

  it('keeps page totals distinct from the full filtered count', async () => {
    const builder = createCareerPlaybookCostsBuilder([playbookRow()], 2);
    mocks.from.mockReturnValue(builder);

    const caller = adminRouter.createCaller(superadminContext);
    const result = await caller.getCareerPlaybookCostEvidence({ limit: 1 });

    expect(result.totalCount).toBe(2);
    expect(result.pageCount).toBe(1);
    expect(result.totalCostUsd).toBe(0.043);
    expect(result.totalTokens).toBe(4700);
  });

  it('marks invalid cost breakdowns instead of presenting them as verified evidence', async () => {
    const builder = createCareerPlaybookCostsBuilder([
      playbookRow({
        cost_breakdown: {
          nodeCosts: [{ node: '', model: '', input_tokens: -1, output_tokens: 0, cost_usd: 0 }],
          total_cost_usd: 0,
        },
      }),
    ]);
    mocks.from.mockReturnValue(builder);

    const caller = adminRouter.createCaller(superadminContext);
    const result = await caller.getCareerPlaybookCostEvidence({});

    expect(result.playbooks[0]).toMatchObject({
      costBreakdownValid: false,
      totalCostUsd: 0,
      totalTokens: 0,
      nodes: [],
    });
  });

  it('rejects organization admins who request another organization filter', async () => {
    const builder = createCareerPlaybookCostsBuilder([]);
    mocks.from.mockReturnValue(builder);

    const caller = adminRouter.createCaller(adminContext);

    await expect(
      caller.getCareerPlaybookCostEvidence({ organizationId: orgB })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(builder.range).not.toHaveBeenCalled();
  });
});
