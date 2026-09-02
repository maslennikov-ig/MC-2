import { createHash } from 'node:crypto';
import { generateEmbeddings } from '@/shared/embeddings/jina-client';
import { jinaCostUsd } from '@/shared/jina/pricing';
import { QualityValidator } from '@/shared/validation/quality-validator';
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import { careerPlaybookBlocksShareAudience } from './audience-scope';
import {
  CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS,
  CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD,
} from './repetition-thresholds';

const validator = new QualityValidator();
export const CAREER_PLAYBOOK_SEMANTIC_EMBEDDING_CACHE_MAX_ENTRIES = 4_096;
const CAREER_PLAYBOOK_SEMANTIC_REPETITION_ISSUE_MARKER = 'repeat semantically equivalent material';

interface SemanticBlock {
  blockId: CareerPlaybookBlockId;
  content: string;
  paragraphs: string[];
}

interface SemanticBlockPair {
  left: SemanticBlock;
  right: SemanticBlock;
}

interface SemanticParagraphPair {
  block: SemanticBlock;
  leftIndex: number;
  rightIndex: number;
}

export interface EvaluateCareerPlaybookSemanticRepetitionOptions {
  onNodeCost?: (cost: CareerPlaybookNodeCost) => void;
  cache?: CareerPlaybookSemanticEmbeddingCache;
  cacheNamespace?: string;
}

export function isCareerPlaybookSemanticRepetitionIssue(issue: CareerPlaybookJudgeIssue): boolean {
  return issue.description.includes(CAREER_PLAYBOOK_SEMANTIC_REPETITION_ISSUE_MARKER);
}

export class CareerPlaybookSemanticRepetitionProviderError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
    readonly nodeCosts: CareerPlaybookNodeCost[] = [],
    readonly warnings: string[] = []
  ) {
    super(message, options);
    this.name = 'CareerPlaybookSemanticRepetitionProviderError';
  }
}

/**
 * Process-local LRU for final re-judges. Keys contain only playbook id plus a
 * SHA-256 digest; values contain only vectors. Customer prose is never stored,
 * and a playbook can never reuse another playbook's entries.
 */
export class CareerPlaybookSemanticEmbeddingCache {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly maxEntries = CAREER_PLAYBOOK_SEMANTIC_EMBEDDING_CACHE_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error(`Semantic embedding cache maxEntries must be positive, got ${maxEntries}`);
    }
  }

  private key(namespace: string, text: string): string {
    const digest = createHash('sha256').update(text).digest('hex');
    return `${namespace}:${digest}`;
  }

  get(namespace: string, text: string): number[] | undefined {
    const key = this.key(namespace, text);
    const embedding = this.entries.get(key);
    if (!embedding) return undefined;
    this.entries.delete(key);
    this.entries.set(key, embedding);
    return embedding;
  }

  set(namespace: string, text: string, embedding: number[]): void {
    const key = this.key(namespace, text);
    this.entries.delete(key);
    this.entries.set(key, embedding);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

export function splitCareerPlaybookSemanticParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n+/u)
    .map(paragraph =>
      paragraph
        .replace(/^#{1,6}\s+/u, '')
        .replace(/\s+/gu, ' ')
        .trim()
    )
    .filter(paragraph => paragraph.length >= CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS);
}

function collectSemanticBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): SemanticBlock[] {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.flatMap(catalogBlock => {
    const content = generatedBlocks[catalogBlock.blockId]?.content?.trim();
    if (!content) return [];
    return [
      {
        blockId: catalogBlock.blockId,
        content,
        paragraphs: splitCareerPlaybookSemanticParagraphs(content),
      },
    ];
  });
}

function collectBlockPairs(blocks: readonly SemanticBlock[]): SemanticBlockPair[] {
  const pairs: SemanticBlockPair[] = [];
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      if (!careerPlaybookBlocksShareAudience(blocks[left].blockId, blocks[right].blockId)) {
        continue;
      }
      pairs.push({ left: blocks[left], right: blocks[right] });
    }
  }
  return pairs;
}

/** A markdown separator cell, `---` or `:--:`. */
const SEPARATOR_CELL = /^:?-{2,}:?$/;

/** Cells of a paragraph that is a markdown table, in reading order. */
function tableCells(paragraph: string): string[] {
  const cells = paragraph
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean);
  return cells.length >= 4 && cells.some(cell => SEPARATOR_CELL.test(cell)) ? cells : [];
}

/** Column names of a table paragraph, or null when it is not a table. */
function tableHeader(paragraph: string): string | null {
  const cells = tableCells(paragraph);
  const separator = cells.findIndex(cell => SEPARATOR_CELL.test(cell));
  if (separator <= 0) return null;
  return cells.slice(0, separator).join('|').toLowerCase();
}

