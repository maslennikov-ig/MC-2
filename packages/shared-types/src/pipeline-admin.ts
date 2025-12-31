/**
 * Admin Pipeline Dashboard - Core Types
 *
 * Types for pipeline configuration, statistics, and settings management.
 * Supports versioned model configs, global settings, and export/import.
 *
 * @module pipeline-admin
 */

import { z } from 'zod';
import type { PhaseName } from './model-config';
import { promptTemplateSchema } from './prompt-template';

// =============================================================================
// Phase Names (FR-009)
// =============================================================================

export const phaseNameSchema = z.enum([
  // Global default (admin-configurable fallback)
  'global_default',
  // Stage 2: Document Processing (Summarization)
  'stage_2_summarization',
  'stage_2_standard_ru',
  'stage_2_standard_en',
  'stage_2_extended_ru',
  'stage_2_extended_en',
  // Stage 3: Classification
  'stage_3_classification',
  // Stage 4: Analysis
  'stage_4_classification',
  'stage_4_scope',
  'stage_4_expert',
  'stage_4_synthesis',
  'stage_4_standard_ru',
  'stage_4_standard_en',
  'stage_4_extended_ru',
  'stage_4_extended_en',
  // Stage 5: Structure Generation
  'stage_5_metadata',
  'stage_5_sections',
  'stage_5_standard_ru',
  'stage_5_standard_en',
  'stage_5_extended_ru',
  'stage_5_extended_en',
  // Stage 6: Lesson Content
  'stage_6_rag_planning',
  'stage_6_judge',
  'stage_6_refinement',
  'stage_6_standard_ru',
  'stage_6_standard_en',
  'stage_6_extended_ru',
  'stage_6_extended_en',
  // Stage 6: Targeted Refinement phases
  'stage_6_arbiter',
  'stage_6_patcher',
  'stage_6_section_expander',
  'stage_6_delta_judge',
  // Stage 7: Enrichments (Activities)
  'stage_7_cover',
  'stage_7_video',
  'stage_7_audio',
  'stage_7_quiz',
  'stage_7_presentation',
  'stage_7_document',
  // Special
  'emergency',
  'quality_fallback',
]);

// Re-export PhaseName type from model-config to avoid duplication
export type { PhaseName };

// =============================================================================
// Pipeline Stages
// =============================================================================

export const pipelineStageSchema = z.object({
  number: z.number().min(1).max(6),
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'inactive', 'error']),
  linkedModels: z.array(phaseNameSchema),
  linkedPrompts: z.array(z.string()),
  modelCount: z.number().int().min(0), // Database-driven count of active models
  promptCount: z.number().int().min(0), // Database-driven count of active prompts
  avgExecutionTime: z.number().nullable(), // milliseconds
  avgCost: z.number().nullable(), // USD
});

export type PipelineStage = z.infer<typeof pipelineStageSchema>;

// =============================================================================
// Pipeline Statistics (FR-006)
// =============================================================================

