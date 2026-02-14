/**
 * Tier 0: Regex-based Intent Heuristics
 *
 * Fast, zero-cost intent classification using pattern matching.
 * Covers ~40-50% of common user messages in both Russian and English.
 * Returns null if no pattern matches (falls through to Tier 1 LLM).
 *
 * Important: Only intents that DON'T require structured slots (target, destination,
 * fieldName, newValue) can be handled here. MOVE_ELEMENT and UPDATE_FIELD need
 * Tier 1 LLM to extract all required slots. DELETE_* needs target.identifier
 * which we provide from the full user message.
 *
 * @module intent/heuristics
 */

import type { ClassifiedIntent } from './classifier';

interface HeuristicRule {
  pattern: RegExp;
  intent: ClassifiedIntent['intent'];
  confidence: number;
  /** If true, pass user message as target.identifier for downstream resolution */
  needsTarget?: boolean;
}

/**
 * Ordered list of heuristic rules.
 * More specific patterns come first to avoid false positives.
 *
 * NOT included (require Tier 1 LLM for slot extraction):
 * - MOVE_ELEMENT: needs `destination` slot
 * - UPDATE_FIELD: needs `fieldName` + `newValue` slots
 */
const HEURISTIC_RULES: HeuristicRule[] = [
  // --- FULL_REGENERATE ---
  // Only match phrases that clearly indicate regenerating the WHOLE course.
  // Bare "regenerate" / "перегенерируй" without scope modifiers must fall through
  // to Tier 1 LLM to distinguish "regenerate everything" from "regenerate this field".
  {
    pattern:
      /(?:полностью\s+(?:перегенерир[а-яё]*|переделай)|(?:перегенерир[а-яё]*|переделай)\s+(?:весь|всю|всё|все|целиком)(?:\s|$)|(?:перегенерир[а-яё]*|переделай)\s+курс|перепиши\s+(?:весь|всё|все)|сгенерируй\s+заново|regenerate\s+(?:the\s+)?(?:whole|entire|full|everything|all|course)(?:\s|$)|redo\s+(?:the\s+)?(?:whole|entire)|start\s+over)/i,
    intent: 'FULL_REGENERATE',
    confidence: 0.95,
  },

  // --- DELETE ---
  {
    pattern:
      /(?:удали|убери|убрать|удалить|delete|remove)\s+(?:урок|lesson|секци[юя]|section|раздел)/i,
    intent: 'DELETE_LESSON',
    confidence: 0.9,
    needsTarget: true,
  },
  {
    pattern:
      /(?:удали|убери|убрать|удалить|delete|remove)\s+(?:последн(?:ий|юю)|первую|первый|last|first)\s+(?:секци[юя]|section|раздел)/i,
    intent: 'DELETE_SECTION',
    confidence: 0.9,
    needsTarget: true,
  },

  // --- GET_INFO ---
  {
    pattern:
      /(?:сколько|скольк[ои]|сколько\s+всего|how\s+many|count|количество)\s+(?:уроков|lessons|секци[йи]|sections|разделов)/i,
    intent: 'GET_INFO',
    confidence: 0.95,
  },
  {
    pattern:
      /(?:покажи|показать|список|перечисли|list|show)\s+(?:все\s+)?(?:уроки|lessons|секции|sections|разделы)/i,
    intent: 'GET_INFO',
    confidence: 0.85,
  },

  // --- ADD ---
  {
    pattern: /(?:добавь|добавить|add)\s+(?:новый\s+)?(?:урок|lesson)/i,
    intent: 'ADD_LESSON',
    confidence: 0.9,
  },
  {
    pattern: /(?:добавь|добавить|add)\s+(?:нов(?:ую|ый)\s+)?(?:секци[юя]|section|раздел)/i,
    intent: 'ADD_SECTION',
    confidence: 0.9,
  },
];

/**
 * Detects element-type words (урок, секция, lesson, section, etc.) in the message.
 * Used to guard FULL_REGENERATE: "перепиши весь урок" is NOT a full course regen,
 * it's a qualified scope (весь + урок). Fall through to Tier 1 LLM for precision.
 */
const ELEMENT_TYPE_PATTERN = /(?:урок[а-яё]*|секци[а-яё]*|раздел[а-яё]*|lessons?|sections?)/i;

/**
 * Classify user intent using regex heuristics (Tier 0).
 *
 * @param userMessage - User's chat message
 * @returns ClassifiedIntent if a pattern matches, null otherwise
 */
export function classifyWithHeuristics(userMessage: string): ClassifiedIntent | null {
  const trimmed = userMessage.trim();

  for (const rule of HEURISTIC_RULES) {
    if (rule.pattern.test(trimmed)) {
      // Guard: scope words + element type ≠ full course regeneration.
      // "перепиши весь урок" / "regenerate all lessons" → Tier 1 LLM decides.
      if (rule.intent === 'FULL_REGENERATE' && ELEMENT_TYPE_PATTERN.test(trimmed)) {
        continue;
      }

      return {
        intent: rule.intent,
        confidence: rule.confidence,
        // For target-dependent intents, pass the full message as identifier
        // so downstream resolvers can extract "урок 2.3", titles, etc.
        ...(rule.needsTarget ? { target: { identifier: trimmed } } : {}),
      };
    }
  }

  return null;
}
