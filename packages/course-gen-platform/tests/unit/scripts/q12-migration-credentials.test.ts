import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindQ12MigrationSession,
  loadQ12MigrationCredentials,
  Q12_MIGRATION_CA_SHA256,
  Q12_MIGRATION_ENDPOINT,
  Q12_MIGRATION_STARTUP_OPTIONS,
  Q12_MIGRATION_SET_CAPABILITY_SQL,
  assertNoQ12UrlEnvironmentOrArgument,
  resolveMigrationConnectionSource,
  type Q12MigrationCredentialPaths,
  type Q12MigrationRunContext,
} from '../../../scripts/migrations/document-evidence-approved';
import { assertConcurrentIndexPacketSafe } from '../../../scripts/migrations/document-evidence-observability-index';

const SYNTHETIC_PASSWORD = 'syn-p@ss/w?rd:#42';
const SYNTHETIC_CAPABILITY = 'mc2-synthetic-db-capability-do-not-log-0000';
const SYNTHETIC_CA = Buffer.from(
  '-----BEGIN CERTIFICATE-----\nSYNTHETIC-Q12-TEST-CA\n-----END CERTIFICATE-----\n'
);
const SYNTHETIC_CA_SHA256 = createHash('sha256').update(SYNTHETIC_CA).digest('hex');

