/**
 * Smart Context Router - Rule-based tier detection for regeneration requests
 *
 * Analyzes user instructions to determine the appropriate context tier (atomic, local,
 * structural, global) using keyword pattern matching with support for multilingual input.
 *
 * Each tier corresponds to different token budgets and context assembly strategies:
 * - atomic: Small fixes (typos, grammar) - 300 tokens total
 * - local: Localized changes (tone, length) - 1000 tokens total
 * - structural: Reorganization (complexity, level) - 2500 tokens total
 * - global: Complete rewrites (style, redesign) - 5000 tokens total
 *
 * @module smart-context-router
 */

import { logger } from '@/shared/logger';
import { ContextTier, TIER_TOKEN_BUDGETS } from '@megacampus/shared-types/regeneration-types';

/**
 * Keyword patterns for each context tier.
 *
 * Patterns are matched case-insensitively and support both English and Russian.
 * The first matching tier is returned, so order matters (atomic → local → structural → global).
 */
const TIER_PATTERNS: Record<ContextTier, string[]> = {
  /**
   * Atomic tier: Minimal edits that don't change meaning
   * - Typo corrections
   * - Spelling/grammar fixes
   * - Punctuation adjustments
   */
  atomic: [
    // English
    'typo',
    'fix',
    'correct',
    'spelling',
    'grammar',
    'punctuation',
    'capitalize',
    'lowercase',
    'uppercase',
    'remove space',
    'add space',
    'fix formatting',
    // Russian
    'опечатка',
    'исправь',
    'исправить',
    'орфография',
    'грамматика',
    'пунктуация',
    'заглавная',
    'строчная',
  ],

  /**
   * Local tier: Content changes within a single block
   * - Simplification/expansion
   * - Tone adjustments
   * - Rephrasing without structural changes
   */
  local: [
    // English - multi-word patterns first (more specific)
    'more formal',
    'less formal',
    'more professional',
    'explain better',
    'make clearer',
    // English - single word patterns
    'simplify',
    'expand',
    'shorten',
    'lengthen',
    'tone',
    'rephrase',
    'reword',
    'clarify',
    'friendlier',
    'casual',
    'concise',
    'detailed',
    // Russian
    'упрости',
    'упростить',
    'расширь',
    'расширить',
    'сократи',
    'сократить',
    'тон',
    'перефразируй',
    'перефразировать',
    'яснее',
    'понятнее',
    'формальнее',
    'неформальнее',
    'дружелюбнее',
    'профессиональнее',
    'подробнее',
  ],

  /**
   * Structural tier: Changes affecting pedagogical structure
   * - Complexity adjustments
   * - Audience targeting
   * - Reorganization
   * - Level changes
   */
  structural: [
    // English - multi-word patterns first (more specific)
    'for students',
    'for professionals',
    'for kids',
    'for beginners',
    'change order',
    'change the order',
    'more complex',
    'less complex',
    'adapt for',
    'target for',
    'make this for',
    // English - single word patterns
    'complexity',
    'level',
    'audience',
    'structure',
    'reorganize',
    'reorder',
    'beginner',
    'intermediate',
    'advanced',
    'easier',
    'harder',
    'restructure',
    'rearrange',
    // Russian
    'сложность',
    'уровень',
    'аудитория',
    'структура',
    'реорганизуй',
    'реорганизовать',
    'переупорядочить',
    'начинающий',
    'для начинающих',
    'продвинутый',
    'легче',
    'сложнее',
    'для студентов',
    'для профессионалов',
    'для детей',
    'изменить порядок',
  ],

  /**
   * Global tier: Complete overhauls
   * - Style changes
   * - Complete rewrites
   * - Redesigns
   */
  global: [
    // English
    'rewrite',
    'style',
    'complete',
    'redesign',
    'overhaul',
    'rebuild',
    'recreate',
    'start over',
    'completely change',
    'different style',
    'new approach',
    'totally different',
    'from scratch',
    // Russian
    'переписать',
    'переписать полностью',
    'стиль',
    'полностью',
    'перепроектировать',
    'пересоздать',
    'заново',
    'с нуля',
    'полностью изменить',
    'другой стиль',
    'новый подход',
  ],
};

/**
 * Detects the appropriate context tier based on user instruction.
 *
 * Uses keyword pattern matching to classify the instruction. Patterns are checked
 * in order (atomic → local → structural → global), and the first match is returned.
 *
 * Default behavior: If no patterns match, returns 'local' tier (safest default for
 * most editing operations).
 *
 * @param instruction - User's regeneration instruction (any language)
 * @returns Detected context tier
 *
 * @example
 * ```typescript
 * detectContextTier("Fix typo in first paragraph") // → 'atomic'
 * detectContextTier("Make this more formal") // → 'local'
 * detectContextTier("Restructure for beginner audience") // → 'structural'
 * detectContextTier("Completely rewrite this") // → 'global'
 * detectContextTier("Исправь опечатку") // → 'atomic' (Russian)
 * ```
 */
export function detectContextTier(instruction: string): ContextTier {
  const lowerInstruction = instruction.toLowerCase().trim();

  // Check each tier's patterns in order
  for (const tier of ['atomic', 'local', 'structural', 'global'] as const) {
    const patterns = TIER_PATTERNS[tier];
    const matched = patterns.some((pattern) => lowerInstruction.includes(pattern));

    if (matched) {
      logger.debug({
        msg: 'Context tier detected',
        tier,
        instruction: instruction.slice(0, 100), // Log first 100 chars only
        matchedPattern: patterns.find((p) => lowerInstruction.includes(p)),
      });
      return tier;
    }
  }

  // Default fallback: local tier (safest for most edits)
  logger.debug({
    msg: 'No tier pattern matched, defaulting to local',
    instruction: instruction.slice(0, 100),
  });

  return 'local';
}

/**
 * Retrieves token budget configuration for a given context tier.
 *
 * Token budgets control how much context and target content can be included:
 * - `target`: Max tokens for the regenerated content
 * - `context`: Max tokens for surrounding/related context
 * - `total`: Combined max tokens for the entire prompt
 *
 * @param tier - Context tier (atomic | local | structural | global)
 * @returns Token budget configuration
 *
 * @example
 * ```typescript
 * const budget = getTokenBudget('atomic');
 * // { target: 200, context: 100, total: 300 }
 *
 * const budget = getTokenBudget('global');
 * // { target: 2000, context: 3000, total: 5000 }
 * ```
 */
export function getTokenBudget(tier: ContextTier): { target: number; context: number; total: number } {
  return TIER_TOKEN_BUDGETS[tier];
}

/**
 * Re-export tier patterns for testing/debugging purposes.
 * @internal
 */
export const _TIER_PATTERNS = TIER_PATTERNS;
