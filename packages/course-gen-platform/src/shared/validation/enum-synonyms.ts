/**
 * Synonym mappings for all enum fields
 *
 * Maps semantically equivalent values to canonical enum values.
 * Based on research and production failure logs.
 *
 * @module shared/validation/enum-synonyms
 * @see docs/investigations/INV-2025-11-19-007-preprocessing-semantic-validation.md
 */

export const ENUM_SYNONYMS: Record<string, Record<string, string>> = {
  // REMOVED 2025-11-19: exercise_types and exercise_type are now freeform text fields
  // See: docs/investigations/INV-2025-11-19-002-exercise-type-enum-to-text-migration.md
  // Legacy mappings preserved in git history if needed for rollback

  // target_audience
  target_audience: {
    'entry-level': 'beginner',
    entry_level: 'beginner',
    novice: 'beginner',
    expert: 'advanced',
    professional: 'advanced',
  },

  // difficulty_level
  difficulty_level: {
    easy: 'beginner',
    medium: 'intermediate',
    hard: 'advanced',
    expert: 'advanced',
  },

  // difficulty (alias for difficulty_level - used in sections_breakdown)
  difficulty: {
    easy: 'beginner',
    medium: 'intermediate',
    hard: 'advanced',
    expert: 'advanced',
  },

  // importance (sections_breakdown.importance: 'simple' | 'normal' | 'complex')
  // LLMs often confuse this with difficulty enum values
  importance: {
    // Backward compat: old enum values → new
    core: 'complex',
    important: 'normal',
    optional: 'simple',
    // LLM synonym mappings (remapped to new values)
    advanced: 'normal',
    intermediate: 'normal',
    beginner: 'complex', // LLMs confuse difficulty with importance
    high: 'complex',
    medium: 'normal',
    low: 'simple',
    critical: 'complex',
    essential: 'complex',
    main: 'complex',
    primary: 'complex',
    secondary: 'normal',
    supplementary: 'simple',
    extra: 'simple',
    bonus: 'simple',
  },

  // Add more mappings as discovered from logs
};
