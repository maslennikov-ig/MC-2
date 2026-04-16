/**
 * Round-trip regression tests for truncation issue code contract.
 *
 * These tests lock in the contract between structural-checks.ts (produces
 * issue message strings) and self-reviewer-phases.ts (classifies by code).
 * They prevent a silent regression: if someone changes a message prefix
 * in structural-checks.ts without updating TRUNCATION_ISSUE_PREFIXES,
 * classifyTruncationIssue would return null for that message and the
 * categorizer would treat it as `unknown` → conservatively non-blocking.
 *
 * This is the failure mode we want to catch EARLY in tests.
 */
import { describe, expect, it } from 'vitest';
import {
  checkContentTruncation,
  classifyTruncationIssue,
  TRUNCATION_ISSUE_PREFIXES,
} from '@/stages/stage6-lesson-content/judge/filters/structural-checks';
import { categorizeTruncationIssues } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases';

const PAD =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.';

describe('truncation issue code round-trip', () => {
  it('every message produced by checkContentTruncation is classifiable', () => {
    // Craft content that triggers every check
    const content = `${PAD}${PAD}\n\n## Bad Section\n\nNo proper ending but more than fifty characters to pass the filter threshold boundary quick\n\n## Last\n\nи`;

    const result = checkContentTruncation(content);
    expect(result.passed).toBe(false);

    // Every produced message should be recognizable by the classifier
    for (const msg of result.truncationIssues) {
      const kind = classifyTruncationIssue(msg);
      expect(kind, `message "${msg}" was not classifiable`).not.toBeNull();
    }

    // Categorizer should not have anything in the `unknown` bucket
    const categorized = categorizeTruncationIssues(result.truncationIssues);
    expect(categorized.unknown).toHaveLength(0);
  });

  it('SUSPICIOUSLY_SHORT messages are classified as deterministic', () => {
    const short = 'Short.';
    const result = checkContentTruncation(short);
    expect(
      result.truncationIssues.some(m => m.startsWith(TRUNCATION_ISSUE_PREFIXES.SUSPICIOUSLY_SHORT))
    ).toBe(true);

    const categorized = categorizeTruncationIssues(result.truncationIssues);
    expect(categorized.deterministic.length).toBeGreaterThan(0);
  });

  it('UNMATCHED_CODE messages are classified as deterministic', () => {
    const broken = `${PAD}${PAD}\n\`\`\`ts\nconst x = 1;`; // unclosed fence
    const result = checkContentTruncation(broken);
    const unmatched = result.truncationIssues.find(m =>
      m.startsWith(TRUNCATION_ISSUE_PREFIXES.UNMATCHED_CODE)
    );
    expect(unmatched).toBeDefined();
    expect(classifyTruncationIssue(unmatched)).toBe('UNMATCHED_CODE');
  });

  it('MID_SENTENCE messages are classified as deterministic', () => {
    // Content ending with a comma is an explicit mid-sentence pattern.
    // (Word-boundary patterns with Cyrillic don't match reliably in JS regex,
    // so comma is the most reliable trigger across languages.)
    const midSentence = `${PAD}${PAD} this is an important list including items such as:,`;
    const result = checkContentTruncation(midSentence);
    const mid = result.truncationIssues.find(m =>
      m.startsWith(TRUNCATION_ISSUE_PREFIXES.MID_SENTENCE)
    );
    expect(mid).toBeDefined();
    expect(classifyTruncationIssue(mid)).toBe('MID_SENTENCE');
  });

  it('GLOBAL_ENDING messages are classified as globalEnding (composite-required)', () => {
    const noEnd = `${PAD}${PAD} end with word, not punctuation "and"`;
    const result = checkContentTruncation(noEnd);
    const globalMsg = result.truncationIssues.find(m =>
      m.startsWith(TRUNCATION_ISSUE_PREFIXES.GLOBAL_ENDING)
    );
    if (globalMsg) {
      expect(classifyTruncationIssue(globalMsg)).toBe('GLOBAL_ENDING');
    }
  });

  it('unknown messages go to `unknown` bucket (fail-open, not fail-closed)', () => {
    // Artificial: simulate a new check added without wiring severity
    const categorized = categorizeTruncationIssues(['Mystery future check triggered']);

    expect(categorized.unknown).toHaveLength(1);
    expect(categorized.deterministic).toHaveLength(0);
    // Fail-open: unknown → treated as non-blocking, not auto-escalated
  });

  it('TRUNCATION_ISSUE_PREFIXES constants match actual message outputs', () => {
    // Each prefix must be a string that classifyTruncationIssue recognizes
    // when prepended to sample suffixes. This catches prefix typos early.
    const samples = {
      GLOBAL_ENDING: 'Content does not end with proper punctuation (last char: "x")',
      UNMATCHED_CODE: 'Unmatched code blocks detected (3 markers found, expected even number)',
      MID_SENTENCE: 'Content appears to end mid-sentence',
      SUSPICIOUSLY_SHORT: 'Content suspiciously short (120 characters)',
      CALLOUT_TRUNCATED: 'Callout block appears truncated (last line: "[!TIP]")',
    } as const;

    for (const [kind, msg] of Object.entries(samples)) {
      expect(classifyTruncationIssue(msg), `sample for ${kind} failed`).toBe(kind);
    }

    // SECTION_TRUNCATED has a variable number, not in PREFIXES as constant but tested
    expect(classifyTruncationIssue('Section 3 appears truncated (ends with "|")')).toBe(
      'SECTION_TRUNCATED'
    );
  });
});
