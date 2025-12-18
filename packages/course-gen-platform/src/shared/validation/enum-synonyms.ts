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

  // primary_strategy
  primary_strategy: {
    'problem based learning': 'problem-based learning',
    'lecture based': 'lecture-based',
    'inquiry based': 'inquiry-based',
    'project based': 'project-based',
  },

  // target_audience
  target_audience: {
    'entry-level': 'beginner',
    'entry_level': 'beginner',
    'novice': 'beginner',
    'expert': 'advanced',
    'professional': 'advanced',
  },

  // difficulty_level
  difficulty_level: {
    'easy': 'beginner',
    'medium': 'intermediate',
    'hard': 'advanced',
    'expert': 'advanced',
  },

  // importance (sections_breakdown.importance: 'core' | 'important' | 'optional')
  // LLMs often confuse this with difficulty enum values
  importance: {
    'advanced': 'important', // Misuse of difficulty value
    'intermediate': 'important', // Misuse of difficulty value
    'beginner': 'core', // Misuse of difficulty value
    'high': 'core',
    'medium': 'important',
    'low': 'optional',
    'critical': 'core',
    'essential': 'core',
    'main': 'core',
    'primary': 'core',
    'secondary': 'important',
    'supplementary': 'optional',
    'extra': 'optional',
    'bonus': 'optional',
  },

  // bloom_level (cognitiveLevel)
  cognitiveLevel: {
    'recall': 'remember',
    'comprehend': 'understand',
    'apply_knowledge': 'apply',
    'analyse': 'analyze', // UK spelling
    'synthesis': 'create',
  },

  // Add more mappings as discovered from logs
};
