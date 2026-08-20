/**
 * Contract: the restart migration says what it means about traces and cost.
 *
 * `restart_from_stage` deletes the traces of the stages it is about to redo.
 * Two things were wrong with the list and one thing was right but unwritten:
 *
 *  - stage_7 was missing, so a restart from stage 2 — which re-runs the
 *    pipeline through enrichments — counted the previous run's stage-7 spend
 *    alongside the new one (mc2-fyn4f);
 *  - `courses.estimated_cost_usd` is the cached SUM of the rows the DELETE just
 *    removed and was never resynced, so a restart whose regeneration failed
 *    early left the course claiming the cost of a run that no longer exists;
 *  - `stage_edit` rows correctly survive, because that money was really spent
 *    on chat and inline edits and is not being redone. Nothing said so, which
 *    is how a correct behaviour gets "fixed".
 *
 * And the migration exists at all because two overloads with identical
 * parameter names made every named-argument RPC call unresolvable (mc2-wxvyr).
 *
 * Asserted against the SQL text rather than a live database: this suite has no
 * Postgres, and the file is the artifact that ships. `.sql` is outside
 * lint-staged's formatters, so the text does not move under the assertions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = join(
  __dirname,
  '../../../supabase/migrations/20260820140100_restart_from_stage_single_signature.sql'
);

const sql = readFileSync(MIGRATION, 'utf-8');

/** The body of the one DELETE against generation_trace. */
function traceDeleteClause(): string {
  const start = sql.indexOf('DELETE FROM generation_trace');
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf(';', start);
  return sql.slice(start, end);
}

describe('what a restart clears', () => {
  it('deletes the traces of every stage it is about to redo, stage 7 included', () => {
    const clause = traceDeleteClause();

    for (const stage of ['stage_2%', 'stage_3%', 'stage_4%', 'stage_5%', 'stage_6%', 'stage_7%']) {
      expect(clause).toContain(stage);
    }
  });

  it('keeps what the user spent editing', () => {
    // Not conditional, not commented out — absent from the DELETE entirely.
    expect(traceDeleteClause()).not.toContain('stage_edit');
  });

  it('says out loud why editing is kept, so it is not "fixed" later', () => {
    expect(sql).toMatch(/stage_edit[\s\S]{0,400}?(deliberately|really spent)/i);
  });

  it('resyncs the cached course total from the rows that survive', () => {
    expect(sql).toContain('SUM(cost_usd)');
    expect(sql).toMatch(/UPDATE courses\s+SET estimated_cost_usd/);
  });
});

describe('how many functions answer to the name', () => {
  it('drops the overload that made the RPC unresolvable', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.restart_from_stage(UUID, UUID, INTEGER)');
  });

  it('keeps the admin bypass the dropped overload carried', () => {
    // The simpler repair — dropping the overload and stopping — would have
    // removed a capability someone deliberately added, four months later.
    expect(sql).toMatch(/role IN \('admin', 'superadmin'\)/);
  });

  it('asserts exactly one signature survives, rather than trusting it', () => {
    expect(sql).toContain('must have exactly one signature');
  });

  it('pins search_path, which the dropped overload did not', () => {
    expect(sql).toContain('SET search_path = public');
    expect(sql).toContain('must pin search_path=public');
  });
});
