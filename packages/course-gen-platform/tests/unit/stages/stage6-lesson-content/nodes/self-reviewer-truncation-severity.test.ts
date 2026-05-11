/**
 * Tests for truncation severity classification in analyzeCriticalIssues.
 *
 * Goal: stop firing CRITICAL TRUNCATION (→ REGENERATE loop → rejected rows)
 * on heuristic-only signals like per-section last-char and callout block
 * endings. Those heuristics false-positive on markdown tables, horizontal
 * rules, list endings, quote blocks — all valid structural endings.
 *
 * New severity policy:
 * - Deterministic signals (unmatched code fence, <200 chars, explicit
 *   mid-sentence patterns) → CRITICAL on first hit
 * - Global last-char (Check 1) alone → NOT CRITICAL (needs composite)
 * - Global last-char + any heuristic signal → CRITICAL (composite)
 * - Heuristic-only (Check 5/6) → NOT CRITICAL, surfaced as INFO via buildMinorIssues
 */
import { describe, expect, it } from 'vitest';
import { analyzeCriticalIssues } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases';
import type { HeuristicCheckResults } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases';

function baseHeuristics(): HeuristicCheckResults {
  return {
    languageCheck: {
      passed: true,
      foreignCharacters: 0,
      scriptsFound: [],
      foreignSamples: [],
    },
    truncationCheck: {
      passed: true,
      truncationIssues: [],
      lastCharacter: '.',
      hasMatchedCodeBlocks: true,
      actual: 'no truncation detected',
      scoreContribution: 1.0,
    } as HeuristicCheckResults['truncationCheck'],
    mermaidCheck: {
      passed: true,
      mermaidIssues: [],
      affectedDiagrams: 0,
      totalDiagrams: 0,
      fallbackComments: 0,
      actual: 'no mermaid diagrams',
      scoreContribution: 1.0,
    } as HeuristicCheckResults['mermaidCheck'],
  };
}

function withTruncationIssues(issues: string[]): HeuristicCheckResults {
  const h = baseHeuristics();
  h.truncationCheck = {
    ...h.truncationCheck,
    passed: false,
    truncationIssues: issues,
    lastCharacter: '|',
    hasMatchedCodeBlocks: true,
  } as HeuristicCheckResults['truncationCheck'];
  return h;
}

describe('analyzeCriticalIssues — truncation severity policy', () => {
  describe('heuristic-only signals should NOT produce CRITICAL', () => {
    it('three "Section X appears truncated" alone → no CRITICAL TRUNCATION', () => {
      // Live pattern from KPE-0507 lesson 1.1: 3 sections ended with table pipes / hr
      const heuristics = withTruncationIssues([
        'Section 2 appears truncated (ends with "|")',
        'Section 5 appears truncated (ends with "|")',
        'Section 7 appears truncated (ends with "-")',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 8);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(0);
    });

    it('"Callout block appears truncated" alone → no CRITICAL TRUNCATION', () => {
      const heuristics = withTruncationIssues([
        'Callout block appears truncated (last line: "[!TIP]")',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(0);
    });

    it('mix of 5 section + callout heuristics → no CRITICAL TRUNCATION', () => {
      // Live pattern from MKK-6903 lesson 1.3
      const heuristics = withTruncationIssues([
        'Section 3 appears truncated (ends with "м")',
        'Section 6 appears truncated (ends with "-")',
        'Section 7 appears truncated (ends with "-")',
        'Section 8 appears truncated (ends with "-")',
        'Callout block appears truncated (last line: "[!NOTE]")',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 10);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(0);
    });
  });

  describe('deterministic signals should produce CRITICAL on first hit', () => {
    it('unmatched code blocks → CRITICAL', () => {
      const heuristics = withTruncationIssues([
        'Unmatched code blocks detected (3 markers found, expected even number)',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(1);
    });

    it('mid-sentence pattern → CRITICAL', () => {
      const heuristics = withTruncationIssues(['Content appears to end mid-sentence']);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(1);
    });

    it('suspiciously short content → CRITICAL', () => {
      const heuristics = withTruncationIssues(['Content suspiciously short (120 characters)']);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(1);
    });
  });

  describe('global last-char (Check 1) requires composite support', () => {
    it('global last-char alone → NO CRITICAL (fragile signal without support)', () => {
      const heuristics = withTruncationIssues([
        'Content does not end with proper punctuation (last char: ")")',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(0);
    });

    it('global last-char + ≥1 section heuristic → CRITICAL (composite = genuine truncation)', () => {
      const heuristics = withTruncationIssues([
        'Content does not end with proper punctuation (last char: "и")',
        'Section 3 appears truncated (ends with "и")',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(1);
    });

    it('global last-char + deterministic → CRITICAL (always)', () => {
      const heuristics = withTruncationIssues([
        'Content does not end with proper punctuation (last char: "и")',
        'Content appears to end mid-sentence',
      ]);
      const result = analyzeCriticalIssues('content', heuristics, 'ru', 0, 5);
      const criticalTruncation = result.issues.filter(
        i => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
      );
      expect(criticalTruncation).toHaveLength(1);
    });
  });
});
