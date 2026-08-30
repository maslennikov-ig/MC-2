import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  generateEmbeddings,
  getJinaTokenStats,
  resetJinaTokenStats,
} from '@/shared/embeddings/jina-client';
import { jinaCostUsd } from '@/shared/jina/pricing';
import { splitCareerPlaybookSemanticParagraphs } from '@/stages/stage-career-playbook/nodes/semantic-repetition';
import {
  CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS,
  CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD,
} from '@/stages/stage-career-playbook/nodes/repetition-thresholds';
import { QualityValidator } from '@/shared/validation/quality-validator';
import { CAREER_PLAYBOOK_BLOCK_CATALOG } from '@megacampus/shared-types';

export type BaselineAudience = 'employee' | 'manager' | 'hr';
export type MeasurementMode = 'baseline' | 'evaluation';

/**
 * The two modes deliberately read different sources.
 *
 * `baseline` reproduces the recorded 2026-08-29 phase-0 measurement, so every
 * input it depends on is frozen here: moving a production checkbox must not
 * silently rewrite a published historical number.
 *
 * `evaluation` grades a live playbook and therefore reads production directly.
 * Specs 028 section 3 promises the owner can move any checkbox in
 * `career-playbook-blocks.ts` without touching logic; that promise is only kept
 * if the acceptance measurer follows the same catalogue and the same thresholds
 * the pipeline uses.
 */
const HISTORICAL_BLOCK_IDS = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
] as const;

const PRODUCTION_BLOCK_IDS = CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => block.blockId);

function canonicalBlockIds(mode: MeasurementMode): readonly string[] {
  return mode === 'baseline' ? HISTORICAL_BLOCK_IDS : PRODUCTION_BLOCK_IDS;
}

/**
 * Frozen phase-0 copy of specs/028-role-guide-audiences/spec.md section 3.
 * Historical-baseline reproduction only — evaluation uses
 * {@link PRODUCTION_AUDIENCE_BLOCKS}.
 */
