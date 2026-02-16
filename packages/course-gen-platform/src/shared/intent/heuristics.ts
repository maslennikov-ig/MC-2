/**
 * Tier 0: Regex-based Intent Heuristics
 *
 * Fast, zero-cost intent classification using pattern matching.
 * Covers ~40-50% of common user messages in both Russian and English.
 * Returns null if no pattern matches (falls through to Tier 1 LLM).
 *
 * Important: Tier 0 handles intents only when required slots can be extracted
 * deterministically from regex captures. Ambiguous MOVE/UPDATE requests fall
 * through to Tier 1 LLM for richer slot extraction.
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
  /** Optional capture-based payload extractor for slots like destination/newValue */
  buildIntent?: (match: RegExpMatchArray, userMessage: string) => Partial<ClassifiedIntent>;
}

/**
 * Ordered list of heuristic rules.
 * More specific patterns come first to avoid false positives.
 *
 * Some MOVE/UPDATE variants are included only for explicit patterns with
 * parsable target/destination/field/value.
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
    pattern: /(?:удали|убери|убрать|удалить|delete|remove)\s+(?:урок|lesson)/i,
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
  {
    pattern: /(?:удали|убери|убрать|удалить|delete|remove)\s+(?:секци[юя]|section|раздел)/i,
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

  // --- MOVE ---
  {
    pattern: /(?:перенеси|перемести|move)\s+(.+?)\s+(?:в|во|to|into|после|after)\s+(.+)/i,
    intent: 'MOVE_ELEMENT',
    confidence: 0.85,
    buildIntent: match => ({
      target: { identifier: match[1].trim() },
      destination: match[2].trim(),
    }),
  },

  // --- UPDATE_FIELD ---
  // Path-like updates only (safe Tier 0 extraction).
  // Natural language updates still fall through to Tier 1 LLM.
  {
    pattern: /(?:set|update|change)\s+([a-z0-9_.[\]]+)\s+(?:to)\s+(.+)/i,
    intent: 'UPDATE_FIELD',
    confidence: 0.85,
    buildIntent: match => ({
      fieldName: match[1].trim(),
      newValue: parseHeuristicValue(match[2]),
    }),
  },
  {
    pattern: /(?:измени|обнови)\s+([a-z0-9_.[\]]+)\s+(?:на)\s+(.+)/i,
    intent: 'UPDATE_FIELD',
    confidence: 0.85,
    buildIntent: match => ({
      fieldName: match[1].trim(),
      newValue: parseHeuristicValue(match[2]),
    }),
  },
];

/**
 * Detects element-type words (урок, секция, lesson, section, etc.) in the message.
 * Used to guard FULL_REGENERATE: "перепиши весь урок" is NOT a full course regen,
 * it's a qualified scope (весь + урок). Fall through to Tier 1 LLM for precision.
 */
const ELEMENT_TYPE_PATTERN = /(?:урок[а-яё]*|секци[а-яё]*|раздел[а-яё]*|lessons?|sections?)/i;

function parseHeuristicValue(raw: string): unknown {
  const trimmed = raw.trim();
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');

  if (/^(true|false)$/i.test(unquoted)) {
    return unquoted.toLowerCase() === 'true';
  }

  if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }

  const isJsonLike =
    (unquoted.startsWith('{') && unquoted.endsWith('}')) ||
    (unquoted.startsWith('[') && unquoted.endsWith(']'));

  if (isJsonLike) {
    try {
      return JSON.parse(unquoted);
    } catch {
      // Fall through to string if parse fails
    }
  }

  return unquoted;
}

/**
 * Classify user intent using regex heuristics (Tier 0).
 *
 * @param userMessage - User's chat message
 * @returns ClassifiedIntent if a pattern matches, null otherwise
 */
export function classifyWithHeuristics(userMessage: string): ClassifiedIntent | null {
  const trimmed = userMessage.trim();

  for (const rule of HEURISTIC_RULES) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      // Guard: scope words + element type ≠ full course regeneration.
      // "перепиши весь урок" / "regenerate all lessons" → Tier 1 LLM decides.
      if (rule.intent === 'FULL_REGENERATE' && ELEMENT_TYPE_PATTERN.test(trimmed)) {
        continue;
      }

      const baseResult: ClassifiedIntent = {
        intent: rule.intent,
        confidence: rule.confidence,
        // For target-dependent intents, pass the full message as identifier
        // so downstream resolvers can extract "урок 2.3", titles, etc.
        ...(rule.needsTarget ? { target: { identifier: trimmed } } : {}),
      };

      if (rule.buildIntent) {
        return {
          ...baseResult,
          ...rule.buildIntent(match, trimmed),
        };
      }

      return baseResult;
    }
  }

  return null;
}
