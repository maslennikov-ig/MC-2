/**
 * Structural content checks (truncation, Mermaid syntax, callout density, code block audience)
 * @module stages/stage6-lesson-content/judge/filters/structural-checks
 */

import type { FilterCheckResult } from './types';
import { MERMAID_BLOCK_REGEX } from '../../utils/mermaid-sanitizer';
import { countMermaidFallbackComments } from '../../utils/mermaid-fallback-marker';

// ============================================================================
// CONTENT TRUNCATION CHECK (Self-Review Pre-filter)
// ============================================================================

/**
 * Check if content appears truncated or incomplete
 *
 * Signs of truncation:
 * - Last section doesn't end with proper punctuation (. ! ? 。 ！ ？)
 * - Unmatched code blocks (odd number of ```)
 * - Incomplete sentences (ends with comma, "and", "or", etc.)
 * - Suspiciously short last section
 *
 * @param content - Lesson content (markdown string)
 * @returns Filter check result with truncation issues
 */
/**
 * Stable prefixes for truncation issue messages.
 *
 * EXPORTED so downstream consumers (self-reviewer-phases.ts categorizer)
 * can key off these without relying on fragile magic-string regexes.
 *
 * IMPORTANT: when changing message format, update both the generator site
 * below AND the categorizer patterns that depend on these prefixes.
 */
export const TRUNCATION_ISSUE_PREFIXES = {
  GLOBAL_ENDING: 'Content does not end with proper punctuation',
  UNMATCHED_CODE: 'Unmatched code blocks detected',
  MID_SENTENCE: 'Content appears to end mid-sentence',
  SUSPICIOUSLY_SHORT: 'Content suspiciously short',
  CALLOUT_TRUNCATED: 'Callout block appears truncated',
  SECTION_TRUNCATED: 'Section ', // prefix only — "Section N appears truncated"
} as const;

export type TruncationIssueKind =
  | 'GLOBAL_ENDING'
  | 'UNMATCHED_CODE'
  | 'MID_SENTENCE'
  | 'SUSPICIOUSLY_SHORT'
  | 'CALLOUT_TRUNCATED'
  | 'SECTION_TRUNCATED';

/**
 * Classify an issue message back to its kind. Single source of truth for
 * the message-prefix → kind mapping used by the severity categorizer.
 */
export function classifyTruncationIssue(message: string): TruncationIssueKind | null {
  if (message.startsWith(TRUNCATION_ISSUE_PREFIXES.UNMATCHED_CODE)) return 'UNMATCHED_CODE';
  if (message.startsWith(TRUNCATION_ISSUE_PREFIXES.MID_SENTENCE)) return 'MID_SENTENCE';
  if (message.startsWith(TRUNCATION_ISSUE_PREFIXES.SUSPICIOUSLY_SHORT)) return 'SUSPICIOUSLY_SHORT';
  if (message.startsWith(TRUNCATION_ISSUE_PREFIXES.CALLOUT_TRUNCATED)) return 'CALLOUT_TRUNCATED';
  if (message.startsWith(TRUNCATION_ISSUE_PREFIXES.GLOBAL_ENDING)) return 'GLOBAL_ENDING';
  if (/^Section \d+ appears truncated/.test(message)) return 'SECTION_TRUNCATED';
  return null;
}

/**
 * Maximum length of a line that can qualify as a footer.
 *
 * Real footers are SHORT ("© 2024 Company", "All rights reserved",
 * "Copyright © 2024 Acme Inc.", "Материал подготовлен учебным центром
 * Мегакампус") — typically 10-70 chars.
 *
 * Substantive prose mentioning these keywords in context ("Copyright law is
 * discussed in this appendix...", "Материал подготовлен в формате кейса с
 * подробным разбором...") runs noticeably longer.
 *
 * 80 chars balances between accepting long attribution lines and rejecting
 * full sentences. If a real footer legitimately exceeds 80 chars (e.g.
 * multi-author attribution), wrap it across multiple short lines instead.
 */