export const BASELINE_AUDIENCE_BLOCKS: Readonly<Record<BaselineAudience, readonly string[]>> = {
  employee: [
    'header',
    'block_1',
    'block_2',
    'block_3',
    'block_4',
    'block_5',
    'block_6',
    'block_8',
    'block_9',
    'block_10',
    'block_11',
    'block_13',
    'block_14',
    'block_16',
    'block_18',
    'block_19',
    'block_20',
    'block_22',
    'block_24',
    'block_25',
  ],
  manager: [
    'header',
    'block_1',
    'block_2',
    'block_3',
    'block_4',
    'block_5',
    'block_6',
    'block_7',
    'block_10',
    'block_14',
    'block_15',
    'block_16',
    'block_17',
    'block_18',
    'block_20',
    'block_21',
    'block_23',
    'block_24',
    'block_25',
    'block_26',
  ],
  hr: [
    'header',
    'block_1',
    'block_7',
    'block_8',
    'block_11',
    'block_12',
    'block_13',
    'block_14',
    'block_15',
    'block_17',
    'block_19',
    'block_24',
    'block_25',
    'block_26',
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

/** Live audience views, read from the same catalogue the pipeline judges with. */
export const PRODUCTION_AUDIENCE_BLOCKS: Readonly<Record<BaselineAudience, readonly string[]>> =
  Object.freeze(
    Object.fromEntries(
      (['employee', 'manager', 'hr'] as const).map(audience => [
        audience,
        CAREER_PLAYBOOK_BLOCK_CATALOG.filter(block => block.audiences.includes(audience)).map(
          block => block.blockId
        ),
      ])
    ) as Record<BaselineAudience, readonly string[]>
  );

export function audienceBlocksForMode(
  mode: MeasurementMode
): Readonly<Record<BaselineAudience, readonly string[]>> {
  return mode === 'baseline' ? BASELINE_AUDIENCE_BLOCKS : PRODUCTION_AUDIENCE_BLOCKS;
}

const REPORT_THRESHOLDS = [0.75, 0.8, 0.85, 0.9] as const;
/** Frozen phase-0 measurement unit; evaluation uses the production constant. */
const BASELINE_MIN_PARAGRAPH_CHARACTERS = 100;
/** The number the published baseline recorded; a drift check, not a live knob. */
const RECORDED_BASELINE_THRESHOLD = 0.85;

export function minParagraphCharactersForMode(mode: MeasurementMode): number {
  return mode === 'baseline'
    ? BASELINE_MIN_PARAGRAPH_CHARACTERS
    : CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS;
}

export function thresholdForMode(mode: MeasurementMode): number {
  return mode === 'baseline'
    ? RECORDED_BASELINE_THRESHOLD
    : CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD;
}
export const HISTORICAL_BASELINE_COHORT_HASHES = [
  '6395b5f9cd2e',
  'e744615ce64f',
  'fc063a949fda',
  '6bb4cfe5ba7d',
  '113e791d28b3',
  '7e8ace983dea',
  'e59fa24dc439',
  'd09d3a64caf5',
  '8eb6215118b3',
  '7890f1e69f5a',
  'ade84257b4ea',
  'd373335584bf',
  '6e6f47153972',
  '0f49ec1f2b59',
] as const;
const MAX_INPUT_CHARACTERS = 2_500_000;
const MAX_EMBEDDING_ITEMS = 4_000;
const CHECKPOINT_SCHEMA = 'career-playbook-repetition-embeddings/v1';
const CHECKPOINT_MODEL = 'jina-embeddings-v3';
const DEFAULT_EMBEDDING_BATCH_SIZE = 40;
const SAFE_TOKENS_PER_MINUTE = 75_000;
const RATE_LIMIT_WINDOW_MS = 61_000;

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
  threshold: number,
  audienceBlocks: Readonly<Record<BaselineAudience, readonly string[]>> = BASELINE_AUDIENCE_BLOCKS
): EmbeddedPlaybookMeasurement {
  const byId = new Map(playbook.blocks.map(block => [block.blockId, block]));
  const views = {} as EmbeddedPlaybookMeasurement['views'];
  const viewPairs: SimilarityPair[] = [];

  for (const audience of ['employee', 'manager', 'hr'] as const) {
    const blocks = audienceBlocks[audience]
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

interface EmbeddingCheckpoint {
  schemaVersion: typeof CHECKPOINT_SCHEMA;
  model: typeof CHECKPOINT_MODEL;
  embeddings: Record<string, number[]>;
}

export interface CheckpointEmbeddingOptions {
  cachePath: string;
  batchSize?: number;
  embedBatch?: (texts: string[]) => Promise<number[][]>;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRateLimitRetries?: number;
  getTotalTokens?: () => number;
}

function embeddingCacheKey(text: string): string {
  return createHash('sha256')
    .update(`${CHECKPOINT_MODEL}\0retrieval.passage\0`)
    .update(text)
    .digest('hex');
}

async function loadEmbeddingCheckpoint(cachePath: string): Promise<EmbeddingCheckpoint> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, 'utf8')) as Partial<EmbeddingCheckpoint>;
    if (
      parsed.schemaVersion !== CHECKPOINT_SCHEMA ||
      parsed.model !== CHECKPOINT_MODEL ||
      !parsed.embeddings ||
      typeof parsed.embeddings !== 'object'
    ) {
      throw new Error(`Unsupported embedding checkpoint at ${cachePath}`);
    }
    for (const [hash, embedding] of Object.entries(parsed.embeddings)) {
      if (!/^[a-f0-9]{64}$/u.test(hash) || !Array.isArray(embedding) || embedding.length !== 768) {
        throw new Error(`Invalid embedding checkpoint entry at ${cachePath}`);
      }
    }
    return parsed as EmbeddingCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: CHECKPOINT_SCHEMA, model: CHECKPOINT_MODEL, embeddings: {} };
    }
    throw error;
  }
}

