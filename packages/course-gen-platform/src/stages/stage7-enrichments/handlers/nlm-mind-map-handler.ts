/**
 * NotebookLM Mind Map Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-mind-map-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates mind map via bridge
 * - Poll mode: checks bridge task status → fetches result when ready
 * - Parses and validates tree structure, stores in JSONB
 */

import { logger } from '@/shared/logger';
import type { MindMapEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildStandardSources,
  resolveNlmAsyncMode,
  resolveBridgeTaskId,
  checkBridgeTaskStatus,
  fetchBridgeTaskMedia,
} from './nlm-shared';

/** Depth threshold for logging a warning (not a hard limit) */
const DEPTH_WARNING_THRESHOLD = 20;

interface RawMindMapNode {
  label?: string;
  name?: string;
  title?: string;
  text?: string;
  children?: RawMindMapNode[];
  description?: string;
}

type NormalizedNode = {
  label: string;
  children?: NormalizedNode[];
  description?: string;
};

function normalizeMindMapNode(raw: RawMindMapNode): NormalizedNode {
  const label = (raw.label || raw.name || raw.title || raw.text || '').trim();
  if (!label) {
    return { label: 'Untitled' };
  }

  const result: NormalizedNode = { label };

  if (raw.description && typeof raw.description === 'string') {
    result.description = raw.description.trim();
  }

  if (Array.isArray(raw.children) && raw.children.length > 0) {
    result.children = raw.children
      .filter((c): c is RawMindMapNode => c && typeof c === 'object')
      .map(c => normalizeMindMapNode(c));
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
    for (const key of ['root', 'tree', 'mindmap', 'mind_map', 'data']) {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        return obj[key] as RawMindMapNode;
      }
    }
    return obj as unknown as RawMindMapNode;
  }

  throw new Error('NotebookLM bridge mind map response is not a valid tree object');
}

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  lessonTitle: string,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: {
      type: 'nlm_mind_map',
      root: { label: lessonTitle },
    } as MindMapEnrichmentContent,
    metadata: {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      estimated_cost_usd: 0,
      model_used: 'notebooklm-bridge',
      quality_score: 1.0,
      retry_attempts: 0,
      additional_info: {
        bridge: 'notebooklm',
        bridge_task_id: taskId,
        bridge_task_status: taskStatus,
        ...extra,
      },
    },
    deferredTask: {
      provider: 'notebooklm-bridge',
      mediaType: 'mind_map',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function parseMindMapResult(
  rawMedia: { textContent?: string; buffer: Buffer },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  const rawJson = rawMedia.textContent ?? rawMedia.buffer.toString('utf-8');
  const rawRoot = parseMindMapJson(rawJson);
  const root = normalizeMindMapNode(rawRoot);
  const totalNodes = countNodes(root as { children?: { label: string }[] });
  const treeDepth = maxDepth(root as { children?: { label: string }[] });

  if (treeDepth > DEPTH_WARNING_THRESHOLD) {
    logger.warn(
      { treeDepth, totalNodes, threshold: DEPTH_WARNING_THRESHOLD },
      'NLM mind map: tree depth exceeds warning threshold'
    );
  }

  const content: MindMapEnrichmentContent = {
    type: 'nlm_mind_map',
    root,
    total_nodes: totalNodes,
    max_depth: treeDepth,
  };

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: durationMs,
    estimated_cost_usd: 0,
    model_used: 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      total_nodes: totalNodes,
      max_depth: treeDepth,
      ...extra,
    },
  };

  return { content, metadata };
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

  // Poll mode: check existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'mind_map');
    const durationMs = Date.now() - startTime;

    if (!poll.completed) {
      return buildDeferredResult(
        bridgeTaskId,
        poll.status.status,
        poll.status.responseMetadata,
        durationMs,
        enrichmentContext.lesson.title,
        { poll_mode: true }
      );
    }

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'mind_map');
    return parseMindMapResult(media, durationMs, {
      poll_mode: true,
      bridge_task_id: bridgeTaskId,
    });
  }

  // Start mode: initiate new generation
  const lessonContent = await getLessonContent(
    enrichmentContext.lesson.id,
    enrichmentContext.course.id
  );
  if (!lessonContent) {
    throw new Error(`No lesson content found for lesson ${enrichmentContext.lesson.id}`);
  }

  const { language, sources, sourceStrategy } = buildStandardSources(
    lessonContent,
    settings,
    input
  );

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
    return buildDeferredResult(
      start.taskId,
      start.status,
      start.responseMetadata,
      durationMs,
      enrichmentContext.lesson.title,
      { source_strategy_used: sourceStrategy, source_count: sources.length, depth }
    );
  }

  const durationMs = Date.now() - startTime;
  return parseMindMapResult(start.immediateMedia, durationMs, {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
    depth,
  });
}

export const nlmMindMapHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