const MAX_FOOTER_LINE_CHARS = 80;

/**
 * Deterministic footer patterns.
 *
 * These lines are self-sufficient evidence of a real footer/attribution block.
 * If the entire tail block consists of footer-shaped lines AND at least one
 * line matches these patterns, we can safely ignore the block for global
 * ending checks.
 */
const DEFINITE_FOOTER_PATTERNS: RegExp[] = [
  // Symbol-led attribution
  /^\s*(?:©|®|\(c\))\s+\S/,
  // Copyright with a structural signal.
  /^\s*[Cc]opyright\b.*(?:©|\(c\)|\b\d{4}\b|[Rr]eserved\b|\bInc\.|\bLtd\.|\bLLC\b|\bCorp\.)/,
  // Rights-reserved phrases.
  /^\s*[Вв]се\s+права\s+(?:защищ|зарезервир)/,
  /^\s*[Aa]ll\s+[Rr]ights\s+[Rr]eserved\b/,
  // Explicit copyright phrasing.
  /^\s*[Аа]вторские?\s+права(?:\s|$)/,
  /^\s*[Аа]вторским\s+правом(?:\s|$)/,
  /^\s*[Мм]атериал\s+защищ(?:ен|ён)?\s+авторским\s+правом/,
];

/**
 * Ambiguous footer-ish shapes.
 *
 * These lines are plausible footer attributions in Russian, but they can also
 * start normal prose:
 * - "Материал подготовлен учебным центром ..."  -> attribution
 * - "Материал подготовлен в формате кейса ..." -> substantive content
 *
 * We treat such blocks conservatively: they are not deterministic footer
 * evidence, but they also should not alone trigger GLOBAL_ENDING.
 */
const AMBIGUOUS_FOOTERISH_PATTERNS: RegExp[] = [
  /^\s*[Мм]атериал\s+подготовлен(?:\s|$)/,
  /^\s*[Мм]атериал\s+защищ(?:ен|ён)?(?:\s|$)/,
];

type TrailingHrBlockKind = 'none' | 'definite_footer' | 'ambiguous_footerish' | 'substantive_tail';

type TrailingHrBlockClassification = {
  kind: TrailingHrBlockKind;
  contentBeforeHr: string;
};

function isBoundedFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  return trimmed.length <= MAX_FOOTER_LINE_CHARS;
}

function isDefiniteFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!isBoundedFooterLine(trimmed)) return false;
  return DEFINITE_FOOTER_PATTERNS.some(pattern => pattern.test(trimmed));
}

function isAmbiguousFooterishLine(line: string): boolean {
  const trimmed = line.trim();
  if (!isBoundedFooterLine(trimmed)) return false;
  return AMBIGUOUS_FOOTERISH_PATTERNS.some(pattern => pattern.test(trimmed));
}

function isFooterShapedLine(line: string): boolean {
  return isDefiniteFooterLine(line) || isAmbiguousFooterishLine(line);
}

/**
 * Classify the block after the LAST standalone horizontal rule.
 *
 * We intentionally separate:
 * - definite_footer: safe to ignore entirely
 * - ambiguous_footerish: do not strip, but do not let it alone trigger Check 1
 * - substantive_tail: keep normal truncation behavior
 */
function classifyTrailingHrBlock(content: string): TrailingHrBlockClassification {
  const hrPattern = /(?:^|\n)[-*_]{3,}\s*(?:\n|$)/g;
  let lastHRIndex = -1;
  let match: RegExpExecArray | null;

  while ((match = hrPattern.exec(content)) !== null) {
    lastHRIndex = match.index + (content[match.index] === '\n' ? 1 : 0);
    if (match.index === hrPattern.lastIndex) hrPattern.lastIndex++;
  }

  if (lastHRIndex === -1) {
    return { kind: 'none', contentBeforeHr: content };
  }

  const contentBeforeHr = content.slice(0, lastHRIndex).trimEnd();
  const afterHRMatch = content.slice(lastHRIndex).match(/^[-*_]{3,}\s*\n([\s\S]+)$/);
  if (!afterHRMatch) {
    return { kind: 'none', contentBeforeHr: content };
  }

  const lines = afterHRMatch[1].split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { kind: 'none', contentBeforeHr: content };
  }

  if (!lines.every(isFooterShapedLine)) {
    return { kind: 'substantive_tail', contentBeforeHr };
  }

  if (lines.some(isDefiniteFooterLine)) {
    return { kind: 'definite_footer', contentBeforeHr };
  }

  return { kind: 'ambiguous_footerish', contentBeforeHr };
}

