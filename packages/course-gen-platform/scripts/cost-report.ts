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

// The runbook's command is `pnpm cost:report ...` and nothing else in this
// script reads a config file, so without this it exits 1 on
// "Missing Supabase configuration" and the reconciliation stops before it
// starts. The 2026-08-20 run worked around it with `set -a && . ./.env`, which
// is exactly the kind of undocumented step that makes a runbook untrustworthy
// (mc2-wjdfe).
import 'dotenv/config';

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
  input_data: Record<string, unknown> | null;
  error_data: Record<string, unknown> | null;
}

const PAGE = 1000;

/**
 * Whether this row represents a call somebody was billed for.
 *
 * The cost recorders stamp `input_data.billedCall`, and a call that died
 * mid-flight carries `error_data.spentButUnpriced`. Everything else with a token
 * count is a stage progress marker — `generator_complete`, `phase_complete`,
 * `judge_complete` — or a Jina embedding, which is not billed through OpenRouter
 * at all.
 *
 * The stamp is deliberate rather than inferred, because inference gets this
 * wrong in both directions. Token counts do not identify a call: `judge_complete`
 * records the whole cascade's totals and is unpriced *on purpose*, since each
 * judge call prices itself where it is made. Step names do not either: a caller
 * may pass its own, and `selfReviewer_complete` is a real priced call.
 *
 * The distinction is the difference between a metric and a rumour. On 2026-08-20
 * the report announced 21 rows of "money the ledger missed" and every one was a
 * marker or an embedding, which made the runbook's acceptance line "rows with
 * tokens but NO price = 0" unreachable by construction (mc2-wjmrd).
 */
function isBilledCallRow(row: TraceRow): boolean {
  if (row.input_data?.billedCall === true) return true;
  if (row.error_data?.spentButUnpriced === true) return true;
  // Rows written before the stamp existed. `llm_call` and `image_call` are the
  // recorders' defaults, so this classifies an older window correctly without
  // pretending a marker is a call.
  return row.step_name === 'llm_call' || row.step_name === 'image_call';
}

/** A billed call that still carries no price. These are the real holes. */
function isLedgerHole(row: TraceRow): boolean {
  // `=== null`, never falsy: a measured $0 is a measurement (mc2-y452l).
  return isBilledCallRow(row) && row.cost_usd === null;
}

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
        'id, course_id, stage, phase, step_name, model_used, tokens_used, cost_usd, created_at, input_data, error_data'
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
    if (isLedgerHole(row)) bucket.unpriced += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

/**
 * What the Career Playbook spent, which lives somewhere else entirely.
 *
 * Playbook costs are written to `career_playbooks.cost_breakdown`, not to
 * `generation_trace` — a playbook is not a course, and `generation_trace`
 * requires a `course_id` that references one. The report used to sum only the
 * trace, so on 2026-08-20 the window showed $0.076998 and called it the total
 * while a whole product line was outside it (mc2-rkmeg). Reconciling half a
 * ledger against a whole invoice can only ever fail.
 */
interface PlaybookCost {
  id: string;
  updatedAt: string;
  status: string;
  costUsd: number;
  unknownCostAttempts: number;
  calls: number;
}