async function saveEmbeddingCheckpoint(
  cachePath: string,
  checkpoint: EmbeddingCheckpoint
): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint)}\n`, 'utf8');
  await rename(temporaryPath, cachePath);
}

function isRateLimitError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown })?.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  return statusCode === 429 || /(?:429|rate limit|tokens per minute)/iu.test(message);
}

/**
 * Embed texts with a content-addressed checkpoint. Customer prose is used only
 * for the provider call and never persisted; the cache stores SHA-256 keys and
 * vectors. Each successful batch is atomically durable before the next starts.
 */
export async function embedTextsWithCheckpoint(
  texts: string[],
  options: CheckpointEmbeddingOptions
): Promise<number[][]> {
  const checkpoint = await loadEmbeddingCheckpoint(options.cachePath);
  const batchSize = options.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error(`Embedding batch size must be between 1 and 100, got ${batchSize}`);
  }
  const embedBatch =
    options.embedBatch ?? ((batch: string[]) => generateEmbeddings(batch, 'retrieval.passage'));
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 3;

  const keyed = texts.map(text => ({ text, hash: embeddingCacheKey(text) }));
  const missingByHash = new Map<string, string>();
  for (const item of keyed) {
    if (!checkpoint.embeddings[item.hash]) missingByHash.set(item.hash, item.text);
  }
  const missing = [...missingByHash].map(([hash, text]) => ({ hash, text }));
  let estimatedTokensInWindow = 0;

  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    // UTF-8 bytes / 3 deliberately overestimates both observed RU and EN tokenization.
    const estimatedTokens = batch.reduce(
      (sum, item) => sum + Math.ceil(Buffer.byteLength(item.text, 'utf8') / 3),
      0
    );
    if (
      estimatedTokensInWindow > 0 &&
      estimatedTokensInWindow + estimatedTokens > SAFE_TOKENS_PER_MINUTE
    ) {
      await sleep(RATE_LIMIT_WINDOW_MS);
      estimatedTokensInWindow = 0;
    }

    let embeddings: number[][];
    let rateLimitAttempts = 0;
    const tokensBefore = options.getTotalTokens?.() ?? 0;
    while (true) {
      try {
        embeddings = await embedBatch(batch.map(item => item.text));
        break;
      } catch (error) {
        if (!isRateLimitError(error) || rateLimitAttempts >= maxRateLimitRetries) throw error;
        rateLimitAttempts += 1;
        await sleep(RATE_LIMIT_WINDOW_MS);
        estimatedTokensInWindow = 0;
      }
    }
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Jina returned ${embeddings.length} embeddings for a ${batch.length}-item batch`
      );
    }
    for (let index = 0; index < batch.length; index += 1) {
      const embedding = embeddings[index];
      if (!Array.isArray(embedding) || embedding.length !== 768) {
        throw new Error(`Jina returned an invalid embedding for batch item ${index + 1}`);
      }
      checkpoint.embeddings[batch[index].hash] = embedding;
    }
    await saveEmbeddingCheckpoint(options.cachePath, checkpoint);
    const observedTokens = (options.getTotalTokens?.() ?? tokensBefore) - tokensBefore;
    estimatedTokensInWindow += observedTokens > 0 ? observedTokens : estimatedTokens;
  }

  return keyed.map(item => {
    const embedding = checkpoint.embeddings[item.hash];
    if (!embedding) throw new Error(`Embedding checkpoint is missing ${item.hash}`);
    return embedding;
  });
}

interface StoredBlock {
  status?: unknown;
  content?: unknown;
}

export interface StoredPlaybook {
  id: string;
  status: string;
  language: string | null;
  created_at: string;
  generated_blocks: Record<string, StoredBlock> | null;
}

interface TextBlock {
  blockId: string;
  content: string;
  paragraphs: string[];
}

export interface TextPlaybook {
  playbookId: string;
  language: string;
  createdAt: string;
  blocks: TextBlock[];
}

export type MeasurementArgs =
  | {
      mode: 'baseline';
      cohortHashes: string[];
      outputPath: string;
      cachePath: string;
    }
  | {
      mode: 'evaluation';
      playbookId: string;
      threshold: number;
      outputPath: string;
      cachePath: string;
    };

