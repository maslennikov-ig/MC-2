/**
 * NotebookLM Mind Map Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-mind-map-handler
 *
 * Single-stage flow:
 * - Fetches lesson content and builds source bundle
 * - Generates mind map (hierarchical JSON) via NotebookLM bridge
 * - Parses and validates tree structure, stores in JSONB
 */

import { logger } from '@/shared/logger';
import type { MindMapEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import { buildNotebookLMSources, resolveSourceStrategy } from './nlm-shared';

interface RawMindMapNode {
  label?: string;
  name?: string;
  title?: string;
  text?: string;
  children?: RawMindMapNode[];
  description?: string;
}

function normalizeMindMapNode(raw: RawMindMapNode): {
  label: string;
  children?: ReturnType<typeof normalizeMindMapNode>[];
  description?: string;
} {
  const label = (raw.label || raw.name || raw.title || raw.text || '').trim();
  if (!label) {
    return { label: 'Untitled' };
  }

  const result: {
    label: string;
    children?: ReturnType<typeof normalizeMindMapNode>[];
    description?: string;
  } = { label };

  if (raw.description && typeof raw.description === 'string') {
    result.description = raw.description.trim();
  }

  if (Array.isArray(raw.children) && raw.children.length > 0) {
    result.children = raw.children
      .filter((c): c is RawMindMapNode => c && typeof c === 'object')
      .map(normalizeMindMapNode);
  }

  return result;
}

function countNodes(node: { children?: { label: string }[] }): number {
  let count = 1;
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child as typeof node);
    }
  }
  return count;
}

function maxDepth(node: { children?: { label: string }[] }): number {
  if (!('children' in node) || !Array.isArray(node.children) || node.children.length === 0) {
    return 1;
  }
  let max = 0;
  for (const child of node.children) {
    const d = maxDepth(child as typeof node);
    if (d > max) max = d;
  }
  return 1 + max;
}

function parseMindMapJson(raw: string): RawMindMapNode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('NotebookLM bridge returned invalid mind map JSON');
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    // Check if root is nested under a key
    for (const key of ['root', 'tree', 'mindmap', 'mind_map', 'data']) {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        return obj[key] as RawMindMapNode;
      }
    }
    // The object itself is the root
    return obj as unknown as RawMindMapNode;
  }

  throw new Error('NotebookLM bridge mind map response is not a valid tree object');
}

async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'NLM mind map handler: generating'
  );

  const lessonContent = await getLessonContent(
    enrichmentContext.lesson.id,
    enrichmentContext.course.id
  );
  if (!lessonContent) {
    throw new Error(`No lesson content found for lesson ${enrichmentContext.lesson.id}`);
  }

  const language = enrichmentContext.course.language || 'en';
  const sourceStrategy = resolveSourceStrategy(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: lessonContent,
    scriptTitle: 'Lesson Content',
    rawLessonContent: lessonContent,
    input,
  });

  const depth = typeof settings.depth === 'string' ? settings.depth : 'standard';
  const depthNumber = depth === 'shallow' ? 2 : depth === 'deep' ? 5 : 3;

  const start = await notebookLmBridgeClient.startMindMap({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    sources,
    mindMapDepth: depthNumber,
  });

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    const deferredContent: MindMapEnrichmentContent = {
      type: 'nlm_mind_map',
      root: { label: enrichmentContext.lesson.title },
    };

    return {
      content: deferredContent,
      metadata: {
        generated_at: new Date().toISOString(),
        generation_duration_ms: durationMs,
        estimated_cost_usd: 0,
        model_used: 'notebooklm-bridge',
        quality_score: 1.0,
        retry_attempts: 0,
        additional_info: {
          bridge: 'notebooklm',
          source_strategy_used: sourceStrategy,
          source_count: sources.length,
          depth,
          bridge_task_id: start.taskId,
          bridge_task_status: start.status,
        },
      },
      deferredTask: {
        provider: 'notebooklm-bridge',
        mediaType: 'mind_map',
        taskId: start.taskId,
        status: start.status,
        responseMetadata: start.responseMetadata,
      },
    };
  }

  const bridgeResult = start.immediateMedia;
  const rawJson = bridgeResult.textContent ?? bridgeResult.buffer.toString('utf-8');
  const rawRoot = parseMindMapJson(rawJson);
  const root = normalizeMindMapNode(rawRoot);
  const totalNodes = countNodes(root as { children?: { label: string }[] });
  const treeDepth = maxDepth(root as { children?: { label: string }[] });

  const content: MindMapEnrichmentContent = {
    type: 'nlm_mind_map',
    root,
    total_nodes: totalNodes,
    max_depth: treeDepth,
  };

  const durationMs = Date.now() - startTime;

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: durationMs,
    estimated_cost_usd: 0,
    model_used: 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      depth,
      total_nodes: totalNodes,
      max_depth: treeDepth,
    },
  };

  return { content, metadata };
}

export const nlmMindMapHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
