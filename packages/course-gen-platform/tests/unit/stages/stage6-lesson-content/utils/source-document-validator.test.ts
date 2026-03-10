/**
 * Tests for stage6-lesson-content/utils/source-document-validator.ts
 *
 * Pure functions:
 * - validateSourceDocuments: rule-based validation with options
 * - hasCoreDocument: quick CORE existence check
 * - getSourceDocumentStats: summary statistics
 */
import { describe, it, expect } from 'vitest';
import {
  validateSourceDocuments,
  hasCoreDocument,
  getSourceDocumentStats,
} from '@/stages/stage6-lesson-content/utils/source-document-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDoc(priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY', chunkCount = 5) {
  return {
    document_id: `doc-${Math.random().toString(36).slice(2)}`,
    file_name: `file-${priority.toLowerCase()}.pdf`,
    document_priority: priority,
    chunk_count: chunkCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSourceDocuments
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSourceDocuments', () => {
  it('passes when CORE document is present (default options)', () => {
    const docs = [makeDoc('CORE'), makeDoc('SUPPLEMENTARY')];
    const result = validateSourceDocuments(docs as any);
    expect(result.passed).toBe(true);
    expect(result.coreDocumentUsed).toBe(true);
    expect(result.totalDocuments).toBe(2);
  });

  it('fails when no CORE document (default requireCoreDocument=true)', () => {
    const docs = [makeDoc('SUPPLEMENTARY'), makeDoc('SUPPLEMENTARY')];
    const result = validateSourceDocuments(docs as any);
    expect(result.passed).toBe(false);
    expect(result.coreDocumentUsed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('passes without CORE when requireCoreDocument=false', () => {
    const docs = [makeDoc('IMPORTANT')];
    const result = validateSourceDocuments(docs as any, { requireCoreDocument: false });
    expect(result.passed).toBe(true);
  });

  it('counts priority correctly', () => {
    const docs = [makeDoc('CORE'), makeDoc('CORE'), makeDoc('IMPORTANT'), makeDoc('SUPPLEMENTARY')];
    const result = validateSourceDocuments(docs as any);
    expect(result.priorityCounts.core).toBe(2);
    expect(result.priorityCounts.important).toBe(1);
    expect(result.priorityCounts.supplementary).toBe(1);
  });

  it('calculates coreChunkPercentage', () => {
    const docs = [makeDoc('CORE', 8), makeDoc('SUPPLEMENTARY', 2)];
    const result = validateSourceDocuments(docs as any);
    expect(result.coreChunkPercentage).toBe(80);
  });

  it('fails when coreChunkPercentage below minimum', () => {
    const docs = [makeDoc('CORE', 1), makeDoc('SUPPLEMENTARY', 9)];
    const result = validateSourceDocuments(docs as any, { minCoreChunkPercentage: 50 });
    expect(result.passed).toBe(false);
    expect(result.coreChunkPercentage).toBe(10);
  });

  it('warns on supplementary-only documents', () => {
    const docs = [makeDoc('SUPPLEMENTARY')];
    const result = validateSourceDocuments(docs as any, { requireCoreDocument: false });
    expect(result.warnings.some(w => w.includes('SUPPLEMENTARY'))).toBe(true);
  });

  it('handles empty documents array', () => {
    const result = validateSourceDocuments([], { requireCoreDocument: false });
    expect(result.totalDocuments).toBe(0);
    expect(result.coreChunkPercentage).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasCoreDocument
// ─────────────────────────────────────────────────────────────────────────────

describe('hasCoreDocument', () => {
  it('returns true when CORE document exists', () => {
    expect(hasCoreDocument([makeDoc('CORE')] as any)).toBe(true);
  });

  it('returns false when no CORE document', () => {
    expect(hasCoreDocument([makeDoc('IMPORTANT'), makeDoc('SUPPLEMENTARY')] as any)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasCoreDocument([])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSourceDocumentStats
// ─────────────────────────────────────────────────────────────────────────────

describe('getSourceDocumentStats', () => {
  it('counts documents and chunks correctly', () => {
    const docs = [makeDoc('CORE', 10), makeDoc('IMPORTANT', 5), makeDoc('SUPPLEMENTARY', 3)];
    const stats = getSourceDocumentStats(docs as any);
    expect(stats.totalDocuments).toBe(3);
    expect(stats.totalChunks).toBe(18);
    expect(stats.coreDocuments).toBe(1);
    expect(stats.importantDocuments).toBe(1);
    expect(stats.supplementaryDocuments).toBe(1);
  });

  it('handles empty array', () => {
    const stats = getSourceDocumentStats([]);
    expect(stats.totalDocuments).toBe(0);
    expect(stats.totalChunks).toBe(0);
  });
});