function flagValue(argv: string[], flag: string): string | undefined {
  const indexes = argv.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length > 1) throw new Error(`${flag} may be provided only once`);
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseMeasurementArgs(argv: string[], cwd: string = process.cwd()): MeasurementArgs {
  const requestedMode = flagValue(argv, '--mode');
  if (requestedMode && requestedMode !== 'baseline' && requestedMode !== 'evaluation') {
    throw new Error('--mode must be baseline or evaluation');
  }
  const playbookId = flagValue(argv, '--playbook-id');
  const thresholdRaw = flagValue(argv, '--threshold');
  const mode = requestedMode ?? (playbookId ? 'evaluation' : 'baseline');
  const outputRaw = flagValue(argv, '--out');
  const cacheRaw = flagValue(argv, '--cache');
  const outputPath = path.resolve(
    cwd,
    outputRaw ??
      (mode === 'baseline'
        ? '../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md'
        : '../../docs/career-playbook/evaluation-semantic-repetition.md')
  );
  const cachePath = path.resolve(
    cwd,
    cacheRaw ?? '.cache/career-playbook-repetition/jina-embeddings-v3.json'
  );

  if (mode === 'evaluation') {
    if (
      !playbookId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        playbookId
      )
    ) {
      throw new Error('evaluation mode requires a valid --playbook-id UUID');
    }
    const productionThreshold = thresholdForMode('evaluation');
    if (thresholdRaw === undefined || Number(thresholdRaw) !== productionThreshold) {
      throw new Error(
        `evaluation mode requires --threshold ${productionThreshold.toFixed(2)}, the production value`
      );
    }
    if (argv.includes('--cohort-hash')) {
      throw new Error('evaluation mode does not accept --cohort-hash');
    }
    return { mode, playbookId, threshold: productionThreshold, outputPath, cachePath };
  }

  if (playbookId || thresholdRaw !== undefined) {
    throw new Error('baseline mode does not accept --playbook-id or --threshold');
  }
  const cohortHashes = argv.flatMap((value, index) =>
    value === '--cohort-hash' && argv[index + 1] ? [argv[index + 1]] : []
  );
  const selectedHashes = cohortHashes.length
    ? cohortHashes
    : [...HISTORICAL_BASELINE_COHORT_HASHES];
  if (
    selectedHashes.length !== 14 ||
    new Set(selectedHashes).size !== 14 ||
    selectedHashes.some(hash => !/^[0-9a-f]{12}$/u.test(hash))
  ) {
    throw new Error('baseline mode requires exactly 14 unique --cohort-hash values');
  }
  return { mode, cohortHashes: selectedHashes, outputPath, cachePath };
}

/**
 * Baseline keeps the frozen phase-0 splitter; evaluation calls the production
 * one, so a change to how the pipeline sees a paragraph cannot pass acceptance
 * unnoticed.
 */
