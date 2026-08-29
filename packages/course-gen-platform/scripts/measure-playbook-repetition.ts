import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { generateEmbeddings, getJinaTokenStats, resetJinaTokenStats } from '@/shared/embeddings/jina-client';
import { QualityValidator } from '@/shared/validation/quality-validator';

export type BaselineAudience = 'employee' | 'manager' | 'hr';

const CANONICAL_BLOCK_IDS = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
] as const;

/**
 * Phase-0-only copy of specs/028-role-guide-audiences/spec.md section 3.
 * Production does not yet expose an audience map, so the baseline must remain
 * independent of the later implementation while still measuring the same views.
 */
export const BASELINE_AUDIENCE_BLOCKS: Readonly<Record<BaselineAudience, readonly string[]>> = {
  employee: [
    'header', 'block_1', 'block_2', 'block_3', 'block_4', 'block_5', 'block_6', 'block_8',
    'block_9', 'block_10', 'block_11', 'block_13', 'block_14', 'block_16', 'block_18',
    'block_19', 'block_20', 'block_22', 'block_24', 'block_25',
  ],
  manager: [
    'header', 'block_1', 'block_2', 'block_3', 'block_4', 'block_5', 'block_6', 'block_7',
    'block_10', 'block_14', 'block_15', 'block_16', 'block_17', 'block_18', 'block_20',
    'block_21', 'block_23', 'block_24', 'block_25', 'block_26',
  ],
  hr: [
    'header', 'block_1', 'block_7', 'block_8', 'block_11', 'block_12', 'block_13',
    'block_14', 'block_15', 'block_17', 'block_19', 'block_24', 'block_25', 'block_26',
  ],
};

const BLOCK_LABELS: Readonly<Record<string, string>> = {
  header: 'Role guide header',
  block_1: 'Mission and key results',
  block_2: 'Anti-goals',
  block_3: 'Responsibility zones',
  block_4: 'Duties',
  block_5: 'Decision authority matrix',
  block_6: 'KPI and metrics',
  block_7: 'Competencies',
  block_8: 'Tools and technologies',
  block_9: 'Human-AI collaboration',
  block_10: 'Dependencies',
  block_11: 'Career path',
  block_12: 'Candidate profile',
  block_13: 'Day in the life',
  block_14: 'Onboarding',
  block_15: 'Motivation',
  block_16: 'Main process',
  block_17: 'Red flags',
  block_18: 'FAQ',
  block_19: 'Industry context',
  block_20: 'Business model',
  block_21: 'Failure modes',
  block_22: 'Role README',
  block_23: 'Continuity plan',
  block_24: 'Role Canvas',
  block_25: 'Footer',
  block_26: 'Implementation checklist',
};

export const BASELINE_TOO_CLOSE_THRESHOLD = 0.85;
const REPORT_THRESHOLDS = [0.75, 0.8, BASELINE_TOO_CLOSE_THRESHOLD, 0.9] as const;
const MIN_PARAGRAPH_CHARACTERS = 100;
const EXPECTED_PLAYBOOK_COUNT = 14;
const MAX_INPUT_CHARACTERS = 2_500_000;
const MAX_EMBEDDING_ITEMS = 4_000;

export interface EmbeddedBlock {
  blockId: string;
  embedding: number[];
  paragraphEmbeddings: number[][];
}

export interface EmbeddedPlaybook {
  playbookId: string;
  blocks: EmbeddedBlock[];
}

interface SimilarityPair {
  blockA: string;
  blockB: string;
  similarity: number;
  tooClose: boolean;
  audience: BaselineAudience;
}

interface ParagraphSimilarityPair {
  blockId: string;
  paragraphA: number;
  paragraphB: number;
  similarity: number;
  tooClose: boolean;
}

export interface EmbeddedPlaybookMeasurement {
  playbookId: string;
  views: Record<BaselineAudience, { pairCount: number; tooCloseCount: number }>;
  viewPairs: SimilarityPair[];
  paragraphPairCount: number;
  tooCloseParagraphCount: number;
  paragraphPairs: ParagraphSimilarityPair[];
}

const validator = new QualityValidator();

