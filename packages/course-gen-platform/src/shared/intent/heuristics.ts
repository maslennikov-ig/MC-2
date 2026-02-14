/**
 * Tier 0: Regex-based Intent Heuristics
 *
 * Fast, zero-cost intent classification using pattern matching.
 * Covers ~40-50% of common user messages in both Russian and English.
 * Returns null if no pattern matches (falls through to Tier 1 LLM).
 *
 * @module intent/heuristics
 */

import type { ClassifiedIntent } from './classifier';

interface HeuristicRule {
  pattern: RegExp;
  intent: ClassifiedIntent['intent'];
  confidence: number;
  /** If true, the rule needs target resolution — pass user message as identifier */
  needsTarget?: boolean;
}

/**
 * Ordered list of heuristic rules.
 * More specific patterns come first to avoid false positives.
 */
const HEURISTIC_RULES: HeuristicRule[] = [
  // --- FULL_REGENERATE ---
  {
    pattern:
      /(?:полностью\s+)?(?:перегенерир|переделай|перепиши\s+(?:весь|всё|все)|сгенерируй\s+заново|regenerate|redo\s+(?:the\s+)?(?:whole|entire)|start\s+over)/i,
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

  // --- UPDATE_FIELD (rename) ---
  {
    pattern:
      /(?:измени|изменить|переименуй|rename|change)\s+(?:название|имя|заголовок|title|name)\s+(?:курса|course)/i,
    intent: 'UPDATE_FIELD',
    confidence: 0.9,
    needsTarget: true,
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

  // --- MOVE ---
  {
    pattern: /(?:перемести|передвинь|move|перенеси)\s+(?:урок|lesson|секци[юя]|section|раздел)/i,
    intent: 'MOVE_ELEMENT',
    confidence: 0.85,
    needsTarget: true,
  },
];

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
