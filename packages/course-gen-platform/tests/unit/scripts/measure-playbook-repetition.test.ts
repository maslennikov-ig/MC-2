import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptUrl = new URL('../../../scripts/measure-playbook-repetition.ts', import.meta.url);

function basisVector(axis: number): number[] {
  return Array.from({ length: 768 }, (_, index) => (index === axis ? 1 : 0));
}

describe('Career Playbook repetition measurement', () => {
  it('counts block pairs per audience-view and paragraph pairs only within their block', async () => {
    expect(existsSync(fileURLToPath(scriptUrl)), 'measurement script must exist').toBe(true);

    const { measureEmbeddedPlaybook } = await import(scriptUrl.href);
    const firstMeaning = basisVector(0);
    const secondMeaning = basisVector(1);
    const thirdMeaning = basisVector(2);

    const result = measureEmbeddedPlaybook(
      {
        playbookId: 'fixture-playbook',
        blocks: [
          {
            blockId: 'header',
            embedding: firstMeaning,
            paragraphEmbeddings: [firstMeaning, firstMeaning],
          },
          {
            blockId: 'block_1',
            embedding: firstMeaning,
            paragraphEmbeddings: [secondMeaning, thirdMeaning],
          },
          {
            blockId: 'block_2',
            embedding: secondMeaning,
            paragraphEmbeddings: [secondMeaning],
          },
          {
            blockId: 'block_7',
            embedding: thirdMeaning,
            paragraphEmbeddings: [thirdMeaning],
          },
        ],
      },
      0.9
    );

    expect(result.views).toEqual({
      employee: { pairCount: 3, tooCloseCount: 1 },
      manager: { pairCount: 6, tooCloseCount: 1 },
      hr: { pairCount: 3, tooCloseCount: 1 },
    });
    expect(result.viewPairs).toHaveLength(12);
    expect(result.viewPairs.filter(pair => pair.tooClose)).toHaveLength(3);
    expect(result.paragraphPairCount).toBe(2);
    expect(result.tooCloseParagraphCount).toBe(1);
    expect(result.paragraphPairs.filter(pair => pair.tooClose)).toEqual([
      expect.objectContaining({ blockId: 'header', paragraphA: 1, paragraphB: 2, similarity: 1 }),
    ]);
  });

  it('resumes from an atomic prose-free checkpoint and preserves input order after a 429', async () => {
    const { embedTextsWithCheckpoint } = await import(scriptUrl.href);
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'playbook-repetition-'));
    const cachePath = path.join(cacheDir, 'embeddings.json');
    const texts = ['customer alpha', 'customer beta', 'customer gamma'];
    const firstMeaning = basisVector(0);
    const secondMeaning = basisVector(1);
    const thirdMeaning = basisVector(2);
    let firstRunCalls = 0;

    await expect(
      embedTextsWithCheckpoint(texts, {
        cachePath,
        batchSize: 2,
        embedBatch: async batch => {
          firstRunCalls += 1;
          if (firstRunCalls === 1) return [firstMeaning, secondMeaning];
          throw new Error(`interrupted while embedding ${batch.length} item`);
        },
        sleep: async () => undefined,
      })
    ).rejects.toThrow('interrupted while embedding 1 item');

    const persistedAfterInterruption = await readFile(cachePath, 'utf8');
    expect(persistedAfterInterruption).not.toContain('customer alpha');
    expect(persistedAfterInterruption).not.toContain('customer beta');
    expect(persistedAfterInterruption).not.toContain('customer gamma');

    const resumedBatches: string[][] = [];
    const waits: number[] = [];
    let resumeAttempts = 0;
    const embeddings = await embedTextsWithCheckpoint(texts, {
      cachePath,
      batchSize: 2,
      embedBatch: async batch => {
        resumedBatches.push([...batch]);
        resumeAttempts += 1;
        if (resumeAttempts === 1) {
          throw Object.assign(new Error('Token rate limit exceeded'), { statusCode: 429 });
        }
        return [thirdMeaning];
      },
      sleep: async milliseconds => {
        waits.push(milliseconds);
      },
    });

    expect(resumedBatches).toEqual([['customer gamma'], ['customer gamma']]);
    expect(waits).toEqual([61_000]);
    expect(embeddings).toEqual([firstMeaning, secondMeaning, thirdMeaning]);
  });
});
