#!/usr/bin/env tsx
/**
 * What a course actually cost, and where the ledger is still blind.
 *
 * Exists for mc2-z0xr3: on 2026-08-16 a course showed $0.031 while OpenRouter
 * billed $0.065, and there was no way to see where the difference lived. Since
 * then the holes it was hiding have been closed one at a time — Stage 6 lesson
 * generation was unpriced, the intent classifier spent on a raw client with no
 * course, a served model variant was priced as its base, a paid call that
 * produced nothing recorded nothing, editing had no stage the database would
 * accept, and `|| null` filed a genuine $0 as "not measured". Reconciling the
 * next run against the invoice is what proves that work.
 *
 * Read-only. Never writes.
 *
 * Usage:
 *   pnpm cost:report <courseId> [--json]
 *   pnpm cost:report --since 2026-08-20T12:00:00Z [--json]
 *
 * The `--since` form is the one to compare against an OpenRouter invoice
 * window: pick the moment before the run started and read the provider's
 * dashboard for the same window.
 */

import { getSupabaseAdmin } from '../src/shared/supabase/admin.js';

interface TraceRow {
  id: string;
  course_id: string;
  stage: string;
  phase: string;
  step_name: string;
  model_used: string | null;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: string;
}

const PAGE = 1000;

function usd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/**
 * Every matching row, paged by cursor on `id`.
 *
 * Keyset, not offset, for the same reason `readCourseTraceRows` is: `id`
 * defaults to `gen_random_uuid()`, so with OFFSET a concurrent insert can shift
 * a boundary row into the next page and be counted twice. A cost report that
 * double-counts is worse than none.
 */
async function readRows(filter: { courseId?: string; since?: string }): Promise<TraceRow[]> {
  const supabase = getSupabaseAdmin();
  const rows: TraceRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    let query = supabase
      .from('generation_trace')
      .select(
        'id, course_id, stage, phase, step_name, model_used, tokens_used, cost_usd, created_at'
      );

    if (filter.courseId) query = query.eq('course_id', filter.courseId);
    if (filter.since) query = query.gte('created_at', filter.since);
    if (cursor !== null) query = query.gt('id', cursor);

    const page = await query.order('id', { ascending: true }).limit(PAGE);
    if (page.error) throw new Error(`Failed to read generation_trace: ${page.error.message}`);
    if (!page.data || page.data.length === 0) break;

    rows.push(...(page.data as TraceRow[]));
    cursor = (page.data[page.data.length - 1] as TraceRow).id;
  }

  return rows;
}

interface Bucket {
  key: string;
  calls: number;
  tokens: number;
  cost: number;
  unpriced: number;
}