async function readPlaybookCosts(filter: { since?: string }): Promise<PlaybookCost[]> {
  if (!filter.since) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, status, updated_at, cost_breakdown')
    .gte('updated_at', filter.since)
    .order('updated_at', { ascending: true });

  if (error) throw new Error(`Failed to read career_playbooks: ${error.message}`);

  return (data ?? []).map(row => {
    const raw = row as {
      id: string;
      status: string;
      updated_at: string;
      cost_breakdown: {
        total_cost_usd?: number;
        unknown_cost_attempts?: number;
        nodeCosts?: unknown[];
      } | null;
    };
    return {
      id: raw.id,
      status: raw.status,
      updatedAt: raw.updated_at,
      costUsd: raw.cost_breakdown?.total_cost_usd ?? 0,
      unknownCostAttempts: raw.cost_breakdown?.unknown_cost_attempts ?? 0,
      calls: Array.isArray(raw.cost_breakdown?.nodeCosts) ? raw.cost_breakdown.nodeCosts.length : 0,
    };
  });
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

  const [rows, playbooks] = await Promise.all([
    readRows({ courseId, since }),
    // Only the `--since` form: a course id selects a course, and a playbook is
    // not one.
    courseId ? Promise.resolve([]) : readPlaybookCosts({ since }),
  ]);

  if (rows.length === 0 && playbooks.length === 0) {
    console.log('No generation_trace rows matched. Nothing was recorded for this selection.');
    return;
  }

  const traceTotal = rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  const playbookTotal = playbooks.reduce((sum, p) => sum + p.costUsd, 0);
  const total = traceTotal + playbookTotal;
  const tokens = rows.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
  const billedCalls = rows.filter(isBilledCallRow);
  const unpriced = rows.filter(isLedgerHole);
  // Settled from `/api/v1/generation` rather than estimated from MODEL_CATALOG.
  const billedByProvider = rows.filter(
    r => (r.input_data as { billedByProvider?: boolean } | null)?.billedByProvider === true
  );
  const measuredZero = rows.filter(r => r.cost_usd === 0);
  const markerRows = rows.filter(r => !isBilledCallRow(r) && (r.tokens_used ?? 0) > 0);
  const noModel = rows.filter(r => r.model_used === null && (r.tokens_used ?? 0) > 0);
  const editRows = rows.filter(r => r.stage === 'stage_edit');
  const unknownCostAttempts = playbooks.reduce((sum, p) => sum + p.unknownCostAttempts, 0);
  const times = rows.map(r => r.created_at).sort();

  if (json) {
    console.log(
      JSON.stringify(
        {
          rows: rows.length,
          totalCostUsd: Number(total.toFixed(6)),
          traceCostUsd: Number(traceTotal.toFixed(6)),
          playbookCostUsd: Number(playbookTotal.toFixed(6)),
          totalTokens: tokens,
          billedCallRows: billedCalls.length,
          billedByProviderRows: billedByProvider.length,
          unpricedRows: unpriced.length,
          measuredZeroRows: measuredZero.length,
          progressMarkerRows: markerRows.length,
          rowsWithTokensButNoModel: noModel.length,
          editRows: editRows.length,
          editCostUsd: Number(editRows.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(6)),
          playbooks: playbooks.map(p => ({
            id: p.id,
            status: p.status,
            costUsd: Number(p.costUsd.toFixed(6)),
            calls: p.calls,
            unknownCostAttempts: p.unknownCostAttempts,
          })),
          unknownCostAttempts,
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
  console.log(`trace rows     ${rows.length}   (${billedCalls.length} of them billed calls)`);
  console.log(`tokens         ${tokens.toLocaleString('en-US')}`);
  console.log(`generation_trace ${usd(traceTotal)}`);
  if (playbooks.length > 0 || !courseId) {
    console.log(
      `career playbooks ${usd(playbookTotal)}   (${playbooks.length} in window)` +
        (unknownCostAttempts > 0 ? `  ${unknownCostAttempts} attempts of unknown cost` : '')
    );
  }
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

  if (playbooks.length > 0) {
    console.log('\nCAREER PLAYBOOKS IN WINDOW');
    console.log('─'.repeat(84));
    for (const p of playbooks) {
      console.log(
        `  ${p.updatedAt}  ${pad(p.id, 38)} ${pad(p.status, 10)} ${padLeft(usd(p.costUsd), 13)}` +
          `${padLeft(`${p.calls} calls`, 10)}` +
          (p.unknownCostAttempts > 0 ? `  ${p.unknownCostAttempts} unknown` : '')
      );
    }
  }

  console.log('\n══ LEDGER COVERAGE ══');
  console.log(
    `billed calls with NO price      ${unpriced.length}   <- each one is money the ledger missed`
  );
  console.log(
    `priced by the provider          ${billedByProvider.length}   <- from /api/v1/generation, not MODEL_CATALOG`
  );
  console.log(
    `rows priced at exactly $0       ${measuredZero.length}   <- measured, not missing (mc2-y452l)`
  );
  console.log(
    `progress markers with tokens    ${markerRows.length}   <- not calls; their tokens are already counted (mc2-wjmrd)`
  );
  console.log(
    `rows with tokens but no model   ${noModel.length}   <- usually stage-aggregate rows`
  );
  console.log(
    `stage_edit rows                 ${editRows.length}   <- chat, inline edits, element CRUD`
  );
  if (unknownCostAttempts > 0) {
    console.log(
      `playbook attempts of unknown cost ${unknownCostAttempts}   <- TOTAL is a lower bound by that much`
    );
  }

  if (unpriced.length > 0) {
    console.log('\nUnpriced calls, newest first:');
    for (const row of unpriced.slice(-10).reverse()) {
      console.log(
        `  ${row.created_at}  ${pad(`${row.stage}/${row.phase}`, 34)} ${pad(row.step_name, 20)} ${row.model_used ?? '(no model)'}`
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
    console.log(`sum over generation_trace       ${usd(traceTotal)}`);
    if (stored !== null && Math.abs(stored - traceTotal) > 1e-6) {
      console.log('MISMATCH — the cached total is stale; a stage or edit refresh will correct it.');
    } else if (stored !== null) {
      console.log('match');
    }
  }

  console.log(
    '\nCompare TOTAL against the OpenRouter dashboard, or the delta of /api/v1/credits,\n' +
      'for the same window. Since 2026-08-21 most rows are priced from\n' +
      "/api/v1/generation — the provider's own charge — so a gap now points at a call\n" +
      'that left no row at all rather than at a wrong catalogue price (mc2-z0xr3).\n'
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