/**
 * Strip a trailing "--- + footer-block" segment from content.
 *
 * Only deterministic footer blocks are stripped. Ambiguous footer-ish blocks
 * stay in the content; Check 1 handles them via classifier-aware suppression.
 */
function stripTrailingFooterBlock(content: string): string {
  const classification = classifyTrailingHrBlock(content);
  return classification.kind === 'definite_footer' ? classification.contentBeforeHr : content;
}

/**
 * Strip trailing structural markdown that represents VALID section endings
 * but would confuse naive last-char checks:
 * - Horizontal rules (---, ***, ___)
 * - Copyright/meta italic lines (*text*) — only when they appear at the tail
 * - Trailing bold lines (**text**)
 * - Quote/callout lines
 * - "--- + definite footer block" pattern (ambiguous footer-ish tails are
 *   handled separately by Check 1 and are not stripped here)
 *
 * Runs iteratively because the tail often has multiple trailing markers
 * (e.g. horizontal rule + italic copyright).
 */
function stripTrailingStructuralMarkers(content: string): string {
  let current = content;
  const linePatterns = [
    /(?:^|\n)[-*_]{3,}\s*$/, // horizontal rule on its own line (or at very start)
    /(?:^|\n)\*[^*\n]+\*\s*$/, // trailing single-asterisk italic line
    /(?:^|\n)\*\*[^\n]+\*\*\s*$/, // trailing double-asterisk bold line
    /(?:^|\n)>\s*\S[^\n]*\s*$/, // trailing quote/callout line (handled by Check 5)
  ];

  // Iterate up to 5 times — in practice 2-3 is enough; bound prevents adversarial loops
  for (let i = 0; i < 5; i++) {
    const before = current;
    // First, try to strip the "--- + footer block" pattern (narrow predicate)
    current = stripTrailingFooterBlock(current);
    // Then strip individual trailing markers
    for (const pattern of linePatterns) {
      current = current.replace(pattern, '').trimEnd();
    }
    if (current === before) break;
  }
  return current;
}

function getLastNonEmptyLine(content: string): string {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length > 0) {
      return line;
    }
  }
  return '';
}

function isMarkdownListLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line);
}

