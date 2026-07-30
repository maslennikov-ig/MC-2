import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REAL_PG17 = process.env.MC2_Q12_REAL_PG17 === '1';
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const STRUCTURAL_CATALOG = resolve(REPO_ROOT, 'deploy/qdrant/q12-structural-catalog.sql');
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'q12-local-pg17-fixture-only';
const CONTROLLER_GUC =
  '-c megacampus.q12_fixture_controller=on -c default_transaction_read_only=off';
const CONTAINER = `mc2-q12-pg17-${process.pid}-${Date.now()}`;
const PLAN_CAPTURE = resolve(REPO_ROOT, 'deploy/qdrant/q12-migration-plan-capture.py');
const structuralCatalogSql = readFileSync(STRUCTURAL_CATALOG, 'utf8').trim();
let familyBaseline: StructuralSnapshot;

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface StructuralSnapshot {
  hash: string;
  payload: string;
}

interface MutationProbe {
  family: string;
  mutate: string;
  cleanup: string;
  redacted?: string;
}

interface CommentProbe {
  objectType: string;
  mutate: string;
  cleanup: string;
  comment: string;
}

interface PsqlOptions {
  controller?: boolean;
  appName?: string;
  database?: string;
}

interface AsyncPsql {
  child: ChildProcessWithoutNullStreams;
  output: () => string;
}

