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

function collectParagraphPairs(blocks: readonly SemanticBlock[]): SemanticParagraphPair[] {
  const pairs: SemanticParagraphPair[] = [];
  for (const block of blocks) {
    for (let left = 0; left < block.paragraphs.length; left += 1) {
      for (let right = left + 1; right < block.paragraphs.length; right += 1) {
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

function buildParagraphIssue(
  pair: SemanticParagraphPair,
  similarity: number
): CareerPlaybookJudgeIssue {
  return {
    block_id: pair.block.blockId,
    severity: 'critical',
    category: 'contradiction',
    description: `${pair.block.blockId} paragraphs ${pair.leftIndex + 1} and ${pair.rightIndex + 1} repeat semantically equivalent material (cosine ${similarity.toFixed(4)}, threshold ${CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD}).`,
    suggestion: `Merge or remove the repeated paragraph inside ${pair.block.blockId}.`,
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