function bucketBy(rows: TraceRow[], keyOf: (row: TraceRow) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = map.get(key) ?? { key, calls: 0, tokens: 0, cost: 0, unpriced: 0 };
    bucket.calls += 1;
    bucket.tokens += row.tokens_used ?? 0;
    bucket.cost += row.cost_usd ?? 0;
    // A row that spent tokens but carries no price is a hole in the ledger.
    // `cost_usd === 0` is NOT one: since mc2-y452l a measured zero is stored as
    // 0 and is distinguishable from "never measured".
    if (row.cost_usd === null && (row.tokens_used ?? 0) > 0) bucket.unpriced += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

function printTable(title: string, buckets: Bucket[]): void {
  console.log(`\n${title}`);
  console.log('─'.repeat(84));
  console.log(
    `${pad('', 42)}${padLeft('calls', 7)}${padLeft('tokens', 12)}${padLeft('cost', 13)}${padLeft('unpriced', 10)}`
  );
  for (const b of buckets) {
    const flag = b.unpriced > 0 ? String(b.unpriced) : '·';
    console.log(
      `${pad(b.key.slice(0, 41), 42)}${padLeft(String(b.calls), 7)}${padLeft(
        b.tokens.toLocaleString('en-US'),
        12
      )}${padLeft(usd(b.cost), 13)}${padLeft(flag, 10)}`
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex === -1 ? undefined : args[sinceIndex + 1];
  const courseId = args.find(a => !a.startsWith('--') && a !== since);

  if (!courseId && !since) {
    console.error('Usage: tsx scripts/cost-report.ts <courseId> | --since <ISO8601> [--json]');
    process.exitCode = 2;
    return;
  }

  const rows = await readRows({ courseId, since });

  if (rows.length === 0) {
    console.log('No generation_trace rows matched. Nothing was recorded for this selection.');
    return;
  }

  const total = rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  const tokens = rows.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
  const unpriced = rows.filter(r => r.cost_usd === null && (r.tokens_used ?? 0) > 0);
  const measuredZero = rows.filter(r => r.cost_usd === 0);
  const noModel = rows.filter(r => r.model_used === null && (r.tokens_used ?? 0) > 0);
  const editRows = rows.filter(r => r.stage === 'stage_edit');
  const times = rows.map(r => r.created_at).sort();

  if (json) {
    console.log(
      JSON.stringify(
        {
          rows: rows.length,
          totalCostUsd: Number(total.toFixed(6)),
          totalTokens: tokens,
          unpricedRows: unpriced.length,
          measuredZeroRows: measuredZero.length,
          rowsWithTokensButNoModel: noModel.length,
          editRows: editRows.length,
          editCostUsd: Number(editRows.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(6)),
          firstAt: times[0],
          lastAt: times[times.length - 1],
          byStage: bucketBy(rows, r => r.stage),
          byModel: bucketBy(rows, r => r.model_used ?? '(no model recorded)'),
        },
        null,
        2
      )
    );
    return;
  }

  console.log('\n══ RECORDED COST ══');
  console.log(`selection      ${courseId ? `course ${courseId}` : `since ${since}`}`);
  console.log(`window         ${times[0]}  →  ${times[times.length - 1]}`);
  console.log(`trace rows     ${rows.length}`);
  console.log(`tokens         ${tokens.toLocaleString('en-US')}`);
  console.log(`TOTAL          ${usd(total)}`);

  printTable(
    'BY STAGE',
    bucketBy(rows, r => r.stage)
  );
  printTable(
    'BY MODEL',
    bucketBy(rows, r => r.model_used ?? '(no model recorded)')
  );
  printTable('BY PHASE (top 15)', bucketBy(rows, r => `${r.stage}/${r.phase}`).slice(0, 15));

  console.log('\n══ LEDGER COVERAGE ══');
  console.log(
    `rows with tokens but NO price   ${unpriced.length}   <- each one is money the ledger missed`
  );
  console.log(
    `rows priced at exactly $0       ${measuredZero.length}   <- measured, not missing (mc2-y452l)`
  );
  console.log(
    `rows with tokens but no model   ${noModel.length}   <- usually stage-aggregate rows`
  );
  console.log(
    `stage_edit rows                 ${editRows.length}   <- chat, inline edits, element CRUD`
  );

  if (unpriced.length > 0) {
    console.log('\nUnpriced calls, newest first:');
    for (const row of unpriced.slice(-10).reverse()) {
      console.log(
        `  ${row.created_at}  ${pad(`${row.stage}/${row.phase}`, 34)} ${row.model_used ?? '(no model)'}`
      );
    }
  }

  if (courseId) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('courses')
      .select('estimated_cost_usd')
      .eq('id', courseId)
      .single();
    const stored =
      (data as { estimated_cost_usd: number | null } | null)?.estimated_cost_usd ?? null;
    console.log('\n══ CACHED TOTAL ══');
    console.log(`courses.estimated_cost_usd      ${stored === null ? 'NULL' : usd(stored)}`);
    console.log(`sum over generation_trace       ${usd(total)}`);
    if (stored !== null && Math.abs(stored - total) > 1e-6) {
      console.log('MISMATCH — the cached total is stale; a stage or edit refresh will correct it.');
    } else if (stored !== null) {
      console.log('match');
    }
  }

  console.log(
    '\nCompare TOTAL against the OpenRouter dashboard for the same window. A gap means\n' +
      'either an unpriced call above, or a model whose catalogue price is wrong (mc2-z0xr3).\n'
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
