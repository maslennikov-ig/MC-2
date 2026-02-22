import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  };
  return { logger: mockLogger, default: mockLogger };
});

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const LESSON_ID = '22222222-2222-4222-8222-222222222222';
const ENRICHMENT_ID = '33333333-3333-4333-8333-333333333333';

describe('stage7 local storage service media support', () => {
  let tempDir: string;
  let originalStoragePath: string | undefined;

  beforeEach(async () => {
    originalStoragePath = process.env.ENRICHMENTS_LOCAL_PATH;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stage7-local-storage-'));
    process.env.ENRICHMENTS_LOCAL_PATH = tempDir;
  });

  afterEach(async () => {
    if (originalStoragePath === undefined) {
      delete process.env.ENRICHMENTS_LOCAL_PATH;
    } else {
      process.env.ENRICHMENTS_LOCAL_PATH = originalStoragePath;
    }

    vi.resetModules();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    { extension: 'mp3', expectedMime: 'audio/mpeg' },
    { extension: 'mp4', expectedMime: 'video/mp4' },
  ])(
    'accepts $extension and reports $expectedMime metadata',
    async ({ extension, expectedMime }) => {
      const { uploadEnrichmentAssetLocal, getAssetMetadataLocal } = await import(
        '../../../src/stages/stage7-enrichments/services/local-storage-service'
      );

      const storagePath = await uploadEnrichmentAssetLocal(
        COURSE_ID,
        LESSON_ID,
        ENRICHMENT_ID,
        Buffer.from('asset-bytes'),
        extension
      );

      const metadata = await getAssetMetadataLocal(storagePath);

      expect(storagePath).toBe(`${COURSE_ID}/${LESSON_ID}/${ENRICHMENT_ID}.${extension}`);
      expect(metadata).not.toBeNull();
      expect(metadata?.mimeType).toBe(expectedMime);
      expect(metadata?.size).toBeGreaterThan(0);
    }
  );
});
