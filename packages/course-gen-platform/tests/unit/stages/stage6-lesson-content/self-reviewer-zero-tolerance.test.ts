/**
 * Zero-Tolerance Logic Tests for buildMinorIssues()
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases
 *
 * Tests the zero-tolerance severity classification in buildMinorIssues():
 * - CJK / ARABIC / DEVANAGARI scripts → FIXABLE (auto-strip required)
 * - Non-zero-tolerance scripts (e.g. LATIN) → INFO
 * - Mixed scripts with at least one zero-tolerance → FIXABLE
 * - Passed language check → no LANGUAGE issue emitted
 * - Truncation issues still work independently
 */

import { describe, it, expect, vi } from 'vitest';
import { buildMinorIssues } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases';
import type { HeuristicCheckResults } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/logger', () => {
  const mockChild = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => mockChild),
    },
  };
});

vi.mock('@/orchestrator/metrics', () => ({
  metricsStore: { recordModelFallback: vi.fn() },
}));

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a minimal HeuristicCheckResults object for language-check testing.
 * All fields not under test are set to safe defaults.
 */
function makeHeuristicsWithLanguage(languageOverrides: {
  passed: boolean;
  foreignCharacters?: number;
  scriptsFound?: string[];
  foreignSamples?: string[];
}): HeuristicCheckResults {
  return {
    languageCheck: {
      passed: languageOverrides.passed,
      foreignCharacters: languageOverrides.foreignCharacters ?? 0,
      scriptsFound: languageOverrides.scriptsFound ?? [],
      foreignSamples: languageOverrides.foreignSamples ?? [],
      // FilterCheckResult base fields
      actual: languageOverrides.foreignCharacters ?? 0,
      scoreContribution: 1,
    },
    truncationCheck: {
      passed: true,
      truncationIssues: [],
      lastCharacter: '.',
      hasMatchedCodeBlocks: true,
      actual: 0,
      scoreContribution: 1,
    },
    mermaidCheck: {
      passed: true,
      mermaidIssues: [],
      affectedDiagrams: 0,
      totalDiagrams: 0,
      actual: 0,
      scoreContribution: 1,
    },
  };
}

/**
 * Build a minimal HeuristicCheckResults object with truncation issues only.
 */