export function measureEmbeddedPlaybook(
  playbook: EmbeddedPlaybook,
  threshold: number = BASELINE_TOO_CLOSE_THRESHOLD
): EmbeddedPlaybookMeasurement {
  const byId = new Map(playbook.blocks.map(block => [block.blockId, block]));
  const views = {} as EmbeddedPlaybookMeasurement['views'];
  const viewPairs: SimilarityPair[] = [];

  for (const audience of ['employee', 'manager', 'hr'] as const) {
    const blocks = BASELINE_AUDIENCE_BLOCKS[audience]
      .map(blockId => byId.get(blockId))
      .filter((block): block is EmbeddedBlock => block !== undefined);
    let tooCloseCount = 0;

    for (let left = 0; left < blocks.length; left += 1) {
      for (let right = left + 1; right < blocks.length; right += 1) {
        const similarity = validator.cosineSimilarity(
          blocks[left].embedding,
          blocks[right].embedding
        );
        const tooClose = similarity >= threshold;
        if (tooClose) tooCloseCount += 1;
        viewPairs.push({
          blockA: blocks[left].blockId,
          blockB: blocks[right].blockId,
          similarity,
          tooClose,
          audience,
        });
      }
    }

    views[audience] = {
      pairCount: (blocks.length * (blocks.length - 1)) / 2,
      tooCloseCount,
    };
  }

  const paragraphPairs: ParagraphSimilarityPair[] = [];
  for (const block of playbook.blocks) {
    for (let left = 0; left < block.paragraphEmbeddings.length; left += 1) {
      for (let right = left + 1; right < block.paragraphEmbeddings.length; right += 1) {
        const similarity = validator.cosineSimilarity(
          block.paragraphEmbeddings[left],
          block.paragraphEmbeddings[right]
        );
        paragraphPairs.push({
          blockId: block.blockId,
          paragraphA: left + 1,
          paragraphB: right + 1,
          similarity,
          tooClose: similarity >= threshold,
        });
      }
    }
  }

  return {
    playbookId: playbook.playbookId,
    views,
    viewPairs,
    paragraphPairCount: paragraphPairs.length,
    tooCloseParagraphCount: paragraphPairs.filter(pair => pair.tooClose).length,
    paragraphPairs,
  };
}

interface StoredBlock {
  status?: unknown;
  content?: unknown;
}

interface StoredPlaybook {
  id: string;
  language: string | null;
  created_at: string;
  generated_blocks: Record<string, StoredBlock> | null;
}

interface TextBlock {
  blockId: string;
  content: string;
  paragraphs: string[];
}

interface TextPlaybook {
  playbookId: string;
  language: string;
  createdAt: string;
  blocks: TextBlock[];
}

export function splitSemanticParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n+/u)
    .map(paragraph =>
      paragraph
        .replace(/^#{1,6}\s+/u, '')
        .replace(/\s+/gu, ' ')
        .trim()
    )
    .filter(paragraph => paragraph.length >= MIN_PARAGRAPH_CHARACTERS);
}

function normalizePlaybook(row: StoredPlaybook): TextPlaybook | undefined {
  if (!row.generated_blocks) return undefined;
  if (!CANONICAL_BLOCK_IDS.every(blockId => blockId in row.generated_blocks!)) return undefined;

  const blocks = CANONICAL_BLOCK_IDS.map(blockId => {
    const stored = row.generated_blocks![blockId];
    const content = typeof stored?.content === 'string' ? stored.content.trim() : '';
    return { blockId, content, paragraphs: splitSemanticParagraphs(content) };
  });
  if (blocks.some(block => block.content.length === 0)) return undefined;

  return {
    playbookId: row.id,
    language: row.language ?? 'unknown',
    createdAt: row.created_at,
    blocks,
  };
}

async function loadCompletedPlaybooks(): Promise<TextPlaybook[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, language, created_at, generated_blocks')
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to read completed Career Playbooks: ${error.message}`);
  const playbooks = ((data ?? []) as StoredPlaybook[])
    .map(normalizePlaybook)
    .filter((playbook): playbook is TextPlaybook => playbook !== undefined);

  if (playbooks.length !== EXPECTED_PLAYBOOK_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_PLAYBOOK_COUNT} complete 27-block playbooks, found ${playbooks.length}`
    );
  }
  return playbooks;
}

