#!/usr/bin/env tsx
/**
 * Migration drift detector.
 *
 * Compares the repo's Supabase migration files against the migrations actually
 * applied in the target database and FAILS (exit 1) if any repo migration has
 * not been applied. This catches the silent drift that broke the Career
 * Playbook catalog (image_* columns missing because June migrations were never
 * applied). See beads mc2-hnkmf.
 *
 * Matching is by descriptive slug (filename minus timestamp prefixes), NOT by
 * Supabase migration `version`, because this database's history has reassigned
 * versions (e.g. file `20260528193000_add_..._classifier` is recorded with
 * version `20260606060945`). A version-based diff (what `supabase db push`
 * uses) would mis-classify already-applied migrations as pending.
 *
 * Read-only. Requires SUPABASE_DB_URL (direct Postgres connection string).
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
    // A bare version (no underscore) slugifies to itself; harmless but covers
    // migrations recorded only by version.
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
        'postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres).'
    );
    process.exit(2);
  }

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

  const missing = repoMigrations.filter(m => !appliedSlugs.has(m.slug));

  if (json) {
    console.log(
      JSON.stringify(
        {
          repoCount: repoMigrations.length,
          appliedCount: appliedSlugs.size,
          missing: missing.map(m => m.file),
        },
        null,
        2
      )
    );
  }

  if (missing.length === 0) {
    if (!json) {
      console.log(
        `✅ Migration drift check passed: all ${repoMigrations.length} repo migrations are applied.`
      );
    }
    return;
  }

  if (!json) {
    console.error(`❌ Migration drift detected: ${missing.length} repo migration(s) not applied:`);
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
