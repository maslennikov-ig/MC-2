/**
 * Prompt Loader Service - DB-First with Hardcoded Fallback
 *
 * Loads prompt templates with database-first + hardcoded-fallback strategy.
 *
 * @module services/prompt-loader
 *
 * Loading Strategy:
 * 1. Always try loading from `prompt_templates` table first
 * 2. If not found in DB or DB error: Fallback to `PROMPT_REGISTRY`
 * 3. Return template with source metadata ('database' | 'hardcoded')
 *
 * @example
 * ```typescript
 * const { template, variables, source } = await loadPrompt(
 *   'stage_6',
 *   'stage6_planner'
 * );
 * console.log(`Loaded ${source} prompt: ${template.substring(0, 50)}...`);
 * ```
 */

import type { PromptStage, PromptVariable } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import { PROMPT_REGISTRY } from '../shared/prompts/prompt-registry';
import { logger } from '../shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Prompt load result with source metadata
 */
export interface PromptLoadResult {
  template: string;
  variables: PromptVariable[];
  source: 'database' | 'hardcoded';
  promptName?: string;
  promptDescription?: string;
  version?: number;
}


/**
 * Prompt template row from database
 */
interface PromptTemplateRow {
  id: string;
  stage: string;
  prompt_key: string;
  prompt_name: string;
  prompt_description: string | null;
  prompt_template: string;
  variables: PromptVariable[];
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}


// ============================================================================
// MAIN API
// ============================================================================

/**
 * Load prompt template with DB-first + hardcoded fallback strategy
 *
 * Strategy:
 * 1. Always try loading from `prompt_templates` table (is_active = true)
 * 2. If not found or DB error: Fallback to `PROMPT_REGISTRY`
 *
 * @param stage - Prompt stage (stage_3, stage_4, stage_5, stage_6)
 * @param promptKey - Unique prompt identifier (e.g., "stage6_planner")
 * @returns Prompt template with metadata
 * @throws Error if prompt not found in both DB and registry
 *
 * @example
 * ```typescript
 * const prompt = await loadPrompt('stage_6', 'stage6_planner');
 * if (prompt.source === 'database') {
 *   console.log(`Using database version ${prompt.version}`);
 * }
 * ```
 */
export async function loadPrompt(
  stage: PromptStage,
  promptKey: string
): Promise<PromptLoadResult> {
  logger.debug(
    { stage, promptKey },
    'Loading prompt template'
  );

  try {
    // Step 1: Always try loading from database first
    try {
      const dbPrompt = await loadPromptFromDatabase(stage, promptKey);

      if (dbPrompt) {
        logger.info(
          {
            stage,
            promptKey,
            version: dbPrompt.version,
            source: 'database',
          },
          'Loaded prompt from database'
        );
        return dbPrompt;
      }

      // dbPrompt is null - prompt not found in database, fallback to registry
      logger.debug(
        { stage, promptKey },
        'Prompt not found in database, falling back to hardcoded registry'
      );
    } catch (dbError) {
      // Database connection/query error - log and fallback to registry
      logger.warn(
        {
          stage,
          promptKey,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        },
        'Database error loading prompt, falling back to hardcoded registry'
      );
    }

    // Step 2: Fallback to hardcoded registry
    const hardcodedPrompt = loadPromptFromRegistry(stage, promptKey);

    if (!hardcodedPrompt) {
      throw new Error(
        `Prompt not found: stage=${stage}, promptKey=${promptKey} (checked both database and registry)`
      );
    }

    logger.info(
      { stage, promptKey, source: 'hardcoded' },
      'Loaded prompt from hardcoded registry'
    );

    return hardcodedPrompt;
  } catch (error) {
    logger.error(
      {
        stage,
        promptKey,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to load prompt'
    );
    throw error;
  }
}

/**
 * Reload prompt from database (force refresh, bypass cache)
 *
 * Useful for admin UI when prompts are updated.
 *
 * @param stage - Prompt stage
 * @param promptKey - Prompt key
 * @returns Database prompt or null if not found
 */
export async function reloadPromptFromDatabase(
  stage: PromptStage,
  promptKey: string
): Promise<PromptLoadResult | null> {
  return loadPromptFromDatabase(stage, promptKey);
}

/**
 * @deprecated No longer caches settings. Feature flag check removed.
 */
export function clearSettingsCache(): void {
  logger.debug('clearSettingsCache called (no-op - feature flags removed)');
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Load prompt from database (active version only)
 *
 * Queries `prompt_templates` table for active prompt matching stage and key.
 *
 * @param stage - Prompt stage
 * @param promptKey - Prompt key
 * @returns Prompt from database or null if not found
 * @throws Error if database query fails (not related to missing data)
 */
async function loadPromptFromDatabase(
  stage: PromptStage,
  promptKey: string
): Promise<PromptLoadResult | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('stage', stage)
    .eq('prompt_key', promptKey)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned (not found) - this is expected, return null for fallback
      logger.debug(
        { stage, promptKey },
        'Prompt not found in database (will use fallback)'
      );
      return null;
    }

    // All other errors are unexpected database/connection issues - throw to surface the problem
    logger.error(
      {
        stage,
        promptKey,
        errorCode: error.code,
        errorMessage: error.message,
      },
      'Database error loading prompt template'
    );
    throw new Error(
      `Database error loading prompt: ${error.message} (code: ${error.code})`
    );
  }

  if (!data) {
    return null;
  }

  const row = data as PromptTemplateRow;

  return {
    template: row.prompt_template,
    variables: row.variables,
    source: 'database',
    promptName: row.prompt_name,
    promptDescription: row.prompt_description || undefined,
    version: row.version,
  };
}

