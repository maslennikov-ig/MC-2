#!/usr/bin/env tsx
/**
 * Migration drift detector (tail-drift gate).
 *
 * Catches the real failure mode that broke the Career Playbook catalog: new
 * migration files land in the repo but never get applied to the shared
 * dev+staging Supabase DB (image_* columns missing because the June migrations
 * were never run). See beads mc2-hnkmf.
 *
 * Every repo migration must be either recorded in `schema_migrations` or listed
 * in `scripts/migration-drift-allowlist.txt` with a reason. Anything else fails
 * the gate.
 *
 * This used to be a tail-only check, and that was its third failure mode. It
 * found the newest repo migration that IS recorded (the "watermark") and flagged
 * only migrations after it — so anything skipped in the MIDDLE of history was
 * invisible, permanently: the next applied migration moved the watermark past it
 * and it could never be reported again. On 2026-08-20 that was 86 of 279 repo
 * migrations, and one of them was
 * `20260413120000_drop_legacy_restart_from_stage_overload.sql`, unapplied for
 * four months under a green gate while the overload it removes made every
 * `restart_from_stage` RPC call unresolvable (mc2-wxvyr, mc2-y23na).
 *
 * The tail-only design had a real reason, recorded here before it changed: this
 * database's `schema_migrations` only starts in late 2025 and its history has
 * reassigned versions and renamed entries, so a naive full diff produces dozens
 * of false positives on old, already-applied migrations. The allowlist is the
 * answer to that — grandfather what exists, with a per-entry reason, and fail
 * only on what is new. Each of those 86 was audited by checking whether its
 * EFFECT is present in the database (tables, indexes, functions, types,
 * triggers, views, columns, publication membership, nullability) rather than
 * whether its name matches, because name matching is precisely what this history
 * is bad at.
 *
 * Matching is by descriptive slug (filename minus timestamp prefixes), robust
 * to single/double-stamped names. Read-only. Requires SUPABASE_DB_URL.
 *
 * The gate fails closed. It used to warn and return 0 when the database could
 * not be reached, which made it worse than useless: on CI run 31481370434 it
 * annotated "could not reach the database; skipping (deploy not blocked)" and
 * passed, so every deploy carrying a migration crossed an unchecked gate. A
 * gate that cannot see must say so and stop the deploy (mc2-s98bw).
 *
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... pnpm -F course-gen-platform exec \
 *     tsx scripts/check-migration-drift.ts [--json]
 *
 * Exit codes: 0 = in sync, 1 = drift detected, 2 = misconfiguration,
 * 3 = database unreachable.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type ClientConfig } from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(scriptDir, '..', 'supabase', 'migrations');
const ALLOWLIST_PATH = join(scriptDir, 'migration-drift-allowlist.txt');

export const EXIT_DRIFT = 1;
export const EXIT_MISCONFIGURED = 2;
export const EXIT_UNREACHABLE = 3;

const CONNECT_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 15_000;

/**
 * Reduce a migration filename or recorded migration name to its descriptive
 * slug by stripping any leading `<timestamp>_` prefixes (the history contains
 * both single- and double-stamped names).
 */
export function slugify(name: string): string {
  let slug = name.replace(/\.sql$/i, '');
  while (/^\d{6,}_/.test(slug)) {
    slug = slug.replace(/^\d{6,}_/, '');
  }
  return slug;
}

export interface RepoMigration {
  file: string;
  slug: string;
}

export interface DriftResult {
  repoCount: number;
  watermark: string | null;
  /** Unapplied, unallowlisted, and newer than the watermark — usually just written. */
  missing: string[];
  /** Unapplied, unallowlisted, and older than the watermark — the class the old gate could not see. */
  historicalMissing: string[];
  /** Unapplied but allowlisted with a reason. Counted, not failed. */
  allowlistedCount: number;
  /** Allowlist entries that are now applied, or name no repo file. Reported, not failed. */
  staleAllowlist: string[];
}

/**
 * Every repo migration must be applied or allowlisted.
 *
 * The watermark survives only to split the report: a gap in the tail is almost
 * always a migration someone just wrote and forgot to apply, and deserves a
 * sharper message than a gap in 2025. Both fail.
 */
