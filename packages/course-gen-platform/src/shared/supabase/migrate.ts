/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-case-declarations */

/**
 * CLI utility for database migrations.
 *
 * NOTE: This file has 0 imports from application code - it's a standalone CLI tool.
 * Usage: npx ts-node src/shared/supabase/migrate.ts up
 *        npx ts-node src/shared/supabase/migrate.ts rollback <version>
 *
 * @module shared/supabase/migrate
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger';

/**
 * Database Migration Runner
 * Executes SQL migration files in order against the Supabase project
 */

// Create Supabase admin client for migrations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS _migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  const { error } = await supabase.rpc('exec_sql', { query });
  if (error) {
    logger.error({ err: error }, 'Failed to create migrations table');
    throw error;
  }
}

/**
 * Get list of already executed migrations
 */
async function getExecutedMigrations(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('_migrations')
    .select('version')
    .order('version', { ascending: true });

  if (error) {
    logger.error({ err: error }, 'Failed to fetch executed migrations');
    throw error;
  }

  return new Set(data?.map(m => m.version) || []);
}

/**
 * Execute a single migration file
 */
async function executeMigration(filepath: string, version: string, name: string): Promise<void> {
  logger.info(`Executing migration: ${version}_${name}`);

  try {
    // Read migration file
    const sql = readFileSync(filepath, 'utf8');

    // Execute migration SQL
    const { error: execError } = await supabase.rpc('exec_sql', { query: sql });
    if (execError) {
      throw execError;
    }

    // Record migration as executed
    const { error: recordError } = await supabase.from('_migrations').insert({
      version,
      name,
    });

    if (recordError) {
      throw recordError;
    }

    logger.info(`✓ Migration ${version}_${name} executed successfully`);
  } catch (error) {
    logger.error({ err: error }, `✗ Migration ${version}_${name} failed`);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  logger.info('Starting database migrations...');

  try {
    // Ensure migrations table exists
    await ensureMigrationsTable();

    // Get already executed migrations
    const executed = await getExecutedMigrations();

    // Get migration files from directory
    const migrationsDir = join(process.cwd(), 'packages/course-gen-platform/supabase/migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let migrationsRun = 0;

    for (const file of files) {
      // Parse version and name from filename (e.g., "20250110_initial_schema.sql")
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        logger.warn(`Skipping invalid migration filename: ${file}`);
        continue;
      }

      const [, version, name] = match;

      // Skip if already executed
      if (executed.has(version)) {
        logger.debug(`Skipping already executed migration: ${version}_${name}`);
        continue;
      }

      // Execute migration
      const filepath = join(migrationsDir, file);
      await executeMigration(filepath, version, name);
      migrationsRun++;
    }

    if (migrationsRun === 0) {
      logger.info('No new migrations to run');
    } else {
      logger.info(`Successfully ran ${migrationsRun} migration(s)`);
    }
  } catch (error) {
    logger.error({ err: error }, 'Migration runner failed');
    throw error;
  }
}

/**
 * Rollback a specific migration (if down script exists)
 */
export async function rollbackMigration(version: string): Promise<void> {
  logger.info(`Rolling back migration: ${version}`);

  try {
    // Check if rollback file exists
    const migrationsDir = join(process.cwd(), 'packages/course-gen-platform/supabase/migrations');
    const rollbackFile = readdirSync(migrationsDir).find(
      f => f.startsWith(`${version}_`) && f.endsWith('.down.sql')
    );

    if (!rollbackFile) {
      throw new Error(`No rollback script found for migration ${version}`);
    }

    // Execute rollback
    const filepath = join(migrationsDir, rollbackFile);
    const sql = readFileSync(filepath, 'utf8');

    const { error: execError } = await supabase.rpc('exec_sql', { query: sql });
    if (execError) {
      throw execError;
    }

    // Remove migration record
    const { error: deleteError } = await supabase
      .from('_migrations')
      .delete()
      .eq('version', version);

    if (deleteError) {
      throw deleteError;
    }

    logger.info(`✓ Migration ${version} rolled back successfully`);
  } catch (error) {
    logger.error({ err: error }, `✗ Rollback of migration ${version} failed`);
    throw error;
  }
}

// CLI support (ESM compatible)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '');
if (isMainModule) {
  const command = process.argv[2];

  switch (command) {
    case 'up':
      runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    case 'rollback':
      const version = process.argv[3];
      if (!version) {
        console.error('Usage: migrate.ts rollback <version>');
        process.exit(1);
      }
      rollbackMigration(version)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;

    default:
      console.log('Usage:');
      console.log('  migrate.ts up          - Run all pending migrations');
      console.log('  migrate.ts rollback <version> - Rollback specific migration');
      process.exit(0);
  }
}
