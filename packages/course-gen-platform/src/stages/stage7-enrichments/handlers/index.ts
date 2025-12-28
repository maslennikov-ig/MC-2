/**
 * Stage 7 Enrichment Handlers
 * @module stages/stage7-enrichments/handlers
 *
 * Export all enrichment-specific handlers for use by the enrichment router.
 * Each handler implements the EnrichmentHandler interface and provides
 * type-specific generation logic.
 */

export { videoHandler } from './video-handler';

// Future handlers to be added:
// export { quizHandler } from './quiz-handler';
// export { audioHandler } from './audio-handler';
// export { presentationHandler } from './presentation-handler';
// export { documentHandler } from './document-handler';
