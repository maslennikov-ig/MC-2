/**
 * Template Whitelist for Technical Content
 * @module shared/validation/template-whitelist
 *
 * Whitelist patterns for legitimate template syntax in technical content.
 * Used to prevent false positive placeholder detection in RAG context
 * that contains Helm, Go templates, Jinja2, Ansible variables, etc.
 *
 * Shared between:
 * - placeholder-validator.ts (Stage 5 validation)
 * - prompt-service.ts (unresolved placeholder warnings)
 *
 * @limitations
 * - Does NOT handle escaped braces: `\{\{ .Values.x \}\}` will not match
 * - Does NOT handle nested templates: `{{ outer {{ inner }} }}` may not match correctly
 * - These edge cases are rare in practice and acceptable for this use case
 */

/**
 * Common Helm/Sprig functions (used for Set-based lookup).
 * This avoids catastrophic backtracking from a 70+ alternation regex.
 *
 * @see https://helm.sh/docs/chart_template_guide/function_list/
 */
const HELM_FUNCTIONS = new Set([
  // Type conversion
  'quote',
  'squote',
  'toYaml',
  'toJson',
  'toPrettyJson',
  'toRawJson',
  'fromYaml',
  'fromJson',
  'b64enc',
  'b64dec',
  // String functions
  'trim',
  'trimAll',
  'trimPrefix',
  'trimSuffix',
  'upper',
  'lower',
  'title',
  'untitle',
  'repeat',
  'substr',
  'nospace',
  'trunc',
  'abbrev',
  'abbrevboth',
  'initials',
  'randAlphaNum',
  'randAlpha',
  'randNumeric',
  'randAscii',
  'wrap',
  'wrapWith',
  'contains',
  'hasPrefix',
  'hasSuffix',
  'replace',
  'plural',
  'snakecase',
  'camelcase',
  'kebabcase',
  'swapcase',
  'shuffle',
  'nindent',
  'indent',
  'cat',
  // Default/required
  'default',
  'required',
  'empty',
  'coalesce',
  'ternary',
  // Regex
  'regexMatch',
  'regexFind',
  'regexFindAll',
  'regexReplaceAll',
  'regexReplaceAllLiteral',
  'regexSplit',
  // Lists
  'list',
  'first',
  'last',
  'rest',
  'initial',
  'append',
  'prepend',
  'concat',
  'reverse',
  'uniq',
  'without',
  'has',
  'slice',
  'until',
  'untilStep',
  'seq',
  'sortAlpha',
  // Dicts
  'dict',
  'get',
  'set',
  'unset',
  'keys',
  'values',
  'pick',
  'omit',
  'merge',
  'mustMerge',
  'mergeOverwrite',
  'deepCopy',
  'pluck',
  // Math
  'add',
  'add1',
  'sub',
  'mul',
  'div',
  'mod',
  'max',
  'min',
  'ceil',
  'floor',
  'round',
  'len',
  // Crypto
  'sha256sum',
  'sha1sum',
  'adler32sum',
  'htpasswd',
  'derivePassword',
  'genPrivateKey',
  'buildCustomCert',
  'genCA',
  'genSelfSignedCert',
  'genSignedCert',
  // Date
  'now',
  'date',
  'dateModify',
  'dateInZone',
  'duration',
  'durationRound',
  'ago',
  'toDate',
  'mustToDate',
  'unixEpoch',
  'htmlDate',
  'htmlDateInZone',
  // Type functions
  'kindOf',
  'typeOf',
  'kindIs',
  'typeIs',
  'deepEqual',
  // Semantic versioning
  'semver',
  'semverCompare',
  // Flow control
  'fail',
  // Print
  'print',
  'println',
  'printf',
  // Split/join
  'split',
  'splitList',
  'splitn',
  'join',
  // Kubernetes
  'lookup',
  'tpl',
  // URL
  'urlParse',
  'urlJoin',
]);

/**
 * Check if a string is a known Helm/Sprig function name.
 * Uses Set lookup for O(1) performance instead of regex alternation.
 *
 * @param funcName - Potential function name
 * @returns True if it's a known Helm function
 */
function isHelmFunction(funcName: string): boolean {
  return HELM_FUNCTIONS.has(funcName.toLowerCase());
}

