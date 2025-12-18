/**
 * Prompt Service
 * @module shared/prompts/prompt-service
 *
 * Provides database-driven prompt templates with fallback to hardcoded prompts.
 * Supports Mustache-style variable rendering ({{variable}}).
 *
 * Features:
 * - Database lookup with 5-minute TTL caching
 * - Fallback to PROMPT_REGISTRY when database unavailable
 * - Variable validation and rendering with {{variable}} syntax
 * - Stage-based prompt retrieval
 */

import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';
import type { PromptVariable } from '@megacampus/shared-types';
import { PROMPT_REGISTRY, getPrompt as getHardcodedPrompt, type HardcodedPrompt } from './prompt-registry';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prompt result with template and metadata
 */
export interface PromptResult {
  /** Unique prompt identifier */
  promptKey: string;
  /** Human-readable name */
  promptName: string;
  /** Template with {{variable}} placeholders */
  promptTemplate: string;
  /** List of variables with metadata */
  variables: PromptVariable[];
  /** Source of prompt (database or hardcoded fallback) */
  source: 'database' | 'hardcoded';
  /** Version number */
  version: number;
}

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PromptCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class PromptServiceImpl {
  private promptCache = new PromptCache<PromptResult>();

  /**
   * Get prompt template by key
   *
   * @param promptKey - Unique prompt identifier (e.g., 'stage4_phase1_classification')
   * @returns PromptResult or null if not found
   */
  async getPrompt(promptKey: string): Promise<PromptResult | null> {
    const cacheKey = `prompt:${promptKey}`;

    // Check cache
    const cached = this.promptCache.get(cacheKey);
    if (cached) {
      logger.debug({ promptKey, source: 'cache' }, 'Prompt cache hit');
      return cached;
    }

    // Try database lookup
    try {
      const dbPrompt = await this.fetchPromptFromDb(promptKey);
      if (dbPrompt) {
        logger.info({ promptKey, source: 'database' }, 'Using database prompt');
        this.promptCache.set(cacheKey, dbPrompt);
        return dbPrompt;
      }
    } catch (err) {
      logger.warn({ promptKey, error: err }, 'Database prompt lookup failed');
    }

    // Fallback to hardcoded registry
    const hardcodedPrompt = this.getHardcodedPromptResult(promptKey);
    if (hardcodedPrompt) {
      logger.info({ promptKey, source: 'hardcoded' }, 'Using hardcoded prompt fallback');
      this.promptCache.set(cacheKey, hardcodedPrompt);
      return hardcodedPrompt;
    }

    logger.warn({ promptKey }, 'Prompt not found in database or registry');
    return null;
  }

  /**
   * Render prompt template with variable substitution
   *
   * @param promptKey - Unique prompt identifier
   * @param variables - Variables to substitute (key-value pairs)
   * @returns Rendered prompt string
   * @throws Error if prompt not found or required variables missing
   */
  async renderPrompt(promptKey: string, variables: Record<string, string>): Promise<string> {
    const prompt = await this.getPrompt(promptKey);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptKey}`);
    }

    // Validate required variables
    const missingVars = prompt.variables
      .filter((v) => v.required)
      .filter((v) => !variables[v.name])
      .map((v) => v.name);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required variables for prompt ${promptKey}: ${missingVars.join(', ')}`
      );
    }

    // Render template with Mustache-style {{variable}} replacement
    let rendered = prompt.promptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replaceAll(placeholder, value);
    }

    // Check for unresolved placeholders
    const unresolvedMatches = rendered.match(/\{\{[^}]+\}\}/g);
    if (unresolvedMatches) {
      logger.warn(
        { promptKey, unresolved: unresolvedMatches },
        'Prompt has unresolved placeholders'
      );
    }

    return rendered;
  }

  /**
   * Get all prompts for a specific stage
   *
   * @param stage - Stage identifier ('stage_3', 'stage_4', 'stage_5', 'stage_6')
   * @returns Array of prompts for that stage
   */
  async getPromptsForStage(
    stage: 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6'
  ): Promise<PromptResult[]> {
    // Try database lookup first
    try {
      const dbPrompts = await this.fetchPromptsForStageFromDb(stage);
      if (dbPrompts.length > 0) {
        logger.info({ stage, count: dbPrompts.length, source: 'database' }, 'Fetched stage prompts from database');
        return dbPrompts;
      }
    } catch (err) {
      logger.warn({ stage, error: err }, 'Database stage prompts lookup failed');
    }

    // Fallback to hardcoded registry
    const hardcodedPrompts = Array.from(PROMPT_REGISTRY.values())
      .filter((p) => p.stage === stage)
      .map((p) => this.convertHardcodedToResult(p));

    logger.info(
      { stage, count: hardcodedPrompts.length, source: 'hardcoded' },
      'Using hardcoded stage prompts'
    );
    return hardcodedPrompts;
  }

  /**
   * Clear prompt cache (for testing/admin)
   */
  clearCache(): void {
    this.promptCache.clear();
    logger.info('Prompt cache cleared');
  }

  // ==========================================================================
  // PRIVATE METHODS - DATABASE LOOKUPS
  // ==========================================================================

  private async fetchPromptFromDb(promptKey: string): Promise<PromptResult | null> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.warn({ promptKey, error }, 'Error fetching prompt from DB');
      return null;
    }

    if (!data) {
      return null;
    }

    // Parse variables JSON
    const variables = this.parseVariables(data.variables);

    return {
      promptKey: data.prompt_key,
      promptName: data.prompt_name,
      promptTemplate: data.prompt_template,
      variables,
      version: data.version,
      source: 'database',
    };
  }

  private async fetchPromptsForStageFromDb(
    stage: 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6'
  ): Promise<PromptResult[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('stage', stage)
      .eq('is_active', true)
      .order('prompt_key');

    if (error) {
      logger.warn({ stage, error }, 'Error fetching stage prompts from DB');
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row) => ({
      promptKey: row.prompt_key,
      promptName: row.prompt_name,
      promptTemplate: row.prompt_template,
      variables: this.parseVariables(row.variables),
      version: row.version,
      source: 'database' as const,
    }));
  }

  // ==========================================================================
  // PRIVATE METHODS - HARDCODED FALLBACKS
  // ==========================================================================

  private getHardcodedPromptResult(promptKey: string): PromptResult | null {
    const hardcoded = getHardcodedPrompt(promptKey);
    if (!hardcoded) {
      return null;
    }

    return this.convertHardcodedToResult(hardcoded);
  }

  private convertHardcodedToResult(hardcoded: HardcodedPrompt): PromptResult {
    return {
      promptKey: hardcoded.promptKey,
      promptName: hardcoded.promptName,
      promptTemplate: hardcoded.promptTemplate,
      variables: hardcoded.variables,
      version: 1, // Hardcoded prompts are version 1
      source: 'hardcoded',
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private parseVariables(variablesJson: unknown): PromptVariable[] {
    if (!variablesJson) {
      return [];
    }

    try {
      // If already parsed as JSON by Supabase client
      if (Array.isArray(variablesJson)) {
        return variablesJson as PromptVariable[];
      }

      // If string, parse it
      if (typeof variablesJson === 'string') {
        const parsed = JSON.parse(variablesJson);
        return Array.isArray(parsed) ? parsed : [];
      }

      return [];
    } catch (err) {
      logger.warn({ error: err }, 'Failed to parse prompt variables JSON');
      return [];
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let serviceInstance: PromptServiceImpl | null = null;

/**
 * Get the singleton PromptService instance
 *
 * @returns PromptService instance
 */
export function createPromptService(): PromptServiceImpl {
  if (!serviceInstance) {
    serviceInstance = new PromptServiceImpl();
  }
  return serviceInstance;
}

/**
 * Export type for external use
 */
export type PromptService = PromptServiceImpl;
