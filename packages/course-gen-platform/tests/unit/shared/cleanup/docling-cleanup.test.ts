import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupDoclingCacheForCourse, generateCacheKey } from '@/shared/cleanup/docling-cleanup';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Docling MCP 3 cache compatibility', () => {
  it('generates the first 32 characters of the official sorted-JSON SHA-256 key', () => {
    expect(generateCacheKey('/app/uploads/example.pdf')).toBe('185ea327902cd6396486c80e09fd024a');
  });

  it('matches Python json.dumps canonicalization for Unicode paths', () => {
    expect(generateCacheKey('/app/uploads/курс №1.pdf')).toBe('511f9fcaefb9040515e45017c318dc67');
    expect(generateCacheKey('/app/uploads/emoji-📄.pdf')).toBe('7dcb30596966bd7895b9dfc2bc488c6a');
  });

  it('deletes both JSON and Markdown files for new and legacy keys', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-cleanup-'));
    temporaryDirectories.push(cacheDir);
    const source = '/app/uploads/example.pdf';
    const currentKey = generateCacheKey(source);
    const legacyKey = '569c86d848008faa152584d7823fb3f3';

    await Promise.all(
      [currentKey, legacyKey].flatMap(key =>
        ['json', 'md'].map(extension =>
          fs.writeFile(path.join(cacheDir, `${key}.${extension}`), `${key}-${extension}`)
        )
      )
    );

    const result = await cleanupDoclingCacheForCourse(cacheDir, [source]);

    expect(result).toMatchObject({ deletedCount: 4, errorCount: 0 });
    expect(await fs.readdir(cacheDir)).toEqual([]);
  });

  it('deletes keys produced from both the host path and its container path', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-cleanup-paths-'));
    temporaryDirectories.push(cacheDir);
    const previousBase = process.env.DOCLING_UPLOADS_BASE_PATH;
    const previousContainer = process.env.DOCLING_CONTAINER_UPLOADS_PATH;
    process.env.DOCLING_UPLOADS_BASE_PATH = '/opt/megacampus/data';
    process.env.DOCLING_CONTAINER_UPLOADS_PATH = '/app/uploads';

    try {
      const hostPath = '/opt/megacampus/data/uploads/course/document.pdf';
      const containerPath = '/app/uploads/course/document.pdf';
      await Promise.all(
        [generateCacheKey(hostPath), generateCacheKey(containerPath)].map(key =>
          fs.writeFile(path.join(cacheDir, `${key}.json`), key)
        )
      );

      const result = await cleanupDoclingCacheForCourse(cacheDir, [hostPath]);

      expect(result.deletedCount).toBe(2);
      expect(await fs.readdir(cacheDir)).toEqual([]);
    } finally {
      if (previousBase === undefined) delete process.env.DOCLING_UPLOADS_BASE_PATH;
      else process.env.DOCLING_UPLOADS_BASE_PATH = previousBase;
      if (previousContainer === undefined) delete process.env.DOCLING_CONTAINER_UPLOADS_PATH;
      else process.env.DOCLING_CONTAINER_UPLOADS_PATH = previousContainer;
    }
  });
});