const mutationProbes: readonly MutationProbe[] = [
  {
    family: 'access_methods',
    mutate: 'CREATE ACCESS METHOD fixture_probe_am TYPE INDEX HANDLER pg_catalog.bthandler',
    cleanup: 'DROP ACCESS METHOD fixture_probe_am',
  },
  {
    family: 'casts',
    mutate:
      'CREATE CAST (fixture.cast_source AS fixture.cast_target) WITH FUNCTION fixture.cast_source_to_target(fixture.cast_source) AS ASSIGNMENT',
    cleanup: 'DROP CAST (fixture.cast_source AS fixture.cast_target)',
  },
  {
    family: 'collations',
    mutate: "CREATE COLLATION fixture.probe_collation (provider = libc, locale = 'C')",
    cleanup: 'DROP COLLATION fixture.probe_collation',
  },
  {
    family: 'conversions',
    mutate:
      "CREATE CONVERSION fixture.probe_conversion FOR 'UTF8' TO 'LATIN1' FROM pg_catalog.utf8_to_iso8859_1",
    cleanup: 'DROP CONVERSION fixture.probe_conversion',
  },
  {
    family: 'foreign_data_wrappers',
    mutate: "CREATE FOREIGN DATA WRAPPER fixture_probe_fdw OPTIONS (purpose 'q12')",
    cleanup: 'DROP FOREIGN DATA WRAPPER fixture_probe_fdw',
  },
  {
    family: 'foreign_servers',
    mutate:
      "CREATE SERVER fixture_probe_server TYPE 'q12' VERSION '17' FOREIGN DATA WRAPPER fixture_base_fdw OPTIONS (host '127.0.0.1')",
    cleanup: 'DROP SERVER fixture_probe_server',
  },
  {
    family: 'user_mappings',
    mutate:
      "CREATE USER MAPPING FOR PUBLIC SERVER fixture_base_server OPTIONS (user 'fixture', password 'q12-user-mapping-secret')",
    cleanup: 'DROP USER MAPPING FOR PUBLIC SERVER fixture_base_server',
    redacted: 'q12-user-mapping-secret',
  },
  {
    family: 'languages',
    mutate:
      'CREATE TRUSTED PROCEDURAL LANGUAGE fixture_language HANDLER pg_catalog.plpgsql_call_handler INLINE pg_catalog.plpgsql_inline_handler VALIDATOR pg_catalog.plpgsql_validator',
    cleanup: 'DROP LANGUAGE fixture_language',
  },
  {
    family: 'operators',
    mutate:
      'CREATE OPERATOR fixture.=== (FUNCTION = fixture.integer_equal, LEFTARG = integer, RIGHTARG = integer)',
    cleanup: 'DROP OPERATOR fixture.=== (integer, integer)',
  },
  {
    family: 'operator_families',
    mutate: 'CREATE OPERATOR FAMILY fixture.probe_family USING btree',
    cleanup: 'DROP OPERATOR FAMILY fixture.probe_family USING btree',
  },
  {
    family: 'operator_classes',
    mutate: `CREATE OPERATOR CLASS fixture.probe_opclass FOR TYPE integer USING btree
      FAMILY fixture.base_family AS
      OPERATOR 1 < (integer, integer),
      OPERATOR 2 <= (integer, integer),
      OPERATOR 3 = (integer, integer),
      OPERATOR 4 >= (integer, integer),
      OPERATOR 5 > (integer, integer),
      FUNCTION 1 fixture.integer_compare(integer, integer)`,
    cleanup: 'DROP OPERATOR CLASS fixture.probe_opclass USING btree',
  },
  {
    family: 'extended_statistics',
    mutate:
      'CREATE STATISTICS fixture.probe_statistics (dependencies, ndistinct) ON left_value, right_value FROM fixture.statistics_input',
    cleanup: 'DROP STATISTICS fixture.probe_statistics',
  },
  {
    family: 'text_search_parsers',
    mutate: `CREATE TEXT SEARCH PARSER fixture.probe_parser (
      START = pg_catalog.prsd_start,
      GETTOKEN = pg_catalog.prsd_nexttoken,
      END = pg_catalog.prsd_end,
      LEXTYPES = pg_catalog.prsd_lextype,
      HEADLINE = pg_catalog.prsd_headline
    )`,
    cleanup: 'DROP TEXT SEARCH PARSER fixture.probe_parser',
  },
  {
    family: 'text_search_templates',
    mutate:
      'CREATE TEXT SEARCH TEMPLATE fixture.probe_template (INIT = pg_catalog.dsimple_init, LEXIZE = pg_catalog.dsimple_lexize)',
    cleanup: 'DROP TEXT SEARCH TEMPLATE fixture.probe_template',
  },
  {
    family: 'text_search_dictionaries',
    mutate: 'CREATE TEXT SEARCH DICTIONARY fixture.probe_dictionary (TEMPLATE = pg_catalog.simple)',
    cleanup: 'DROP TEXT SEARCH DICTIONARY fixture.probe_dictionary',
  },
  {
    family: 'text_search_configurations',
    mutate:
      'CREATE TEXT SEARCH CONFIGURATION fixture.probe_configuration (COPY = pg_catalog.simple)',
    cleanup: 'DROP TEXT SEARCH CONFIGURATION fixture.probe_configuration',
  },
  {
    family: 'transforms',
    mutate: `CREATE TRANSFORM FOR jsonb LANGUAGE plpgsql (
      FROM SQL WITH FUNCTION pg_catalog.dsimple_init(internal),
      TO SQL WITH FUNCTION pg_catalog.jsonb_recv(internal)
    )`,
    cleanup: 'DROP TRANSFORM FOR jsonb LANGUAGE plpgsql',
  },
  {
    family: 'publications',
    mutate:
      'CREATE PUBLICATION fixture_probe_publication FOR TABLE fixture.statistics_input (left_value) WHERE (left_value > 0)',
    cleanup: 'DROP PUBLICATION fixture_probe_publication',
  },
  {
    family: 'subscriptions',
    mutate: `CREATE SUBSCRIPTION fixture_probe_subscription
      CONNECTION 'host=127.0.0.1 dbname=postgres user=postgres password=q12-subscription-secret'
      PUBLICATION fixture_base_publication
      WITH (connect = false, create_slot = false, enabled = false, slot_name = NONE)`,
    cleanup: 'DROP SUBSCRIPTION fixture_probe_subscription',
    redacted: 'q12-subscription-secret',
  },
] as const;