/**
 * Whitelist patterns for legitimate template syntax in technical content.
 * These are NOT placeholders - they are valid code examples.
 *
 * RT-008: Template syntax whitelist for technical content
 * - Helm: {{ .Values.* }}, {{ .Release.* }}, {{ if ... }}, {{ range ... }}
 * - Go templates: {{ .Field }}, {{ request.object }}
 * - Jinja2: {{ variable }}, {% block %}
 * - Ansible: {{ ansible_hostname }}, {{ hostvars['x'] }}
 */
export const TEMPLATE_WHITELIST_PATTERNS: readonly RegExp[] = [
  // Helm/Go templates: {{ .Values.x }}, {{ .Release.Name }}, {{ .Chart.Name }}
  /\{\{\s*\.(?:Values|Release|Chart|Capabilities|Template|Files)\.[^}]+\}\}/,
  // Helm control flow: {{ if .Values.x }}, {{ range .Values.x }}, {{ with .Values.x }}
  /\{\{\s*(?:if|else|end|range|with|define|template|block|include)\b[^}]*\}\}/,
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
  // Kyverno/OPA args: {{args.service-name}}, {{request.object.metadata.name}}
  /\{\{[a-z]+\.[a-zA-Z0-9_.-]+\}\}/,
  // Argo Workflows: {{workflow.name}}, {{inputs.parameters.x}}
  /\{\{(?:workflow|inputs|outputs|steps|tasks)\.[a-zA-Z0-9_.]+\}\}/,
  // GitHub Actions: ${{ github.event }}, ${{ secrets.TOKEN }}
  /\$\{\{\s*(?:github|secrets|env|vars|inputs|needs|steps|matrix|strategy|runner|job)\.[^}]+\}\}/,
] as const;

/**
 * Check if a template pattern matches any whitelisted pattern.
 *
 * Uses two-phase matching:
 * 1. Fast Set lookup for Helm functions (O(1))
 * 2. Regex patterns for other template types
 *
 * @param templateMatch - A single {{ }} match to check
 * @returns True if the match is whitelisted (legitimate technical content)
 *
 * @example
 * isWhitelistedTemplate('{{ .Values.name }}')    // true
 * isWhitelistedTemplate('{{ quote .name }}')     // true (Helm function)
 * isWhitelistedTemplate('{{ PLACEHOLDER }}')     // false
 */
export function isWhitelistedTemplate(templateMatch: string): boolean {
  // Phase 1: Check Helm function patterns (O(1) Set lookup)
  // Pattern: {{ funcName argument... }}
  const helmFuncMatch = templateMatch.match(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s+[^}]+\}\}/);
  if (helmFuncMatch && isHelmFunction(helmFuncMatch[1])) {
    return true;
  }

  // Phase 2: Check regex patterns for other template types
  return TEMPLATE_WHITELIST_PATTERNS.some(pattern => pattern.test(templateMatch));
}

/**
 * Filter unresolved placeholders, removing whitelisted templates.
 *
 * @param matches - Array of {{ }} matches from text
 * @returns Array with whitelisted templates removed
 *
 * @example
 * filterWhitelistedTemplates([
 *   '{{ .Values.name }}',  // removed (Helm)
 *   '{{ MISSING }}',       // kept (unresolved)
 * ])
 * // Returns: ['{{ MISSING }}']
 */
export function filterWhitelistedTemplates(matches: string[]): string[] {
  return matches.filter(match => !isWhitelistedTemplate(match));
}

/**
 * Check if ALL template patterns in text are whitelisted.
 *
 * @param text - Full text to check
 * @returns True if all {{ }} patterns in text are whitelisted
 *
 * @limitations
 * - Uses simple regex `/\{\{[^}]+\}\}/g` which does NOT handle:
 *   - Escaped braces: `\{\{ .Values.x \}\}` (won't be detected as template)
 *   - Nested templates: `{{ outer {{ inner }} }}` (may split incorrectly)
 * - These edge cases are rare in production RAG content and acceptable
 *
 * @example
 * areAllTemplatesWhitelisted('Use {{ .Values.name }} here')  // true
 * areAllTemplatesWhitelisted('Missing {{ UNKNOWN }}')        // false
 */
export function areAllTemplatesWhitelisted(text: string): boolean {
  // Note: This simple regex has known limitations with escaped/nested braces
  // See @limitations in JSDoc above
  const templateMatches = text.match(/\{\{[^}]+\}\}/g);
  if (!templateMatches) return true; // No templates = nothing to whitelist

  return templateMatches.every(match => isWhitelistedTemplate(match));
}
