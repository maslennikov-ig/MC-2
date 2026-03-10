/**
 * Tests for stage6-lesson-content/utils/mermaid-validator.ts — PURE FUNCTIONS ONLY
 *
 * parseMermaidError: structured error parsing from mermaid error strings
 * getValidationSummary: aggregate batch validation stats
 * getValidationCacheStats / clearValidationCache: cache helpers
 */
import { describe, it, expect } from 'vitest';
import {
  parseMermaidError,
  getValidationSummary,
  getValidationCacheStats,
  clearValidationCache,
} from '@/stages/stage6-lesson-content/utils/mermaid-validator';
import type { MermaidValidationResult } from '@/stages/stage6-lesson-content/utils/mermaid-validator';

// ─────────────────────────────────────────────────────────────────────────────
// parseMermaidError
// ─────────────────────────────────────────────────────────────────────────────

describe('parseMermaidError', () => {
  it('extracts line number from error message', () => {
    const parsed = parseMermaidError('Parse error on line 3: Unexpected token');
    expect(parsed.line).toBe(3);
    expect(parsed.rawError).toBe('Parse error on line 3: Unexpected token');
  });

  it('extracts column number from error message', () => {
    const parsed = parseMermaidError('Syntax error at column 15: foo');
    expect(parsed.column).toBe(15);
  });

  it('extracts both line and column', () => {
    const parsed = parseMermaidError('Parse error on line 7, column 12: unexpected end');
    expect(parsed.line).toBe(7);
    expect(parsed.column).toBe(12);
  });

  it('returns clean message without position prefix', () => {
    const parsed = parseMermaidError('Parse error on line 3: Unexpected token PLUS');
    expect(parsed.message).toBe('Unexpected token PLUS');
  });

  it('returns full error as message when no prefix detected', () => {
    const parsed = parseMermaidError('Something went wrong');
    expect(parsed.message).toBe('Something went wrong');
    expect(parsed.line).toBeUndefined();
    expect(parsed.column).toBeUndefined();
  });

  it('preserves rawError unchanged', () => {
    const error = 'Parse error on line 1: invalid stuff';
    const parsed = parseMermaidError(error);
    expect(parsed.rawError).toBe(error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getValidationSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('getValidationSummary', () => {
  const makeResult = (
    valid: boolean,
    diagramType: string | null,
    errors: string[] = []
  ): MermaidValidationResult => ({ valid, errors, diagramType });

  it('counts valid and invalid results', () => {
    const results = [
      makeResult(true, 'flowchart'),
      makeResult(false, null, ['error1']),
      makeResult(true, 'sequence'),
    ];
    const summary = getValidationSummary(results);
    expect(summary.total).toBe(3);
    expect(summary.valid).toBe(2);
    expect(summary.invalid).toBe(1);
  });

  it('counts diagram types', () => {
    const results = [
      makeResult(true, 'flowchart'),
      makeResult(true, 'flowchart'),
      makeResult(true, 'sequence'),
    ];
    const summary = getValidationSummary(results);
    expect(summary.diagramTypes).toEqual({ flowchart: 2, sequence: 1 });
  });

  it('collects unique error messages', () => {
    const results = [
      makeResult(false, null, ['error A']),
      makeResult(false, null, ['error A', 'error B']),
    ];
    const summary = getValidationSummary(results);
    expect(summary.errorMessages).toEqual(expect.arrayContaining(['error A', 'error B']));
    expect(summary.errorMessages).toHaveLength(2); // deduped
  });

  it('handles empty results array', () => {
    const summary = getValidationSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.valid).toBe(0);
    expect(summary.invalid).toBe(0);
    expect(summary.diagramTypes).toEqual({});
    expect(summary.errorMessages).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('validation cache helpers', () => {
  it('getValidationCacheStats returns size and maxSize', () => {
    const stats = getValidationCacheStats();
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('maxSize');
    expect(typeof stats.size).toBe('number');
    expect(stats.maxSize).toBe(100);
  });

  it('clearValidationCache resets cache', () => {
    clearValidationCache();
    const stats = getValidationCacheStats();
    expect(stats.size).toBe(0);
  });
});
