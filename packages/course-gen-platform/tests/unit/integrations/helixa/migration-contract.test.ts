import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The Helixa migrations install six triggers on three live tables (`courses`,
// `career_playbooks`, `file_catalog`). Every one of them is a row-level trigger in
// the same transaction as the write that fires it, so anything that raises inside
// one aborts an ordinary course or playbook completion. Two ways to raise had
// already shipped and no test could see them, because the only suites that execute
// this SQL are the `*-pg17.test.ts` files and those skip without a live database.
//
// 1. `pgcrypto` is installed in the `extensions` schema on this project, not
//    `public`. A function that pins `SET search_path = public` and calls a bare
//    `digest(...)` cannot resolve it. `20260711130000_document_conflict_auto_answers.sql`
//    already knew: it writes `extensions.digest(...)`.
// 2. A trigger function that reads a table revoked from `authenticated` needs
//    `SECURITY DEFINER`, or the privilege check fails for any caller who is not
//    `service_role` — and it fails whether or not the table holds any rows.
//
// Migrations apply in filename order and use CREATE OR REPLACE, so only the LAST
// definition of a function is the one the database ends up running. These
// assertions read that last definition, which is why the original 2026-08-23 files
// can keep their superseded bodies without failing here.

const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');

interface FunctionDefinition {
  file: string;
  body: string;
  header: string;
}

function migrationFilenames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d{14}_.+\.sql$/u.test(name))
    .sort();
}

