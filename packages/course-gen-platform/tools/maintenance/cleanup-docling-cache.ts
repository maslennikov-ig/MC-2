import path from 'path';
import { cleanupDoclingCache } from '../../src/shared/cleanup/docling-cleanup.js';
import { logger } from '../../src/shared/logger/index.js';

/**
 * Docling Cache Cleanup Script Entrypoint
 * 
 * Usage: tsx tools/maintenance/cleanup-docling-cache.ts [ttl-in-hours]
 */

const DEFAULT_TTL_HOURS = 24;
// Default to monorepo root .tmp if not provided (assuming CWD is packages/course-gen-platform)
const CACHE_DIR = process.env.DOCLING_CACHE_PATH || path.resolve(process.cwd(), '../../.tmp/docling-cache');

async function main() {
  const args = process.argv.slice(2);
  const ttlHours = args[0] ? parseInt(args[0], 10) : DEFAULT_TTL_HOURS;
  
  if (isNaN(ttlHours)) {
    logger.error('Invalid TTL provided. Please provide a number in hours.');
    process.exit(1);
  }

  try {
    await cleanupDoclingCache(CACHE_DIR, ttlHours);
  } catch (err) {
    console.error('Unhandled error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