/** Data cells of a table paragraph, separator row excluded. */
function tableBodyCells(paragraph: string): Set<string> {
  const cells = tableCells(paragraph);
  const separator = cells.findIndex(cell => SEPARATOR_CELL.test(cell));
  if (separator < 0) return new Set();
  return new Set(
    cells
      .slice(separator)
      .filter(cell => !SEPARATOR_CELL.test(cell))
      .map(cell => cell.toLowerCase())
  );
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const cell of left) if (right.has(cell)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** A label a paragraph opens with, such as `**Ранние сигналы:**`. */
function leadingLabel(paragraph: string): string {
  const match = paragraph.match(/^([^:|]{8,90}:)/);
  return match ? match[1].trim().toLowerCase() : '';
}

/**
 * Whether two paragraphs are the same shape rather than the same content.
 *
 * A cosine over a whole paragraph measures its frame as much as its meaning, and
 * inside one block the frame is uniform on purpose: a career ladder publishes a
 * management track and an expert track as two tables with one header, a 30-60-90
 * plan publishes three gates as three checklists under one label. Nothing the
 * model can rewrite will separate them, which is why regeneration never cleared
 * this class — the shared frame is the part it is supposed to keep.
 *
 * Measured over the stored corpus 2026-09-02 (28 completed playbooks, 13,469
 * within-block paragraph pairs, one embedding pass): 24 pairs cross the 0.85
 * threshold, and reading all 24 by hand leaves exactly one that is genuinely the
 * same material twice — a03dfb46 block_9, which states one AI-delegation
 * taxonomy in two tables whose columns are renamed. Different headers, so this
 * exemption does not reach it, and it is still reported.
 *
 * The two shapes below clear 9 of the 24, including all three criticals this
 * check has ever filed (cc12dccc block_11, db9d3ff9 block_11, db9d3ff9
 * block_21). Both are decided from the text, so neither costs a call:
 *
 * - two tables with identical columns whose data rows are mostly different;
 * - two paragraphs opening with the same label.
 *
 * The rejected alternative is on record in mc2-de6fe: normalizing markdown out
 * before embedding moves the count 22 -> 15 but redistributes rather than
 * separates, pushing survivors higher (1acebc5b block_4 0.8748 -> 0.9365).
 */
function isParallelStructure(left: string, right: string): boolean {
  const header = tableHeader(left);
  if (header && header === tableHeader(right)) {
    return overlap(tableBodyCells(left), tableBodyCells(right)) < 0.5;
  }

  const label = leadingLabel(left);
  return label !== '' && label === leadingLabel(right);
}

function collectParagraphPairs(blocks: readonly SemanticBlock[]): SemanticParagraphPair[] {
  const pairs: SemanticParagraphPair[] = [];
  for (const block of blocks) {
    for (let left = 0; left < block.paragraphs.length; left += 1) {
      for (let right = left + 1; right < block.paragraphs.length; right += 1) {
        if (isParallelStructure(block.paragraphs[left], block.paragraphs[right])) continue;
        pairs.push({ block, leftIndex: left, rightIndex: right });
      }
    }
  }
  return pairs;
}

function buildCrossBlockIssues(
  pair: SemanticBlockPair,
  similarity: number
): CareerPlaybookJudgeIssue[] {
  const similarityText = similarity.toFixed(4);
  return [
    {
      block_id: pair.left.blockId,
      severity: 'critical',
      category: 'contradiction',
      description: `${pair.left.blockId} and ${pair.right.blockId} repeat semantically equivalent material inside a shared audience view (cosine ${similarityText}, threshold ${CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD}).`,
      suggestion: `Keep the material in its canonical owner block and remove the repeated meaning from ${pair.left.blockId}; review ${pair.right.blockId} as the paired source.`,
    },
    {
      block_id: pair.right.blockId,
      severity: 'critical',
      category: 'contradiction',
      description: `${pair.right.blockId} and ${pair.left.blockId} repeat semantically equivalent material inside a shared audience view (cosine ${similarityText}, threshold ${CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD}).`,
      suggestion: `Keep the material in its canonical owner block and remove the repeated meaning from ${pair.right.blockId}; review ${pair.left.blockId} as the paired source.`,
    },
  ];
}

/**
 * A within-block paragraph repetition is reported, not regenerated.
 *
 * `isParallelStructure` removes the two shapes that can be decided from the
 * text. What it cannot decide is the rest of the same problem: of the 24 pairs
 * above threshold on the stored corpus, 15 survive both exemptions and 14 of
 * those are still parallel structure — a 60-day gate beside a 90-day gate, a
 * manager's checklist beside an employee's, weekly duties beside monthly ones.
 * They differ by a period, an ordinal or a reader, which is exactly the
 * distinction a whole-paragraph cosine averages away.
 *
 * Regenerating a block on a signal that is wrong fourteen times in fifteen buys
 * fourteen rewrites of correct text per real defect, and the model cannot
 * satisfy the finding anyway without breaking the parallel form the contract
 * asks for. So the pair stays visible as a warning and stops driving a
 * regeneration.
 *
 * The cross-block check keeps `critical`: comparing two whole blocks in a shared
 * audience view is a different measurement, and no evidence puts it wrong.
 */
function buildParagraphIssue(
  pair: SemanticParagraphPair,
  similarity: number
): CareerPlaybookJudgeIssue {
  return {
    block_id: pair.block.blockId,
    severity: 'warning',
    category: 'contradiction',
    description: `${pair.block.blockId} paragraphs ${pair.leftIndex + 1} and ${pair.rightIndex + 1} repeat semantically equivalent material (cosine ${similarity.toFixed(4)}, threshold ${CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD}).`,
    suggestion: `Merge or remove the repeated paragraph inside ${pair.block.blockId}, unless the two are parallel items — two gates, two tracks, two readers — that share a shape on purpose.`,
  };
}

/**
 * Compare all eligible block and paragraph pairs with one batched embeddings
 * entry-point call. Exact duplicate texts are embedded once and reused.
 */
export async function evaluateCareerPlaybookSemanticRepetition(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  options: EvaluateCareerPlaybookSemanticRepetitionOptions = {}
): Promise<CareerPlaybookJudgeIssue[]> {
  const blocks = collectSemanticBlocks(generatedBlocks);
  const blockPairs = collectBlockPairs(blocks);
  const paragraphPairs = collectParagraphPairs(blocks);
  if (blockPairs.length === 0 && paragraphPairs.length === 0) return [];

  const texts = new Set<string>();
  for (const pair of blockPairs) {
    texts.add(pair.left.content);
    texts.add(pair.right.content);
  }
  for (const pair of paragraphPairs) {
    texts.add(pair.block.paragraphs[pair.leftIndex]);
    texts.add(pair.block.paragraphs[pair.rightIndex]);
  }
  const uniqueTexts = [...texts];
  const cacheNamespace = options.cacheNamespace;
  const embeddingByText = new Map<string, number[]>();
  const missingTexts: string[] = [];
  for (const text of uniqueTexts) {
    const cached =
      options.cache && cacheNamespace ? options.cache.get(cacheNamespace, text) : undefined;
    if (cached) embeddingByText.set(text, cached);
    else missingTexts.push(text);
  }

  if (missingTexts.length > 0) {
    let embeddings: number[][];
    try {
      // cost-exempt: a playbook cannot use generation_trace's course foreign key;
      // each Jina batch receipt is copied into Career Playbook nodeCosts below.
      embeddings = await generateEmbeddings(missingTexts, 'retrieval.passage', undefined, usage => {
        const costUsd = jinaCostUsd(usage.model, usage.totalTokens);
        options.onNodeCost?.({
          node: 'semanticRepetition',
          model: usage.model,
          input_tokens: usage.totalTokens,
          output_tokens: 0,
          cost_usd: costUsd ?? 0,
          attempts: 1,
          outcome: 'succeeded',
          ...(costUsd === undefined ? { cost_unknown: true } : {}),
          provider_name: 'jina',
          billed_by_provider: false,
        });
      });
    } catch (error) {
      throw new CareerPlaybookSemanticRepetitionProviderError(
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    }

    if (embeddings.length !== missingTexts.length) {
      throw new CareerPlaybookSemanticRepetitionProviderError(
        `Jina returned ${embeddings.length} embeddings for ${missingTexts.length} semantic inputs`
      );
    }

    for (let index = 0; index < missingTexts.length; index += 1) {
      const text = missingTexts[index];
      const embedding = embeddings[index];
      embeddingByText.set(text, embedding);
      if (options.cache && cacheNamespace) {
        options.cache.set(cacheNamespace, text, embedding);
      }
    }
  }
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const pair of blockPairs) {
    const similarity = validator.cosineSimilarity(
      embeddingByText.get(pair.left.content)!,
      embeddingByText.get(pair.right.content)!
    );
    if (similarity >= CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD) {
      issues.push(...buildCrossBlockIssues(pair, similarity));
    }
  }

  for (const pair of paragraphPairs) {
    const similarity = validator.cosineSimilarity(
      embeddingByText.get(pair.block.paragraphs[pair.leftIndex])!,
      embeddingByText.get(pair.block.paragraphs[pair.rightIndex])!
    );
    if (similarity >= CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD) {
      issues.push(buildParagraphIssue(pair, similarity));
    }
  }

  return issues;
}
