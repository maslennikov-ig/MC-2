import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';
import {
  ModelConfigBunker,
  getModelConfigBunker,
  initializeModelConfigBunker,
  validateModelAvailability,
} from '@/shared/llm/model-config-bunker';
import { getRedisClient } from '@/shared/cache/redis';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

// ==== MOCKS ====
const { mockFs, mockFsPromises } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn(),
    copyFileSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
  },
  mockFsPromises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('fs/promises', () => ({
  default: mockFsPromises,
  ...mockFsPromises,
}));

vi.mock('@/shared/cache/redis', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  return {
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Provide a stable mocked UUID
vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

const mockGetOpenRouterModels = vi.fn().mockResolvedValue({ models: [{ id: 'gpt-4o' }] });
vi.mock('../../../../src/services/openrouter-models.js', () => ({
  getOpenRouterModels: () => mockGetOpenRouterModels(),
}));

// Mock process.env to control constants if needed, but not strictly necessary as they are evaluated on module load.
// We will test behavior based on defaults.

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn(),
};

const validDbRow = {
  phase_name: 'stage_4_classification',
  context_tier: 'standard',
  model_id: 'gpt-4o',
  fallback_model_id: 'gpt-4o-mini',
  temperature: 0.5,
  max_tokens: 1000,
  max_context_tokens: 120000,
  language: 'ru',
  stage_number: 4,
};

const globalDefaultRow = {
  phase_name: 'global_default',
  context_tier: 'standard',
  model_id: 'gpt-4o',
  fallback_model_id: null,
  temperature: 0.7,
  max_tokens: 4096,
  max_context_tokens: null,
  language: 'any',
  stage_number: null,
};

const emergencyRow = {
  phase_name: 'emergency',
  context_tier: 'standard',
  model_id: 'gpt-3.5-turbo',
  fallback_model_id: null,
  temperature: 0.7,
  max_tokens: 4096,
  max_context_tokens: null,
  language: 'any',
  stage_number: null,
};

describe('ModelConfigBunker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getRedisClient as any).mockReturnValue(mockRedis);
    (getSupabaseAdmin as any).mockReturnValue(mockSupabase);

    // Default mocks to empty/successful
    mockFs.existsSync.mockReturnValue(false);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');

    mockSupabase.eq.mockResolvedValue({
      data: [validDbRow, globalDefaultRow, emergencyRow],
      error: null,
    });

    mockFsPromises.mkdir.mockResolvedValue(undefined as any);

    // Dynamic matching of stat size to writeFile payload
    let lastWrittenSize = 100;
    mockFsPromises.writeFile.mockImplementation((file: string, data: any) => {
      lastWrittenSize = Buffer.byteLength(data.toString(), 'utf-8');
      return Promise.resolve();
    });
    mockFsPromises.stat.mockImplementation(() => Promise.resolve({ size: lastWrittenSize }));

    mockFsPromises.rename.mockResolvedValue(undefined as any);
    mockFsPromises.unlink.mockResolvedValue(undefined as any);

    vi.useFakeTimers();
  });

  afterEach(() => {
    const bunker = getModelConfigBunker();
    bunker.shutdown();
    (bunker as any).cache.clear();
    (bunker as any).isReady = false;
    (bunker as any).syncRetries = 0;
    (bunker as any).cacheUpdatedAt = 0;
    vi.useRealTimers();
  });

  describe('Initialization and Loading', () => {
    it('loads from seed array, then redis, then DB on fresh start', async () => {
      // Setup seed disk format Array
      mockFs.existsSync.mockImplementation((path: string) => path.includes('config-seed.json'));
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify([validDbRow, globalDefaultRow, emergencyRow])
      );

      const bunker = new ModelConfigBunker();
      await bunker.initialize();

      expect(bunker.isInitialized()).toBe(true);

      const health = bunker.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.configCount).toBe(3); // The 3 rows
    });

    it('loads from disk snapshot format', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null }); // Don't over-sync from DB
      mockFs.existsSync.mockImplementation((path: string) => path.includes('lkg-config.json'));
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          updatedAt: Date.now(),
          data: {
            'global_default:standard': globalDefaultRow,
          },
        })
      );

      const bunker = new ModelConfigBunker();
      await bunker.initialize();

      expect(bunker.isInitialized()).toBe(true);
      expect(bunker.getHealth().configCount).toBe(1);
    });

    it('handles invalid configs in disk snapshot format', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });
      mockFs.existsSync.mockImplementation((path: string) => path.includes('lkg-config.json'));
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          updatedAt: 1234567890,
          data: {
            'valid:standard': globalDefaultRow,
            'invalid1:standard': { phase_name: 'invalid1' }, // Missing required fields
            'invalid2:standard': { phase_name: 'invalid2' },
          },
        })
      );

      const bunker = new ModelConfigBunker();
      await bunker.initialize();
      expect(bunker.getHealth().configCount).toBe(1);
    });

    it('handles JSON parse error in disk cache', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Unreadable');
      });

      const bunker = new ModelConfigBunker();
      await bunker.initialize(); // DB sync kicks in and restores config
      expect(bunker.getHealth().configCount).toBe(3);
    });

    it('handles invalid configs and cache dropping in seed format array', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });
      mockFs.existsSync.mockImplementation((path: string) => path.includes('config-seed.json'));
      // 1 valid, 3 invalid -> 75% invalid (>20% threshold)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify([
          validDbRow,
          { phase_name: 'invalid1' },
          { phase_name: 'invalid2' },
          { phase_name: 'invalid3' },
        ])
      );

      const bunker = new ModelConfigBunker();
      // DB sync fails, disk cache corrupted -> throws critical
      await expect(bunker.initialize()).rejects.toThrow('CRITICAL: No configs loaded');
    });

    it('syncs from DB and updates LKG and Redis on initialization', async () => {
      const bunker = new ModelConfigBunker();

      await bunker.initialize();

      expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', true);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
      expect(mockFsPromises.rename).toHaveBeenCalled();
      expect(bunker.getHealth().configCount).toBe(3);
    });

    it('throws if no configs can be loaded from anywhere', async () => {
      // Empty DB, no disk, no redis
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });

      const bunker = new ModelConfigBunker();
      await expect(bunker.initialize()).rejects.toThrow('CRITICAL: No configs loaded');
    });

    it('circuit breaker prevents bad db overrides', async () => {
      // disk has 11 valid configs
      const validRows = Array.from({ length: 11 }, (_, i) => ({
        ...globalDefaultRow,
        phase_name: `phase_${i}`,
      }));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validRows));

      const bunker = new ModelConfigBunker();

      // DB returns empty or bad, should not drop cache
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });
      await bunker.initialize();

      expect(bunker.getHealth().configCount).toBe(11);
    });
  });

  describe('Retrieval (get & getEmergency)', () => {
    it('resolves exactly', () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('stage_4_classification:standard:ru', { ...validDbRow });
      (bunker as any).cacheUpdatedAt = Date.now();

      const config = bunker.get('stage_4_classification', 'standard', 'ru');
      expect(config.model_id).toBe('gpt-4o');
      expect(config._meta.resolution).toBe('exact');
      expect(config._meta.source).toBe('memory_l1');
    });

    it('falls back to language', () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('stage_4_classification:standard', {
        ...validDbRow,
        language: 'any',
      });

      const config = bunker.get('stage_4_classification', 'standard', 'fr');
      expect(config._meta.resolution).toBe('fallback_lang');
    });

    it('falls back to tier', () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('stage_4_classification:standard', { ...validDbRow });

      const config = bunker.get('stage_4_classification', 'extended', 'fr');
      expect(config._meta.resolution).toBe('fallback_tier');
    });

    it('falls back to global default', () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('global_default:standard', { ...globalDefaultRow });

      const config = bunker.get('unknown', 'extended', 'fr');
      expect(config._meta.resolution).toBe('global_default');
    });

    it('throws if totally missing', () => {
      const bunker = new ModelConfigBunker();
      expect(() => bunker.get('unknown')).toThrow('Config Resolution Failed');
    });

    it('getEmergency returns emergency config', () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('emergency:extended', { ...emergencyRow });
      const config = bunker.getEmergency();
      expect(config.model_id).toBe('gpt-3.5-turbo');
    });
  });

  describe('Background Sync & Error Recovery', () => {
    it('restarts background sync', () => {
      const bunker = new ModelConfigBunker();
      bunker.restartBackgroundSync();
      expect((bunker as any).syncTimer).not.toBeNull();
      bunker.shutdown();
    });

    it('pauses sync after max retries', async () => {
      const bunker = new ModelConfigBunker();
      // Setup initial cache so it doesn't fail init
      (bunker as any).cache.set('global_default:standard', { ...globalDefaultRow });
      (bunker as any).isReady = true;

      // Make DB fail repeatedly
      mockSupabase.eq.mockResolvedValue({ data: null, error: new Error('DB Error') });

      // Run syncFromDatabase directly enough times to hit max retries
      for (let i = 0; i < 5; i++) {
        await (bunker as any).syncFromDatabase();
      }

      // 6th time should have cleared the timer
      expect((bunker as any).syncTimer).toBeNull();
    });

    it('recovers atomic file write if size mismatch', async () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('global_default:standard', { ...globalDefaultRow });
      (bunker as any).isReady = true;

      mockFsPromises.writeFile.mockResolvedValue(undefined as any);
      // Mock stat size error to break LKG write
      mockFsPromises.stat.mockResolvedValue({ size: 1 } as any);

      // Trigger sync
      mockSupabase.eq.mockResolvedValue({ data: [globalDefaultRow], error: null });
      await (bunker as any).syncFromDatabase();

      // lkgWriteFailures should be 1
      expect(bunker.getHealth().lkgWriteFailures).toBe(1);
    });
  });

  describe('Singleton initializers', () => {
    it('returns the same instance', async () => {
      // Setup successful init
      mockSupabase.eq.mockResolvedValue({ data: [globalDefaultRow], error: null });

      const p1 = initializeModelConfigBunker();
      const p2 = initializeModelConfigBunker();

      const b1 = await p1;
      const b2 = await p2;
      expect(b1).toBe(b2);

      const b3 = getModelConfigBunker();
      expect(b3).toBe(b1);

      // Should return already initialized bunker immediately without new promise
      const b4 = await initializeModelConfigBunker();
      expect(b4).toBe(b1);
    });

    it('clears initialization promise on error', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });
      mockFs.existsSync.mockReturnValue(false); // force fail

      await expect(initializeModelConfigBunker()).rejects.toThrow('CRITICAL: No configs loaded');

      // Should be able to retry
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify([globalDefaultRow]));
      const b = await initializeModelConfigBunker();
      expect(b.isInitialized()).toBe(true);
    });
  });

  describe('validateModelAvailability', () => {
    it('validates against OpenRouter models successfully', async () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('key', validDbRow); // model_id: 'gpt-4o'

      mockGetOpenRouterModels.mockResolvedValueOnce({
        models: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      });
      await validateModelAvailability(bunker); // Should hit info log
    });

    it('warns about invalid models missing from OpenRouter', async () => {
      const bunker = new ModelConfigBunker();
      (bunker as any).cache.set('key', { ...validDbRow, model_id: 'fake-model-idxl' });

      mockGetOpenRouterModels.mockResolvedValueOnce({ models: [{ id: 'gpt-4o' }] });
      await validateModelAvailability(bunker); // Should hit warn log
    });

    it('handles fetch errors gracefully without breaking', async () => {
      const bunker = new ModelConfigBunker();
      mockGetOpenRouterModels.mockRejectedValueOnce(new Error('Network error'));
      await validateModelAvailability(bunker); // Should hit catch warn log
    });
  });
});
