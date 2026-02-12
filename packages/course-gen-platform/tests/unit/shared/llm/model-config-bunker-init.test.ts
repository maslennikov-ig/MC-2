/**
 * Unit tests for ModelConfigBunker directory initialization (mkdirSync fix)
 * @module tests/unit/shared/llm/model-config-bunker-init
 *
 * Tests the fix for ENOENT errors in parallel workers by verifying that
 * the LKG directory is created BEFORE any file operations.
 *
 * Focus: Only tests the mkdirSync initialization behavior, not full bunker lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Stats } from 'fs';

// ============================================================================
// MOCKS (must be defined before imports)
// ============================================================================

// Mock fs module
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    copyFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
  };
});

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ mtime: new Date() } as Stats),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Redis client
vi.mock('@/shared/cache/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
  }),
}));

// Mock Supabase admin client
vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          data: [],
          error: null,
        }),
      }),
    }),
  }),
}));

// Mock logger
vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { mkdirSync, existsSync, copyFileSync, readFileSync } from 'fs';
import { ModelConfigBunker } from '@/shared/llm/model-config-bunker';
import logger from '@/shared/logger';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('ModelConfigBunker: mkdirSync initialization', () => {
  let bunker: ModelConfigBunker;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks: LKG doesn't exist, SEED exists
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('config-seed.json')) {
        return true; // SEED exists
      }
      return false; // LKG doesn't exist
    });

    // Mock readFileSync to return valid minimal config in SEED ARRAY FORMAT
    // (This is the format model-config-bunker expects from disk)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify([
        {
          phase_name: 'global_default',
          context_tier: 'standard',
          model_id: 'anthropic/claude-3.5-sonnet',
          fallback_model_id: null,
          temperature: 0.7,
          max_tokens: 4096,
          max_context_tokens: null,
          quality_threshold: null,
          max_retries: null,
          timeout_ms: null,
          language: 'any',
          stage_number: null,
          judge_role: null,
          weight: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
    );
  });

  afterEach(() => {
    // Cleanup timer if bunker was initialized
    if (bunker && (bunker as any).syncTimer) {
      bunker.shutdown();
    }
  });

  // ==========================================================================
  // CORE FIX VERIFICATION
  // ==========================================================================

  it('should call mkdirSync with recursive:true during initialize', async () => {
    bunker = new ModelConfigBunker();

    await bunker.initialize();

    // Verify mkdirSync was called
    expect(mkdirSync).toHaveBeenCalled();

    // Verify recursive option was used
    const calls = vi.mocked(mkdirSync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toEqual({ recursive: true });
  });

  it('should call mkdirSync BEFORE any file read operations', async () => {
    const callOrder: string[] = [];

    // Track call order
    vi.mocked(mkdirSync).mockImplementation(() => {
      callOrder.push('mkdirSync');
    });

    vi.mocked(existsSync).mockImplementation((path: any) => {
      callOrder.push('existsSync');
      if (typeof path === 'string' && path.includes('config-seed.json')) {
        return true;
      }
      return false;
    });

    vi.mocked(readFileSync).mockImplementation((() => {
      callOrder.push('readFileSync');
      return JSON.stringify([
        {
          phase_name: 'global_default',
          context_tier: 'standard',
          model_id: 'anthropic/claude-3.5-sonnet',
          fallback_model_id: null,
          temperature: 0.7,
          max_tokens: 4096,
          max_context_tokens: null,
          quality_threshold: null,
          max_retries: null,
          timeout_ms: null,
          language: 'any',
          stage_number: null,
          judge_role: null,
          weight: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    }) as any);

    bunker = new ModelConfigBunker();

    await bunker.initialize();

    // Verify mkdirSync was called FIRST
    expect(callOrder[0]).toBe('mkdirSync');

    // Verify file operations came after
    const mkdirIndex = callOrder.indexOf('mkdirSync');
    const existsIndex = callOrder.indexOf('existsSync');
    const readIndex = callOrder.indexOf('readFileSync');

    expect(mkdirIndex).toBeLessThan(existsIndex);
    expect(mkdirIndex).toBeLessThan(readIndex);
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  it('should propagate mkdirSync error if directory creation fails', async () => {
    const mkdirError = new Error('EACCES: permission denied');
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw mkdirError;
    });

    bunker = new ModelConfigBunker();

    await expect(bunker.initialize()).rejects.toThrow('EACCES: permission denied');

    // Verify error was logged
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      expect.stringContaining('Initialization failed')
    );
  });

  it('should NOT proceed with file operations if mkdirSync throws', async () => {
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    bunker = new ModelConfigBunker();

    try {
      await bunker.initialize();
    } catch {
      // Expected to throw
    }

    // Verify existsSync was never called (operation halted)
    expect(existsSync).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // INTEGRATION WITH DIRECTORY PATHS
  // ==========================================================================

  it('should create directory for LKG_PATH (dirname)', async () => {
    // Reset mkdirSync mock to ensure no error from previous test
    vi.mocked(mkdirSync).mockReset();

    bunker = new ModelConfigBunker();

    await bunker.initialize();

    const calls = vi.mocked(mkdirSync).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // Verify the path is a directory (not the file itself)
    const dirPath = calls[0][0] as string;
    expect(dirPath).not.toContain('lkg-config.json');
    expect(dirPath).toContain('data'); // Should contain 'data' directory
  });

  it('should succeed when directory already exists (recursive:true handles this)', async () => {
    // mkdirSync with recursive:true is idempotent - doesn't throw if dir exists
    vi.mocked(mkdirSync).mockImplementation(() => {
      // No-op (directory already exists)
    });

    bunker = new ModelConfigBunker();

    await expect(bunker.initialize()).resolves.not.toThrow();

    expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});