function canonicalUri(password = SYNTHETIC_PASSWORD): string {
  const { protocol, user, host, port, database } = Q12_MIGRATION_ENDPOINT;
  return `${protocol}//${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

interface Fixture {
  boundary: string;
  paths: Q12MigrationCredentialPaths;
  overrides: { trustBoundary: string; expectedCaSha256: string };
}

const roots: string[] = [];

async function makeFixture(
  options: {
    url?: string;
    urlMode?: number;
    caBytes?: Buffer;
    caMode?: number;
    capabilityMode?: number;
    urlName?: string;
  } = {}
): Promise<Fixture> {
  const boundary = await mkdtemp(join(tmpdir(), 'mc2-q12-cred-'));
  roots.push(boundary);
  await chmod(boundary, 0o700);
  const secrets = join(boundary, 'secrets');
  await mkdir(secrets, { mode: 0o700 });
  await chmod(secrets, 0o700);

  const dbUrlFile = join(secrets, options.urlName ?? 'supabase_db_url');
  const caFile = join(secrets, 'prod-ca-2021.crt');
  const capabilityFile = join(secrets, 'db-capability');

  await writeFile(dbUrlFile, `${options.url ?? canonicalUri()}\n`, { mode: 0o600 });
  await chmod(dbUrlFile, options.urlMode ?? 0o600);
  await writeFile(caFile, options.caBytes ?? SYNTHETIC_CA, { mode: 0o644 });
  await chmod(caFile, options.caMode ?? 0o644);
  await writeFile(capabilityFile, `${SYNTHETIC_CAPABILITY}\n`, { mode: 0o400 });
  await chmod(capabilityFile, options.capabilityMode ?? 0o400);

  return {
    boundary,
    paths: { dbUrlFile, caFile, capabilityFile },
    overrides: { trustBoundary: boundary, expectedCaSha256: SYNTHETIC_CA_SHA256 },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Q12 file-only migration credential contract', () => {
  it('rejects SUPABASE_DB_URL and any URI-shaped argument in Q12 mode', () => {
    expect(() =>
      assertNoQ12UrlEnvironmentOrArgument(
        { SUPABASE_DB_URL: canonicalUri() } as NodeJS.ProcessEnv,
        []
      )
    ).toThrow(/SUPABASE_DB_URL/u);
    expect(() =>
      assertNoQ12UrlEnvironmentOrArgument({} as NodeJS.ProcessEnv, ['--db-url', canonicalUri()])
    ).toThrow(/argument/iu);
    expect(() =>
      assertNoQ12UrlEnvironmentOrArgument({} as NodeJS.ProcessEnv, [canonicalUri()])
    ).toThrow(/argument/iu);
    expect(() =>
      assertNoQ12UrlEnvironmentOrArgument({} as NodeJS.ProcessEnv, ['apply', '--allow-remote'])
    ).not.toThrow();
  });

  it('builds a field-by-field ClientConfig with fixed TLS and startup opt-out', async () => {
    const fixture = await makeFixture();
    const { clientConfig, capability } = await loadQ12MigrationCredentials(
      fixture.paths,
      fixture.overrides
    );

    expect(clientConfig).not.toHaveProperty('connectionString');
    expect(clientConfig.host).toBe(Q12_MIGRATION_ENDPOINT.host);
    expect(clientConfig.port).toBe(Q12_MIGRATION_ENDPOINT.port);
    expect(clientConfig.database).toBe(Q12_MIGRATION_ENDPOINT.database);
    expect(clientConfig.user).toBe(Q12_MIGRATION_ENDPOINT.user);
    expect(clientConfig.password).toBe(SYNTHETIC_PASSWORD);
    expect(clientConfig.options).toBe(Q12_MIGRATION_STARTUP_OPTIONS);
    expect(clientConfig.ssl).toMatchObject({
      rejectUnauthorized: true,
      servername: Q12_MIGRATION_ENDPOINT.host,
    });
    const ssl = clientConfig.ssl as { ca: Buffer | string };
    expect(Buffer.from(ssl.ca).equals(SYNTHETIC_CA)).toBe(true);
    expect(capability).toBe(SYNTHETIC_CAPABILITY);
  });

  it('pins the production CA SHA-256', () => {
    expect(Q12_MIGRATION_CA_SHA256).toBe(
      '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
    );
  });

  describe('URI field validation', () => {
    const cases: Array<[string, string]> = [
      [
        'wrong protocol',
        'postgres://postgres.diqooqbuchsliypgwksu:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
      ],
      ['wrong host', 'postgresql://postgres.diqooqbuchsliypgwksu:pw@db.example.com:5432/postgres'],
      [
        'wrong port',
        'postgresql://postgres.diqooqbuchsliypgwksu:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
      ],
      [
        'missing port',
        'postgresql://postgres.diqooqbuchsliypgwksu:pw@aws-1-us-east-2.pooler.supabase.com/postgres',
      ],
      [
        'wrong database',
        'postgresql://postgres.diqooqbuchsliypgwksu:pw@aws-1-us-east-2.pooler.supabase.com:5432/appdb',
      ],
      ['wrong user', 'postgresql://postgres:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres'],
      ['query parameter', `${canonicalUri()}?sslmode=verify-full`],
      ['host query parameter', `${canonicalUri()}?host=/tmp`],
      ['options query parameter', `${canonicalUri()}?options=-csearch_path%3Dq12`],
      ['sslcert query parameter', `${canonicalUri()}?sslcert=/tmp/x.crt`],
      ['duplicate query key', `${canonicalUri()}?sslmode=require&sslmode=verify-full`],
      ['fragment', `${canonicalUri()}#fragment`],
    ];
    it.each(cases)('rejects a %s', async (_label, url) => {
      const fixture = await makeFixture({ url });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow();
    });

    it('rejects a multiline value', async () => {
      const fixture = await makeFixture({ url: `${canonicalUri()}\n${canonicalUri()}` });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /single|line|multiline/iu
      );
    });

    it('rejects an empty value', async () => {
      const fixture = await makeFixture({ url: '' });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow();
    });
  });

  describe('file identity and permission validation', () => {
    it('rejects a symlinked credential file', async () => {
      const fixture = await makeFixture();
      const target = `${fixture.paths.dbUrlFile}.real`;
      await writeFile(target, `${canonicalUri()}\n`, { mode: 0o600 });
      await rm(fixture.paths.dbUrlFile);
      await symlink(target, fixture.paths.dbUrlFile);
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /symlink|canonical/iu
      );
    });

    it('rejects a relative path', async () => {
      const fixture = await makeFixture();
      await expect(
        loadQ12MigrationCredentials(
          { ...fixture.paths, dbUrlFile: 'secrets/supabase_db_url' },
          fixture.overrides
        )
      ).rejects.toThrow(/absolute/iu);
    });

    it('rejects a group/world-writable parent directory', async () => {
      const fixture = await makeFixture();
      await chmod(join(fixture.boundary, 'secrets'), 0o770);
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /parent|writable/iu
      );
    });

    it('rejects an unsafe URL file mode', async () => {
      const fixture = await makeFixture({ urlMode: 0o644 });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /mode/iu
      );
    });

    it('accepts either 0400 or 0600 for the URL file', async () => {
      for (const urlMode of [0o400, 0o600]) {
        const fixture = await makeFixture({ urlMode });
        await expect(
          loadQ12MigrationCredentials(fixture.paths, fixture.overrides)
        ).resolves.toBeTruthy();
      }
    });

    it('rejects an unsafe CA file mode', async () => {
      const fixture = await makeFixture({ caMode: 0o600 });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /mode/iu
      );
    });

    it('rejects an unsafe capability file mode', async () => {
      const fixture = await makeFixture({ capabilityMode: 0o600 });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /mode/iu
      );
    });

    it('rejects an inode swap detected after open', async () => {
      const fixture = await makeFixture();
      const swap = async (label: string): Promise<void> => {
        if (label !== 'database URL file') return;
        const replacement = `${fixture.paths.dbUrlFile}.swap`;
        await writeFile(replacement, `${canonicalUri()}\n`, { mode: 0o600 });
        await rm(fixture.paths.dbUrlFile);
        await symlink(replacement, fixture.paths.dbUrlFile);
      };
      await expect(
        loadQ12MigrationCredentials(fixture.paths, {
          ...fixture.overrides,
          afterOpen: swap,
        })
      ).rejects.toThrow(/identity|changed|symlink/iu);
    });

    it('rejects a wrong CA SHA-256', async () => {
      const fixture = await makeFixture({ caBytes: Buffer.from('different-ca\n') });
      await expect(loadQ12MigrationCredentials(fixture.paths, fixture.overrides)).rejects.toThrow(
        /CA|SHA/iu
      );
    });
  });

  describe('secret hygiene', () => {
    it('keeps the password and URI out of every fail-closed error', async () => {
      const url = `${canonicalUri()}?sslmode=verify-full`;
      const fixture = await makeFixture({ url });
      const error = await loadQ12MigrationCredentials(fixture.paths, fixture.overrides).then(
        () => {
          throw new Error('expected rejection');
        },
        (reason: unknown) => reason
      );
      const text =
        error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
      expect(text).not.toContain(SYNTHETIC_PASSWORD);
      expect(text).not.toContain(url);
      expect(text).not.toContain(SYNTHETIC_CAPABILITY);
    });
  });

  describe('bindQ12MigrationSession', () => {
    function proverClient(rows: Record<string, unknown>): {
      client: Client;
      queries: Array<{ text: string; values?: unknown[] }>;
    } {
      const queries: Array<{ text: string; values?: unknown[] }> = [];
      const query = vi.fn((text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (/set_config/u.test(text)) return Promise.resolve({ rows: [{ set_config: '' }] });
        return Promise.resolve({ rows: [rows] });
      });
      return { client: { query } as unknown as Client, queries };
    }

    const identity = {
      session_user: 'postgres',
      current_database: 'postgres',
      server_major: 17,
      transaction_read_only: 'off',
    };

    it('proves identity then binds the capability with only the value parameterized', async () => {
      const { client, queries } = proverClient(identity);
      await bindQ12MigrationSession(client, SYNTHETIC_CAPABILITY);
      const setConfig = queries.find(entry => /set_config/u.test(entry.text));
      expect(setConfig).toBeDefined();
      expect(setConfig!.text).toBe(Q12_MIGRATION_SET_CAPABILITY_SQL);
      expect(setConfig!.text).toContain("'megacampus.q12_capability'");
      expect(setConfig!.text).toContain('$1');
      expect(setConfig!.text).toContain('false');
      expect(setConfig!.text).not.toContain(SYNTHETIC_CAPABILITY);
      expect(setConfig!.values).toEqual([SYNTHETIC_CAPABILITY]);
    });

    it.each([
      ['non-postgres session', { ...identity, session_user: 'authenticator' }],
      ['wrong database', { ...identity, current_database: 'appdb' }],
      ['wrong server major', { ...identity, server_major: 15 }],
      ['read-write session', { ...identity, transaction_read_only: 'on' }],
    ])('fails closed on a %s and never binds the capability', async (_label, rows) => {
      const { client, queries } = proverClient(rows);
      await expect(bindQ12MigrationSession(client, SYNTHETIC_CAPABILITY)).rejects.toThrow();
      expect(queries.some(entry => /set_config/u.test(entry.text))).toBe(false);
    });
  });
});

