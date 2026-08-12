#!/usr/bin/env tsx
/**
 * Migration drift detector (tail-drift gate).
 *
 * Catches the real failure mode that broke the Career Playbook catalog: new
 * migration files land in the repo but never get applied to the shared
 * dev+staging Supabase DB (image_* columns missing because the June migrations
 * were never run). See beads mc2-hnkmf.
 *
 * Why "tail drift" and not a full diff: this database's `schema_migrations`
 * only starts in late 2025 (everything earlier is an untracked baseline) and
 * its history has reassigned versions / renamed entries, so a naive "every repo
 * migration must appear in schema_migrations" check produces dozens of false
 * positives on old, already-applied migrations. Instead we find the newest repo
 * migration that IS recorded (the "watermark") and flag only repo migrations
 * NEWER than it that are not recorded. Migrations apply in filename order, so
 * the unapplied set is always the tail above the watermark.
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
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type ClientConfig } from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(scriptDir, '..', 'supabase', 'migrations');

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
  missing: string[];
}

/**
 * Watermark = newest repo migration that IS recorded as applied.
 * Drift = repo migrations after the watermark that are not recorded.
 */
export function computeDrift(
  repoMigrations: readonly RepoMigration[],
  appliedSlugs: ReadonlySet<string>
): DriftResult {
  let watermark = -1;
  for (let i = 0; i < repoMigrations.length; i += 1) {
    if (appliedSlugs.has(repoMigrations[i].slug)) watermark = i;
  }

  const missing = repoMigrations.slice(watermark + 1).filter(m => !appliedSlugs.has(m.slug));

  return {
    repoCount: repoMigrations.length,
    watermark: watermark >= 0 ? repoMigrations[watermark].file : null,
    missing: missing.map(m => m.file),
  };
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

  const result = computeDrift(repoMigrations, appliedSlugs);

  if (json) console.log(JSON.stringify(result, null, 2));

  if (result.missing.length === 0) {
    if (!json) {
      const tip = result.watermark ? ` (latest applied: ${result.watermark})` : '';
      console.log(`✅ Migration drift check passed: no unapplied tail migrations${tip}.`);
    }
    return;
  }

  if (!json) {
    console.error(
      `::error::Migration drift detected: ${result.missing.length} migration(s) newer than the ` +
        `latest applied one are not in the database:`
    );
    for (const file of result.missing) console.error(`  - ${file}`);
    console.error(
      '\nApply the missing migrations to the database before deploying. See beads mc2-hnkmf.'
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
