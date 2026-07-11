import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const forwardPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711150000_document_evidence_observability_index.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711150000_document_evidence_observability_index_rollback.sql'
);
const forward = existsSync(forwardPath) ? readFileSync(forwardPath, 'utf8') : '';
const rollback = existsSync(rollbackPath) ? readFileSync(rollbackPath, 'utf8') : '';
const indexName = 'idx_clarifying_pending_critical_evidence_created_at';

describe('document evidence observability index migration', () => {
  it('covers the exact durable reconciliation predicate ordered by created_at', () => {
    expect(forward).toMatch(new RegExp(`CREATE INDEX (?:IF NOT EXISTS )?${indexName}`));
    expect(forward).toMatch(/ON public\.clarifying_questions\s*\(created_at\)/u);
    expect(forward).toContain("question_category = 'document_conflicts'");
    expect(forward).toContain("question_priority = 'critical'");
    expect(forward).toContain("status = 'pending'");
    expect(rollback).toContain(`DROP INDEX IF EXISTS public.${indexName}`);
  });
});

const databaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedDescribe = databaseUrl ? describe.sequential : describe.skip;
let client: Client;

function disposableUrl(value: string): string {
  const parsed = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    !/_test$/u.test(parsed.pathname.replace(/^\//u, ''))
  ) {
    throw new Error('Observability index tests require a loopback disposable _test database');
  }
  return value;
}

async function resetSchema(): Promise<void> {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    CREATE TABLE public.clarifying_questions (
      id uuid PRIMARY KEY,
      question_category text,
      question_priority text NOT NULL,
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function indexDefinition(): Promise<string | undefined> {
  const result = await client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
    [indexName]
  );
  return result.rows[0]?.indexdef;
}

appliedDescribe('document evidence observability index applied', () => {
  beforeAll(async () => {
    if (!databaseUrl) return;
    client = new Client({ connectionString: disposableUrl(databaseUrl) });
    await client.connect();
    await resetSchema();
  });

  afterAll(async () => {
    if (!client) return;
    await resetSchema();
    await client.end();
  });

  it('applies the exact partial index and supports the production oldest query', async () => {
    await client.query(forward);
    const definition = await indexDefinition();
    expect(definition).toContain(`CREATE INDEX ${indexName}`);
    expect(definition).toContain('USING btree (created_at)');
    expect(definition).toContain("question_category = 'document_conflicts'::text");
    expect(definition).toContain("question_priority = 'critical'::text");
    expect(definition).toContain("status = 'pending'::text");

    await client.query(`
      INSERT INTO public.clarifying_questions
        (id, question_category, question_priority, status, created_at)
      VALUES
        ('10000000-0000-4000-8000-000000000001','document_conflicts','critical','pending','2026-01-01T00:00:00Z'),
        ('10000000-0000-4000-8000-000000000002','document_conflicts','important','pending','2025-01-01T00:00:00Z');
      SET enable_seqscan=off;
    `);
    const plan = await client.query<{ 'QUERY PLAN': string }>(`
      EXPLAIN (COSTS OFF)
      SELECT created_at
      FROM public.clarifying_questions
      WHERE question_category='document_conflicts'
        AND question_priority='critical'
        AND status='pending'
      ORDER BY created_at ASC
      LIMIT 1
    `);
    expect(plan.rows.map(row => row['QUERY PLAN']).join('\n')).toContain(indexName);
  });

  it('rolls back cleanly and reapplies idempotently', async () => {
    await client.query(rollback);
    expect(await indexDefinition()).toBeUndefined();
    await client.query(forward);
    await client.query(forward);
    expect(await indexDefinition()).toContain(indexName);
  });
});