const commentProbes: readonly CommentProbe[] = [
  {
    objectType: 'access method',
    mutate: "COMMENT ON ACCESS METHOD fixture_comment_am IS 'q12-comment-access-method'",
    cleanup: 'COMMENT ON ACCESS METHOD fixture_comment_am IS NULL',
    comment: 'q12-comment-access-method',
  },
  {
    objectType: 'cast',
    mutate:
      "COMMENT ON CAST (fixture.comment_cast_source AS fixture.comment_cast_target) IS 'q12-comment-cast'",
    cleanup: 'COMMENT ON CAST (fixture.comment_cast_source AS fixture.comment_cast_target) IS NULL',
    comment: 'q12-comment-cast',
  },
  {
    objectType: 'event trigger',
    mutate: "COMMENT ON EVENT TRIGGER fixture_comment_event_trigger IS 'q12-comment-event-trigger'",
    cleanup: 'COMMENT ON EVENT TRIGGER fixture_comment_event_trigger IS NULL',
    comment: 'q12-comment-event-trigger',
  },
  {
    objectType: 'foreign data wrapper',
    mutate:
      "COMMENT ON FOREIGN DATA WRAPPER fixture_base_fdw IS 'q12-comment-foreign-data-wrapper'",
    cleanup: 'COMMENT ON FOREIGN DATA WRAPPER fixture_base_fdw IS NULL',
    comment: 'q12-comment-foreign-data-wrapper',
  },
  {
    objectType: 'foreign server',
    mutate: "COMMENT ON SERVER fixture_base_server IS 'q12-comment-foreign-server'",
    cleanup: 'COMMENT ON SERVER fixture_base_server IS NULL',
    comment: 'q12-comment-foreign-server',
  },
  {
    objectType: 'language',
    mutate: "COMMENT ON LANGUAGE fixture_comment_language IS 'q12-comment-language'",
    cleanup: 'COMMENT ON LANGUAGE fixture_comment_language IS NULL',
    comment: 'q12-comment-language',
  },
  {
    objectType: 'publication',
    mutate: "COMMENT ON PUBLICATION fixture_base_publication IS 'q12-comment-publication'",
    cleanup: 'COMMENT ON PUBLICATION fixture_base_publication IS NULL',
    comment: 'q12-comment-publication',
  },
  {
    objectType: 'subscription',
    mutate: "COMMENT ON SUBSCRIPTION fixture_comment_subscription IS 'q12-comment-subscription'",
    cleanup: 'COMMENT ON SUBSCRIPTION fixture_comment_subscription IS NULL',
    comment: 'q12-comment-subscription',
  },
  {
    objectType: 'transform',
    mutate: "COMMENT ON TRANSFORM FOR json LANGUAGE plpgsql IS 'q12-comment-transform'",
    cleanup: 'COMMENT ON TRANSFORM FOR json LANGUAGE plpgsql IS NULL',
    comment: 'q12-comment-transform',
  },
] as const;

function docker(args: string[], input?: string, timeout = 120_000): CommandResult {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function psqlResult(sql: string, options: PsqlOptions = {}): CommandResult {
  const environment = [
    '-e',
    `PGPASSWORD=${POSTGRES_PASSWORD}`,
    '-e',
    `PGAPPNAME=${options.appName ?? 'q12-pg17-fixture'}`,
  ];
  if (options.controller) environment.push('-e', `PGOPTIONS=${CONTROLLER_GUC}`);
  return docker(
    [
      'exec',
      '-i',
      ...environment,
      CONTAINER,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      options.database ?? 'postgres',
      '-At',
    ],
    `${sql.trim()}\n`
  );
}

function psql(sql: string, options: PsqlOptions = {}): string {
  const result = psqlResult(sql, options);
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

// psql -At still echoes BEGIN/SET/COMMIT status lines for a multi-statement script; the catalog hash
// is the sole 64-hex line in the output.
function hashLine(output: string): string {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[0-9a-f]{64}$/u.test(line));
  expect(lines, `no unique 64-hex hash line in: ${output}`).toHaveLength(1);
  return lines[0];
}

function snapshot(options: PsqlOptions = {}): StructuralSnapshot {
  const serialized = psql(
    `
      SELECT jsonb_build_object(
        'hash', canonical.structural_sha256,
        'payload', canonical.payload
      )::text
      FROM (
        ${structuralCatalogSql}
      ) canonical
    `,
    options
  );
  const parsed = JSON.parse(serialized) as { hash: string; payload: unknown };
  return { hash: parsed.hash, payload: JSON.stringify(parsed.payload) };
}

function spawnPsql(sql: string, options: { controller?: boolean; appName: string }): AsyncPsql {
  const environment = [
    '-e',
    `PGPASSWORD=${POSTGRES_PASSWORD}`,
    '-e',
    `PGAPPNAME=${options.appName}`,
  ];
  if (options.controller) environment.push('-e', `PGOPTIONS=${CONTROLLER_GUC}`);
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      ...environment,
      CONTAINER,
      'psql',
      '-X',
      '-h',
      '127.0.0.1',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });
  child.stdin.end(`${sql.trim()}\n`);
  return { child, output: () => output };
}

