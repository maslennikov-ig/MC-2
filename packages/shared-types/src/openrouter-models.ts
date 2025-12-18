/**
 * Admin Pipeline Dashboard - OpenRouter Model Types
 *
 * Types for OpenRouter API integration, model listing, and filtering.
 * Based on OpenRouter API specification.
 *
 * @module openrouter-models
 */

import { z } from 'zod';

// =============================================================================
// OpenRouter Model (FR-014, FR-016)
// =============================================================================

export const openRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  contextLength: z.number(),
  architecture: z.object({
    modality: z.string(),
    tokenizer: z.string(),
    instructType: z.string().nullable(),
  }),
  pricing: z.object({
    prompt: z.number(), // USD per token
    completion: z.number(), // USD per token
    image: z.number().optional(),
    request: z.number().optional(),
  }),
  provider: z.string(), // Extracted from id (e.g., "openai" from "openai/gpt-4")
});

export type OpenRouterModel = z.infer<typeof openRouterModelSchema>;

// =============================================================================
// Model List Response
// =============================================================================

export const openRouterModelsResponseSchema = z.object({
  models: z.array(openRouterModelSchema),
  fromCache: z.boolean(),
  cacheAge: z.number().optional(), // milliseconds since cache
  lastFetchedAt: z.string().datetime().optional(),
});

export type OpenRouterModelsResponse = z.infer<typeof openRouterModelsResponseSchema>;

// =============================================================================
// Model Filter (FR-017)
// =============================================================================

export const modelFilterSchema = z.object({
  providers: z.array(z.string()).optional(),
  minContextLength: z.number().optional(),
  maxContextLength: z.number().optional(),
  maxPricePerMillion: z.number().optional(), // USD per 1M tokens
  search: z.string().optional(),
});

export type ModelFilter = z.infer<typeof modelFilterSchema>;
