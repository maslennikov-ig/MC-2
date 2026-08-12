/**
 * Config seed drift gate.
 *
 * `config-seed.json` is the routing table the platform falls back to when
 * Supabase is unreachable. It is a committed file, refreshed only by an explicit
 * `generate:config-seed` run, and nothing has ever checked that it still
 * resembles the database.
 *
 * It silently fell twenty phases behind between 2026-06 and 2026-08-12, because
 * the generator's REQUIRED_PHASES list named two phases that had been dead for
 * months, so every refresh in that window failed and was ignored. An outage in
 * that window would have routed all of Stage 7, all of Career Playbook, chat and
 * inline editing through global_default.
 *
 * The offline tests already pin the seed's internal shape. This gate is about
 * the one thing they cannot see: whether the file still agrees with the table.
 * Read-only. Requires SUPABASE_DB_URL, same as the migration drift gate.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... pnpm -F course-gen-platform exec \
 *     tsx scripts/check-config-seed-drift.ts
 *
 * Refs mc2-5p609
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

import { buildSslConfig } from './check-migration-drift';

const EXIT_MISCONFIGURED = 2;
const EXIT_DRIFT = 1;
const CONNECT_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 20_000;

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'config',
  'config-seed.json'
);

export interface SeedRow {
  config_type: string;
  course_id: string | null;
  phase_name: string;
  language: string | null;
  context_tier: string | null;
  judge_role: string | null;
  model_id: string;
  fallback_model_id: string | null;
}

/**
 * Stage 6 canonical phases are injected into the seed by the generator and
 * deliberately have no database row, so they cannot be compared against one.
 */
const SEED_ONLY_PHASES = new Set(['stage_6_content']);

function routingKey(row: {
  config_type: string;
  course_id: string | null;
  phase_name: string;
  language: string | null;
  context_tier: string | null;
  judge_role: string | null;
}): string {
  return [
    row.config_type,
    row.course_id ?? '-',
    row.phase_name,
    row.language ?? 'any',
    row.context_tier ?? 'standard',
    row.judge_role ?? '-',
  ].join('|');
}

export interface SeedDriftResult {
  missingFromSeed: string[];
  staleInSeed: string[];
  changedModels: string[];
  seedCount: number;
  dbCount: number;
  hasDrift: boolean;
}

/**
 * Compare the committed seed against the active routing table.
 *
 * Pure so the comparison can be tested without a database — the part worth
 * testing is what counts as drift, not the connection.
 */
export function compareSeedToDatabase(seed: SeedRow[], dbRows: SeedRow[]): SeedDriftResult {
  const dbByKey = new Map(dbRows.map(row => [routingKey(row), row]));
  const seedByKey = new Map(
    seed.filter(row => !SEED_ONLY_PHASES.has(row.phase_name)).map(row => [routingKey(row), row])
  );

  const missingFromSeed: string[] = [];
  const staleInSeed: string[] = [];
  const changedModels: string[] = [];

  for (const [key, dbRow] of dbByKey) {
    const seedRow = seedByKey.get(key);
    if (!seedRow) {
      missingFromSeed.push(`${key} -> ${dbRow.model_id}`);
      continue;
    }
    if (
      seedRow.model_id !== dbRow.model_id ||
      (seedRow.fallback_model_id ?? null) !== (dbRow.fallback_model_id ?? null)
    ) {
      changedModels.push(
        `${key}: seed ${seedRow.model_id}/${seedRow.fallback_model_id ?? '-'} vs db ${dbRow.model_id}/${dbRow.fallback_model_id ?? '-'}`
      );
    }
  }

  for (const key of seedByKey.keys()) {
    if (!dbByKey.has(key)) staleInSeed.push(key);
  }

  return {
    missingFromSeed,
    staleInSeed,
    changedModels,
    seedCount: seedByKey.size,
    dbCount: dbByKey.size,
    hasDrift: missingFromSeed.length > 0 || staleInSeed.length > 0 || changedModels.length > 0,
  };
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('::error::SUPABASE_DB_URL is not set, so the config seed drift gate cannot run.');
    process.exit(EXIT_MISCONFIGURED);
  }

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedRow[];
  const { ssl, verified, reason } = buildSslConfig(dbUrl, process.env.SUPABASE_DB_CA_CERT);
  if (!verified) console.warn(`::warning::Config seed drift gate TLS: ${reason}.`);

  const client = new Client({
    connectionString: dbUrl,
    ...(ssl ? { ssl } : {}),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });

  let dbRows: SeedRow[];
  try {
    await client.connect();
    const res = await client.query<SeedRow>(
      `SELECT config_type, course_id, phase_name, language, context_tier, judge_role,
              model_id, fallback_model_id
       FROM llm_model_config
       WHERE is_active = true`
    );
    dbRows = res.rows;
  } catch (error) {
    // Fail closed: an unreachable database means the gate produced no verdict,
    // and a gate that passes without a verdict is worse than no gate.
    console.error(
      `::error::Config seed drift gate could not reach the database: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(EXIT_MISCONFIGURED);
  } finally {
    await client.end().catch(() => undefined);
  }

  const result = compareSeedToDatabase(seed, dbRows);

  if (!result.hasDrift) {
    console.log(
      `config seed drift check OK: ${result.seedCount} seeded rows match ${result.dbCount} active configs`
    );
    return;
  }

  console.error('::error::config-seed.json no longer matches llm_model_config.');
  for (const line of result.missingFromSeed) console.error(`  missing from seed: ${line}`);
  for (const line of result.staleInSeed) {
    console.error(`  present in seed but not active in DB: ${line}`);
  }
  for (const line of result.changedModels) console.error(`  model changed: ${line}`);
  console.error(
    'Run `pnpm -F course-gen-platform generate:config-seed` and commit the refreshed file.'
  );
  process.exit(EXIT_DRIFT);
}

// Only run when invoked directly: the comparison above is imported by tests.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))
) {
  void main();
}