export function computeDrift(
  repoMigrations: readonly RepoMigration[],
  appliedSlugs: ReadonlySet<string>,
  allowlist: ReadonlyMap<string, string> = new Map()
): DriftResult {
  let watermark = -1;
  for (let i = 0; i < repoMigrations.length; i += 1) {
    if (appliedSlugs.has(repoMigrations[i].slug)) watermark = i;
  }

  const missing: string[] = [];
  const historicalMissing: string[] = [];
  let allowlistedCount = 0;

  for (let i = 0; i < repoMigrations.length; i += 1) {
    const m = repoMigrations[i];
    if (appliedSlugs.has(m.slug)) continue;
    if (allowlist.has(m.slug)) {
      allowlistedCount += 1;
      continue;
    }
    if (i > watermark) missing.push(m.file);
    else historicalMissing.push(m.file);
  }

  // An allowlist entry that is now applied, or that names a file nobody kept, is
  // a claim about the database that has stopped being true. Say so — a rotting
  // allowlist is how a gate quietly stops guarding again.
  const repoSlugs = new Set(repoMigrations.map(m => m.slug));
  const staleAllowlist = [...allowlist.keys()]
    .filter(slug => appliedSlugs.has(slug) || !repoSlugs.has(slug))
    .sort();

  return {
    repoCount: repoMigrations.length,
    watermark: watermark >= 0 ? repoMigrations[watermark].file : null,
    missing,
    historicalMissing,
    allowlistedCount,
    staleAllowlist,
  };
}

/**
 * Slugs the repository knowingly does not apply, mapped to why.
 *
 * `<slug><TAB><reason>`; blank lines and `#` comments ignored. A reason is
 * mandatory — an entry without one is rejected rather than silently accepted,
 * because "why is the database correct without this?" is the entire value of the
 * file and an empty reason means nobody answered it.
 */
export function parseAllowlist(contents: string): Map<string, string> {
  const entries = new Map<string, string>();
  contents.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const tab = rawLine.indexOf('\t');
    const slug = (tab === -1 ? rawLine : rawLine.slice(0, tab)).trim();
    const reason = tab === -1 ? '' : rawLine.slice(tab + 1).trim();
    if (!reason) {
      throw new Error(
        `Migration drift allowlist line ${index + 1} has no reason: "${line}". ` +
          'Use `<slug><TAB><reason>` and record WHY the database is correct without it.'
      );
    }
    entries.set(slug, reason);
  });
  return entries;
}

export function loadAllowlist(path: string = ALLOWLIST_PATH): Map<string, string> {
  if (!existsSync(path)) return new Map();
  return parseAllowlist(readFileSync(path, 'utf-8'));
}

/**
 * TLS settings for the pooler connection.
 *
 * Supavisor refuses plaintext ("(ESSLREQUIRED) SSL connection is required for
 * user: postgres") and node-postgres does not negotiate TLS unless asked, which
 * is why this gate never once reached the database. Its chain is rooted in
 * Supabase's own CA, so full verification needs that CA supplied through
 * SUPABASE_DB_CA_CERT; without it we still encrypt but cannot verify the chain,
 * and the caller says so out loud rather than quietly downgrading.
 *
 * A `sslmode` already present in the URL wins: node-postgres honours it and the
 * operator has then made the choice explicitly.
 */
export function buildSslConfig(
  dbUrl: string,
  caCert?: string
): { ssl: ClientConfig['ssl']; verified: boolean; reason: string } {
  let hasSslMode = false;
  try {
    hasSslMode = new URL(dbUrl).searchParams.has('sslmode');
  } catch {
    hasSslMode = false;
  }

  if (hasSslMode) {
    return { ssl: undefined, verified: true, reason: 'sslmode from connection string' };
  }
  if (caCert && caCert.trim()) {
    return {
      ssl: { ca: caCert, rejectUnauthorized: true },
      verified: true,
      reason: 'chain verified against SUPABASE_DB_CA_CERT',
    };
  }
  return {
    ssl: { rejectUnauthorized: false },
    verified: false,
    reason: 'encrypted but chain not verified; set SUPABASE_DB_CA_CERT to verify',
  };
}