describe('Q12 concurrent observability index packet preflight', () => {
  it('accepts the real comment-prefixed CONCURRENTLY index and index-comment statements', () => {
    // The observability packet splits its fixed source naively on ';', so each
    // statement retains its leading -- comment lines; the preflight must strip
    // those before matching.
    expect(() =>
      assertConcurrentIndexPacketSafe([
        `-- Bound the global unresolved-critical evidence reconciliation used by textfile metrics.
-- This migration must be executed statement-by-statement in autocommit mode.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clarifying_pending_critical_evidence_created_at
  ON public.clarifying_questions (created_at)
  WHERE question_category = 'document_conflicts'
    AND question_priority = 'critical'
    AND status = 'pending'`,
        `COMMENT ON INDEX public.idx_clarifying_pending_critical_evidence_created_at IS
  'Covers exact count and oldest-first reconciliation for pending critical document conflicts.'`,
      ])
    ).not.toThrow();
    expect(() =>
      assertConcurrentIndexPacketSafe([
        `-- This rollback must be executed statement-by-statement in autocommit mode.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_clarifying_pending_critical_evidence_created_at`,
      ])
    ).not.toThrow();
  });

  it.each([
    ['a non-concurrent index', 'CREATE INDEX idx_x ON public.clarifying_questions (created_at)'],
    ['a table statement', 'CREATE TABLE public.injected (id uuid PRIMARY KEY)'],
    ['a schema statement', 'CREATE SCHEMA injected'],
    [
      'a function statement',
      'CREATE FUNCTION public.injected() RETURNS void LANGUAGE sql AS $$ $$',
    ],
    [
      'a trigger statement',
      'CREATE TRIGGER injected BEFORE INSERT ON public.x EXECUTE FUNCTION f()',
    ],
    ['a grant statement', 'GRANT SELECT ON public.clarifying_questions TO service_role'],
    ['a revoke statement', 'REVOKE ALL ON public.clarifying_questions FROM authenticated'],
    ['an ALTER statement', 'ALTER TABLE public.clarifying_questions ADD COLUMN injected text'],
  ])('rejects %s injected into the concurrent packet', (_label, statement) => {
    expect(() => assertConcurrentIndexPacketSafe([statement])).toThrow(/CONCURRENTLY|index/iu);
  });
});

