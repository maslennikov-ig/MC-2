/**
 * Career Playbook admin cost evidence.
 * @module server/routers/admin/career-playbook-costs
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CareerPlaybookCostBreakdownSchema,
  CareerPlaybookPlaybookStatusSchema,
  type CareerPlaybookCostBreakdown,
} from '@megacampus/shared-types';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';

interface CareerPlaybookCostRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: string;
  language: string;
  position_title: string | null;
  cost_breakdown: unknown;
  created_at: string;
  completed_at: string | null;
}

interface CareerPlaybookCostQuery {
  select: (columns: string, options?: { count?: 'exact' }) => CareerPlaybookCostQuery;
  eq: (column: string, value: unknown) => CareerPlaybookCostQuery;
  order: (column: string, options?: { ascending?: boolean }) => CareerPlaybookCostQuery;
  range: (
    from: number,
    to: number
  ) => Promise<{ data: CareerPlaybookCostRow[] | null; count: number | null; error: unknown }>;
}

interface CareerPlaybookCostSupabase {
  from(table: 'career_playbooks'): CareerPlaybookCostQuery;
}

const CareerPlaybookCostNodeEvidenceSchema = z.object({
  stage: z.string(),
  node: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
});

const CareerPlaybookCostEvidenceItemSchema = z.object({
  playbookId: z.string().uuid(),
  title: z.string(),
  status: CareerPlaybookPlaybookStatusSchema,
  costBreakdownValid: z.boolean(),
  language: z.string(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  totalCostUsd: z.number().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  nodes: z.array(CareerPlaybookCostNodeEvidenceSchema),
});

const CareerPlaybookCostEvidenceResponseSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  playbooks: z.array(CareerPlaybookCostEvidenceItemSchema),
});

const CareerPlaybookCostEvidenceInputSchema = z.object({
  playbookId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  status: CareerPlaybookPlaybookStatusSchema.optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stageFromNode(node: string): string {
  if (node === 'followupGenerator') return 'followup';
  if (node === 'specBuilder') return 'spec';
  if (node === 'crossBlockJudge') return 'judge';
  if (node === 'blockRegenerator') return 'regeneration';

  const groupMatch = /^group(\d+)Generator$/.exec(node);
  if (groupMatch) return `group_${groupMatch[1]}`;

  return node;
}

function parseCostBreakdown(raw: unknown): {
  costBreakdown: CareerPlaybookCostBreakdown;
  valid: boolean;
} {
  const parsed = CareerPlaybookCostBreakdownSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      costBreakdown: { nodeCosts: [], total_cost_usd: 0 },
      valid: false,
    };
  }

  return { costBreakdown: parsed.data, valid: true };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mapCostRow(row: CareerPlaybookCostRow) {
  const parsedStatus = CareerPlaybookPlaybookStatusSchema.safeParse(row.status);
  const status = parsedStatus.success ? parsedStatus.data : 'failed';
  const { costBreakdown, valid } = parseCostBreakdown(row.cost_breakdown);
  const nodes = costBreakdown.nodeCosts.map(nodeCost => {
    const inputTokens = nodeCost.input_tokens;
    const outputTokens = nodeCost.output_tokens;
    return {
      stage: stageFromNode(nodeCost.node),
      node: nodeCost.node,
      model: nodeCost.model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: nodeCost.cost_usd,
      ...(typeof nodeCost.duration_ms === 'number' ? { durationMs: nodeCost.duration_ms } : {}),
    };
  });
  const totalInputTokens = nodes.reduce((sum, node) => sum + node.inputTokens, 0);
  const totalOutputTokens = nodes.reduce((sum, node) => sum + node.outputTokens, 0);
  const nodeCostTotal = nodes.reduce((sum, node) => sum + node.costUsd, 0);
  const totalCostUsd =
    costBreakdown.total_cost_usd > 0 || nodeCostTotal === 0
      ? costBreakdown.total_cost_usd
      : nodeCostTotal;

  return {
    playbookId: row.id,
    title: row.position_title ?? 'Untitled Career Playbook',
    status,
    costBreakdownValid: valid,
    language: row.language,
    organizationId: row.organization_id,
    userId: row.user_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    totalCostUsd: roundMetric(totalCostUsd),
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    nodes,
  };
}

export const careerPlaybookCostsRouter = router({
  getCareerPlaybookCostEvidence: adminProcedure
    .input(CareerPlaybookCostEvidenceInputSchema)
    .output(CareerPlaybookCostEvidenceResponseSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      if (
        ctx.user.role !== 'superadmin' &&
        input.organizationId &&
        input.organizationId !== ctx.user.organizationId
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Organization admins can only view their own organization cost evidence',
        });
      }

      try {
        const supabase = getSupabaseAdmin() as unknown as CareerPlaybookCostSupabase;
        let query = supabase
          .from('career_playbooks')
          .select(
            'id, user_id, organization_id, status, language, position_title, cost_breakdown, created_at, completed_at',
            { count: 'exact' }
          )
          .order('created_at', { ascending: false });

        if (input.playbookId) {
          query = query.eq('id', input.playbookId);
        }

        if (ctx.user.role === 'superadmin') {
          if (input.organizationId) {
            query = query.eq('organization_id', input.organizationId);
          }
        } else {
          query = query.eq('organization_id', ctx.user.organizationId);
        }

        if (input.status) {
          query = query.eq('status', input.status);
        }

        const { data, count, error } = await query.range(
          input.offset,
          input.offset + input.limit - 1
        );

        if (error) {
          throw new Error(errorMessageFrom(error));
        }

        const playbooks = (data ?? []).map(mapCostRow);
        const totalInputTokens = playbooks.reduce(
          (sum, playbook) => sum + playbook.totalInputTokens,
          0
        );
        const totalOutputTokens = playbooks.reduce(
          (sum, playbook) => sum + playbook.totalOutputTokens,
          0
        );
        const totalCostUsd = playbooks.reduce((sum, playbook) => sum + playbook.totalCostUsd, 0);

        return {
          totalCount: count ?? playbooks.length,
          pageCount: playbooks.length,
          totalCostUsd: roundMetric(totalCostUsd),
          totalInputTokens,
          totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          playbooks,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to fetch Career Playbook cost evidence');
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch Career Playbook cost evidence: ${errorMessageFrom(error)}`,
        });
      }
    }),
});

export type CareerPlaybookCostsRouter = typeof careerPlaybookCostsRouter;
