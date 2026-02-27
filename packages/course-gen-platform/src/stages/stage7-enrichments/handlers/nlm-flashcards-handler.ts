/**
 * NotebookLM Flashcards Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-flashcards-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates flashcards via bridge
 * - Poll mode: checks bridge task status → fetches result when ready
 * - Parses JSON into FlashcardsEnrichmentContent, stores in JSONB
 */

import { logger } from '@/shared/logger';
import { nanoid } from 'nanoid';
import type { FlashcardsEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildNotebookLMSources,
  resolveSourceStrategy,
  resolveNlmAsyncMode,
  resolveBridgeTaskId,
  checkBridgeTaskStatus,
  fetchBridgeTaskMedia,
} from './nlm-shared';

interface RawFlashcard {
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
  id?: string;
  difficulty?: string;
}

function parseFlashcardsJson(raw: string): RawFlashcard[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('NotebookLM bridge returned invalid flashcards JSON');
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is RawFlashcard =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
    );
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['cards', 'flashcards', 'data', 'items']) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as unknown[]).filter(
          (item): item is RawFlashcard =>
            item !== null && typeof item === 'object' && !Array.isArray(item)
        );
      }
    }
  }

  throw new Error('NotebookLM bridge flashcards response did not contain a card array');
}

function normalizeCards(rawCards: RawFlashcard[]) {
  const validDifficulties = new Set(['easy', 'medium', 'hard']);
  const cards = rawCards
    .filter(c => (c.front || c.question) && (c.back || c.answer))
    .map(c => ({
      id: c.id || nanoid(8),
      front: (c.front || c.question || '').trim(),
      back: (c.back || c.answer || '').trim(),
      difficulty:
        c.difficulty && validDifficulties.has(c.difficulty)
          ? (c.difficulty as 'easy' | 'medium' | 'hard')
          : undefined,
    }));

  if (cards.length === 0) {
    throw new Error('NotebookLM returned empty flashcards set');
  }

  return cards;
}

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: {
      type: 'nlm_flashcards',
      cards: [],
      total_cards: 0,
    } as unknown as FlashcardsEnrichmentContent,
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
      mediaType: 'flashcards',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function parseFlashcardsResult(
  rawMedia: { textContent?: string; buffer: Buffer },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  const rawJson = rawMedia.textContent ?? rawMedia.buffer.toString('utf-8');
  const rawCards = parseFlashcardsJson(rawJson);
  const cards = normalizeCards(rawCards);

  const content: FlashcardsEnrichmentContent = {
    type: 'nlm_flashcards',
    cards,
    total_cards: cards.length,
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
      actual_card_count: cards.length,
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
    'NLM flashcards handler: generating'
  );

  // Poll mode: check existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'flashcards');
    const durationMs = Date.now() - startTime;

    if (!poll.completed) {
      return buildDeferredResult(
        bridgeTaskId,
        poll.status.status,
        poll.status.responseMetadata,
        durationMs,
        { poll_mode: true }
      );
    }

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'flashcards');
    return parseFlashcardsResult(media, durationMs, {
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

  const language = enrichmentContext.course.language || 'en';
  const sourceStrategy = resolveSourceStrategy(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: lessonContent,
    scriptTitle: enrichmentContext.lesson.title,
    rawLessonContent: lessonContent,
    input,
  });

  // Read camelCase keys from validated on-demand schema
  const difficulty = typeof settings.difficulty === 'string' ? settings.difficulty : 'medium';
  const cardCount = typeof settings.cardCount === 'number' ? settings.cardCount : 15;

  const start = await notebookLmBridgeClient.startFlashcards({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    sources,
    flashcardDifficulty: difficulty,
    flashcardCount: cardCount,
  });

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    return buildDeferredResult(start.taskId, start.status, start.responseMetadata, durationMs, {
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      difficulty,
      card_count: cardCount,
    });
  }

  const durationMs = Date.now() - startTime;
  return parseFlashcardsResult(start.immediateMedia, durationMs, {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
    difficulty,
    requested_card_count: cardCount,
  });
}

export const nlmFlashcardsHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
