/**
 * Migration drift gate (mc2-s98bw).
 *
 * The gate shipped blind: it never enabled TLS, Supavisor rejected the
 * plaintext connection, and the catch branch annotated a warning and returned
 * 0. Every deploy carrying a migration crossed a gate that had checked nothing.
 * These tests pin the three behaviours that were missing: real drift is
 * reported, an unreachable database fails the job, and a missing connection
 * string fails the job.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  EXIT_MISCONFIGURED,
  EXIT_UNREACHABLE,
  buildSslConfig,
  computeDrift,
  loadAllowlist,
  parseAllowlist,
  readRepoMigrations,
  slugify,
  type RepoMigration,
} from '../../../scripts/check-migration-drift';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = fileURLToPath(
  new URL('../../../scripts/check-migration-drift.ts', import.meta.url)
);
const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function migrations(...files: string[]): RepoMigration[] {
  return files.map(file => ({ file, slug: slugify(file) }));
}

/** Run the gate as CI runs it and return its exit code and combined output. */
async function runGate(env: Record<string, string | undefined>) {
  try {
    const { stdout, stderr } = await execFileAsync('pnpm', ['exec', 'tsx', SCRIPT_PATH], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, ...env },
      timeout: 60_000,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('slugify', () => {
  it('strips single and double timestamp prefixes', () => {
    expect(slugify('20260811120000_career_playbook_quality_v2_routing.sql')).toBe(
      'career_playbook_quality_v2_routing'
    );
    // The history contains double-stamped names; both shapes must reduce alike.
    expect(slugify('20260520141021_20260513090000_career_playbook')).toBe('career_playbook');
  });
});

describe('computeDrift', () => {
  it('passes when every repo migration is recorded', () => {
    const repo = migrations('20260101000000_a.sql', '20260102000000_b.sql');
    const result = computeDrift(repo, new Set(['a', 'b']));

    expect(result.missing).toEqual([]);
    expect(result.watermark).toBe('20260102000000_b.sql');
  });

  it('fails on a deliberate drift fixture: an unapplied tail migration', () => {
    // The exact shape of mc2-db696.121 — two new files, neither ever applied.
    const repo = migrations(
      '20260711151000_document_evidence_observability_totals.sql',
      '20260811120000_career_playbook_quality_v2_routing.sql',
      '20260811180000_career_playbook_proofreader_phase.sql'
    );
    const result = computeDrift(repo, new Set(['document_evidence_observability_totals']));

    expect(result.missing).toEqual([
      '20260811120000_career_playbook_quality_v2_routing.sql',
      '20260811180000_career_playbook_proofreader_phase.sql',
    ]);
  });

  it('reports an unrecorded migration below the watermark instead of ignoring it', () => {
    // This test used to assert the opposite, and the assertion was the bug: it
    // pinned "ignores unrecorded migrations below the watermark" as a
    // requirement. Anything skipped mid-history was invisible permanently,
    // because the next applied migration moved the watermark past it. That is
    // how 20260413120000_drop_legacy_restart_from_stage_overload.sql sat
    // unapplied for four months under a green gate while the overload it
    // removes broke every restart_from_stage RPC call (mc2-wxvyr, mc2-y23na).
    //
    // The false-positive worry behind the old design was real. The allowlist is
    // the answer to it, not blindness — see the next describe block.
    const repo = migrations(
      '20240101000000_baseline.sql',
      '20260101000000_a.sql',
      '20260102000000_b.sql'
    );
    const result = computeDrift(repo, new Set(['a', 'b']));

    expect(result.historicalMissing).toEqual(['20240101000000_baseline.sql']);
    // Still separated from the tail: a gap in the tail is usually a migration
    // someone just wrote, and reads differently from a gap in 2024.
    expect(result.missing).toEqual([]);
  });

  it('separates a tail gap from a historical one when both exist', () => {
    const repo = migrations(
      '20240101000000_baseline.sql',
      '20260101000000_a.sql',
      '20260103000000_c.sql'
    );
    const result = computeDrift(repo, new Set(['a']));

    expect(result.historicalMissing).toEqual(['20240101000000_baseline.sql']);
    expect(result.missing).toEqual(['20260103000000_c.sql']);
  });
});

describe('the allowlist', () => {
  it('lets a knowingly-skipped migration pass without hiding the rest', () => {
    const repo = migrations(
      '20240101000000_baseline.sql',
      '20240102000000_superseded.sql',
      '20260101000000_a.sql'
    );
    const allow = new Map([['superseded', 'Replaced by 20260101000000_a, which is applied.']]);

    const result = computeDrift(repo, new Set(['a']), allow);

    expect(result.allowlistedCount).toBe(1);
    // The allowlist explains one gap. It must not excuse the one next to it.
    expect(result.historicalMissing).toEqual(['20240101000000_baseline.sql']);
  });

  it('reports an entry that is now applied, so the file cannot rot unnoticed', () => {
    const repo = migrations('20240101000000_baseline.sql');
    const allow = new Map([['baseline', 'Pre-dates the history table.']]);

    const result = computeDrift(repo, new Set(['baseline']), allow);

    // Not a failure — a redundant entry lets nothing through. But an
    // unmaintained allowlist is how the previous gate stopped guarding.
    expect(result.staleAllowlist).toEqual(['baseline']);
    expect(result.historicalMissing).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('reports an entry naming a migration nobody kept', () => {
    const repo = migrations('20260101000000_a.sql');
    const allow = new Map([['deleted_long_ago', 'Superseded.']]);

    const result = computeDrift(repo, new Set(['a']), allow);

    expect(result.staleAllowlist).toEqual(['deleted_long_ago']);
  });

  it('refuses an entry with no reason', () => {
    // "Why is the database correct without this?" is the whole value of the
    // file. An entry that does not answer it is a silent skip with extra steps.
    expect(() => parseAllowlist('some_slug\n')).toThrow(/no reason/u);
    expect(() => parseAllowlist('some_slug\t   \n')).toThrow(/no reason/u);
  });

  it('reads slug and reason, ignoring comments and blank lines', () => {
    const parsed = parseAllowlist(
      [
        '# a comment',
        '',
        'first_slug\tBecause it is superseded.',
        'second_slug\tBecause: reasons.',
      ].join('\n')
    );

    expect([...parsed.keys()]).toEqual(['first_slug', 'second_slug']);
    expect(parsed.get('first_slug')).toBe('Because it is superseded.');
  });
});

describe('the shipped allowlist file', () => {
  it('explains every migration this repository does not apply, and nothing else', () => {
    // The end-to-end check runs in CI against the live database. This one pins
    // the file itself: every entry must name a migration that still exists, and
    // must carry a reason long enough to be one.
    const allow = loadAllowlist();
    const repoSlugs = new Set(readRepoMigrations().map(m => m.slug));

    expect(allow.size).toBeGreaterThan(0);

    const orphans = [...allow.keys()].filter(slug => !repoSlugs.has(slug));
    expect(orphans).toEqual([]);

    const unexplained = [...allow.entries()]
      .filter(([, reason]) => reason.length < 20)
      .map(([slug]) => slug);
    expect(unexplained).toEqual([]);
  });
});

describe('buildSslConfig', () => {
  const url = 'postgresql://user:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres';

  it('enables TLS when the URL says nothing about it', () => {
    // Without this the pooler answers "(ESSLREQUIRED) SSL connection is
    // required for user: postgres" — the failure that blinded the gate.
    const { ssl, verified } = buildSslConfig(url);

    expect(ssl).toEqual({ rejectUnauthorized: false });
    expect(verified).toBe(false);
  });

  it('verifies the chain when a CA is supplied', () => {
    const { ssl, verified } = buildSslConfig(url, '-----BEGIN CERTIFICATE-----\nx\n');

    expect(ssl).toMatchObject({ rejectUnauthorized: true });
    expect(verified).toBe(true);
  });

  it('defers to an explicit sslmode in the connection string', () => {
    const { ssl, verified } = buildSslConfig(`${url}?sslmode=verify-full`);

    expect(ssl).toBeUndefined();
    expect(verified).toBe(true);
  });
});

describe('gate exit codes', () => {
  it('fails loudly when the database is unreachable', async () => {
    const { code, output } = await runGate({
      SUPABASE_DB_URL: 'postgresql://user:pw@drift-gate-no-such-host.invalid:5432/postgres',
      SUPABASE_DB_CA_CERT: '',
    });

    expect(code).toBe(EXIT_UNREACHABLE);
    expect(output).toContain('::error::');
    expect(output).toContain('the deploy is blocked');
  }, 90_000);

  it('fails when no connection string is configured', async () => {
    const { code, output } = await runGate({ SUPABASE_DB_URL: '', SUPABASE_DB_CA_CERT: '' });

    expect(code).toBe(EXIT_MISCONFIGURED);
    expect(output).toContain('::error::');
  }, 90_000);
});
