/**
 * Shared types and schemas export
 * @module @megacampus/shared-types
 */

export * from './database.types';
export * from './file-upload-constants';
export * from './common-enums';
export * from './zod-schemas';
export * from './bullmq-jobs';
export * from './summarization-job';
export * from './summarization-result';
export * from './model-config';
export * from './model-defaults';
export * from './analysis-job';
export * from './analysis-schemas'; // Includes enhanced Analyze types
export * from './generation-result';
export * from './style-prompts';
export * from './generation-job';
export * from './generation-metadata';
export * from './transactional-outbox';

// Stage 4-6 Pipeline Types (v0.20.0+)
export * from './document-prioritization';
export * from './lesson-specification-v2';
export * from './lesson-content';
export * from './lesson-identifiers';

// LLM Judge Evaluation Types
export * from './judge-rubric';
export * from './judge-types';
export * from './judge-thresholds';

// NOTE: analysis-result.ts is NOT exported directly to avoid conflicts
// All analysis types are available via Zod schema inference in analysis-schemas.ts
// Runtime type guards for AnalysisResult
export { isAnalysisResult, parseAnalysisResult } from './analysis-guards';
export * from './generation-graph';

// Admin Pipeline Dashboard Types (v0.23.0+)
export * from './pipeline-admin';
export * from './prompt-template';
export * from './openrouter-models';
export * from './pipeline-admin-schemas';

// Stage 4-5 UI Redesign Types (v0.23.0+)
export * from './regeneration-types';
export * from './dependency-graph';

// Stage 6 UI Types (Glass Factory Dashboard)
export * from './stage6-ui.types';

// LMS Integration Types (Open edX, v0.23.0+)
export * from './lms';

// Context Reserve Settings (Dynamic Threshold)
export * from './context-reserve-settings';

// Token Estimation Utilities
export { estimateTokenCount, getCharsPerToken } from './token-estimation';

// Tier Settings Types
export * from './tier-settings';
