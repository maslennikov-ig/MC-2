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
 */

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
 * @param templateMatch - A single {{ }} match to check
 * @returns True if the match is whitelisted (legitimate technical content)
 */
export function isWhitelistedTemplate(templateMatch: string): boolean {
  return TEMPLATE_WHITELIST_PATTERNS.some(pattern => pattern.test(templateMatch));
}

/**
 * Filter unresolved placeholders, removing whitelisted templates.
 *
 * @param matches - Array of {{ }} matches from text
 * @returns Array with whitelisted templates removed
 */
export function filterWhitelistedTemplates(matches: string[]): string[] {
  return matches.filter(match => !isWhitelistedTemplate(match));
}

/**
 * Check if ALL template patterns in text are whitelisted.
 *
 * @param text - Full text to check
 * @returns True if all {{ }} patterns in text are whitelisted
 */
export function areAllTemplatesWhitelisted(text: string): boolean {
  const templateMatches = text.match(/\{\{[^}]+\}\}/g);
  if (!templateMatches) return true; // No templates = nothing to whitelist

  return templateMatches.every(match => isWhitelistedTemplate(match));
}