/** The last `CREATE OR REPLACE FUNCTION <name>(` block across all migrations. */
function lastDefinitionOf(name: string): FunctionDefinition {
  let found: FunctionDefinition | undefined;
  for (const file of migrationFilenames()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const pattern = new RegExp(
      `CREATE OR REPLACE FUNCTION ${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
      'gu'
    );
    const matches = sql.match(pattern);
    if (matches && matches.length > 0) {
      const block = matches[matches.length - 1];
      found = { file, body: block, header: block.slice(0, block.indexOf('AS $$')) };
    }
  }
  if (!found) throw new Error(`No definition found for ${name}`);
  return found;
}

// Every Helixa function whose effective body hashes something.
const DIGEST_CALLERS = [
  'capture_helixa_role_guide_generation_proof',
  'validate_course_job_instruction_native_source',
  'schedule_helixa_course_from_role_guide',
];

// Trigger functions that read a table revoked from anon/authenticated. The
// file_catalog one is the sharp case: `file_catalog_all` lets an admin or
// instructor JWT UPDATE and DELETE, and `authenticated` has no BYPASSRLS.
const DEFINER_REQUIRED = [
  'prevent_helixa_native_source_file_mutation',
  'validate_course_job_instruction_native_source',
  'validate_course_job_instruction_source',
  'capture_helixa_role_guide_generation_proof',
  'schedule_helixa_role_guide',
  'fail_helixa_role_guide_generation',
];

// The two role-guide scheduling functions hash nothing today. They carry
// `extensions` on their search path anyway, so that a later edit adding a hash cannot
// reintroduce the 2026-09-05 defect by inheriting a `public`-only path.
const SEARCH_PATH_REQUIRED = [
  ...DIGEST_CALLERS,
  'schedule_helixa_role_guide',
  'fail_helixa_role_guide_generation',
];

describe('Helixa migration contract', () => {
  it.each(DIGEST_CALLERS)('%s resolves digest through the extensions schema', name => {
    const definition = lastDefinitionOf(name);
    expect(definition.body).toMatch(/extensions\.digest\(/u);
    // No bare `digest(` left anywhere in the effective body.
    expect(definition.body.replace(/extensions\.digest\(/gu, '')).not.toMatch(/\bdigest\(/u);
  });

  it.each(SEARCH_PATH_REQUIRED)('%s carries extensions on its search_path', name => {
    expect(lastDefinitionOf(name).header).toMatch(/SET search_path = public, extensions/u);
  });

  it.each(['schedule_helixa_role_guide', 'fail_helixa_role_guide_generation'])(
    '%s calls no bare digest',
    name => {
      const definition = lastDefinitionOf(name);
      expect(definition.body.replace(/extensions\.digest\(/gu, '')).not.toMatch(/\bdigest\(/u);
    }
  );

  it('schedules a role guide only under the command lease and an enabled binding', () => {
    const definition = lastDefinitionOf('schedule_helixa_role_guide');
    // The fence: the same command row, the same lease, the same claim generation, still
    // inside its lease window. Without all four a stale caller could write a second row.
    expect(definition.body).toMatch(/c\.lease_token = p_lease_token/u);
    expect(definition.body).toMatch(/c\.claim_generation = p_claim_generation/u);
    expect(definition.body).toMatch(/c\.lease_expires_at > NOW\(\)/u);
    expect(definition.body).toMatch(/GENERATION_COMMAND_FENCE_LOST/u);
    // The binding half that gates this command specifically, not the course one.
    expect(definition.body).toMatch(/binding\.job_instruction_creation_enabled/u);
    expect(definition.body).toMatch(/GENERATION_SERVICE_PRINCIPAL_INVALID/u);
    // The row it writes has to be the command the ledger stored, not a rewritten one.
    expect(definition.body).toMatch(/GENERATION_COMMAND_PAYLOAD_MISMATCH/u);
  });

  it('takes the outbox queue name from its caller, not a literal', () => {
    const definition = lastDefinitionOf('schedule_helixa_course_from_role_guide');
    // The outbox processor claims only rows whose target_queue equals its own QUEUE_NAME,
    // and dev runs as `course-generation-dev`. A literal here addressed every dev row to a
    // queue no dev worker reads.
    expect(definition.body).toMatch(/p_target_queue TEXT/u);
    expect(definition.body).toMatch(/jsonb_build_object\('priority', 0\), p_target_queue/u);
    expect(definition.body).not.toMatch(/'course-generation'/u);
    // Refused rather than defaulted: a default is how the literal survived.
    expect(definition.body).toMatch(/GENERATION_TARGET_QUEUE_REQUIRED/u);
  });

  it('schedules CREATE_COURSE under its ledger fence and direct-course permission', () => {
    const definition = lastDefinitionOf('schedule_helixa_course');
    expect(definition.body).toMatch(/c\.command_kind = 'CREATE_COURSE'/u);
    expect(definition.body).toMatch(/c\.lease_token = p_lease_token/u);
    expect(definition.body).toMatch(/c\.claim_generation = p_claim_generation/u);
    expect(definition.body).toMatch(/binding\.course_creation_enabled/u);
    expect(definition.body).toMatch(
      /command\.command_payload->'selectedSources' <> p_selected_sources/u
    );
    expect(definition.body).toMatch(/jsonb_build_object\('priority', 0\), p_target_queue/u);
    expect(definition.body).toMatch(/'structure_analysis'/u);
  });

  it('replaces the course scheduler rather than overloading it', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '20260905140000_helixa_course_schedule_target_queue.sql'),
      'utf8'
    );
    // Two functions sharing a name make every PostgREST rpc() call to it unresolvable.
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS schedule_helixa_course_from_role_guide\(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER\);/u
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION schedule_helixa_course_from_role_guide\([^)]*, TEXT\) TO service_role/u
    );
  });

  it('grants the role-guide scheduling functions to service_role only', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '20260905130000_helixa_schedule_role_guide.sql'),
      'utf8'
    );
    for (const name of ['schedule_helixa_role_guide', 'fail_helixa_role_guide_generation']) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION ${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`,
          'u'
        )
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION ${name}\\([^)]*\\) TO service_role`, 'u')
      );
    }
  });

  it.each(DEFINER_REQUIRED)('%s runs as definer', name => {
    expect(lastDefinitionOf(name).header).toMatch(/SECURITY DEFINER/u);
  });

  it('indexes every lookup the live-table triggers make on each write', () => {
    const sql = migrationFilenames()
      .map(file => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      .join('\n');
    // The enqueue pair reads bindings by organization on every courses and
    // career_playbooks write; the two markers and the proof capture read
    // generation commands the same way. None of the UNIQUE constraints can serve
    // them, because every one of those leads with `binding_id`.
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_helixa_knowledge_sync_bindings_organization_enabled[\s\S]*?helixa_knowledge_sync_bindings\(organization_id\)/u
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_helixa_generation_commands_organization_object[\s\S]*?helixa_generation_commands\(organization_id, object_kind, object_id\)/u
    );
  });

  it('scopes the native-generation observation to the organization it is given', () => {
    const definition = lastDefinitionOf('observe_helixa_native_generation');
    // Without this the outbox match is object + timestamp only, so a second
    // binding returns a foreign event id that complete_observed_… then refuses.
    expect(definition.body).toMatch(/outbox\.organization_id = p_organization_id/u);
  });
});