export function splitSemanticParagraphs(
  markdown: string,
  mode: MeasurementMode = 'baseline'
): string[] {
  if (mode === 'evaluation') return splitCareerPlaybookSemanticParagraphs(markdown);
  return markdown
    .split(/\n\s*\n+/u)
    .map(paragraph =>
      paragraph
        .replace(/^#{1,6}\s+/u, '')
        .replace(/\s+/gu, ' ')
        .trim()
    )
    .filter(paragraph => paragraph.length >= BASELINE_MIN_PARAGRAPH_CHARACTERS);
}

function normalizePlaybook(row: StoredPlaybook, mode: MeasurementMode): TextPlaybook | undefined {
  if (!row.generated_blocks) return undefined;
  const blockIds = canonicalBlockIds(mode);
  if (!blockIds.every(blockId => blockId in row.generated_blocks!)) return undefined;

  const blocks = blockIds.map(blockId => {
    const stored = row.generated_blocks![blockId];
    const content = typeof stored?.content === 'string' ? stored.content.trim() : '';
    return { blockId, content, paragraphs: splitSemanticParagraphs(content, mode) };
  });
  if (blocks.some(block => block.content.length === 0)) return undefined;

  return {
    playbookId: row.id,
    language: row.language ?? 'unknown',
    createdAt: row.created_at,
    blocks,
  };
}

export function selectMeasurementCohort(
  rows: StoredPlaybook[],
  args: MeasurementArgs
): TextPlaybook[] {
  if (args.mode === 'evaluation') {
    const matches = rows.filter(candidate => candidate.id === args.playbookId);
    const row = matches.length === 1 ? matches[0] : undefined;
    const normalized =
      row?.status === 'completed' ? normalizePlaybook(row, 'evaluation') : undefined;
    if (!normalized) {
      throw new Error(
        `Evaluation requires exactly one completed ${PRODUCTION_BLOCK_IDS.length}-block playbook`
      );
    }
    return [normalized];
  }

  const cohort = args.cohortHashes.map(hash => {
    const matches = rows.filter(row => shortHash(row.id) === hash);
    const normalized =
      matches.length === 1 && matches[0].status === 'completed'
        ? normalizePlaybook(matches[0], 'baseline')
        : undefined;
    if (!normalized) {
      throw new Error('Historical baseline requires all 14 completed 27-block playbooks');
    }
    return normalized;
  });
  if (cohort.length !== 14) {
    throw new Error('Historical baseline requires exactly 14 completed 27-block playbooks');
  }
  return cohort;
}

async function loadMeasurementCohort(args: MeasurementArgs): Promise<TextPlaybook[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let query = supabase
    .from('career_playbooks')
    .select('id, status, language, created_at, generated_blocks');
  if (args.mode === 'evaluation') query = query.eq('id', args.playbookId);
  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to read Career Playbooks: ${error.message}`);
  return selectMeasurementCohort((data ?? []) as StoredPlaybook[], args);
}

async function embedPlaybooks(
  playbooks: TextPlaybook[],
  cachePath: string
): Promise<EmbeddedPlaybook[]> {
  const items = playbooks.flatMap(playbook =>
    playbook.blocks.flatMap(block => [
      {
        playbookId: playbook.playbookId,
        blockId: block.blockId,
        paragraphIndex: -1,
        text: block.content,
      },
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
  const embeddings = await embedTextsWithCheckpoint(
    items.map(item => item.text),
    { cachePath, getTotalTokens: () => getJinaTokenStats().totalTokens }
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
      return {
        blockId: block.blockId,
        embedding: embeddings[blockEmbeddingIndex],
        paragraphEmbeddings,
      };
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

function selectWorkingThreshold(
  viewScores: number[],
  paragraphScores: number[]
): (typeof REPORT_THRESHOLDS)[number] {
  const selected = [...REPORT_THRESHOLDS]
    .reverse()
    .find(
      threshold =>
        viewScores.filter(score => score >= threshold).length >= 5 &&
        paragraphScores.filter(score => score >= threshold).length >= 5
    );
  if (selected === undefined) {
    throw new Error(
      'STOP: no meaningful repetition signal at thresholds 0.75/0.80/0.85/0.90 in both metrics'
    );
  }
  return selected;
}

export function formatReport(
  playbooks: TextPlaybook[],
  measurements: EmbeddedPlaybookMeasurement[],
  generatedAt: string,
  selectedThreshold: number,
  cachePath: string,
  args: MeasurementArgs
): string {
  const aliases = new Map(
    playbooks.map((playbook, index) => [
      playbook.playbookId,
      `P${String(index + 1).padStart(2, '0')}`,
    ])
  );
  const viewPairs = measurements.flatMap(measurement =>
    measurement.viewPairs.map(pair => ({ ...pair, playbookId: measurement.playbookId }))
  );
  const paragraphPairs = measurements.flatMap(measurement =>
    measurement.paragraphPairs.map(pair => ({ ...pair, playbookId: measurement.playbookId }))
  );
  const viewScores = viewPairs.map(pair => pair.similarity).sort((a, b) => a - b);
  const paragraphScores = paragraphPairs.map(pair => pair.similarity).sort((a, b) => a - b);
  const stats = getJinaTokenStats();
  const reportBlockIds = canonicalBlockIds(args.mode);

  const lines = [
    args.mode === 'baseline'
      ? '# Career Playbook semantic repetition baseline'
      : '# Career Playbook semantic repetition evaluation',
    '',
    `Generated: ${generatedAt}`,
    `Cohort size: **${playbooks.length}**`,
    '',
    '## Method',
    '',
    args.mode === 'baseline'
      ? `- Source: the fixed historical 14-playbook hash cohort from \`career_playbooks\`; every selected row must remain \`completed\` with all ${HISTORICAL_BLOCK_IDS.length} stored blocks. Later completed rows do not change this cohort.`
      : `- Source: one exact \`career_playbooks.id\` requested by the operator; it must resolve to exactly one \`completed\` row with all ${PRODUCTION_BLOCK_IDS.length} stored blocks.`,
    `- Stored shape: ${reportBlockIds.length} blocks = \`header\` + ${reportBlockIds.length - 1} content blocks.`,
    args.mode === 'baseline'
      ? `- Audience views: frozen phase-0 map copied from \`specs/028-role-guide-audiences/spec.md\` section 3: employee ${BASELINE_AUDIENCE_BLOCKS.employee.length}, manager ${BASELINE_AUDIENCE_BLOCKS.manager.length}, HR ${BASELINE_AUDIENCE_BLOCKS.hr.length} blocks, including header.`
      : `- Audience views: read live from \`CAREER_PLAYBOOK_BLOCK_CATALOG\`, the same map the pipeline judges with: employee ${PRODUCTION_AUDIENCE_BLOCKS.employee.length}, manager ${PRODUCTION_AUDIENCE_BLOCKS.manager.length}, HR ${PRODUCTION_AUDIENCE_BLOCKS.hr.length} blocks, including header.`,
    '- Inter-block unit: one pair occurrence inside one audience-view. A block pair shared by two views is intentionally counted twice because those are two separately read documents; pairs with no shared view are not compared.',
    `- Intra-block unit: paragraphs of at least ${minParagraphCharactersForMode(args.mode)} normalized characters, split on Markdown blank lines; paragraphs are compared only with paragraphs from the same block.`,
    '- Embeddings: existing `generateEmbeddings(..., retrieval.passage)` Jina path, including the shared Jina distributed rate/concurrency limiters; cosine similarity is `QualityValidator.cosineSimilarity`.',
    args.mode === 'baseline'
      ? `- Recorded baseline threshold: **${selectedThreshold.toFixed(2)}**. The historical distribution must reproduce 0.85 as the highest candidate retaining at least five pair occurrences in both metric families.`
      : `- Fixed evaluation threshold: **${selectedThreshold.toFixed(2)}**. Evaluation never selects a threshold from one playbook and zero too-close pairs is a valid measured result.`,
    `- Resume cache: content-addressed SHA-256 → embedding records at \`${path.relative(process.cwd(), cachePath)}\`; it contains no source prose and is atomically replaced after every successful batch.`,
    '- No customer prose is stored in this artifact. Examples identify only the playbook alias, block topic and paragraph ordinal.',
    '',
    '## Snapshot',
    '',
    '| Alias | id sha256/12 | Language | Characters | Semantic paragraphs |',
    '| --- | --- | --- | ---: | ---: |',
    ...playbooks.map(playbook => {
      const characters = playbook.blocks.reduce((sum, block) => sum + block.content.length, 0);
      const paragraphs = playbook.blocks.reduce((sum, block) => sum + block.paragraphs.length, 0);
      return `| ${aliases.get(playbook.playbookId)} | \`${shortHash(playbook.playbookId)}\` | ${playbook.language} | ${characters} | ${paragraphs} |`;
    }),
    '',
    '## Summary',
    '',
    `| Unit | Compared pairs | ≥${selectedThreshold.toFixed(2)} | Too-close rate | p50 | p90 | p95 | p99 | max |`,
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Audience-view block pairs | ${viewPairs.length} | ${viewPairs.filter(pair => pair.similarity >= selectedThreshold).length} | ${rate(viewPairs.filter(pair => pair.similarity >= selectedThreshold).length, viewPairs.length)} | ${percentile(viewScores, 0.5).toFixed(4)} | ${percentile(viewScores, 0.9).toFixed(4)} | ${percentile(viewScores, 0.95).toFixed(4)} | ${percentile(viewScores, 0.99).toFixed(4)} | ${percentile(viewScores, 1).toFixed(4)} |`,
    `| Paragraph pairs within one block | ${paragraphPairs.length} | ${paragraphPairs.filter(pair => pair.similarity >= selectedThreshold).length} | ${rate(paragraphPairs.filter(pair => pair.similarity >= selectedThreshold).length, paragraphPairs.length)} | ${percentile(paragraphScores, 0.5).toFixed(4)} | ${percentile(paragraphScores, 0.9).toFixed(4)} | ${percentile(paragraphScores, 0.95).toFixed(4)} | ${percentile(paragraphScores, 0.99).toFixed(4)} | ${percentile(paragraphScores, 1).toFixed(4)} |`,
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
      .map(
        (pair, index) =>
          `| ${index + 1} | ${aliases.get(pair.playbookId)} | ${pair.audience} | ${pair.blockA} — ${BLOCK_LABELS[pair.blockA]} | ${pair.blockB} — ${BLOCK_LABELS[pair.blockB]} | ${pair.similarity.toFixed(4)} |`
      ),
    '',
    '## Top paragraph pairs within one block',
    '',
    '| Rank | Playbook | Block | Paragraphs | Similarity |',
    '| ---: | --- | --- | --- | ---: |',
    ...paragraphPairs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20)
      .map(
        (pair, index) =>
          `| ${index + 1} | ${aliases.get(pair.playbookId)} | ${pair.blockId} — ${BLOCK_LABELS[pair.blockId]} | ${pair.paragraphA} ↔ ${pair.paragraphB} | ${pair.similarity.toFixed(4)} |`
      ),
    '',
    '## Reproduction',
    '',
    '```bash',
    'cd /home/me/code/mc2/packages/course-gen-platform',
    'set -a; . .env; set +a',
    args.mode === 'baseline'
      ? 'TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --mode baseline --out ../../docs/career-playbook/2026-08-29-semantic-repetition-baseline.md --cache .cache/career-playbook-repetition/jina-embeddings-v3.json'
      : `TMPDIR=/tmp pnpm exec tsx scripts/measure-playbook-repetition.ts --mode evaluation --playbook-id <completed-playbook-uuid> --threshold ${thresholdForMode('evaluation').toFixed(2)} --out <evaluation-report-path> --cache .cache/career-playbook-repetition/jina-embeddings-v3.json`,
    '```',
    '',
    `Jina run stats: ${stats.requestCount} paid HTTP batches in this invocation, ${stats.totalTokens} input tokens, $${(jinaCostUsd(CHECKPOINT_MODEL, stats.totalTokens) ?? 0).toFixed(6)} at the repository catalogue rate. Cache hits cost $0.`,
    '',
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseMeasurementArgs(process.argv.slice(2));
  const playbooks = await loadMeasurementCohort(args);
  const embedded = await embedPlaybooks(playbooks, args.cachePath);
  const audienceBlocks = audienceBlocksForMode(args.mode);
  let selectedThreshold: number;
  if (args.mode === 'baseline') {
    const scoreOnlyMeasurements = embedded.map(playbook =>
      measureEmbeddedPlaybook(playbook, Number.POSITIVE_INFINITY, audienceBlocks)
    );
    selectedThreshold = selectWorkingThreshold(
      scoreOnlyMeasurements.flatMap(measurement =>
        measurement.viewPairs.map(pair => pair.similarity)
      ),
      scoreOnlyMeasurements.flatMap(measurement =>
        measurement.paragraphPairs.map(pair => pair.similarity)
      )
    );
    if (selectedThreshold !== RECORDED_BASELINE_THRESHOLD) {
      throw new Error(
        `Historical baseline threshold drift: expected ${RECORDED_BASELINE_THRESHOLD.toFixed(2)}, got ${selectedThreshold.toFixed(2)}`
      );
    }
  } else {
    selectedThreshold = args.threshold;
  }
  const measurements = embedded.map(playbook =>
    measureEmbeddedPlaybook(playbook, selectedThreshold, audienceBlocks)
  );
  const report = formatReport(
    playbooks,
    measurements,
    new Date().toISOString(),
    selectedThreshold,
    args.cachePath,
    args
  );
  await mkdir(path.dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, report, 'utf8');
  console.log(`Wrote ${args.outputPath}`);
  console.log(`Completed playbooks: ${playbooks.length}`);
  console.log(
    `Audience-view pairs: ${measurements.reduce((sum, item) => sum + item.viewPairs.length, 0)}`
  );
  console.log(
    `Within-block paragraph pairs: ${measurements.reduce((sum, item) => sum + item.paragraphPairCount, 0)}`
  );
  console.log(`Selected threshold: ${selectedThreshold.toFixed(2)}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
