/**
 * XML Character Escaping Utilities
 * @module integrations/lms/openedx/utils/xml-escape
 *
 * Provides functions for escaping and unescaping special XML characters
 * to prevent XML injection and ensure valid OLX (Open Learning XML) content.
 */

/**
 * Map of XML special characters to their entity equivalents
 */
const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * Reverse map for unescaping XML entities
 */
const XML_UNESCAPE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/**
 * Escape special XML characters in a string
 *
 * Converts the five XML special characters (&, <, >, ", ') to their
 * corresponding XML entities to prevent injection and ensure valid XML.
 *
 * @param input - String to escape
 * @returns Escaped string safe for use in XML content
 *
 * @example
 * ```typescript
 * xmlEscape("Tom & Jerry")
 * // Returns: "Tom &amp; Jerry"
 *
 * xmlEscape("<script>alert('xss')</script>")
 * // Returns: "&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;"
 *
 * xmlEscape('He said "Hello"')
 * // Returns: "He said &quot;Hello&quot;"
 *
 * xmlEscape("")
 * // Returns: ""
 * ```
 */
export function xmlEscape(input: string): string {
  if (!input || input.length === 0) {
    return '';
  }

  return input.replace(/[&<>"']/g, (char) => XML_ESCAPE_MAP[char] || char);
}

/**
 * Unescape XML entities back to their original characters
 *
 * Converts XML entities (&amp;, &lt;, &gt;, &quot;, &apos;) back to their
 * original characters (&, <, >, ", ').
 *
 * @param input - String with XML entities to unescape
 * @returns Unescaped string with original characters
 *
 * @example
 * ```typescript
 * xmlUnescape("Tom &amp; Jerry")
 * // Returns: "Tom & Jerry"
 *
 * xmlUnescape("&lt;div&gt;Hello&lt;/div&gt;")
 * // Returns: "<div>Hello</div>"
 *
 * xmlUnescape("")
 * // Returns: ""
 * ```
 */
export function xmlUnescape(input: string): string {
  if (!input || input.length === 0) {
    return '';
  }

  return input.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_UNESCAPE_MAP[entity] || entity);
}

/**
 * Escape string for safe use in XML attribute values
 *
 * Similar to xmlEscape but specifically designed for attribute values.
 * Ensures double quotes are escaped to prevent attribute value breakout.
 *
 * @param input - String to escape for attribute value
 * @returns Escaped string safe for use in XML attribute values
 *
 * @example
 * ```typescript
 * escapeForAttribute('Display "Name"')
 * // Returns: "Display &quot;Name&quot;"
 *
 * const xml = `<chapter display_name="${escapeForAttribute(name)}">`
 * ```
 */
export function escapeForAttribute(input: string): string {
  // For attributes, we need to escape the same characters as xmlEscape
  // Double quotes are particularly important for attribute values
  return xmlEscape(input);
}

/**
 * Check if a string contains any unescaped XML special characters
 *
 * Useful for validation to ensure strings have been properly escaped.
 *
 * @param input - String to check
 * @returns true if string contains unescaped XML special characters
 *
 * @example
 * ```typescript
 * hasUnescapedXmlChars("Tom & Jerry")
 * // Returns: true
 *
 * hasUnescapedXmlChars("Tom &amp; Jerry")
 * // Returns: false
 *
 * hasUnescapedXmlChars("Hello World")
 * // Returns: false
 * ```
 */
export function hasUnescapedXmlChars(input: string): boolean {
  if (!input || input.length === 0) {
    return false;
  }

  // Check for unescaped special characters
  // We need to exclude already-escaped entities
  const tempEscaped = input.replace(/&(?:amp|lt|gt|quot|apos);/g, '');
  return /[&<>"']/.test(tempEscaped);
}