export const pipelineStatsSchema = z.object({
  totalGenerations: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  totalCost: z.number(), // USD
  avgCompletionTime: z.number(), // milliseconds
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export type PipelineStats = z.infer<typeof pipelineStatsSchema>;

// =============================================================================
// Model Configuration (FR-007, FR-008)
// Extended database interface with versioning and audit fields
// =============================================================================

// =============================================================================
// Judge Role (CLEV Voting System)
// =============================================================================

export const judgeRoleSchema = z.enum(['primary', 'secondary', 'tiebreaker']);
export type JudgeRole = z.infer<typeof judgeRoleSchema>;

export const modelConfigWithVersionSchema = z.object({
  id: z.string().uuid(),
  configType: z.string(),
  phaseName: phaseNameSchema,
  courseId: z.string().uuid().nullable(),
  modelId: z.string(),
  fallbackModelId: z.string().nullable(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(128000),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  // Wave 1 migration fields (20251203_migrate_global_model_configs)
  stageNumber: z.number().nullable(),
  language: z.string().nullable(),
  contextTier: z.string().nullable(),
  maxContextTokens: z.number().nullable(),
  thresholdTokens: z.number().nullable(),
  cacheReadEnabled: z.boolean().nullable(),
  primaryDisplayName: z.string().nullable(),
  fallbackDisplayName: z.string().nullable(),
  // CLEV Judge fields (20251210_add_judge_role_and_weight)
  judgeRole: judgeRoleSchema.nullable(),
  weight: z.number().min(0).max(1).nullable(),
  // Per-stage settings (20251216_add_per_stage_settings)
  qualityThreshold: z.number().min(0).max(1).nullable(),
  maxRetries: z.number().int().min(0).max(10).nullable(),
  timeoutMs: z.number().int().min(1000).nullable(),
});

export type ModelConfigWithVersion = z.infer<typeof modelConfigWithVersionSchema>;

export const updateModelConfigInputSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().optional(),
  fallbackModelId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(128000).optional(),
  expectedVersion: z.number().int().positive().optional(), // Optimistic locking
  // Per-stage settings (optional, null = use default)
  qualityThreshold: z.number().min(0).max(1).nullable().optional(),
  maxRetries: z.number().int().min(0).max(10).nullable().optional(),
  timeoutMs: z.number().int().min(1000).nullable().optional(),
});

export type UpdateModelConfigInput = z.infer<typeof updateModelConfigInputSchema>;

// =============================================================================
// Model Config History
// =============================================================================

export const modelConfigHistoryItemSchema = z.object({
  id: z.string().uuid(),
  version: z.number(),
  modelId: z.string(),
  fallbackModelId: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type ModelConfigHistoryItem = z.infer<typeof modelConfigHistoryItemSchema>;

// =============================================================================
// Global Settings (FR-026, FR-027)
// =============================================================================

export const globalSettingsSchema = z.object({
  ragTokenBudget: z.number().min(1000).max(100000),
});

export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

// =============================================================================
// Export/Import (FR-028 - FR-033)
// =============================================================================

export const configExportDataSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  exportedBy: z.string().uuid(),
  platformVersion: z.string(), // e.g., "0.22.2" from package.json
  data: z.object({
    modelConfigs: z.array(modelConfigWithVersionSchema),
    promptTemplates: z.array(promptTemplateSchema),
    globalSettings: globalSettingsSchema,
  }),
});

export type ConfigExport = z.infer<typeof configExportDataSchema>;

export const configBackupSchema = z.object({
  id: z.string().uuid(),
  backupName: z.string(),
  backupType: z.enum(['manual', 'auto_pre_import', 'scheduled']),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type ConfigBackup = z.infer<typeof configBackupSchema>;

export const importPreviewSchema = z.object({
  modelConfigChanges: z.array(z.object({
    phaseName: phaseNameSchema,
    currentModelId: z.string().nullable(),
    newModelId: z.string(),
    changeType: z.enum(['add', 'update', 'unchanged']),
  })),
  promptTemplateChanges: z.array(z.object({
    stage: z.string(),
    promptKey: z.string(),
    changeType: z.enum(['add', 'update', 'unchanged']),
  })),
  settingsChanges: z.array(z.object({
    key: z.string(),
    currentValue: z.unknown(),
    newValue: z.unknown(),
  })),
});

export type ImportPreview = z.infer<typeof importPreviewSchema>;

// =============================================================================
// Judge Configuration (CLEV Voting System API)
// =============================================================================

export const judgeConfigSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string(),
  displayName: z.string(),
  language: z.string(),
  judgeRole: judgeRoleSchema,
  weight: z.number().min(0).max(1),
  temperature: z.number(),
  maxTokens: z.number(),
  fallbackModelId: z.string().nullable(),
  isActive: z.boolean(),
});

export type JudgeConfig = z.infer<typeof judgeConfigSchema>;

export const judgeConfigsByLanguageSchema = z.object({
  language: z.string(),
  primary: judgeConfigSchema,
  secondary: judgeConfigSchema,
  tiebreaker: judgeConfigSchema,
});

export type JudgeConfigsByLanguage = z.infer<typeof judgeConfigsByLanguageSchema>;

export const updateJudgeConfigInputSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().optional(),
  weight: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateJudgeConfigInput = z.infer<typeof updateJudgeConfigInputSchema>;
