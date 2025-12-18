/**
 * Admin Pipeline Dashboard - Prompt Template Types
 *
 * Types for versioned prompt templates with fallback support.
 * Supports CRUD operations, history tracking, and variable substitution.
 *
 * @module prompt-template
 */

import { z } from 'zod';

// =============================================================================
// Prompt Stages
// =============================================================================

export const promptStageSchema = z.enum(['stage_3', 'stage_4', 'stage_5', 'stage_6']);

export type PromptStage = z.infer<typeof promptStageSchema>;

// =============================================================================
// Prompt Variables
// =============================================================================

export const promptVariableSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  example: z.string().optional(),
});

export type PromptVariable = z.infer<typeof promptVariableSchema>;

// =============================================================================
// Prompt Template (FR-018)
// =============================================================================

export const promptTemplateSchema = z.object({
  id: z.string().uuid(),
  stage: promptStageSchema,
  promptKey: z.string(),
  promptName: z.string(),
  promptDescription: z.string().nullable(),
  promptTemplate: z.string(),
  variables: z.array(promptVariableSchema),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

// =============================================================================
// Prompt Template Input Schemas
// =============================================================================

export const updatePromptTemplateInputSchema = z.object({
  id: z.string().uuid(),
  promptTemplate: z.string().min(1).optional(),
  promptName: z.string().min(1).optional(),
  promptDescription: z.string().nullable().optional(),
  variables: z.array(promptVariableSchema).optional(),
  expectedVersion: z.number().int().positive().optional(), // Optimistic locking
});

export type UpdatePromptTemplateInput = z.infer<typeof updatePromptTemplateInputSchema>;

// =============================================================================
// Prompt History
// =============================================================================

export const promptHistoryItemSchema = z.object({
  id: z.string().uuid(),
  stage: promptStageSchema,
  promptKey: z.string(),
  promptName: z.string(),
  promptTemplate: z.string(),
  variables: z.array(promptVariableSchema),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().nullable(),
  createdByEmail: z.string().nullable(),
});

export type PromptHistoryItem = z.infer<typeof promptHistoryItemSchema>;

// =============================================================================
// Grouped Prompts (for UI display)
// =============================================================================

export const promptsByStageSchema = z.record(
  promptStageSchema,
  z.array(promptTemplateSchema)
);

export type PromptsByStage = z.infer<typeof promptsByStageSchema>;