describe('Q12 file-only mode and databaseUrl are mutually exclusive', () => {
  const q12: Q12MigrationRunContext = {
    clientConfig: { host: '127.0.0.1' },
    capability: 'synthetic-capability',
  };
  const url = 'postgresql://postgres:x@127.0.0.1:5432/postgres';

  it('routes a Q12 context to its ClientConfig and never a connectionString', () => {
    const source = resolveMigrationConnectionSource({ q12 });
    expect(source).toEqual({ kind: 'q12', context: q12 });
    expect(source).not.toHaveProperty('connectionString');
  });

  it('routes an ordinary databaseUrl to the connectionString path', () => {
    expect(resolveMigrationConnectionSource({ databaseUrl: url })).toEqual({
      kind: 'url',
      connectionString: url,
    });
  });

  it('fails closed when both a Q12 context and databaseUrl are supplied', () => {
    expect(() => resolveMigrationConnectionSource({ q12, databaseUrl: url })).toThrow(/combined/iu);
  });

  it('fails closed when neither connection source is supplied', () => {
    expect(() => resolveMigrationConnectionSource({})).toThrow(/exactly one/iu);
    expect(() => resolveMigrationConnectionSource({ databaseUrl: '' })).toThrow(/exactly one/iu);
  });
});

const APPROVED_MODULE = '../../../scripts/migrations/document-evidence-approved';
const Q12_CLI_FLAGS = [
  '--db-url-file',
  '/opt/megacampus/secrets/supabase_db_url',
  '--ca-file',
  '/opt/megacampus/secrets/prod-ca-2021.crt',
  '--q12-db-capability-file',
  '/opt/megacampus/backups/q12/run/secrets/db-capability',
];

