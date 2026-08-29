import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
});
