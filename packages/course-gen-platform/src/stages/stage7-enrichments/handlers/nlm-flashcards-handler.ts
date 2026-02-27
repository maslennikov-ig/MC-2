/**
 * NotebookLM Flashcards Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-flashcards-handler
 *
 * Single-stage flow:
 * - Fetches lesson content and builds source bundle
 * - Generates flashcards (JSON) via NotebookLM bridge
 * - Parses JSON into FlashcardsEnrichmentContent, stores in JSONB
 */

import { logger } from '@/shared/logger';
import { nanoid } from 'nanoid';
import type { FlashcardsEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import { buildNotebookLMSources, resolveSourceStrategy } from './nlm-shared';

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
    return parsed as RawFlashcard[];
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['cards', 'flashcards', 'data', 'items']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawFlashcard[];
      }
    }
  }

  throw new Error('NotebookLM bridge flashcards response did not contain a card array');
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

  const difficulty = typeof settings.difficulty === 'string' ? settings.difficulty : 'medium';
  const cardCount = typeof settings.card_count === 'number' ? settings.card_count : 15;

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
    const deferredContent: FlashcardsEnrichmentContent = {
      type: 'nlm_flashcards',
      cards: [],
      total_cards: 0,
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
          difficulty,
          card_count: cardCount,
          bridge_task_id: start.taskId,
          bridge_task_status: start.status,
        },
      },
      deferredTask: {
        provider: 'notebooklm-bridge',
        mediaType: 'flashcards',
        taskId: start.taskId,
        status: start.status,
        responseMetadata: start.responseMetadata,
      },
    };
  }

  const bridgeResult = start.immediateMedia;
  const rawJson = bridgeResult.textContent ?? bridgeResult.buffer.toString('utf-8');
  const rawCards = parseFlashcardsJson(rawJson);

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

  const content: FlashcardsEnrichmentContent = {
    type: 'nlm_flashcards',
    cards,
    total_cards: cards.length,
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
      difficulty,
      requested_card_count: cardCount,
      actual_card_count: cards.length,
    },
  };

  return { content, metadata };
}

export const nlmFlashcardsHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
