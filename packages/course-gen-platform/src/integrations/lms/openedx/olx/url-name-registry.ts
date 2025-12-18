/**
 * URL Name Registry for OLX Elements
 * @module integrations/lms/openedx/olx/url-name-registry
 *
 * Tracks and generates unique url_name identifiers for Open edX OLX elements.
 * Ensures no duplicate identifiers within each element type scope.
 *
 * Open edX requires unique ASCII identifiers (url_name) for all course elements.
 * This registry converts display names (which may contain Cyrillic or other Unicode)
 * into unique ASCII identifiers with automatic collision resolution.
 */

import { transliterate } from '../utils/transliterate';

/**
 * Element types that require unique url_name identifiers in OLX
 *
 * - chapter: Top-level course sections (weeks/modules)
 * - sequential: Subsections within chapters (lessons/topics)
 * - vertical: Units within sequentials (pages/activities)
 * - html: HTML content components within verticals
 */
export type OlxElementType = 'chapter' | 'sequential' | 'vertical' | 'html';

/**
 * Registry for tracking unique url_name values within a course
 *
 * Maintains separate namespaces for each element type to ensure uniqueness.
 * Generates ASCII-only identifiers from display names using transliteration
 * and slugification, with automatic numeric suffixes for collision resolution.
 *
 * @example
 * ```typescript
 * const registry = new UrlNameRegistry();
 *
 * // Generate unique identifiers
 * const name1 = registry.generate('chapter', 'Введение в Python');
 * // Returns: "vvedenie_v_python"
 *
 * const name2 = registry.generate('chapter', 'Введение в Python');
 * // Returns: "vvedenie_v_python_1" (automatic collision resolution)
 *
 * // Check if identifier exists
 * registry.has('chapter', 'vvedenie_v_python'); // true
 *
 * // Get count of registered names
 * registry.count('chapter'); // 2
 * ```
 */
export class UrlNameRegistry {
  /**
   * Internal storage for registered url_names
   * Separate Set for each element type ensures namespace isolation
   */
  private used: Map<OlxElementType, Set<string>> = new Map();

  /**
   * Initialize registry with empty sets for each element type
   */
  constructor() {
    this.used.set('chapter', new Set());
    this.used.set('sequential', new Set());
    this.used.set('vertical', new Set());
    this.used.set('html', new Set());
  }

  /**
   * Generate a unique url_name for given element type
   *
   * Process:
   * 1. Transliterate Unicode (Cyrillic, Arabic, CJK, etc.) to ASCII
   * 2. Slugify: convert to lowercase, replace invalid chars with underscores
   * 3. Ensure uniqueness by adding numeric suffix if needed
   *
   * The base name is limited to 40 characters to leave room for numeric
   * suffixes while staying under the 100-character Open edX limit.
   *
   * @param elementType - Type of OLX element (chapter, sequential, vertical, html)
   * @param input - Display name (may contain Unicode characters)
   * @returns ASCII-only url_name, unique within element type namespace
   *
   * @throws {Error} If elementType is unknown
   * @throws {Error} If more than 10,000 collisions occur (safety limit)
   *
   * @example
   * ```typescript
   * // Cyrillic input
   * registry.generate('chapter', 'Введение')
   * // Returns: "vvedenie"
   *
   * // Arabic input
   * registry.generate('sequential', 'مقدمة')
   * // Returns: "mqdm"
   *
   * // Special characters
   * registry.generate('vertical', 'Hello, World!')
   * // Returns: "hello_world"
   *
   * // Empty input
   * registry.generate('html', '')
   * // Returns: "item"
   *
   * // Collision resolution
   * registry.generate('chapter', 'Test')
   * // Returns: "test"
   * registry.generate('chapter', 'Test')
   * // Returns: "test_1"
   * registry.generate('chapter', 'Test')
   * // Returns: "test_2"
   * ```
   */
  generate(elementType: OlxElementType, input: string): string {
    const set = this.used.get(elementType);
    if (!set) {
      throw new Error(`Unknown element type: ${elementType}`);
    }

    // Step 1: Transliterate Unicode to ASCII
    const ascii = transliterate(input);

    // Step 2: Slugify
    // - Convert to lowercase
    // - Replace any non-alphanumeric characters (except hyphens) with underscores
    // - Collapse multiple underscores into one
    // - Remove leading/trailing underscores
    // - Limit to 40 characters for base name (leaves room for suffixes)
    const base = ascii
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')    // Replace invalid chars
      .replace(/_+/g, '_')             // Collapse multiple underscores
      .replace(/^_|_$/g, '')           // Trim leading/trailing underscores
      .slice(0, 40);                   // Limit base to 40 chars (max 100 total with suffix)

    // Step 3: Ensure uniqueness with numeric suffix
    // If base is empty after slugification, use default 'item'
    let candidate = base || 'item';
    let counter = 1;

    // Check for collisions and add numeric suffix if needed
    while (set.has(candidate)) {
      candidate = `${base || 'item'}_${counter}`;
      counter++;

      // Safety limit to prevent infinite loops
      if (counter > 10000) {
        throw new Error(`Too many duplicate url_names for base: ${base || 'item'}`);
      }
    }

    // Register the new url_name
    set.add(candidate);
    return candidate;
  }

  /**
   * Check if url_name is already registered for given element type
   *
   * @param elementType - Type of OLX element
   * @param urlName - URL name to check
   * @returns true if url_name is already registered
   *
   * @example
   * ```typescript
   * registry.generate('chapter', 'Test');
   * registry.has('chapter', 'test'); // true
   * registry.has('chapter', 'other'); // false
   * registry.has('sequential', 'test'); // false (different namespace)
   * ```
   */
  has(elementType: OlxElementType, urlName: string): boolean {
    return this.used.get(elementType)?.has(urlName) ?? false;
  }

  /**
   * Get count of registered url_names for element type
   *
   * @param elementType - Type of OLX element
   * @returns Number of registered url_names
   *
   * @example
   * ```typescript
   * registry.count('chapter'); // 0
   * registry.generate('chapter', 'Test');
   * registry.count('chapter'); // 1
   * ```
   */
  count(elementType: OlxElementType): number {
    return this.used.get(elementType)?.size ?? 0;
  }

  /**
   * Clear all registered url_names
   *
   * Useful for testing or resetting the registry between course generations.
   *
   * @example
   * ```typescript
   * registry.count('chapter'); // 5
   * registry.clear();
   * registry.count('chapter'); // 0
   * ```
   */
  clear(): void {
    this.used.forEach((set) => set.clear());
  }

  /**
   * Get all registered url_names for element type
   *
   * Returns a copy of the registered names for debugging or analysis.
   *
   * @param elementType - Type of OLX element
   * @returns Array of registered url_names
   *
   * @example
   * ```typescript
   * registry.generate('chapter', 'Intro');
   * registry.generate('chapter', 'Advanced');
   * registry.getAll('chapter');
   * // Returns: ['intro', 'advanced']
   * ```
   */
  getAll(elementType: OlxElementType): string[] {
    return Array.from(this.used.get(elementType) ?? []);
  }
}