/**
 * Load prompt from hardcoded registry
 *
 * @param _stage - Prompt stage (not used, included for API consistency)
 * @param promptKey - Prompt key
 * @returns Prompt from registry or null if not found
 */
function loadPromptFromRegistry(
  _stage: PromptStage,
  promptKey: string
): PromptLoadResult | null {
  const hardcoded = PROMPT_REGISTRY.get(promptKey);

  if (!hardcoded) {
    return null;
  }

  return {
    template: hardcoded.promptTemplate,
    variables: hardcoded.variables,
    source: 'hardcoded',
    promptName: hardcoded.promptName,
    promptDescription: hardcoded.promptDescription,
  };
}

/**
 * List all available prompts (both database and hardcoded)
 *
 * Useful for admin UI to show all prompts.
 *
 * @returns Array of prompt keys with source information
 */
export async function listAvailablePrompts(): Promise<
  Array<{
    stage: PromptStage;
    promptKey: string;
    promptName: string;
    sources: Array<'database' | 'hardcoded'>;
    isActive?: boolean;
    version?: number;
  }>
> {
  const results = new Map<
    string,
    {
      stage: PromptStage;
      promptKey: string;
      promptName: string;
      sources: Array<'database' | 'hardcoded'>;
      isActive?: boolean;
      version?: number;
    }
  >();

  // Add hardcoded prompts
  for (const [key, prompt] of PROMPT_REGISTRY.entries()) {
    results.set(key, {
      stage: prompt.stage,
      promptKey: key,
      promptName: prompt.promptName,
      sources: ['hardcoded'],
    });
  }

  // Add database prompts (if available)
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('prompt_templates')
      .select('stage, prompt_key, prompt_name, is_active, version');

    if (!error && data) {
      for (const row of data) {
        const existing = results.get(row.prompt_key);
        if (existing) {
          // Add 'database' source
          existing.sources.push('database');
          existing.isActive = row.is_active;
          existing.version = row.version;
        } else {
          // Database-only prompt (not in hardcoded registry)
          results.set(row.prompt_key, {
            stage: row.stage as PromptStage,
            promptKey: row.prompt_key,
            promptName: row.prompt_name,
            sources: ['database'],
            isActive: row.is_active,
            version: row.version,
          });
        }
      }
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch database prompts for listing'
    );
  }

  return Array.from(results.values());
}