export function checkContentTruncation(content: string): FilterCheckResult & {
  truncationIssues: string[];
  lastCharacter: string;
  hasMatchedCodeBlocks: boolean;
} {
  const issues: string[] = [];

  // Check 1: Proper ending punctuation
  const trimmedContent = content.trim();
  const trailingHrBlock = classifyTrailingHrBlock(trimmedContent);

  // Strip trailing structural markdown (horizontal rules, copyright lines,
  // trailing bold/italic, quote lines) before evaluating the last char.
  // Definite footer blocks can be stripped safely. Ambiguous footer-ish
  // blocks are not stripped globally, but they also should not alone trigger
  // a blocking GLOBAL_ENDING signal.
  const contentForEndCheckSeed =
    trailingHrBlock.kind === 'definite_footer' || trailingHrBlock.kind === 'ambiguous_footerish'
      ? trailingHrBlock.contentBeforeHr
      : trimmedContent;
  const contentForEndCheck = stripTrailingStructuralMarkers(contentForEndCheckSeed).trim();

  // Get last meaningful character (skip closing markdown like ** _ ` #)
  let lastMeaningfulIndex = contentForEndCheck.length - 1;
  while (lastMeaningfulIndex > 0 && /[*_`#\s]/.test(contentForEndCheck[lastMeaningfulIndex])) {
    lastMeaningfulIndex--;
  }
  const lastMeaningfulChar = contentForEndCheck[lastMeaningfulIndex] ?? '';

  // Accept standard punctuation + common closing markdown/quotes: ) ] » ” for
  // parenthesized or quoted endings like "...(note that X)." or "формат: «X»".
  const validEndingPunctuation = /[.!?。！？:)\]»”"']/;
  // Skip Check 1 entirely when stripping removed everything (content was all
  // structural markers, which is itself a bigger problem caught by Check 4).
  if (contentForEndCheck.length > 0 && !validEndingPunctuation.test(lastMeaningfulChar)) {
    issues.push(`${TRUNCATION_ISSUE_PREFIXES.GLOBAL_ENDING} (last char: "${lastMeaningfulChar}")`);
  }

  // Check 2: Matched code blocks
  const codeBlockCount = (content.match(/```/g) || []).length;
  const hasMatchedCodeBlocks = codeBlockCount % 2 === 0;
  if (!hasMatchedCodeBlocks) {
    issues.push(
      `${TRUNCATION_ISSUE_PREFIXES.UNMATCHED_CODE} (${codeBlockCount} markers found, expected even number)`
    );
  }

  // Check 3: Incomplete sentence patterns at the end
  const lastSentence = trimmedContent.slice(-100);
  const incompletePatterns = [
    /,\s*$/, // Ends with comma
    /\band\s*$/i, // Ends with "and"
    /\bor\s*$/i, // Ends with "or"
    /\bthe\s*$/i, // Ends with "the"
    /\ba\s*$/i, // Ends with "a"
    /\bto\s*$/i, // Ends with "to"
    /\bof\s*$/i, // Ends with "of"
    /\bи\s*$/i, // Russian "and"
    /\bили\s*$/i, // Russian "or"
    /\bчто\s*$/i, // Russian "that"
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(lastSentence)) {
      issues.push(TRUNCATION_ISSUE_PREFIXES.MID_SENTENCE);
      break;
    }
  }

  // Check 4: Very short content (less than 200 characters suggests truncation)
  if (trimmedContent.length < 200) {
    issues.push(
      `${TRUNCATION_ISSUE_PREFIXES.SUSPICIOUSLY_SHORT} (${trimmedContent.length} characters)`
    );
  }

  // Check 5: Callout block truncation (> [!TIP] etc. ending without punctuation)
  const calloutBlockRegex = /^>\s*\[!(TIP|WARNING|NOTE|INFO|DANGER)\].*$(?:\n>.*$)*/gm;
  const calloutBlocks = content.matchAll(calloutBlockRegex);
  for (const calloutMatch of calloutBlocks) {
    const block = calloutMatch[0];
    const lastLine = block.split('\n').pop()?.replace(/^>\s*/, '').trim() ?? '';
    if (lastLine.length > 0 && lastLine.length < 20 && !/[.!?。！？:]$/.test(lastLine)) {
      issues.push(`${TRUNCATION_ISSUE_PREFIXES.CALLOUT_TRUNCATED} (last line: "${lastLine}")`);
    }
  }

  // Check 6: Per-section truncation (check each section individually)
  const sectionBlocks = content.split(/^#{2,3}\s+/m).filter(s => s.trim().length > 50);
  for (let i = 0; i < sectionBlocks.length; i++) {
    const section = sectionBlocks[i].trim();
    // Skip last section (already checked by Check 1)
    if (i === sectionBlocks.length - 1) continue;

    // Strip valid markdown structural endings before checking last char:
    // - Horizontal rules (---, ***, ___)
    // - Table rows ending with | (pipe)
    // - Table separator rows (|---|---|)
    // These are valid section endings, not truncation.
    const sectionForCheck = section
      .replace(/\n[-*_]{3,}\s*$/, '') // trailing --- or *** or ___
      .replace(/\n\|[^|\n]*\|\s*$/, '') // trailing table row
      .replace(/\n\|[-|\s:]+\|\s*$/, '') // trailing table separator |---|---|
      .trim();
    const lastLine = getLastNonEmptyLine(sectionForCheck);

    if (isMarkdownListLine(lastLine)) {
      continue;
    }

    const sectionEnd = sectionForCheck.slice(-50);
    const lastChar = sectionEnd.replace(/[\s*_`#]+$/, '').slice(-1);
    if (lastChar && !/[.!?。！？:\n)\]|]/.test(lastChar)) {
      // Check if it's a title line (next section header) — skip those
      if (!/^\S+\n/.test(sectionForCheck.slice(-20))) {
        issues.push(`Section ${i + 1} appears truncated (ends with "${lastChar}")`);
      }
    }
  }

  const passed = issues.length === 0;

  // Score: 1.0 if clean, reduces based on number of issues
  const scoreContribution = Math.max(0, 1 - issues.length * 0.25);

  const result: FilterCheckResult & {
    truncationIssues: string[];
    lastCharacter: string;
    hasMatchedCodeBlocks: boolean;
  } = {
    passed,
    actual: issues.length === 0 ? 'no truncation detected' : `${issues.length} issues`,
    scoreContribution,
    truncationIssues: issues,
    lastCharacter: lastMeaningfulChar,
    hasMatchedCodeBlocks,
  };

  if (!passed) {
    result.failure = {
      filter: 'contentTruncation',
      expected: 'Complete, properly terminated content',
      actual: `${issues.length} truncation issues`,
      severity: issues.length > 2 ? 'critical' : 'major',
    };
    result.suggestion = `Content appears truncated: ${issues.join('; ')}. Ensure all content is complete and properly terminated.`;
  }

  return result;
}

// ============================================================================
// MERMAID SYNTAX CHECK (Self-Review Pre-filter)
// ============================================================================

// Note: MERMAID_BLOCK_REGEX imported from ../../utils/mermaid-sanitizer (DRY)

/**
 * Check Mermaid diagrams for syntax issues
 *
 * Detects common Mermaid syntax problems:
 * - Escaped quotes `\"` that break rendering
 * - Unclosed brackets [] or braces {}
 * - Invalid arrow syntax (-> should be -->)
 *
 * IMPORTANT: This runs AFTER the sanitizer, so it catches edge cases
 * that slipped through automated fixing.
 *
 * @param content - Lesson content (markdown string)
 * @returns Filter check result with Mermaid issues
 */
export function checkMermaidSyntax(content: string): FilterCheckResult & {
  mermaidIssues: string[];
  affectedDiagrams: number;
  totalDiagrams: number;
  fallbackComments: number;
} {
  const issues: string[] = [];
  let affectedDiagrams = 0;
  let totalDiagrams = 0;
  const fallbackComments = countMermaidFallbackComments(content);

  // Extract all Mermaid blocks
  const mermaidBlocks: string[] = [];
  content.replace(MERMAID_BLOCK_REGEX, (_, mermaidContent: string) => {
    mermaidBlocks.push(mermaidContent);
    return '';
  });

  totalDiagrams = mermaidBlocks.length;

  // Fallback comment means Mermaid rendering failed and was manually masked.
  // Treat this as a critical integrity signal even when no fenced blocks remain.
  if (fallbackComments > 0) {
    issues.push(
      `Detected ${fallbackComments} Mermaid fallback comment(s): diagram could not be rendered`
    );
    affectedDiagrams += fallbackComments;
  }

  // No Mermaid blocks and no fallback comments - return perfect score
  if (totalDiagrams === 0 && fallbackComments === 0) {
    return {
      passed: true,
      actual: 'no mermaid diagrams',
      scoreContribution: 1.0,
      mermaidIssues: [],
      affectedDiagrams: 0,
      totalDiagrams: 0,
      fallbackComments: 0,
    };
  }

  for (let i = 0; i < mermaidBlocks.length; i++) {
    const block = mermaidBlocks[i];
    let hasIssues = false;

    // Check for escaped quotes (primary issue)
    if (/\\"/.test(block)) {
      issues.push(`Diagram ${i + 1}: Contains escaped quotes (\\") that break rendering`);
      hasIssues = true;
    }

    // Check for unclosed brackets
    const openBrackets = (block.match(/\[/g) || []).length;
    const closeBrackets = (block.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(
        `Diagram ${i + 1}: Unclosed brackets (${openBrackets} open, ${closeBrackets} close)`
      );
      hasIssues = true;
    }

    // Check for unclosed braces
    const openBraces = (block.match(/\{/g) || []).length;
    const closeBraces = (block.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Diagram ${i + 1}: Unclosed braces (${openBraces} open, ${closeBraces} close)`);
      hasIssues = true;
    }

    // Check for invalid arrow syntax (-> without proper format)
    // Valid: -->, -.->  Invalid: -> (naked arrow)
    // Pattern: not preceded by - or . and followed by space or letter
    if (/(?<![-.])->(?![->])/.test(block)) {
      issues.push(`Diagram ${i + 1}: Invalid arrow syntax (use --> instead of ->)`);
      hasIssues = true;
    }

    if (hasIssues) {
      affectedDiagrams++;
    }
  }

  const passed = issues.length === 0;
  // Score: 1.0 if clean, reduces by 0.25 per issue (max 4 issues = 0)
  const scoreContribution = Math.max(0, 1 - issues.length * 0.25);

  const result: FilterCheckResult & {
    mermaidIssues: string[];
    affectedDiagrams: number;
    totalDiagrams: number;
    fallbackComments: number;
  } = {
    passed,
    actual: issues.length === 0 ? 'all diagrams valid' : `${issues.length} issues`,
    scoreContribution,
    mermaidIssues: issues,
    affectedDiagrams,
    totalDiagrams,
    fallbackComments,
  };

  if (!passed) {
    // Severity: 'major' for rendering-breaking issues
    result.failure = {
      filter: 'mermaidSyntax',
      expected: 'Valid Mermaid syntax',
      actual: `${issues.length} Mermaid integrity issues (${affectedDiagrams} affected items, ${fallbackComments} fallback comments)`,
      severity: fallbackComments > 0 ? 'critical' : 'major',
    };
    const fallbackHint =
      fallbackComments > 0
        ? ' Remove fallback comments by regenerating/fixing the original Mermaid blocks.'
        : '';
    result.suggestion = `Mermaid syntax issues detected: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}. Fix escaped quotes and ensure proper bracket matching.${fallbackHint}`;
  }

  return result;
}

// ============================================================================
// CALLOUT DENSITY CHECK
// ============================================================================

/** Regex to match callout markers: > [!TIP], > [!WARNING], > [!NOTE], > [!INFO], > [!DANGER] */
const CALLOUT_REGEX = /^>\s*\[!(PRO\s*TIP|TIP|WARNING|NOTE|INFO|DANGER)\]/gim;

/**
 * Check callout density in lesson content
 *
 * Too many callout blocks (> [!TIP], > [!WARNING], etc.) fragment the reading flow
 * and dilute the signal each callout is meant to carry.
 *
 * Thresholds:
 * - 0-2 callouts: pass (score 1.0)
 * - 3-4 callouts: major (score 0.5)
 * - 5+ callouts: critical (score 0.0)
 *
 * @param content - Lesson content (markdown string)
 * @returns Filter check result with callout count and types found
 */
export function checkCalloutDensity(content: string): FilterCheckResult & {
  calloutCount: number;
  calloutTypes: string[];
} {
  const matches = Array.from(content.matchAll(CALLOUT_REGEX));
  const calloutCount = matches.length;
  const calloutTypes = [
    ...new Set(
      matches.map(m => {
        const raw = m[1].toUpperCase().replace(/\s+/g, ' ');
        // Normalize non-standard types: "PRO TIP" → "TIP"
        return raw === 'PRO TIP' || raw === 'PROTIP' ? 'TIP' : raw;
      })
    ),
  ];

  if (calloutCount <= 2) {
    return {
      passed: true,
      actual: `${calloutCount} callout(s)`,
      scoreContribution: 1.0,
      calloutCount,
      calloutTypes,
    };
  }

  const severity: 'major' | 'critical' = calloutCount <= 4 ? 'major' : 'critical';
  const scoreContribution = calloutCount <= 4 ? 0.5 : 0.0;

  return {
    passed: false,
    actual: `${calloutCount} callout(s)`,
    scoreContribution,
    calloutCount,
    calloutTypes,
    failure: {
      filter: 'calloutDensity',
      expected: 'At most 2 callout blocks',
      actual: `${calloutCount} callouts (types: ${calloutTypes.join(', ')})`,
      severity,
    },
    suggestion: `Reduce callout blocks from ${calloutCount} to at most 2. Found types: ${calloutTypes.join(', ')}. Merge related callouts or convert less important ones to regular text.`,
  };
}

// ============================================================================
// CODE BLOCK AUDIENCE MATCH CHECK
// ============================================================================

/**
 * Count non-mermaid code blocks using stateful line-by-line parsing.
 * Correctly handles mixed mermaid and non-mermaid blocks.
 */
export function countNonMermaidCodeBlocks(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  let inCodeBlock = false;
  let currentBlockIsMermaid = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        currentBlockIsMermaid = trimmed.startsWith('```mermaid');
      } else {
        if (!currentBlockIsMermaid) {
          count++;
        }
        inCodeBlock = false;
        currentBlockIsMermaid = false;
      }
    }
  }

  return count;
}

/**
 * Check that code blocks are appropriate for the content archetype
 *
 * Non-technical archetypes (concept_explainer, case_study, legal_warning)
 * should not contain code blocks — their presence signals a mismatch
 * between the content and the intended audience.
 *
 * For code_tutorial archetype, this check always passes.
 *
 * Thresholds (non-code_tutorial only):
 * - 0 code blocks: pass (score 1.0)
 * - 1-3 code blocks: major (score 0.5)
 * - 4+ code blocks: critical (score 0.0)
 *
 * @param content - Lesson content (markdown string)
 * @param contentArchetype - Content archetype from lesson spec
 * @returns Filter check result with code block count
 */
export function checkCodeBlockAudienceMatch(
  content: string,
  contentArchetype: string
): FilterCheckResult & {
  codeBlockCount: number;
  contentArchetype: string;
} {
  const codeBlockCount = countNonMermaidCodeBlocks(content);

  // code_tutorial archetype always passes
  if (contentArchetype === 'code_tutorial') {
    return {
      passed: true,
      actual: `${codeBlockCount} code block(s) (archetype: code_tutorial)`,
      scoreContribution: 1.0,
      codeBlockCount,
      contentArchetype,
    };
  }

  // Non-code archetypes
  if (codeBlockCount === 0) {
    return {
      passed: true,
      actual: `0 code blocks (archetype: ${contentArchetype})`,
      scoreContribution: 1.0,
      codeBlockCount,
      contentArchetype,
    };
  }

  const severity: 'major' | 'critical' = codeBlockCount <= 3 ? 'major' : 'critical';
  const scoreContribution = codeBlockCount <= 3 ? 0.5 : 0.0;

  return {
    passed: false,
    actual: `${codeBlockCount} code block(s)`,
    scoreContribution,
    codeBlockCount,
    contentArchetype,
    failure: {
      filter: 'codeBlockAudienceMatch',
      expected: 'No code blocks in non-technical content',
      actual: `${codeBlockCount} code blocks found in "${contentArchetype}" content`,
      severity,
    },
    suggestion: `Code blocks found in non-technical course content. Remove or replace ${codeBlockCount} code block(s) with prose descriptions, diagrams, or examples appropriate for "${contentArchetype}" archetype.`,
  };
}