export async function loadAppliedSlugs(client: Client): Promise<Set<string>> {
  const res = await client.query<{ version: string; name: string | null }>(
    'SELECT version, name FROM supabase_migrations.schema_migrations'
  );
  const slugs = new Set<string>();
  for (const row of res.rows) {
    if (row.name) slugs.add(slugify(row.name));
    if (row.version) slugs.add(slugify(row.version));
  }
  return slugs;
}

export function readRepoMigrations(dir: string = MIGRATIONS_DIR): RepoMigration[] {
  // Sorted by filename → chronological by timestamp prefix.
  return readdirSync(dir)
    .filter(file => file.endsWith('.sql'))
    .map(file => ({ file, slug: slugify(file) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

async function main() {
  const json = process.argv.includes('--json');
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      '::error::SUPABASE_DB_URL is not set, so the migration drift gate cannot run. ' +
        'It is a required read-only Postgres connection string, e.g. ' +
        'postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres.'
    );
    process.exit(EXIT_MISCONFIGURED);
  }

  const repoMigrations = readRepoMigrations();

  let allowlist: Map<string, string>;
  try {
    allowlist = loadAllowlist();
  } catch (error) {
    // A malformed allowlist means the gate cannot tell "knowingly skipped" from
    // "lost", so it stops rather than guessing in either direction.
    console.error(
      `::error::Migration drift allowlist is unreadable, so drift is unknown. ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(EXIT_MISCONFIGURED);
  }

  const { ssl, verified, reason } = buildSslConfig(dbUrl, process.env.SUPABASE_DB_CA_CERT);
  if (!verified) console.warn(`::warning::Migration drift gate TLS: ${reason}.`);

  let appliedSlugs: Set<string>;
  const client = new Client({
    connectionString: dbUrl,
    ...(ssl ? { ssl } : {}),
    // Bounded, so a black-holed endpoint reports "unreachable" in seconds
    // instead of sitting until the job's 10-minute timeout kills it.
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  try {
    await client.connect();
    appliedSlugs = await loadAppliedSlugs(client);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `::error::Migration drift gate could not reach the database, so drift is unknown ` +
        `and the deploy is blocked. TLS: ${reason}. ${detail}`
    );
    process.exit(EXIT_UNREACHABLE);
  } finally {
    await client.end().catch(() => {});
  }

  const result = computeDrift(repoMigrations, appliedSlugs, allowlist);

  if (json) console.log(JSON.stringify(result, null, 2));

  // Not a failure: a redundant entry does not let unapplied work through. But an
  // unmaintained allowlist is how the previous gate stopped guarding, so it is
  // never silent.
  if (result.staleAllowlist.length > 0 && !json) {
    console.warn(
      `::warning::${result.staleAllowlist.length} migration drift allowlist entr(ies) are ` +
        `stale — now applied, or naming no repo file. Remove them: ` +
        result.staleAllowlist.join(', ')
    );
  }

  if (result.missing.length === 0 && result.historicalMissing.length === 0) {
    if (!json) {
      const tip = result.watermark ? `, latest applied ${result.watermark}` : '';
      console.log(
        `✅ Migration drift check passed: all ${result.repoCount} repo migrations are applied ` +
          `or allowlisted (${result.allowlistedCount} allowlisted${tip}).`
      );
    }
    return;
  }

  if (!json) {
    if (result.missing.length > 0) {
      console.error(
        `::error::Migration drift detected: ${result.missing.length} migration(s) newer than the ` +
          `latest applied one are not in the database:`
      );
      for (const file of result.missing) console.error(`  - ${file}`);
    }
    if (result.historicalMissing.length > 0) {
      console.error(
        `::error::Migration drift detected: ${result.historicalMissing.length} migration(s) ` +
          `older than the latest applied one are not in the database. This is the class the ` +
          `tail-only gate could not see, which is how a repair sat unapplied for four months ` +
          `(mc2-y23na):`
      );
      for (const file of result.historicalMissing) console.error(`  - ${file}`);
    }
    console.error(
      '\nApply them, or add each to scripts/migration-drift-allowlist.txt with a reason ' +
        'saying why the database is correct without it. See beads mc2-hnkmf, mc2-y23na.'
    );
  }
  process.exit(EXIT_DRIFT);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))
) {
  main().catch(error => {
    console.error(error);
    process.exit(EXIT_DRIFT);
  });
}
