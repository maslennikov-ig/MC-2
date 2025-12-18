/**
 * Placeholder Validator
 *
 * Validates course structure for placeholder content that indicates
 * incomplete generation (TODO markers, template variables, etc.)
 *
 * RT-007 Phase 1: Conservative detection to reduce false positives
 * - Only detects EXPLICIT placeholders (TODO, [insert...], {{variable}})
 * - Does NOT block legitimate brackets like [array] or <generic> types
 * - Does NOT block mid-sentence ellipsis
 *
 * RT-007 Phase 3: Severity-based categorization
 * - TODO/FIXME/XXX: ERROR (blocks - explicitly incomplete)
 * - Bracketed placeholders: WARNING (logs - may have false positives)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md
 */

import { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';

/**
 * RT-007 P1: Conservative placeholder patterns
 *
 * Only matches EXPLICIT placeholders to avoid false positives.
 *
 * Changes from RT-006:
 * - Removed: /\[.*?\]/ (too aggressive, caught [array], [object])
 * - Removed: /<.*?>/ (caught TypeScript generics like <number>)
 * - Removed: /\.{3,}/ at any position (caught mid-sentence ellipsis)
 * - Added: Specific patterns like [TODO], [insert...], [add...]
 * - Added: Language-specific patterns (Russian: [название], [описание])
 */
const PLACEHOLDER_PATTERNS = [
  // ✅ TODO/FIXME markers (block always)
  // RT-007 P4: Removed NOTE - legitimate word in educational content ("Note: important info")
  /\b(TODO|FIXME|XXX|HACK)\b/i,

  // ✅ Only explicit bracketed placeholders
  /\[TODO\]/i,
  /\[TBD\]/i,
  /\[FIXME\]/i,
  /\[insert[^\]]*\]/i,      // [insert ...], [insert topic]
  /\[add[^\]]*\]/i,         // [add content]
  /\[replace[^\]]*\]/i,     // [replace ...]
  /\[название[^\]]*\]/i,    // Russian: [название ...]
  /\[описание[^\]]*\]/i,    // Russian: [описание ...]
  /\[введите[^\]]*\]/i,     // Russian: [введите ...]
  /\[добавьте[^\]]*\]/i,    // Russian: [добавьте ...]

  // ❌ REMOVED: /\[.*?\]/ (too aggressive)
  // ❌ REMOVED: /<.*?>/ (catches TypeScript generics)

  // ✅ Template variables (only double braces)
  /\{\{[^}]+\}\}/,          // {{variable}} - explicit template
  /\$\{[^}]+\}/,            // ${variable} - explicit template

  // ✅ Ellipsis indicators (only at start or isolated)
  /^\.\.\.$|^\.\.\.\s/,     // "..." at line start only
  /…$/,                      // Unicode ellipsis at end

  // ✅ Generic placeholders (only with context)
  /\b(example|sample|placeholder|пример|образец)\s+(title|name|description|text|название|текст)\b/i,

  // ✅ Empty or whitespace-only
  /^\s*$/,

  // ✅ Numeric placeholders (with context)
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i
] as const;

/**
 * Helper: Check if text contains placeholders (legacy function)
 *
 * RT-007: More conservative - only matches explicit placeholders
 * @deprecated Use validatePlaceholders() for severity-based validation
 */
export function hasPlaceholders(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Determine severity of placeholder match
 *
 * RT-007 Phase 3: Categorizes placeholders by severity
 * - ERROR: TODO, FIXME, XXX, HACK (explicitly incomplete content)
 * - WARNING: Bracketed placeholders, template variables (may have false positives)
 *
 * @param match - The matched placeholder text
 * @returns Severity level for this placeholder
 */
function determineSeverity(match: string): ValidationSeverity {
  // TODO/FIXME/XXX/HACK markers → ERROR (explicitly incomplete)
  // RT-007 P4: Removed NOTE - legitimate word in educational content
  if (/\b(TODO|FIXME|XXX|HACK)\b/i.test(match)) {
    return ValidationSeverity.ERROR;
  }

  // Explicit [TODO], [TBD], [FIXME], [insert...], [add...] → ERROR
  if (/\[(TODO|TBD|FIXME|insert|add|replace|название|описание|введите|добавьте)\b/i.test(match)) {
    return ValidationSeverity.ERROR;
  }

  // Everything else → WARNING (may be false positives)
  return ValidationSeverity.WARNING;
}

/**
 * Validate text for placeholder content
 *
 * RT-007 Phase 3: Returns ValidationResult with severity-based categorization
 *
 * @param text - Text to validate
 * @returns Validation result with severity-based issues
 */
export function validatePlaceholders(text: string): ValidationResult {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern)![0];
      const severity = determineSeverity(match);

      return {
        passed: false,
        severity,
        score: severity === ValidationSeverity.ERROR ? 0.0 : 0.8,
        issues: severity === ValidationSeverity.ERROR ? [match] : undefined,
        warnings: severity === ValidationSeverity.WARNING ? [match] : undefined,
        suggestion: severity === ValidationSeverity.ERROR
          ? 'Remove TODO/FIXME markers and complete all placeholder content'
          : 'Review bracketed content to ensure it is not a placeholder',
        metadata: {
          rule: 'placeholder_detection',
        }
      };
    }
  }

  return {
    passed: true,
    severity: ValidationSeverity.INFO,
    score: 1.0,
    info: ['No placeholders detected'],
    metadata: {
      rule: 'placeholder_detection',
    }
  };
}

/**
 * Helper: Scan object recursively for placeholders
 *
 * Used by CourseStructureSchema validation to detect
 * incomplete content before saving.
 */
export function scanForPlaceholders(obj: unknown, path: string = ''): string[] {
  const issues: string[] = [];

  if (typeof obj === 'string' && hasPlaceholders(obj)) {
    issues.push(`Placeholder detected at ${path}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      issues.push(...scanForPlaceholders(item, `${path}[${idx}]`));
    });
  } else if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      issues.push(...scanForPlaceholders(value, path ? `${path}.${key}` : key));
    });
  }

  return issues;
}
