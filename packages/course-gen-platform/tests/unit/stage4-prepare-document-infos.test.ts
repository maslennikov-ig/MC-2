/**
 * Unit tests for prepareDocumentInfos
 *
 * Validates that Stage 4 budget allocator receives correct priorities:
 * - Stage 3 LLM-based priorities when available (CORE by relevance)
 * - Size-based fallback when Stage 3 data is absent (backward compat)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareDocumentInfos } from '../../src/stages/stage4-analysis/orchestrator-helpers';
import type { DocumentSummaryResult } from '../../src/stages/stage4-analysis/handler-helpers';

// Mock logger (imported by orchestrator-helpers)
vi.mock('../../src/shared/logger', () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeDoc(
  overrides: Partial<DocumentSummaryResult> & { document_id: string }
): DocumentSummaryResult {
  return {
    file_name: 'test.pdf',
    processed_content: 'summary content',
    processing_method: 'balanced',
    summary_metadata: {
      original_tokens: 50000,
      summary_tokens: 5000,
      compression_ratio: 0.1,
      quality_score: 0.8,
    },
    stage3_priority: null,
    stage3_importance_score: null,
    ...overrides,
  };
}

describe('prepareDocumentInfos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for undefined input', () => {
    expect(prepareDocumentInfos(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(prepareDocumentInfos([])).toEqual([]);
  });

  describe('with Stage 3 priorities', () => {
    it('uses Stage 3 CORE/IMPORTANT/SUPPLEMENTARY priorities', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-small-core',
          summary_metadata: {
            original_tokens: 58000,
            summary_tokens: 5000,
            compression_ratio: 0.086,
            quality_score: 0.7,
          },
          stage3_priority: 'CORE',
          stage3_importance_score: 0.95,
        }),
        makeDoc({
          document_id: 'doc-large-important',
          summary_metadata: {
            original_tokens: 287000,
            summary_tokens: 15000,
            compression_ratio: 0.052,
            quality_score: 0.85,
          },
          stage3_priority: 'IMPORTANT',
          stage3_importance_score: 0.72,
        }),
        makeDoc({
          document_id: 'doc-supplementary',
          summary_metadata: {
            original_tokens: 30000,
            summary_tokens: 3000,
            compression_ratio: 0.1,
            quality_score: 0.6,
          },
          stage3_priority: 'SUPPLEMENTARY',
          stage3_importance_score: 0.35,
        }),
      ];

      const result = prepareDocumentInfos(docs);

      expect(result).toHaveLength(3);

      // CORE is the small but relevant doc (58K), NOT the largest (287K)
      const coreDoc = result.find(d => d.priority === 'CORE');
      expect(coreDoc).toBeDefined();
      expect(coreDoc!.file_id).toBe('doc-small-core');
      expect(coreDoc!.original_tokens).toBe(58000);
      expect(coreDoc!.importance_score).toBe(0.95);

      // IMPORTANT is the large doc
      const importantDoc = result.find(d => d.priority === 'IMPORTANT');
      expect(importantDoc).toBeDefined();
      expect(importantDoc!.file_id).toBe('doc-large-important');
      expect(importantDoc!.importance_score).toBe(0.72);

      // SUPPLEMENTARY
      const suppDoc = result.find(d => d.priority === 'SUPPLEMENTARY');
      expect(suppDoc).toBeDefined();
      expect(suppDoc!.file_id).toBe('doc-supplementary');
    });

    it('uses stage3_importance_score over quality_score', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          stage3_priority: 'CORE',
          stage3_importance_score: 0.98,
          summary_metadata: {
            original_tokens: 10000,
            summary_tokens: 1000,
            compression_ratio: 0.1,
            quality_score: 0.5, // quality_score is low but stage3 score is high
          },
        }),
      ];

      const result = prepareDocumentInfos(docs);
      expect(result[0].importance_score).toBe(0.98);
    });

    it('falls back to quality_score when stage3_importance_score is null', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          stage3_priority: 'CORE',
          stage3_importance_score: null,
          summary_metadata: {
            original_tokens: 10000,
            summary_tokens: 1000,
            compression_ratio: 0.1,
            quality_score: 0.75,
          },
        }),
      ];

      const result = prepareDocumentInfos(docs);
      expect(result[0].importance_score).toBe(0.75);
    });
  });

  describe('Stage 3 priority validation', () => {
    it('falls back to size heuristic when 0 CORE docs (all IMPORTANT)', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          summary_metadata: {
            original_tokens: 100000,
            summary_tokens: 10000,
            compression_ratio: 0.1,
            quality_score: 0.9,
          },
          stage3_priority: 'IMPORTANT',
          stage3_importance_score: 0.8,
        }),
        makeDoc({
          document_id: 'doc-2',
          summary_metadata: {
            original_tokens: 50000,
            summary_tokens: 5000,
            compression_ratio: 0.1,
            quality_score: 0.6,
          },
          stage3_priority: 'IMPORTANT',
          stage3_importance_score: 0.6,
        }),
      ];

      const result = prepareDocumentInfos(docs);

      // Should fall back to size heuristic: largest = CORE
      const coreDoc = result.find(d => d.priority === 'CORE');
      expect(coreDoc).toBeDefined();
      expect(coreDoc!.file_id).toBe('doc-1'); // largest doc
    });

    it('falls back to size heuristic when 2 CORE docs', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          summary_metadata: {
            original_tokens: 80000,
            summary_tokens: 8000,
            compression_ratio: 0.1,
            quality_score: 0.9,
          },
          stage3_priority: 'CORE',
          stage3_importance_score: 0.9,
        }),
        makeDoc({
          document_id: 'doc-2',
          summary_metadata: {
            original_tokens: 120000,
            summary_tokens: 12000,
            compression_ratio: 0.1,
            quality_score: 0.85,
          },
          stage3_priority: 'CORE',
          stage3_importance_score: 0.85,
        }),
      ];

      const result = prepareDocumentInfos(docs);

      // Inconsistent Stage 3 data → size heuristic → largest = CORE
      const coreDocs = result.filter(d => d.priority === 'CORE');
      expect(coreDocs).toHaveLength(1);
      expect(coreDocs[0].file_id).toBe('doc-2'); // 120K > 80K
    });

    it('falls back to size heuristic when priority values are invalid', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          summary_metadata: {
            original_tokens: 50000,
            summary_tokens: 5000,
            compression_ratio: 0.1,
            quality_score: 0.9,
          },
          stage3_priority: 'INVALID_VALUE' as 'CORE',
          stage3_importance_score: 0.8,
        }),
        makeDoc({
          document_id: 'doc-2',
          summary_metadata: {
            original_tokens: 100000,
            summary_tokens: 10000,
            compression_ratio: 0.1,
            quality_score: 0.7,
          },
          stage3_priority: 'CORE',
          stage3_importance_score: 0.9,
        }),
      ];

      const result = prepareDocumentInfos(docs);

      // Invalid value → size heuristic → largest = CORE
      const coreDoc = result.find(d => d.priority === 'CORE');
      expect(coreDoc).toBeDefined();
      expect(coreDoc!.file_id).toBe('doc-2'); // 100K > 50K
    });
  });

  describe('without Stage 3 priorities (backward compat)', () => {
    it('assigns CORE to largest document by token count', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-small',
          summary_metadata: {
            original_tokens: 20000,
            summary_tokens: 2000,
            compression_ratio: 0.1,
            quality_score: 0.9,
          },
        }),
        makeDoc({
          document_id: 'doc-large',
          summary_metadata: {
            original_tokens: 200000,
            summary_tokens: 20000,
            compression_ratio: 0.1,
            quality_score: 0.7,
          },
        }),
      ];

      const result = prepareDocumentInfos(docs);

      const coreDoc = result.find(d => d.priority === 'CORE');
      expect(coreDoc).toBeDefined();
      expect(coreDoc!.file_id).toBe('doc-large');
    });

    it('assigns IMPORTANT when quality_score > 0.7', () => {
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'doc-1',
          summary_metadata: {
            original_tokens: 100000,
            summary_tokens: 10000,
            compression_ratio: 0.1,
            quality_score: 0.8,
          },
        }),
        makeDoc({
          document_id: 'doc-2',
          summary_metadata: {
            original_tokens: 50000,
            summary_tokens: 5000,
            compression_ratio: 0.1,
            quality_score: 0.75,
          },
        }),
        makeDoc({
          document_id: 'doc-3',
          summary_metadata: {
            original_tokens: 30000,
            summary_tokens: 3000,
            compression_ratio: 0.1,
            quality_score: 0.5,
          },
        }),
      ];

      const result = prepareDocumentInfos(docs);

      expect(result.find(d => d.file_id === 'doc-1')!.priority).toBe('CORE');
      expect(result.find(d => d.file_id === 'doc-2')!.priority).toBe('IMPORTANT');
      expect(result.find(d => d.file_id === 'doc-3')!.priority).toBe('SUPPLEMENTARY');
    });
  });

  describe('real-world scenario: course 0b3af59d pattern', () => {
    it('Stage 3 correctly assigns CORE to small relevant doc over large general doc', () => {
      // Real case: Stage 3 classified 58K doc as CORE (most relevant)
      // but the 287K doc is larger (would be CORE by size heuristic)
      const docs: DocumentSummaryResult[] = [
        makeDoc({
          document_id: 'relevant-58k',
          file_name: 'course-specific-material.pdf',
          summary_metadata: {
            original_tokens: 58000,
            summary_tokens: 5800,
            compression_ratio: 0.1,
            quality_score: 0.7,
          },
          stage3_priority: 'CORE',
          stage3_importance_score: 0.95,
        }),
        makeDoc({
          document_id: 'general-287k',
          file_name: 'general-reference.pdf',
          summary_metadata: {
            original_tokens: 287000,
            summary_tokens: 15000,
            compression_ratio: 0.052,
            quality_score: 0.85,
          },
          stage3_priority: 'IMPORTANT',
          stage3_importance_score: 0.72,
        }),
        makeDoc({
          document_id: 'extra-12k',
          file_name: 'supplementary.pdf',
          summary_metadata: {
            original_tokens: 12000,
            summary_tokens: 1200,
            compression_ratio: 0.1,
            quality_score: 0.5,
          },
          stage3_priority: 'SUPPLEMENTARY',
          stage3_importance_score: 0.28,
        }),
      ];

      const result = prepareDocumentInfos(docs);

      // CORE = 58K relevant doc (NOT the 287K general doc)
      const coreDoc = result.find(d => d.priority === 'CORE')!;
      expect(coreDoc.file_id).toBe('relevant-58k');
      expect(coreDoc.original_tokens).toBe(58000);

      // IMPORTANT = 287K general doc (would have been CORE by size)
      const importantDoc = result.find(d => d.priority === 'IMPORTANT')!;
      expect(importantDoc.file_id).toBe('general-287k');
      expect(importantDoc.original_tokens).toBe(287000);

      // This prevents token overflow: budget allocator loads 58K full text
      // instead of 287K full text, staying within context limits
    });
  });
});
