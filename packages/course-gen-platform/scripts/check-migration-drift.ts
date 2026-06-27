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
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... pnpm -F course-gen-platform exec \
 *     tsx scripts/check-migration-drift.ts [--json]
 *
 * Exit codes: 0 = in sync, 1 = drift detected, 2 = misconfiguration.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(scriptDir, '..', 'supabase', 'migrations');

/**
 * Reduce a migration filename or recorded migration name to its descriptive
 * slug by stripping any leading `<timestamp>_` prefixes (the history contains
 * both single- and double-stamped names).
 */
function slugify(name: string): string {
  let slug = name.replace(/\.sql$/i, '');
  while (/^\d{6,}_/.test(slug)) {
    slug = slug.replace(/^\d{6,}_/, '');
  }
  return slug;
}

async function loadAppliedSlugs(client: Client): Promise<Set<string>> {
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

async function main() {
  const json = process.argv.includes('--json');
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      'SUPABASE_DB_URL is required (read-only Postgres connection string, e.g. ' +
        'postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres).'
    );
    process.exit(2);
  }

  // Sorted by filename → chronological by timestamp prefix.
  const repoMigrations = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .map(file => ({ file, slug: slugify(file) }))
    .sort((a, b) => a.file.localeCompare(b.file));

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  let appliedSlugs: Set<string>;
  try {
    appliedSlugs = await loadAppliedSlugs(client);
  } finally {
    await client.end();
  }

  // Watermark = index of the newest repo migration that IS recorded as applied.
  let watermark = -1;
  for (let i = 0; i < repoMigrations.length; i += 1) {
    if (appliedSlugs.has(repoMigrations[i].slug)) watermark = i;
  }

  // Drift = repo migrations after the watermark that are not recorded.
  const missing = repoMigrations.slice(watermark + 1).filter(m => !appliedSlugs.has(m.slug));

  if (json) {
    console.log(
      JSON.stringify(
        {
          repoCount: repoMigrations.length,
          watermark: watermark >= 0 ? repoMigrations[watermark].file : null,
          missing: missing.map(m => m.file),
        },
        null,
        2
      )
    );
  }

  if (missing.length === 0) {
    if (!json) {
      const tip = watermark >= 0 ? ` (latest applied: ${repoMigrations[watermark].file})` : '';
      console.log(`✅ Migration drift check passed: no unapplied tail migrations${tip}.`);
    }
    return;
  }

  if (!json) {
    console.error(
      `❌ Migration drift detected: ${missing.length} migration(s) newer than the latest ` +
        `applied one are not in the database:`
    );
    for (const m of missing) console.error(`  - ${m.file}`);
    console.error(
      '\nApply the missing migrations to the database before deploying. See beads mc2-hnkmf.'
    );
  }
  process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
