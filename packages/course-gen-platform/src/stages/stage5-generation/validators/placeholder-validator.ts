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
 *
 * RT-008: Template syntax whitelist for technical content
 * - Helm: {{ .Values.* }}, {{ .Release.* }}, {{ if ... }}, {{ range ... }}
 * - Go templates: {{ .Field }}, {{ request.object }}
 * - Jinja2: {{ variable }}, {% block %}
 * These are legitimate code examples in DevOps/Kubernetes courses.
 */

/**
 * Whitelist patterns for legitimate template syntax in technical content.
 * These are NOT placeholders - they are valid code examples.
 */
const TEMPLATE_WHITELIST_PATTERNS = [
  // Helm/Go templates: {{ .Values.x }}, {{ .Release.Name }}, {{ .Chart.Name }}
  /\{\{\s*\.(?:Values|Release|Chart|Capabilities|Template|Files)\.[^}]+\}\}/,
  // Helm control flow: {{ if .Values.x }}, {{ range .Values.x }}, {{ with .Values.x }}
  /\{\{\s*(?:if|else|end|range|with|define|template|block|include)\b[^}]*\}\}/,
  // Helm functions: {{ quote .Values.x }}, {{ default "x" .Values.y }}
  /\{\{\s*(?:quote|default|required|empty|coalesce|toYaml|toJson|indent|nindent|trim|upper|lower|title|b64enc|b64dec|sha256sum|trunc|replace|contains|hasPrefix|hasSuffix|list|dict|get|set|unset|keys|values|pick|omit|merge|mustMerge|deepCopy|pluck|concat|append|prepend|first|last|initial|rest|reverse|uniq|without|has|slice|until|untilStep|seq|add|sub|mul|div|mod|max|min|ceil|floor|round|len|now|date|dateModify|dateInZone|duration|ago|toDate|mustToDate|unixEpoch|htmlDate|htmlDateInZone|ternary|kindOf|typeOf|kindIs|typeIs|deepEqual|semver|semverCompare|fail|print|println|printf|splitList|sortAlpha|join|splitn|regexMatch|regexFind|regexFindAll|regexReplaceAll|regexReplaceAllLiteral|regexSplit|sha1sum|adler32sum|lookup|tpl|required|fail|urlParse|urlJoin)\s+[^}]+\}\}/,
  // Go templates field access: {{ .metadata.name }}, {{ .spec.replicas }}
  /\{\{\s*\.[a-z][a-zA-Z0-9_.]*\s*\}\}/,
  // Kubernetes admission webhook: {{ request.object }}, {{ request.operation }}
  /\{\{\s*request\.[a-zA-Z0-9_.]+\s*\}\}/,
  // Jinja2 variables with filters: {{ variable|filter }}
  /\{\{\s*[a-z_][a-z0-9_]*\s*\|[^}]+\}\}/,
  // Ansible variables: {{ ansible_hostname }}, {{ hostvars['x'] }}
  /\{\{\s*(?:ansible_|hostvars|groups|inventory_hostname|play_hosts)[^}]*\}\}/,
  // Generic dotted path access (common in templates): {{ .name }}, {{ .data.key }}
  /\{\{\s*\.[a-zA-Z][a-zA-Z0-9_.]+\s*\}\}/,
] as const;