async function embedPlaybooks(playbooks: TextPlaybook[]): Promise<EmbeddedPlaybook[]> {
  const items = playbooks.flatMap(playbook =>
    playbook.blocks.flatMap(block => [
      { playbookId: playbook.playbookId, blockId: block.blockId, paragraphIndex: -1, text: block.content },
      ...block.paragraphs.map((text, paragraphIndex) => ({
        playbookId: playbook.playbookId,
        blockId: block.blockId,
        paragraphIndex,
        text,
      })),
    ])
  );
  const totalCharacters = items.reduce((sum, item) => sum + item.text.length, 0);
  if (totalCharacters > MAX_INPUT_CHARACTERS || items.length > MAX_EMBEDDING_ITEMS) {
    throw new Error(
      `Cost anomaly guard: ${items.length} embedding items / ${totalCharacters} characters exceeds ` +
        `${MAX_EMBEDDING_ITEMS} items / ${MAX_INPUT_CHARACTERS} characters`
    );
  }

  resetJinaTokenStats();
  const embeddings = await generateEmbeddings(
    items.map(item => item.text),
    'retrieval.passage'
  );
  if (embeddings.length !== items.length) {
    throw new Error(`Jina returned ${embeddings.length} embeddings for ${items.length} inputs`);
  }

  return playbooks.map(playbook => ({
    playbookId: playbook.playbookId,
    blocks: playbook.blocks.map(block => {
      const blockEmbeddingIndex = items.findIndex(
        item =>
          item.playbookId === playbook.playbookId &&
          item.blockId === block.blockId &&
          item.paragraphIndex === -1
      );
      const paragraphEmbeddings = block.paragraphs.map((_, paragraphIndex) => {
        const index = items.findIndex(
          item =>
            item.playbookId === playbook.playbookId &&
            item.blockId === block.blockId &&
            item.paragraphIndex === paragraphIndex
        );
        return embeddings[index];
      });
      return { blockId: block.blockId, embedding: embeddings[blockEmbeddingIndex], paragraphEmbeddings };
    }),
  }));
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function rate(count: number, total: number): string {
  return total === 0 ? '0.00%' : `${((count / total) * 100).toFixed(2)}%`;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function formatReport(
  playbooks: TextPlaybook[],
  measurements: EmbeddedPlaybookMeasurement[],
  generatedAt: string
): string {
  const aliases = new Map(playbooks.map((playbook, index) => [playbook.playbookId, `P${String(index + 1).padStart(2, '0')}`]));
  const viewPairs = measurements.flatMap(measurement =>
    measurement.viewPairs.map(pair => ({ ...pair, playbookId: measurement.playbookId }))
  );
  const paragraphPairs = measurements.flatMap(measurement =>
    measurement.paragraphPairs.map(pair => ({ ...pair, playbookId: measurement.playbookId }))
  );
  const viewScores = viewPairs.map(pair => pair.similarity).sort((a, b) => a - b);
  const paragraphScores = paragraphPairs.map(pair => pair.similarity).sort((a, b) => a - b);
  const stats = getJinaTokenStats();

  const lines = [
    '# Career Playbook semantic repetition baseline',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Method',
    '',
    `- Source: read-only query of \`career_playbooks\` with \`status = completed\`; exactly ${playbooks.length} rows containing all 27 stored blocks were eligible. The incomplete two-block completed fixture was excluded.`,
    '- Stored shape: 27 blocks = `header` + 26 content blocks (`block_1`…`block_26`).',
    `- Audience views: canonical phase-0 map copied from \`specs/028-role-guide-audiences/spec.md\` section 3: employee ${BASELINE_AUDIENCE_BLOCKS.employee.length}, manager ${BASELINE_AUDIENCE_BLOCKS.manager.length}, HR ${BASELINE_AUDIENCE_BLOCKS.hr.length} blocks, including header.`,
    '- Inter-block unit: one pair occurrence inside one audience-view. A block pair shared by two views is intentionally counted twice because those are two separately read documents; pairs with no shared view are not compared.',
    `- Intra-block unit: paragraphs of at least ${MIN_PARAGRAPH_CHARACTERS} normalized characters, split on Markdown blank lines; paragraphs are compared only with paragraphs from the same block.`,
    '- Embeddings: existing `generateEmbeddings(..., retrieval.passage)` Jina path, including the shared Jina distributed rate/concurrency limiters; cosine similarity is `QualityValidator.cosineSimilarity`.',
    `- Primary too-close threshold: **${BASELINE_TOO_CLOSE_THRESHOLD.toFixed(2)}**. This is a high-precision baseline cut: it is stricter than the existing 0.75 Stage-5 broad overlap detector and avoids treating merely related role-guide topics as duplicates. The threshold matrix below preserves sensitivity at 0.75/0.80/0.90 for phase-B calibration.`,
    '- No customer prose is stored in this artifact. Examples identify only the playbook alias, block topic and paragraph ordinal.',
    '',
    '## Snapshot',
    '',
    '| Alias | Playbook id | id sha256/12 | Language | Characters | Semantic paragraphs |',
    '| --- | --- | --- | --- | ---: | ---: |',
    ...playbooks.map(playbook => {
      const characters = playbook.blocks.reduce((sum, block) => sum + block.content.length, 0);
      const paragraphs = playbook.blocks.reduce((sum, block) => sum + block.paragraphs.length, 0);
      return `| ${aliases.get(playbook.playbookId)} | \`${playbook.playbookId}\` | \`${shortHash(playbook.playbookId)}\` | ${playbook.language} | ${characters} | ${paragraphs} |`;
    }),
    '',
    '## Summary',
    '',
    '| Unit | Compared pairs | ≥0.85 | Too-close rate | p50 | p90 | p95 | p99 | max |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Audience-view block pairs | ${viewPairs.length} | ${viewPairs.filter(pair => pair.similarity >= BASELINE_TOO_CLOSE_THRESHOLD).length} | ${rate(viewPairs.filter(pair => pair.similarity >= BASELINE_TOO_CLOSE_THRESHOLD).length, viewPairs.length)} | ${percentile(viewScores, 0.5).toFixed(4)} | ${percentile(viewScores, 0.9).toFixed(4)} | ${percentile(viewScores, 0.95).toFixed(4)} | ${percentile(viewScores, 0.99).toFixed(4)} | ${percentile(viewScores, 1).toFixed(4)} |`,
    `| Paragraph pairs within one block | ${paragraphPairs.length} | ${paragraphPairs.filter(pair => pair.similarity >= BASELINE_TOO_CLOSE_THRESHOLD).length} | ${rate(paragraphPairs.filter(pair => pair.similarity >= BASELINE_TOO_CLOSE_THRESHOLD).length, paragraphPairs.length)} | ${percentile(paragraphScores, 0.5).toFixed(4)} | ${percentile(paragraphScores, 0.9).toFixed(4)} | ${percentile(paragraphScores, 0.95).toFixed(4)} | ${percentile(paragraphScores, 0.99).toFixed(4)} | ${percentile(paragraphScores, 1).toFixed(4)} |`,
    '',
    '## Audience-view threshold matrix',
    '',
    '| Audience | Pairs | ≥0.75 | ≥0.80 | ≥0.85 | ≥0.90 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...(['employee', 'manager', 'hr'] as const).map(audience => {
      const pairs = viewPairs.filter(pair => pair.audience === audience);
      return `| ${audience} | ${pairs.length} | ${REPORT_THRESHOLDS.map(threshold => {
        const count = pairs.filter(pair => pair.similarity >= threshold).length;
        return `${count} (${rate(count, pairs.length)})`;
      }).join(' | ')} |`;
    }),
    '',
    '## Intra-block threshold matrix',
    '',
    '| Pairs | ≥0.75 | ≥0.80 | ≥0.85 | ≥0.90 |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${paragraphPairs.length} | ${REPORT_THRESHOLDS.map(threshold => {
      const count = paragraphPairs.filter(pair => pair.similarity >= threshold).length;
      return `${count} (${rate(count, paragraphPairs.length)})`;
    }).join(' | ')} |`,
    '',
    '## Top audience-view block pairs',
    '',
    '| Rank | Playbook | Audience | Block A | Block B | Similarity |',
    '| ---: | --- | --- | --- | --- | ---: |',
    ...viewPairs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20)
      .map((pair, index) => `| ${index + 1} | ${aliases.get(pair.playbookId)} | ${pair.audience} | ${pair.blockA} — ${BLOCK_LABELS[pair.blockA]} | ${pair.blockB} — ${BLOCK_LABELS[pair.blockB]} | ${pair.similarity.toFixed(4)} |`),
    '',
    '## Top paragraph pairs within one block',
    '',
    '| Rank | Playbook | Block | Paragraphs | Similarity |',
    '| ---: | --- | --- | --- | ---: |',
    ...paragraphPairs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20)
      .map((pair, index) => `| ${index + 1} | ${aliases.get(pair.playbookId)} | ${pair.blockId} — ${BLOCK_LABELS[pair.blockId]} | ${pair.paragraphA} ↔ ${pair.paragraphB} | ${pair.similarity.toFixed(4)} |`),
    '',
    '## Reproduction',
    '',
    '```bash',
    'cd /home/me/code/mc2/packages/course-gen-platform',
    'set -a; . .env; set +a',
    'TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --out ../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md',
    '```',
    '',
    `Jina run stats: ${stats.requestCount} HTTP batches, ${stats.totalTokens} input tokens.`,
    '',
  ];
  return lines.join('\n');
}

function parseOutputPath(argv: string[]): string {
  const index = argv.indexOf('--out');
  return index >= 0 && argv[index + 1]
    ? path.resolve(argv[index + 1])
    : path.resolve('../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md');
}

async function main(): Promise<void> {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const playbooks = await loadCompletedPlaybooks();
  const embedded = await embedPlaybooks(playbooks);
  const measurements = embedded.map(playbook => measureEmbeddedPlaybook(playbook));
  const report = formatReport(playbooks, measurements, new Date().toISOString());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`Completed playbooks: ${playbooks.length}`);
  console.log(`Audience-view pairs: ${measurements.reduce((sum, item) => sum + item.viewPairs.length, 0)}`);
  console.log(`Within-block paragraph pairs: ${measurements.reduce((sum, item) => sum + item.paragraphPairCount, 0)}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
