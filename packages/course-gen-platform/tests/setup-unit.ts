/**
 * Vitest setup file for UNIT tests only
 * Mocks Redis to prevent real connections
 */
import { vi } from 'vitest';
import { config } from 'dotenv';
import path from 'path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

// ============================================================================
// MOCK REDIS BEFORE ANY IMPORTS
// Unit tests should not connect to real Redis
// ============================================================================
vi.mock('@/shared/cache/redis', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    status: 'ready',
  })),
  closeRedisClient: vi.fn().mockResolvedValue(undefined),
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// Also mock ioredis directly for any direct imports
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
    on: vi.fn(),
    status: 'ready',
    connect: vi.fn().mockResolvedValue(undefined),
  }));
  return { default: RedisMock, Redis: RedisMock };
});

// ============================================================================
// DOM ENVIRONMENT SETUP (Required for mermaid in Node.js)
// ============================================================================
const dom = new JSDOM('<!DOCTYPE html><body></body>');
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;

const DOMPurify = createDOMPurify(dom.window);
// @ts-expect-error - Mermaid expects DOMPurify on window
global.window.DOMPurify = DOMPurify;
// @ts-expect-error - Also set global.DOMPurify for direct access
global.DOMPurify = DOMPurify;

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================
config({ path: path.resolve(__dirname, '../.env') });

console.log('=== UNIT TEST SETUP (with Redis mock) ===');
console.log(
  'SUPABASE_URL:',
  process.env.SUPABASE_URL
    ? 'SET (' + process.env.SUPABASE_URL.substring(0, 30) + '...)'
    : 'MISSING'
);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

// ============================================================================
// CLEANUP: Ensure Node.js process can exit cleanly
// ============================================================================
import { afterAll, afterEach } from 'vitest';

afterEach(() => {
  // Clear all mocks between tests to prevent state leakage
  vi.clearAllMocks();
});

afterAll(() => {
  // Restore all mocks to original implementations
  vi.restoreAllMocks();

  // Close JSDOM to release resources
  if (dom && dom.window) {
    dom.window.close();
  }

  // Clear any pending timers (safety net)
  vi.useRealTimers();

  console.log('=== UNIT TEST CLEANUP COMPLETE ===');
});