const PLACEHOLDER_PATTERNS = [
  // ✅ TODO/FIXME markers (block always) - CASE SENSITIVE
  // RT-007 P5: Made case-sensitive to avoid false positives (e.g., "todo list", "todo app")
  // Developers use UPPERCASE for markers, lowercase "todo" is often legitimate content
  /\b(TODO|FIXME|XXX|HACK)\b/,

  // ✅ Only explicit bracketed placeholders
  /\[TODO\]/i,
  /\[TBD\]/i,
  /\[FIXME\]/i,
  /\[insert[^\]]*\]/i, // [insert ...], [insert topic]
  /\[add[^\]]*\]/i, // [add content]
  /\[replace[^\]]*\]/i, // [replace ...]
  /\[название[^\]]*\]/i, // Russian: [название ...]
  /\[описание[^\]]*\]/i, // Russian: [описание ...]
  /\[введите[^\]]*\]/i, // Russian: [введите ...]
  /\[добавьте[^\]]*\]/i, // Russian: [добавьте ...]

  // ❌ REMOVED: /\[.*?\]/ (too aggressive)
  // ❌ REMOVED: /<.*?>/ (catches TypeScript generics)

  // ✅ Template variables (only double braces) - checked AFTER whitelist
  /\{\{[^}]+\}\}/, // {{variable}} - explicit template
  /\$\{[^}]+\}/, // ${variable} - explicit template

  // ✅ Ellipsis indicators (only at start or isolated)
  /^\.\.\.$|^\.\.\.\s/, // "..." at line start only
  /…$/, // Unicode ellipsis at end

  // ✅ Generic placeholders (only with context)
  /\b(example|sample|placeholder|пример|образец)\s+(title|name|description|text|название|текст)\b/i,

  // ✅ Empty or whitespace-only
  /^\s*$/,

  // ✅ Numeric placeholders (with context)
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i,
] as const;

/**
 * Check if text matches a whitelisted template pattern.
 * Returns true if the {{ }} syntax is legitimate technical content.
 */
function isWhitelistedTemplate(text: string): boolean {
  // Find all {{ }} patterns in text
  const templateMatches = text.match(/\{\{[^}]+\}\}/g);
  if (!templateMatches) return false;

  // Check if ALL template matches are whitelisted
  return templateMatches.every(match =>
    TEMPLATE_WHITELIST_PATTERNS.some(pattern => pattern.test(match))
  );
}

/**
 * Helper: Check if text contains placeholders (legacy function)
 *
 * RT-007: More conservative - only matches explicit placeholders
 * RT-008: Skip detection if text contains whitelisted template syntax
 * @deprecated Use validatePlaceholders() for severity-based validation
 */
export function hasPlaceholders(text: string): boolean {
  // RT-008: First check if {{ }} patterns are whitelisted technical content
  if (/\{\{[^}]+\}\}/.test(text) && isWhitelistedTemplate(text)) {
    // All {{ }} in this text are legitimate template syntax
    // Still check other placeholder patterns (TODO, [insert], etc.)
    return PLACEHOLDER_PATTERNS.filter(p => p.source !== '\\{\\{[^}]+\\}\\}').some(pattern =>
      pattern.test(text)
    );
  }

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
  // RT-007 P5: Case-sensitive to avoid false positives with lowercase "todo"
  if (/\b(TODO|FIXME|XXX|HACK)\b/.test(match)) {
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
 * RT-008: Skip {{ }} detection for whitelisted technical templates
 *
 * @param text - Text to validate
 * @returns Validation result with severity-based issues
 */
export function validatePlaceholders(text: string): ValidationResult {
  // RT-008: Check if {{ }} patterns are whitelisted before validating
  const hasWhitelistedTemplates = /\{\{[^}]+\}\}/.test(text) && isWhitelistedTemplate(text);

  for (const pattern of PLACEHOLDER_PATTERNS) {
    // RT-008: Skip {{ }} pattern check if text has whitelisted templates
    if (hasWhitelistedTemplates && pattern.source === '\\{\\{[^}]+\\}\\}') {
      continue;
    }

    if (pattern.test(text)) {
      const match = text.match(pattern)![0];
      const severity = determineSeverity(match);

      return {
        passed: false,
        severity,
        score: severity === ValidationSeverity.ERROR ? 0.0 : 0.8,
        issues: severity === ValidationSeverity.ERROR ? [match] : undefined,
        warnings: severity === ValidationSeverity.WARNING ? [match] : undefined,
        suggestion:
          severity === ValidationSeverity.ERROR
            ? 'Remove TODO/FIXME markers and complete all placeholder content'
            : 'Review bracketed content to ensure it is not a placeholder',
        metadata: {
          rule: 'placeholder_detection',
        },
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
    },
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
