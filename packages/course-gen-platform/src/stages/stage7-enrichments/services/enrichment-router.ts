/**
 * Stage 7 Enrichment Router
 * @module stages/stage7-enrichments/services/enrichment-router
 *
 * Routes enrichment jobs to type-specific handlers.
 * Acts as a dispatcher for different enrichment generation strategies.
 */

import { logger } from '@/shared/logger';
import type { EnrichmentType } from '@megacampus/shared-types';
import type {
  EnrichmentHandlerInput,
  DraftResult,
  GenerateResult,
} from '../types';
import { quizHandler, videoHandler, audioHandler, presentationHandler, coverHandler, cardHandler } from '../handlers';

/**
 * Enrichment handler interface
 * Each enrichment type implements this interface
 */
export interface EnrichmentHandler {
  /** Generation flow type */
  generationFlow: 'single-stage' | 'two-stage';

  /**
   * Generate draft for two-stage enrichments
   * Only required for two-stage flow (presentation, video)
   */
  generateDraft?: (input: EnrichmentHandlerInput) => Promise<DraftResult>;

  /**
   * Generate final content
   * For single-stage: generates complete content
   * For two-stage: generates final content from approved draft
   */
  generate: (input: EnrichmentHandlerInput) => Promise<GenerateResult>;

  /**
   * Generate final content from draft
   * Only required for two-stage flow
   */
  generateFinal?: (
    input: EnrichmentHandlerInput,
    draft: DraftResult
  ) => Promise<GenerateResult>;
}

// Quiz, audio, presentation, and video handlers imported from handlers/

/**
 * Document enrichment handler (stub)
 *
 * Generates downloadable documents (PDF, DOCX).
 * Single-stage flow for now.
 */
const documentHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',

  async generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
    const { enrichmentContext } = input;

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        lessonId: enrichmentContext.lesson.id,
      },
      'Document handler: generating document (stub)'
    );

    const startTime = Date.now();

    // Stub: Placeholder document content
    const content = {
      type: 'document' as const,
      file_name: `${enrichmentContext.lesson.title}.pdf`,
      file_url: 'placeholder://not-implemented',
      format: 'pdf' as const,
    };

    const durationMs = Date.now() - startTime;

    return {
      content,
      metadata: {
        generated_at: new Date().toISOString(),
        generation_duration_ms: durationMs,
        estimated_cost_usd: 0,
        model_used: 'stub',
        quality_score: 1.0,
        retry_attempts: 0,
      },
    };
  },
};

/**
 * Handler registry
 */
const handlers: Record<EnrichmentType, EnrichmentHandler> = {
  quiz: quizHandler,
  audio: audioHandler,
  presentation: presentationHandler,
  video: videoHandler,
  document: documentHandler,
  cover: coverHandler,
  card: cardHandler,
};

/**
 * Route enrichment to appropriate handler
 *
 * @param type - Enrichment type
 * @returns Handler for the enrichment type
 */
export function routeEnrichment(type: EnrichmentType): EnrichmentHandler {
  const handler = handlers[type];

  if (!handler) {
    throw new Error(`No handler registered for enrichment type: ${type}`);
  }

  return handler;
}

/**
 * Check if enrichment type uses two-stage flow
 *
 * @param type - Enrichment type
 * @returns True if two-stage flow
 */
export function isTwoStageEnrichment(type: EnrichmentType): boolean {
  const handler = handlers[type];
  return handler?.generationFlow === 'two-stage';
}

/**
 * Get all registered enrichment types
 *
 * @returns Array of registered enrichment types
 */
export function getRegisteredTypes(): EnrichmentType[] {
  return Object.keys(handlers) as EnrichmentType[];
}