function makeHeuristicsWithTruncation(truncationIssues: string[]): HeuristicCheckResults {
  return {
    languageCheck: {
      passed: true,
      foreignCharacters: 0,
      scriptsFound: [],
      foreignSamples: [],
      actual: 0,
      scoreContribution: 1,
    },
    truncationCheck: {
      passed: false,
      truncationIssues,
      lastCharacter: 'и',
      hasMatchedCodeBlocks: true,
      actual: truncationIssues.length,
      scoreContribution: 0.5,
    },
    mermaidCheck: {
      passed: true,
      mermaidIssues: [],
      affectedDiagrams: 0,
      totalDiagrams: 0,
      actual: 0,
      scoreContribution: 1,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('buildMinorIssues - zero-tolerance severity logic', () => {
  describe('CJK script (zero-tolerance)', () => {
    it('should produce a FIXABLE LANGUAGE issue for CJK script', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 3,
        scriptsFound: ['CJK'],
        foreignSamples: ['分享'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeDefined();
      expect(langIssue!.severity).toBe('FIXABLE');
      expect(langIssue!.location).toBe('global');
      expect(langIssue!.description).toContain('Zero-tolerance');
    });

    it('should include CJK samples in the FIXABLE issue description', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 3,
        scriptsFound: ['CJK'],
        foreignSamples: ['分享'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue!.description).toContain('分享');
    });
  });

  describe('ARABIC script (zero-tolerance)', () => {
    it('should produce a FIXABLE LANGUAGE issue for ARABIC script', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 7,
        scriptsFound: ['ARABIC'],
        foreignSamples: ['العربية'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeDefined();
      expect(langIssue!.severity).toBe('FIXABLE');
    });

    it('should include ARABIC samples in the description', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 7,
        scriptsFound: ['ARABIC'],
        foreignSamples: ['العربية'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE')!;
      expect(langIssue.description).toContain('العربية');
    });
  });

  describe('LATIN script (not zero-tolerance)', () => {
    it('should produce an INFO LANGUAGE issue for LATIN script', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 5,
        scriptsFound: ['LATIN'],
        foreignSamples: ['hello'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeDefined();
      expect(langIssue!.severity).toBe('INFO');
    });

    it('should mention "Minor script mixing" in INFO issue description', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 5,
        scriptsFound: ['LATIN'],
        foreignSamples: ['hello'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE')!;
      expect(langIssue.description).toContain('Minor script mixing');
    });
  });

  describe('Mixed scripts (LATIN + CJK)', () => {
    it('should produce a FIXABLE issue when at least one zero-tolerance script is present', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 8,
        scriptsFound: ['LATIN', 'CJK'],
        foreignSamples: ['hello', '公司'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeDefined();
      // CJK is zero-tolerance, so the whole issue escalates to FIXABLE
      expect(langIssue!.severity).toBe('FIXABLE');
    });
  });

  describe('Language check passed', () => {
    it('should produce no LANGUAGE issue when languageCheck.passed is true', () => {
      const heuristics = makeHeuristicsWithLanguage({ passed: true });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeUndefined();
    });

    it('should return an empty array when both language and truncation checks pass', () => {
      const heuristics: HeuristicCheckResults = {
        languageCheck: {
          passed: true,
          foreignCharacters: 0,
          scriptsFound: [],
          foreignSamples: [],
          actual: 0,
          scoreContribution: 1,
        },
        truncationCheck: {
          passed: true,
          truncationIssues: [],
          lastCharacter: '.',
          hasMatchedCodeBlocks: true,
          actual: 0,
          scoreContribution: 1,
        },
        mermaidCheck: {
          passed: true,
          mermaidIssues: [],
          affectedDiagrams: 0,
          totalDiagrams: 0,
          actual: 0,
          scoreContribution: 1,
        },
      };

      const issues = buildMinorIssues(heuristics);

      expect(issues).toHaveLength(0);
    });
  });

  describe('Truncation issues', () => {
    it('should produce an INFO TRUNCATION issue when truncationCheck fails', () => {
      const heuristics = makeHeuristicsWithTruncation(['Content appears cut off mid-sentence']);

      const issues = buildMinorIssues(heuristics);

      const truncIssue = issues.find(i => i.type === 'TRUNCATION');
      expect(truncIssue).toBeDefined();
      expect(truncIssue!.severity).toBe('INFO');
      expect(truncIssue!.location).toBe('global');
    });

    it('should join multiple truncation issues into description', () => {
      const heuristics = makeHeuristicsWithTruncation([
        'Content cut off mid-sentence',
        'Unmatched code block',
      ]);

      const issues = buildMinorIssues(heuristics);

      const truncIssue = issues.find(i => i.type === 'TRUNCATION')!;
      expect(truncIssue.description).toContain('Content cut off mid-sentence');
      expect(truncIssue.description).toContain('Unmatched code block');
    });

    it('should emit TRUNCATION issue independently of language check', () => {
      // Language passes, truncation fails
      const heuristics = makeHeuristicsWithTruncation(['cut off mid-sentence']);

      const issues = buildMinorIssues(heuristics);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('TRUNCATION');
      expect(issues[0].severity).toBe('INFO');
    });

    it('should emit both LANGUAGE and TRUNCATION issues when both checks fail', () => {
      const heuristics: HeuristicCheckResults = {
        languageCheck: {
          passed: false,
          foreignCharacters: 3,
          scriptsFound: ['CJK'],
          foreignSamples: ['公司'],
          actual: 3,
          scoreContribution: 0.85,
        },
        truncationCheck: {
          passed: false,
          truncationIssues: ['Content appears cut off'],
          lastCharacter: 'и',
          hasMatchedCodeBlocks: true,
          actual: 1,
          scoreContribution: 0.5,
        },
        mermaidCheck: {
          passed: true,
          mermaidIssues: [],
          affectedDiagrams: 0,
          totalDiagrams: 0,
          actual: 0,
          scoreContribution: 1,
        },
      };

      const issues = buildMinorIssues(heuristics);

      expect(issues).toHaveLength(2);
      const types = issues.map(i => i.type);
      expect(types).toContain('LANGUAGE');
      expect(types).toContain('TRUNCATION');
    });
  });

  describe('DEVANAGARI script (zero-tolerance)', () => {
    it('should produce a FIXABLE issue for DEVANAGARI script', () => {
      const heuristics = makeHeuristicsWithLanguage({
        passed: false,
        foreignCharacters: 4,
        scriptsFound: ['DEVANAGARI'],
        foreignSamples: ['नमस्ते'],
      });

      const issues = buildMinorIssues(heuristics);

      const langIssue = issues.find(i => i.type === 'LANGUAGE');
      expect(langIssue).toBeDefined();
      expect(langIssue!.severity).toBe('FIXABLE');
    });
  });
});
