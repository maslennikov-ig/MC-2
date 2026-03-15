import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../logger/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to Last Known Good (LKG) configuration file
 */
export const LKG_PATH = (() => {
  if (process.env.LKG_CONFIG_PATH) {
    return process.env.LKG_CONFIG_PATH;
  }
  if (process.env.NODE_ENV !== 'production') {
    return path.join(__dirname, '../../../../../.local/data/lkg-config.json');
  }
  return '/app/data/lkg-config.json';
})();

/**
 * Path to build-time seed artifact
 */
export const SEED_PATH =
  process.env.SEED_CONFIG_PATH || path.join(__dirname, '../../../../config/config-seed.json');

/**
 * Redis key for configuration snapshot
 */
export const REDIS_KEY = 'llm_config_bunker_snapshot';

/**
 * Background sync interval (1 minute)
 */
export const SYNC_INTERVAL_MS = 60_000;

/**
 * Database query timeout (10 seconds)
 */
export const DB_QUERY_TIMEOUT_MS = 10_000;

/**
 * Circuit breaker threshold for invalid configs
 */
export const INVALID_THRESHOLD = (() => {
  const value = parseFloat(process.env.BUNKER_INVALID_THRESHOLD || '0.2');
  if (isNaN(value) || value < 0 || value > 1) {
    logger.warn(
      { value: process.env.BUNKER_INVALID_THRESHOLD, default: 0.2 },
      '[ModelConfigBunker] Invalid BUNKER_INVALID_THRESHOLD, using default'
    );
    return 0.2;
  }
  return value;
})();

/**
 * Minimum config count to prevent accidental drops
 */
export const MIN_CONFIG_COUNT = (() => {
  const value = parseInt(process.env.BUNKER_MIN_CONFIG_COUNT || '5', 10);
  if (isNaN(value) || value < 1) {
    logger.warn(
      { value: process.env.BUNKER_MIN_CONFIG_COUNT, default: 5 },
      '[ModelConfigBunker] Invalid BUNKER_MIN_CONFIG_COUNT, using default'
    );
    return 5;
  }
  return value;
})();

/**
 * Cache size threshold for drop detection
 */
export const CACHE_SIZE_THRESHOLD = (() => {
  const value = parseInt(process.env.BUNKER_CACHE_SIZE_THRESHOLD || '10', 10);
  if (isNaN(value) || value < 1) {
    logger.warn(
      { value: process.env.BUNKER_CACHE_SIZE_THRESHOLD, default: 10 },
      '[ModelConfigBunker] Invalid BUNKER_CACHE_SIZE_THRESHOLD, using default'
    );
    return 10;
  }
  return value;
})();
