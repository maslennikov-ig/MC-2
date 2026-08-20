/**
 * Contract: the course total is the sum of every trace row, however many there are.
 *
 * `getCourseTokenSummary` selected `generation_trace` with no range. PostgREST
 * applies `db-max-rows` to an unbounded select and returns the first page
 * without an error, so a long-lived course would have silently under-reported —
 * and this function became the writer of `courses.estimated_cost_usd` on every
 * edit (mc2-m8fi5), which is a number people read.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TraceRow {
  id: string;
  stage: string;
  tokens_used: number | null;
  cost_usd: number | null;
}

const state = {
  /** Kept sorted by id, the order the query asks for. */
  rows: [] as TraceRow[],
  /** Rows the server will return at most, however large a page was asked for. */
  serverCap: 1000,
  /** The cursor each request carried, `null` for the first page. */
  cursors: [] as Array<string | null>,
  failFromRequest: Number.POSITIVE_INFINITY,
  updated: [] as Array<number | null>,
  /** Lets a test insert a row while the read is in flight. */
  beforeRequest: undefined as ((requestNumber: number) => void) | undefined,
};

/** The keyset query the reader builds: `.eq(...)` then optionally `.gt(...)`, then order+limit. */
function traceQuery(cursor: string | null) {
  return {
    gt: (_column: string, value: string) => traceQuery(value),
    order: () => ({
      limit: (size: number) => {
        state.cursors.push(cursor);
        state.beforeRequest?.(state.cursors.length);
        if (state.cursors.length >= state.failFromRequest) {
          return Promise.resolve({ data: null, error: { message: 'connection reset' } });
        }
        const start = cursor === null ? 0 : state.rows.findIndex(row => row.id === cursor) + 1;
        const page = state.rows.slice(start, start + Math.min(size, state.serverCap));
        return Promise.resolve({ data: page, error: null });
      },
    }),
  };
}

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'courses') {
        return {
          update: (patch: { estimated_cost_usd: number }) => ({
            eq: () => {
              state.updated.push(patch.estimated_cost_usd);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return { select: () => ({ eq: () => traceQuery(null) }) };
    },
  }),
}));

vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import {
  getCourseTokenSummary,
  updateCourseEstimatedCost,
} from '@/services/token-tracking-service';

const COURSE_ID = '20000000-0000-4000-8000-000000000001';

/** Ids are assigned in sort order, which is what the real query orders by. */
let nextRowId = 0;
function traceRows(count: number, stage: string): TraceRow[] {
  return Array.from({ length: count }, () => ({
    id: `row-${String(nextRowId++).padStart(6, '0')}`,
    stage,
    tokens_used: 100,
    cost_usd: 0.001,
  }));
}

describe('reading a course with a long trace history', () => {
  beforeEach(() => {
    nextRowId = 0;
    state.rows = [];
    state.serverCap = 1000;
    state.cursors = [];
    state.failFromRequest = Number.POSITIVE_INFINITY;
    state.updated = [];
    state.beforeRequest = undefined;
  });

  it('sums every row rather than the first page', async () => {
    state.rows = traceRows(2_500, 'stage_6');

    const summary = await getCourseTokenSummary(COURSE_ID);

    expect(summary.totalTokens).toBe(250_000);
    expect(summary.totalCostUsd).toBeCloseTo(2.5, 6);
    expect(summary.byStage).toEqual([{ stage: 6, tokens: 250_000, cost: 2.5 }]);
  });

  it('keeps going when the server returns fewer rows than the page asked for', async () => {
    // A `db-max-rows` cap below the page size looks exactly like the end of the
    // table, which is how a cap under-reports without failing.
    state.rows = traceRows(1_200, 'stage_6');
    state.serverCap = 200;

    const summary = await getCourseTokenSummary(COURSE_ID);

    expect(summary.totalTokens).toBe(120_000);
    expect(state.cursors.length).toBe(7); // six full pages of 200, then the empty one
  });

  it('starts each page after the last row it was given', async () => {
    state.rows = traceRows(2_500, 'stage_6');

    await getCourseTokenSummary(COURSE_ID);

    // A cursor, not an offset: the first request carries none, and each later
    // one resumes from the id the previous page ended on.
    expect(state.cursors[0]).toBeNull();
    expect(state.cursors[1]).toBe(state.rows[999].id);
    expect(state.cursors[2]).toBe(state.rows[1_999].id);
  });

  it('counts a row inserted mid-read at most once', async () => {
    // `generation_trace.id` is a random uuid, so a row written while the read is
    // in flight sorts anywhere — including before the current page boundary,
    // where an OFFSET would have shifted a counted row into the next page and
    // added it a second time. Stage 6 refreshes the total as each lesson job
    // finishes while sibling jobs for the same course are still inserting.
    state.rows = traceRows(1_500, 'stage_6');
    state.serverCap = 1_000;
    state.beforeRequest = requestNumber => {
      if (requestNumber !== 2) return;
      state.rows = [
        { id: 'row-000000-a', stage: 'stage_6', tokens_used: 100, cost_usd: 0.001 },
        ...state.rows,
      ].sort((a, b) => a.id.localeCompare(b.id));
    };

    const summary = await getCourseTokenSummary(COURSE_ID);

    // 1500 rows, plus at most the one inserted behind the cursor — never 1501
    // counted twice at the boundary.
    expect(summary.totalTokens).toBe(150_000);
  });

  it('still separates editing from the numbered stages across pages', async () => {
    state.rows = [...traceRows(1_500, 'stage_6'), ...traceRows(600, 'stage_edit')];
    state.serverCap = 500;

    const summary = await getCourseTokenSummary(COURSE_ID);

    expect(summary.editing).toEqual({ tokens: 60_000, cost: 0.6 });
    expect(summary.byStage).toEqual([{ stage: 6, tokens: 150_000, cost: 1.5 }]);
    expect(summary.totalTokens).toBe(210_000);
  });

  it('writes the whole sum into the course, not a truncated one', async () => {
    state.rows = traceRows(2_500, 'stage_edit');

    await updateCourseEstimatedCost(COURSE_ID);

    expect(state.updated).toEqual([2.5]);
  });

  it('reports zero rather than a partial total when a page fails', async () => {
    state.rows = traceRows(2_500, 'stage_6');
    state.failFromRequest = 2;

    const summary = await getCourseTokenSummary(COURSE_ID);

    expect(summary).toEqual({
      totalTokens: 0,
      totalCostUsd: 0,
      byStage: [],
      editing: { tokens: 0, cost: 0 },
    });
  });

  it('leaves the recorded cost alone when the read did not finish', async () => {
    // The zero a failed read reports is not a cost. Writing it would replace a
    // real recorded figure with 0 on any transient failure, and paging makes
    // that likelier for exactly the courses with the most to lose.
    state.rows = traceRows(2_500, 'stage_6');
    state.failFromRequest = 2;

    const written = await updateCourseEstimatedCost(COURSE_ID);

    expect(state.updated).toEqual([]);
    expect(written).toBeUndefined();
  });

  it('does write a zero for a course that genuinely cost nothing', async () => {
    state.rows = [];

    const written = await updateCourseEstimatedCost(COURSE_ID);

    expect(state.updated).toEqual([0]);
    expect(written).toBe(0);
  });
});
