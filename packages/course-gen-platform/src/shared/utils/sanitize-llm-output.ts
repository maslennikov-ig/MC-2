/**
 * LLM Output Sanitization Utility
 *
 * Provides HTML/XSS sanitization for LLM-generated text to prevent
 * security vulnerabilities when displaying content to users.
 *
 * **Security Context**:
 * LLM outputs (contextual_language, scope_instructions, etc.) are stored
 * in the database and displayed to users. Without sanitization, malicious
 * users could inject JavaScript or HTML that executes in other users' browsers.
 *
 * **Allowed Tags**:
 * Only basic formatting tags are allowed: b, i, em, strong, p, br
 * No attributes are allowed on any tags (prevents onclick, onerror, etc.)
 *
 * **Usage**:
 * Apply sanitization in phase-5-assembly.ts before storing to database.
 * This ensures all LLM outputs are safe before reaching the frontend.
 *
 * @module sanitize-llm-output
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Create DOMPurify instance for Node.js environment
 *
 * DOMPurify requires a window object, which doesn't exist in Node.js.
 * We use jsdom to create a minimal DOM environment.
 */
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Sanitize LLM-generated text to prevent XSS attacks
 *
 * Removes all potentially dangerous HTML/JavaScript while preserving
 * basic text formatting (bold, italic, paragraphs, line breaks).
 *
 * **Allowed Tags**: b, i, em, strong, p, br
 * **Allowed Attributes**: NONE (all attributes stripped)
 *
 * **Examples**:
 * - Clean text: "Hello world" → "Hello world" (unchanged)
 * - Allowed formatting: "<b>bold</b>" → "<b>bold</b>" (preserved)
 * - XSS attempt: "<script>alert('XSS')</script>" → "" (removed)
 * - Event handlers: "<p onclick='evil()'>text</p>" → "<p>text</p>" (attribute removed)
 * - Dangerous tags: "<iframe src='evil'></iframe>" → "" (removed)
 *
 * @param text - Raw LLM-generated text (may contain HTML)
 * @returns Sanitized text safe for display in browser
 *
 * @example
 * // Clean text (no change)
 * sanitizeLLMOutput("Этот курс научит вас основам закупок");
 * // Returns: "Этот курс научит вас основам закупок"
 *
 * @example
 * // Allowed formatting (preserved)
 * sanitizeLLMOutput("Вы освоите <b>практические навыки</b>");
 * // Returns: "Вы освоите <b>практические навыки</b>"
 *
 * @example
 * // XSS attack (blocked)
 * sanitizeLLMOutput("<script>alert('XSS')</script>Текст");
 * // Returns: "Текст"
 *
 * @example
 * // Event handler (stripped)
 * sanitizeLLMOutput("<p onclick='stealData()'>Опасный текст</p>");
 * // Returns: "<p>Опасный текст</p>"
 *
 * @example
 * // Dangerous tag (removed)
 * sanitizeLLMOutput("Текст<iframe src='http://evil.com'></iframe>");
 * // Returns: "Текст"
 */
export function sanitizeLLMOutput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return purify.sanitize(text, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep text content even if tags are removed
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Sanitize multiple LLM text fields in an object
 *
 * Convenience function for sanitizing multiple fields at once.
 * Useful for sanitizing entire objects before database storage.
 *
 * @param fields - Object with field names and text values
 * @returns Object with same keys but sanitized values
 *
 * @example
 * sanitizeLLMFields({
 *   contextual_language: "Вы <b>научитесь</b> <script>alert('xss')</script>",
 *   scope_instructions: "Создайте курс о <em>закупках</em>",
 * });
 * // Returns: {
 * //   contextual_language: "Вы <b>научитесь</b> ",
 * //   scope_instructions: "Создайте курс о <em>закупках</em>",
 * // }
 */
export function sanitizeLLMFields(
  fields: Record<string, string | null | undefined>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value) {
      sanitized[key] = sanitizeLLMOutput(value);
    } else {
      sanitized[key] = '';
    }
  }

  return sanitized;
}

/**
 * Check if text contains potentially dangerous HTML
 *
 * This is a diagnostic function to detect if sanitization removed content.
 * Useful for logging/monitoring sanitization in production.
 *
 * @param original - Original text
 * @param sanitized - Sanitized text
 * @returns True if sanitization removed content (potential XSS attempt)
 *
 * @example
 * const original = "Text<script>alert('xss')</script>";
 * const sanitized = sanitizeLLMOutput(original);
 * const wasDangerous = hasDangerousContent(original, sanitized);
 * // Returns: true (script tag was removed)
 */
export function hasDangerousContent(original: string, sanitized: string): boolean {
  return original.length > sanitized.length;
}