describe('Q12 migration CLI flag parsing', () => {
  it('returns null when no Q12 flags are present', async () => {
    const { parseQ12MigrationCliFlags } = await import(APPROVED_MODULE);
    expect(parseQ12MigrationCliFlags(['apply', '--allow-remote'])).toBeNull();
  });

  it('parses the full file trio', async () => {
    const { parseQ12MigrationCliFlags } = await import(APPROVED_MODULE);
    expect(parseQ12MigrationCliFlags(['apply', ...Q12_CLI_FLAGS])).toEqual({
      dbUrlFile: '/opt/megacampus/secrets/supabase_db_url',
      caFile: '/opt/megacampus/secrets/prod-ca-2021.crt',
      capabilityFile: '/opt/megacampus/backups/q12/run/secrets/db-capability',
    });
  });

  it('fails closed on a partial flag set', async () => {
    const { parseQ12MigrationCliFlags } = await import(APPROVED_MODULE);
    expect(() =>
      parseQ12MigrationCliFlags([
        'apply',
        '--db-url-file',
        '/opt/megacampus/secrets/supabase_db_url',
      ])
    ).toThrow(/together/iu);
  });

  it('fails closed on a flag missing its value', async () => {
    const { parseQ12MigrationCliFlags } = await import(APPROVED_MODULE);
    expect(() => parseQ12MigrationCliFlags(['apply', '--db-url-file'])).toThrow(/path value/iu);
  });

  it('fails closed on a database URI argument alongside the flags', async () => {
    const { parseQ12MigrationCliFlags } = await import(APPROVED_MODULE);
    expect(() =>
      parseQ12MigrationCliFlags([
        'apply',
        ...Q12_CLI_FLAGS,
        'postgresql://postgres:x@h:5432/postgres',
      ])
    ).toThrow(/URI/iu);
  });
});

describe('Q12 migration CLI resolution keeps file-only and databaseUrl exclusive', () => {
  it('resolves the Q12 file-only mode with no databaseUrl', async () => {
    const { resolveDocumentEvidenceApprovedCli } = await import(APPROVED_MODULE);
    const resolution = resolveDocumentEvidenceApprovedCli(['apply', ...Q12_CLI_FLAGS], {});
    expect(resolution.mode).toBe('q12');
    expect(resolution).not.toHaveProperty('databaseUrl');
  });

  it('resolves ordinary URL mode from SUPABASE_DB_URL', async () => {
    const { resolveDocumentEvidenceApprovedCli } = await import(APPROVED_MODULE);
    const resolution = resolveDocumentEvidenceApprovedCli(['apply'], {
      SUPABASE_DB_URL: 'postgresql://postgres:x@127.0.0.1:5432/postgres',
    } as NodeJS.ProcessEnv);
    expect(resolution).toMatchObject({ mode: 'url' });
  });

  it('fails closed when Q12 flags and SUPABASE_DB_URL are combined', async () => {
    const { resolveDocumentEvidenceApprovedCli } = await import(APPROVED_MODULE);
    expect(() =>
      resolveDocumentEvidenceApprovedCli(['apply', ...Q12_CLI_FLAGS], {
        SUPABASE_DB_URL: 'postgresql://postgres:x@127.0.0.1:5432/postgres',
      } as NodeJS.ProcessEnv)
    ).toThrow(/SUPABASE_DB_URL/u);
  });

  it('fails closed when no connection source is available', async () => {
    const { resolveDocumentEvidenceApprovedCli } = await import(APPROVED_MODULE);
    expect(() => resolveDocumentEvidenceApprovedCli(['apply'], {})).toThrow(/SUPABASE_DB_URL/u);
  });

  it('delivers a Q12 context to the runner as kind q12 without a connectionString', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const runner = (options: Record<string, unknown>): Promise<string> => {
      calls.push(options);
      return Promise.resolve('applied');
    };
    const q12: Q12MigrationRunContext = {
      clientConfig: { host: '127.0.0.1' },
      capability: 'synthetic-capability',
    };
    await runner({ q12, direction: 'apply' });
    expect(calls[0]).toMatchObject({ q12 });
    expect(calls[0]).not.toHaveProperty('databaseUrl');
    expect(JSON.stringify(calls[0])).not.toContain('connectionString');
    expect(resolveMigrationConnectionSource({ q12 })).toMatchObject({ kind: 'q12' });
  });
});
