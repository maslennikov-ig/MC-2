import path from 'path';
import fs from 'fs/promises';
import { cleanupDoclingCache, DEFAULT_DOCLING_TTL_HOURS } from '../../src/shared/cleanup/docling-cleanup.js';
import { logger } from '../../src/shared/logger/index.js';

/**
 * Docling Cache Cleanup Script
 *
 * Removes stale Docling cache files based on TTL (time-to-live).
 * The cache stores parsed document results keyed by MD5 hash of file path.
 *
 * Usage:
 *   pnpm cleanup:docling-cache [OPTIONS] [TTL_HOURS]
 *
 * Options:
 *   --help, -h     Show this help message
 *   --dry-run, -n  Show what would be deleted without actually deleting
 *
 * Arguments:
 *   TTL_HOURS      Cache retention period in hours (default: 168 = 7 days)
 *
 * Examples:
 *   pnpm cleanup:docling-cache              # Delete files older than 7 days
 *   pnpm cleanup:docling-cache 24           # Delete files older than 24 hours
 *   pnpm cleanup:docling-cache --dry-run    # Preview deletions (7 day TTL)
 *   pnpm cleanup:docling-cache --dry-run 24 # Preview deletions (24 hour TTL)
 *
 * Environment Variables:
 *   DOCLING_CACHE_PATH  Override default cache directory location
 */

// Default to monorepo root .tmp if not provided (assuming CWD is packages/course-gen-platform)
const CACHE_DIR = process.env.DOCLING_CACHE_PATH || path.resolve(process.cwd(), '../../.tmp/docling-cache');

function printHelp(): void {
  console.log(`
Docling Cache Cleanup Script

Removes stale Docling cache files based on TTL (time-to-live).
The cache stores parsed document results keyed by MD5 hash of file path.

Usage:
  pnpm cleanup:docling-cache [OPTIONS] [TTL_HOURS]

Options:
  --help, -h     Show this help message
  --dry-run, -n  Show what would be deleted without actually deleting

Arguments:
  TTL_HOURS      Cache retention period in hours (default: ${DEFAULT_DOCLING_TTL_HOURS} = 7 days)

Examples:
  pnpm cleanup:docling-cache              # Delete files older than 7 days
  pnpm cleanup:docling-cache 24           # Delete files older than 24 hours
  pnpm cleanup:docling-cache --dry-run    # Preview deletions (7 day TTL)
  pnpm cleanup:docling-cache --dry-run 24 # Preview deletions (24 hour TTL)

Environment Variables:
  DOCLING_CACHE_PATH  Override default cache directory location
                      Current: ${CACHE_DIR}
`);
}

interface ParsedArgs {
  help: boolean;
  dryRun: boolean;
  ttlHours: number;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    help: false,
    dryRun: false,
    ttlHours: DEFAULT_DOCLING_TTL_HOURS,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    } else if (!arg.startsWith('-')) {
      const parsed = parseInt(arg, 10);
      if (!isNaN(parsed) && parsed > 0) {
        result.ttlHours = parsed;
      } else if (arg.trim() !== '') {
        console.error(`Error: Invalid TTL value "${arg}". Must be a positive number.`);
        process.exit(1);
      }
    } else {
      console.error(`Error: Unknown option "${arg}". Use --help for usage information.`);
      process.exit(1);
    }
  }

  return result;
}

async function dryRunCleanup(cacheDir: string, ttlHours: number): Promise<void> {
  const retentionMs = ttlHours * 60 * 60 * 1000;
  const now = Date.now();
  const thresholdTime = now - retentionMs;

  console.log(`\nDry run mode - no files will be deleted\n`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`TTL: ${ttlHours} hours (${(ttlHours / 24).toFixed(1)} days)`);
  console.log(`Threshold: ${new Date(thresholdTime).toISOString()}\n`);

  try {
    await fs.access(cacheDir);
  } catch {
    console.log('Cache directory does not exist or is not accessible. Nothing to clean.');
    return;
  }

  const files = await fs.readdir(cacheDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('No cache files found.');
    return;
  }

  let wouldDelete = 0;
  let wouldKeep = 0;
  let totalSizeToFree = 0;

  console.log('Files analysis:');
  console.log('-'.repeat(80));

  for (const file of jsonFiles) {
    const filePath = path.join(cacheDir, file);
    try {
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      const ageHours = (age / (60 * 60 * 1000)).toFixed(1);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      if (stats.mtimeMs < thresholdTime) {
        console.log(`  [DELETE] ${file} (age: ${ageHours}h, size: ${sizeMB}MB)`);
        wouldDelete++;
        totalSizeToFree += stats.size;
      } else {
        console.log(`  [KEEP]   ${file} (age: ${ageHours}h, size: ${sizeMB}MB)`);
        wouldKeep++;
      }
    } catch (err) {
      console.log(`  [ERROR]  ${file} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('-'.repeat(80));
  console.log(`\nSummary:`);
  console.log(`  Would delete: ${wouldDelete} files`);
  console.log(`  Would keep:   ${wouldKeep} files`);
  console.log(`  Space freed:  ${(totalSizeToFree / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nRun without --dry-run to actually delete files.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  console.log(`\nDocling Cache Cleanup`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`TTL: ${parsed.ttlHours} hours (${(parsed.ttlHours / 24).toFixed(1)} days)`);

  if (parsed.dryRun) {
    await dryRunCleanup(CACHE_DIR, parsed.ttlHours);
  } else {
    try {
      const result = await cleanupDoclingCache(CACHE_DIR, parsed.ttlHours);

      console.log(`\nCleanup completed:`);
      console.log(`  Deleted: ${result.deletedCount} files`);
      console.log(`  Kept:    ${result.keptCount} files`);
      console.log(`  Errors:  ${result.errorCount}`);
      console.log(`  Freed:   ${(result.totalSizeFreed / 1024 / 1024).toFixed(2)} MB`);
    } catch (err) {
      logger.error({ err }, 'Cleanup failed');
      console.error('\nCleanup failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
