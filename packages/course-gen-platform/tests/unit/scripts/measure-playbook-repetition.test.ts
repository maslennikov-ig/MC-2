import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptUrl = new URL('../../../scripts/measure-playbook-repetition.ts', import.meta.url);

function basisVector(axis: number): number[] {
  return Array.from({ length: 768 }, (_, index) => (index === axis ? 1 : 0));
}

function completedStoredPlaybook(id: string, complete = true) {
  const blockIds = [
    'header',
    ...Array.from({ length: complete ? 26 : 1 }, (_, i) => `block_${i + 1}`),
  ];
  return {
    id,
    status: 'completed',
    language: 'en',
    created_at: '2026-08-29T00:00:00.000Z',
    generated_blocks: Object.fromEntries(
      blockIds.map(blockId => [blockId, { status: 'completed', content: `${blockId} content` }])
    ),
  };
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

  it('keeps an explicit baseline cohort stable and evaluates one exact playbook with zero repeats', async () => {
    const { formatReport, measureEmbeddedPlaybook, parseMeasurementArgs, selectMeasurementCohort } =
      await import(scriptUrl.href);
    const historicalIds = Array.from(
      { length: 14 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    );
    const newId = '00000000-0000-4000-8000-000000000015';
    const cohortHashes = historicalIds.map(id =>
      createHash('sha256').update(id).digest('hex').slice(0, 12)
    );
    const rows = [
      ...historicalIds.map(id => completedStoredPlaybook(id)),
      completedStoredPlaybook(newId),
    ];
    const baselineArgs = parseMeasurementArgs(
      cohortHashes.flatMap(hash => ['--cohort-hash', hash]),
      '/tmp/course-platform'
    );

    expect(
      selectMeasurementCohort(rows, baselineArgs).map(playbook => playbook.playbookId)
    ).toEqual(historicalIds);

    const targetId = historicalIds[0];
    const evaluationArgs = parseMeasurementArgs(
      ['--playbook-id', targetId, '--threshold', '0.85', '--out', '/tmp/evaluation.md'],
      '/tmp/course-platform'
    );
    const [target] = selectMeasurementCohort(rows, evaluationArgs);
    expect(target.playbookId).toBe(targetId);
    expect(() => parseMeasurementArgs(['--mode', 'evaluation'], '/tmp/course-platform')).toThrow(
      /playbook-id/u
    );
    expect(() =>
      parseMeasurementArgs(
        ['--playbook-id', targetId, '--threshold', '0.80'],
        '/tmp/course-platform'
      )
    ).toThrow(/0\.85/u);
    expect(() => selectMeasurementCohort([], evaluationArgs)).toThrow(/completed 27-block/u);
    expect(() =>
      selectMeasurementCohort(
        [completedStoredPlaybook(targetId), completedStoredPlaybook(targetId)],
        evaluationArgs
      )
    ).toThrow(/exactly one completed 27-block/u);
    expect(() =>
      selectMeasurementCohort([completedStoredPlaybook(targetId, false)], evaluationArgs)
    ).toThrow(/completed 27-block/u);

    const zeroMeasurement = measureEmbeddedPlaybook(
      {
        playbookId: targetId,
        blocks: [
          {
            blockId: 'header',
            embedding: basisVector(0),
            paragraphEmbeddings: [basisVector(0), basisVector(1)],
          },
          { blockId: 'block_1', embedding: basisVector(1), paragraphEmbeddings: [] },
          { blockId: 'block_2', embedding: basisVector(2), paragraphEmbeddings: [] },
          { blockId: 'block_7', embedding: basisVector(3), paragraphEmbeddings: [] },
        ],
      },
      0.85
    );
    const report = formatReport(
      [target],
      [zeroMeasurement],
      '2026-08-29T00:00:00.000Z',
      0.85,
      '/tmp/checkpoint.json',
      evaluationArgs
    );

    expect(report).toContain('Cohort size: **1**');
    expect(report).toContain('read live from `CAREER_PLAYBOOK_BLOCK_CATALOG`');
    expect(report).toContain('| Audience-view block pairs | 12 | 0 | 0.00% |');
    expect(report).toContain('| Paragraph pairs within one block | 1 | 0 | 0.00% |');
    expect(report).toContain('Fixed evaluation threshold: **0.85**');
    expect(report).toContain('--playbook-id <completed-playbook-uuid> --threshold 0.85');
    expect(report).not.toContain(targetId);
  });

  it('grades a live playbook with production inputs and reproduces the baseline with frozen ones', async () => {
    const {
      BASELINE_AUDIENCE_BLOCKS,
      audienceBlocksForMode,
      measureEmbeddedPlaybook,
      minParagraphCharactersForMode,
      parseMeasurementArgs,
      splitSemanticParagraphs,
      thresholdForMode,
    } = await import(scriptUrl.href);
    const { CAREER_PLAYBOOK_BLOCK_CATALOG } = await import('@megacampus/shared-types');
    const { splitCareerPlaybookSemanticParagraphs } = await import(
      '@/stages/stage-career-playbook/nodes/semantic-repetition'
    );
    const {
      CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS,
      CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD,
    } = await import('@/stages/stage-career-playbook/nodes/repetition-thresholds');

    // Evaluation follows whatever the owner set in the catalogue; nothing here
    // restates the map, so moving a checkbox moves the acceptance run with it.
    for (const audience of ['employee', 'manager', 'hr'] as const) {
      expect(audienceBlocksForMode('evaluation')[audience]).toEqual(
        CAREER_PLAYBOOK_BLOCK_CATALOG.filter(block => block.audiences.includes(audience)).map(
          block => block.blockId
        )
      );
    }
    // The frozen phase-0 copy currently agrees with the catalogue, so equality
    // alone would pass even if evaluation read the copy. Pin the source too.
    expect(audienceBlocksForMode('evaluation')).not.toBe(BASELINE_AUDIENCE_BLOCKS);
    expect(thresholdForMode('evaluation')).toBe(CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD);
    expect(minParagraphCharactersForMode('evaluation')).toBe(
      CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS
    );
    const productionThreshold = `${CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD}`;
    expect(
      parseMeasurementArgs(
        [
          '--playbook-id',
          '00000000-0000-4000-8000-000000000001',
          '--threshold',
          productionThreshold,
        ],
        '/tmp/course-platform'
      ).threshold
    ).toBe(CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD);

    // The published 2026-08-29 numbers stay reproducible from frozen inputs.
    expect(audienceBlocksForMode('baseline')).toBe(BASELINE_AUDIENCE_BLOCKS);
    expect(thresholdForMode('baseline')).toBe(0.85);
    expect(minParagraphCharactersForMode('baseline')).toBe(100);

    const atFloor = 'a'.repeat(CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS);
    const belowFloor = 'b'.repeat(CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS - 1);
    const markdown = `${atFloor}\n\n${belowFloor}`;
    expect(splitSemanticParagraphs(markdown, 'evaluation')).toEqual(
      splitCareerPlaybookSemanticParagraphs(markdown)
    );
    expect(splitSemanticParagraphs(markdown, 'evaluation')).toEqual([atFloor]);

    // A view the owner narrows must shrink the pair count the report prints.
    const narrowed = {
      ...audienceBlocksForMode('evaluation'),
      employee: ['header', 'block_1'],
    };
    const blocks = ['header', 'block_1', 'block_2'].map((blockId, index) => ({
      blockId,
      embedding: basisVector(index),
      paragraphEmbeddings: [],
    }));
    const wide = measureEmbeddedPlaybook(
      { playbookId: 'fixture', blocks },
      0.85,
      audienceBlocksForMode('evaluation')
    );
    const narrow = measureEmbeddedPlaybook({ playbookId: 'fixture', blocks }, 0.85, narrowed);
    expect(wide.views.employee.pairCount).toBe(3);
    expect(narrow.views.employee.pairCount).toBe(1);
  });
});