async function waitForOutput(session: AsyncPsql, marker: string, timeout = 15_000): Promise<void> {
  const started = Date.now();
  while (!session.output().includes(marker)) {
    if (session.child.exitCode !== null) {
      throw new Error(`psql exited before ${marker}: ${session.output()}`);
    }
    if (Date.now() - started > timeout) {
      session.child.kill('SIGKILL');
      throw new Error(`timed out waiting for ${marker}: ${session.output()}`);
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
}

async function waitForExit(session: AsyncPsql, timeout = 30_000): Promise<number | null> {
  if (session.child.exitCode !== null) return session.child.exitCode;
  return await new Promise((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      session.child.kill('SIGKILL');
      rejectExit(new Error(`timed out waiting for psql: ${session.output()}`));
    }, timeout);
    session.child.once('exit', code => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
}

const installGuardSql = `
  CREATE SCHEMA q12_guard AUTHORIZATION postgres;
  CREATE FUNCTION q12_guard.enforce_ddl_barrier() RETURNS event_trigger
  LANGUAGE plpgsql AS $guard$
  BEGIN
    IF current_setting('megacampus.q12_fixture_controller', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Q12 fixture DDL requires the controller capability';
    END IF;
  END
  $guard$;
  CREATE FUNCTION q12_guard.enforce_write_barrier() RETURNS trigger
  LANGUAGE plpgsql AS $guard$
  BEGIN
    IF current_setting('megacampus.q12_fixture_controller', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Q12 fixture writes require the controller capability';
    END IF;
    RETURN NEW;
  END
  $guard$;
  CREATE TRIGGER q12_guard_row BEFORE INSERT OR UPDATE OR DELETE
    ON supabase_migrations.schema_migrations
    FOR EACH ROW EXECUTE FUNCTION q12_guard.enforce_write_barrier();
  CREATE EVENT TRIGGER q12_guard_ddl_command_start
    ON ddl_command_start EXECUTE FUNCTION q12_guard.enforce_ddl_barrier();
`;

function tx1Installer(sleepSeconds: number): AsyncPsql {
  return spawnPsql(
    `
      BEGIN;
      LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
      \\echo Q12_TX1_LOCKED
      SELECT pg_sleep(${sleepSeconds});
      ${installGuardSql}
      COMMIT;
      \\echo Q12_TX1_COMMITTED
    `,
    { controller: true, appName: 'q12-race-controller' }
  );
}

function preTriggerDdlClient(suffix: string, afterDdlSql: string, appName: string): AsyncPsql {
  return spawnPsql(
    `
      BEGIN;
      CREATE TABLE fixture.race_relation_${suffix}(id integer PRIMARY KEY);
      CREATE TYPE fixture.race_type_${suffix} AS ENUM ('one', 'two');
      CREATE FUNCTION fixture.race_function_${suffix}(value integer) RETURNS integer
        LANGUAGE SQL IMMUTABLE AS $function$ SELECT value + 1 $function$;
      CREATE COLLATION fixture.race_collation_${suffix} (provider = libc, locale = 'C');
      \\echo Q12_PRE_TRIGGER_DDL_READY
      ${afterDdlSql};
      COMMIT;
      \\echo Q12_CLIENT_COMMITTED
    `,
    { appName }
  );
}

function resetGuardAndRaceObjects(suffix: string): void {
  psql(
    `
      DROP EVENT TRIGGER IF EXISTS q12_guard_ddl_command_start;
      DROP TRIGGER IF EXISTS q12_guard_row ON supabase_migrations.schema_migrations;
      DROP FUNCTION IF EXISTS fixture.race_function_${suffix}(integer);
      DROP TABLE IF EXISTS fixture.race_relation_${suffix};
      DROP TYPE IF EXISTS fixture.race_type_${suffix};
      DROP COLLATION IF EXISTS fixture.race_collation_${suffix};
      DELETE FROM supabase_migrations.schema_migrations WHERE version LIKE 'q12-race-${suffix}%';
      DROP SCHEMA IF EXISTS q12_guard CASCADE;
    `,
    { controller: true }
  );
}

function createOidParityDatabase(
  database: 'q12_order_a' | 'q12_order_b',
  typeOrder: readonly ['alpha' | 'beta', 'alpha' | 'beta']
): void {
  psql(`CREATE DATABASE ${database} TEMPLATE template0`);
  const types = typeOrder
    .map(typeName => `CREATE TYPE fixture.${typeName} AS ENUM ('low', 'high')`)
    .join(';\n');
  psql(
    `
      CREATE SCHEMA extensions;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(
        version text PRIMARY KEY,
        name text,
        statements text[]
      );
      CREATE SCHEMA fixture;
      ${types};
      CREATE FUNCTION fixture.alpha_less(fixture.alpha, fixture.alpha)
        RETURNS boolean LANGUAGE SQL IMMUTABLE STRICT
        AS $function$ SELECT $1::text < $2::text $function$;
      CREATE FUNCTION fixture.beta_less(fixture.beta, fixture.beta)
        RETURNS boolean LANGUAGE SQL IMMUTABLE STRICT
        AS $function$ SELECT $1::text < $2::text $function$;
      CREATE FUNCTION fixture.alpha_compare(fixture.alpha, fixture.alpha)
        RETURNS integer LANGUAGE SQL IMMUTABLE STRICT
        AS $function$
          SELECT CASE WHEN $1::text < $2::text THEN -1
            WHEN $1::text > $2::text THEN 1 ELSE 0 END
        $function$;
      CREATE FUNCTION fixture.beta_compare(fixture.beta, fixture.beta)
        RETURNS integer LANGUAGE SQL IMMUTABLE STRICT
        AS $function$
          SELECT CASE WHEN $1::text < $2::text THEN -1
            WHEN $1::text > $2::text THEN 1 ELSE 0 END
        $function$;
      CREATE OPERATOR fixture.<^ (
        FUNCTION = fixture.alpha_less,
        LEFTARG = fixture.alpha,
        RIGHTARG = fixture.alpha
      );
      CREATE OPERATOR fixture.<^ (
        FUNCTION = fixture.beta_less,
        LEFTARG = fixture.beta,
        RIGHTARG = fixture.beta
      );
      CREATE OPERATOR FAMILY fixture.order_family USING btree;
      ALTER OPERATOR FAMILY fixture.order_family USING btree ADD
        OPERATOR 1 fixture.<^ (fixture.alpha, fixture.alpha),
        OPERATOR 1 fixture.<^ (fixture.beta, fixture.beta),
        FUNCTION 1 (fixture.alpha, fixture.alpha)
          fixture.alpha_compare(fixture.alpha, fixture.alpha),
        FUNCTION 1 (fixture.beta, fixture.beta)
          fixture.beta_compare(fixture.beta, fixture.beta);
    `,
    { database }
  );
}

describe.runIf(REAL_PG17)('Q12 canonical catalog against real PostgreSQL 17.10', () => {
  beforeAll(async () => {
    expect(structuralCatalogSql).not.toContain(';');
    const started = docker([
      'run',
      '-d',
      '--rm',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_IMAGE,
      '-c',
      'wal_level=logical',
    ]);
    expect(started.status, started.stderr).toBe(0);

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = psqlResult("SELECT current_setting('server_version_num')");
      if (probe.status === 0 && probe.stdout.trim().startsWith('17')) {
        ready = true;
        break;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
    }
    expect(ready, docker(['logs', CONTAINER]).stdout).toBe(true);

    psql(`
      CREATE SCHEMA extensions;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(
        version text PRIMARY KEY,
        name text,
        statements text[]
      );
      CREATE SCHEMA fixture;
      CREATE TYPE fixture.cast_source AS ENUM ('source');
      CREATE TYPE fixture.cast_target AS ENUM ('target');
      CREATE FUNCTION fixture.cast_source_to_target(fixture.cast_source)
        RETURNS fixture.cast_target LANGUAGE SQL IMMUTABLE
        AS $function$ SELECT 'target'::fixture.cast_target $function$;
      CREATE FUNCTION fixture.integer_equal(integer, integer)
        RETURNS boolean LANGUAGE SQL IMMUTABLE STRICT
        AS $function$ SELECT $1 = $2 $function$;
      CREATE FUNCTION fixture.integer_compare(integer, integer)
        RETURNS integer LANGUAGE internal IMMUTABLE STRICT PARALLEL SAFE AS 'btint4cmp';
      CREATE TABLE fixture.statistics_input(left_value integer, right_value integer);
      CREATE FOREIGN DATA WRAPPER fixture_base_fdw;
      CREATE SERVER fixture_base_server FOREIGN DATA WRAPPER fixture_base_fdw;
      CREATE OPERATOR FAMILY fixture.base_family USING btree;
      CREATE PUBLICATION fixture_base_publication;
      CREATE ACCESS METHOD fixture_comment_am TYPE INDEX HANDLER pg_catalog.bthandler;
      CREATE TYPE fixture.comment_cast_source AS ENUM ('source');
      CREATE TYPE fixture.comment_cast_target AS ENUM ('target');
      CREATE FUNCTION fixture.comment_cast_source_to_target(fixture.comment_cast_source)
        RETURNS fixture.comment_cast_target LANGUAGE SQL IMMUTABLE
        AS $function$ SELECT 'target'::fixture.comment_cast_target $function$;
      CREATE CAST (fixture.comment_cast_source AS fixture.comment_cast_target)
        WITH FUNCTION fixture.comment_cast_source_to_target(fixture.comment_cast_source);
      CREATE TRUSTED PROCEDURAL LANGUAGE fixture_comment_language
        HANDLER pg_catalog.plpgsql_call_handler
        INLINE pg_catalog.plpgsql_inline_handler
        VALIDATOR pg_catalog.plpgsql_validator;
      CREATE FUNCTION fixture.comment_event_trigger() RETURNS event_trigger
        LANGUAGE plpgsql AS $function$ BEGIN END $function$;
      CREATE EVENT TRIGGER fixture_comment_event_trigger
        ON ddl_command_end EXECUTE FUNCTION fixture.comment_event_trigger();
      CREATE TRANSFORM FOR json LANGUAGE plpgsql (
        FROM SQL WITH FUNCTION pg_catalog.dsimple_init(internal),
        TO SQL WITH FUNCTION pg_catalog.json_recv(internal)
      );
      CREATE SUBSCRIPTION fixture_comment_subscription
        CONNECTION 'host=127.0.0.1 dbname=postgres user=postgres password=q12-comment-fixture'
        PUBLICATION fixture_base_publication
        WITH (connect = false, create_slot = false, enabled = false, slot_name = NONE);
    `);
    familyBaseline = snapshot();
  }, 120_000);

  afterAll(() => {
    docker(['rm', '-f', CONTAINER], undefined, 30_000);
  });

  // mc2-34eua follow-up: the plan CAPTURES this catalog and the barrier RE-MEASURES it, and the two
  // must agree byte-for-byte or barrier.install dies at 'pre-guard canonical structural catalog
  // drift'. They ran in DIFFERENT session contexts: the barrier sets `SET LOCAL
  // search_path=pg_catalog` (a hardening it must keep) while q12-migration-plan-capture.py's
  // read_only_wrap set no search_path at all. Every definition-rendering catalog function
  // (pg_get_indexdef / pg_get_constraintdef / pg_get_expr / format_type /
  // pg_get_function_identity_arguments) SUPPRESSES the schema qualifier for objects visible in the
  // current search_path, so the same database hashes differently under the two contexts and the
  // window could never pass C1. Measured on production 2026-07-28: default search_path
  // cfe6b92b…, search_path=pg_catalog a2b25324….
  //
  // Case 1 keeps case 2 honest: it proves the sensitivity is REAL on this fixture, so an accidental
  // future change that made the hash search_path-insensitive would show up here rather than turning
  // the agreement assertion vacuous.
  it('renders the catalog search_path-SENSITIVELY when a visible-schema object is involved', () => {
    psql(`
      CREATE TYPE public.sp_enum AS ENUM ('a', 'b');
      CREATE TABLE public.sp_table(
        value public.sp_enum DEFAULT 'a'::public.sp_enum,
        CONSTRAINT sp_check CHECK (value = 'a'::public.sp_enum)
      );
    `);
    try {
      const visible = hashLine(
        psql(`SELECT canonical.structural_sha256 FROM (\n${structuralCatalogSql}\n) canonical`)
      );
      const pgCatalogOnly = hashLine(
        psql(
          `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
         SET LOCAL search_path=pg_catalog;
         SELECT canonical.structural_sha256 FROM (\n${structuralCatalogSql}\n) canonical;
         COMMIT;`
        )
      );
      expect(pgCatalogOnly).not.toBe(visible);
    } finally {
      psql(`
        DROP TABLE IF EXISTS public.sp_table;
        DROP TYPE IF EXISTS public.sp_enum;
      `);
    }
  });

  it('captures the catalog in the SAME session context the barrier re-measures it in', () => {
    psql(`
      CREATE TYPE public.sp_enum AS ENUM ('a', 'b');
      CREATE TABLE public.sp_table(
        value public.sp_enum DEFAULT 'a'::public.sp_enum,
        CONSTRAINT sp_check CHECK (value = 'a'::public.sp_enum)
      );
    `);
    try {
      // The REAL capture wrapper, emitted by the deployed capture script itself — never a copy of
      // its text, so a future divergence in read_only_wrap fails this test.
      const emit = spawnSync(
        '/usr/bin/python3',
        [
          '-c',
          [
            'import importlib.util, sys',
            `spec = importlib.util.spec_from_file_location('cap', ${JSON.stringify(PLAN_CAPTURE)})`,
            'module = importlib.util.module_from_spec(spec)',
            'spec.loader.exec_module(module)',
            'body = sys.stdin.read()',
            'sys.stdout.write(module.read_only_wrap(body))',
          ].join('\n'),
        ],
        {
          encoding: 'utf8',
          input: `SELECT structural_sha256 FROM (\n${structuralCatalogSql}\n) AS plan_capture`,
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
          maxBuffer: 8 * 1024 * 1024,
        }
      );
      expect(emit.status, emit.stderr).toBe(0);
      // COPY ... TO STDOUT emits the single column; psql -At passes it through.
      const captureHash = hashLine(psql(emit.stdout));

      const barrierHash = hashLine(
        psql(
          `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY;
         SET LOCAL search_path=pg_catalog;
         SELECT canonical.structural_sha256 FROM (\n${structuralCatalogSql}\n) canonical;
         COMMIT;`
        )
      );

      expect(captureHash).toBe(barrierHash);
    } finally {
      psql(`
        DROP TABLE IF EXISTS public.sp_table;
        DROP TYPE IF EXISTS public.sp_enum;
      `);
    }
  });

  it('proves a fresh session inherits read-only while an explicit primary READ WRITE transaction remains possible', () => {
    psql('ALTER DATABASE postgres SET default_transaction_read_only=on', { controller: true });
    try {
      expect(psql("SELECT current_setting('transaction_read_only')")).toBe('on');
      const explicit = psqlResult(
        "BEGIN READ WRITE; SELECT current_setting('transaction_read_only'); ROLLBACK"
      );
      expect(explicit.status, explicit.stderr).toBe(0);
      expect(explicit.stdout.trim()).toContain('off');
    } finally {
      psql('ALTER DATABASE postgres SET default_transaction_read_only=off', { controller: true });
    }
    expect(psql("SELECT current_setting('transaction_read_only')")).toBe('off');
  });

  it.each(mutationProbes)(
    'changes and exactly restores the $family family hash',
    probe => {
      psql(probe.mutate);
      const changed = snapshot();
      try {
        expect(changed.hash).not.toBe(familyBaseline.hash);
        if (probe.redacted) expect(changed.payload).not.toContain(probe.redacted);
      } finally {
        psql(probe.cleanup);
      }
      expect(snapshot().hash).toBe(familyBaseline.hash);
    },
    120_000
  );

  it.each(commentProbes)(
    'changes and exactly restores a schema-less $objectType COMMENT',
    probe => {
      psql(probe.mutate);
      const changed = snapshot();
      try {
        expect(changed.hash).not.toBe(familyBaseline.hash);
        expect(changed.payload).toContain(probe.comment);
      } finally {
        psql(probe.cleanup);
      }
      expect(snapshot().hash).toBe(familyBaseline.hash);
    },
    120_000
  );

  it('redacts every standalone, table, and column FDW option while preserving hash drift', () => {
    const secrets = [
      'q12-fdw-option-secret',
      'q12-server-option-secret',
      'q12-table-option-secret',
      'q12-column-option-secret',
    ] as const;
    psql(`
      ALTER FOREIGN DATA WRAPPER fixture_base_fdw
        OPTIONS (ADD secret 'q12-fdw-option-secret');
      ALTER SERVER fixture_base_server
        OPTIONS (ADD password 'q12-server-option-secret');
      CREATE FOREIGN TABLE fixture.secret_foreign_table(
        id integer OPTIONS (column_secret 'q12-column-option-secret')
      ) SERVER fixture_base_server
        OPTIONS (table_secret 'q12-table-option-secret');
    `);
    const changed = snapshot();
    try {
      expect(changed.hash).not.toBe(familyBaseline.hash);
      for (const secret of secrets) expect(changed.payload).not.toContain(secret);
    } finally {
      psql(`
        DROP FOREIGN TABLE fixture.secret_foreign_table;
        ALTER SERVER fixture_base_server OPTIONS (DROP password);
        ALTER FOREIGN DATA WRAPPER fixture_base_fdw OPTIONS (DROP secret);
      `);
    }
    expect(snapshot().hash).toBe(familyBaseline.hash);
  }, 120_000);

  it('produces byte-identical payload and hash across equivalent reordered type OIDs', () => {
    createOidParityDatabase('q12_order_a', ['alpha', 'beta']);
    createOidParityDatabase('q12_order_b', ['beta', 'alpha']);
    const first = snapshot({ database: 'q12_order_a' });
    const second = snapshot({ database: 'q12_order_b' });
    expect(second.payload).toBe(first.payload);
    expect(second.hash).toBe(first.hash);
  }, 120_000);

  it('rolls back pre-trigger relation/function/type/nonrelation DDL at history visibility', async () => {
    const suffix = 'history';
    resetGuardAndRaceObjects(suffix);
    const before = snapshot();
    const controller = tx1Installer(3);
    await waitForOutput(controller, 'Q12_TX1_LOCKED');
    const client = preTriggerDdlClient(
      suffix,
      `INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
        VALUES ('q12-race-history', 'race', ARRAY['blocked']);
       SELECT pg_sleep(30)`,
      'q12-race-client-history'
    );
    await waitForOutput(client, 'Q12_PRE_TRIGGER_DDL_READY');
    expect(await waitForExit(controller), controller.output()).toBe(0);
    psql(
      `
      SELECT pg_terminate_backend(pid, 5000)
      FROM pg_catalog.pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'q12-race-client-history'
        AND pid <> pg_backend_pid()
    `,
      { controller: true }
    );
    expect(await waitForExit(client), client.output()).not.toBe(0);
    expect(
      psql(
        `
        SELECT jsonb_build_object(
          'relation', to_regclass('fixture.race_relation_history'),
          'type', to_regtype('fixture.race_type_history'),
          'function', to_regprocedure('fixture.race_function_history(integer)'),
          'collation', to_regcollation('fixture.race_collation_history'),
          'history', (SELECT count(*) FROM supabase_migrations.schema_migrations
            WHERE version = 'q12-race-history')
        )::text
      `,
        { controller: true }
      )
    ).toBe('{"type": null, "history": 0, "function": null, "relation": null, "collation": null}');
    expect(snapshot().hash).toBe(before.hash);
    resetGuardAndRaceObjects(suffix);
  }, 120_000);

  it('rejects a pre-trigger DDL transaction that commits after tx1 at the locked tx2 rehash', async () => {
    const suffix = 'commit';
    resetGuardAndRaceObjects(suffix);
    const before = snapshot();
    const controller = tx1Installer(3);
    await waitForOutput(controller, 'Q12_TX1_LOCKED');
    const client = preTriggerDdlClient(suffix, 'SELECT pg_sleep(6)', 'q12-race-client-commit');
    await waitForOutput(client, 'Q12_PRE_TRIGGER_DDL_READY');
    expect(await waitForExit(controller), controller.output()).toBe(0);
    expect(await waitForExit(client), client.output()).toBe(0);
    const committedObjects = psql(
      `
        SELECT jsonb_build_object(
          'relation', to_regclass('fixture.race_relation_commit') IS NOT NULL,
          'type', to_regtype('fixture.race_type_commit') IS NOT NULL,
          'function', to_regprocedure('fixture.race_function_commit(integer)') IS NOT NULL,
          'collation', to_regcollation('fixture.race_collation_commit') IS NOT NULL
        )::text
      `,
      { controller: true }
    );
    const committedSnapshot = snapshot();
    expect(
      committedSnapshot.hash,
      `objects=${committedObjects} controller=${controller.output()} client=${client.output()}`
    ).not.toBe(before.hash);

    const tx2 = psqlResult(
      `
        BEGIN ISOLATION LEVEL READ COMMITTED;
        LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
        DO $verify$
        DECLARE actual text;
        BEGIN
          SELECT canonical.structural_sha256 INTO STRICT actual
          FROM (
            ${structuralCatalogSql}
          ) canonical;
          IF actual IS DISTINCT FROM '${before.hash}' THEN
            RAISE EXCEPTION 'canonical structural catalog drift at guard checkpoint';
          END IF;
        END
        $verify$;
        COMMIT;
      `,
      { controller: true }
    );
    expect(tx2.status).not.toBe(0);
    expect(tx2.stderr).toContain('canonical structural catalog drift at guard checkpoint');
    expect(snapshot().hash).toBe(committedSnapshot.hash);
    resetGuardAndRaceObjects(suffix);
  }, 120_000);

  it('rejects new post-trigger DDL before it can change the canonical hash', () => {
    const suffix = 'post';
    resetGuardAndRaceObjects(suffix);
    const before = snapshot();
    psql(installGuardSql, { controller: true });
    const blocked = psqlResult('CREATE TABLE fixture.race_relation_post(id integer)', {
      appName: 'q12-race-client-post',
    });
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('Q12 fixture DDL requires the controller capability');
    expect(psql("SELECT to_regclass('fixture.race_relation_post') IS NULL")).toBe('t');
    expect(snapshot().hash).toBe(before.hash);
    resetGuardAndRaceObjects(suffix);
  });
});
