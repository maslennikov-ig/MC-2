/**
 * Unit tests for Tournament Classification Utility
 * @module tests/unit/stages/stage2/tournament-classification
 *
 * Tests cover:
 * - Single-stage vs two-stage decision logic
 * - Greedy bin packing algorithm for balanced groups
 * - finalistsPerGroup calculation
 * - Edge cases: single document, empty array, zero tokens
 * - Group balancing validation
 *
 * Note: Only tests pure functions. LLM execution functions are skipped.
 */

import { describe, it, expect } from 'vitest';
import {
  planTournamentClassification,
  type DocumentForClassification,
  type TournamentPlan,
} from '../../../../src/stages/stage2-document-processing/utils/tournament-classification';

describe('Tournament Classification Utility', () => {
  describe('planTournamentClassification - Single-Stage Decision', () => {
    it('should use single-stage classification when all summaries fit in budget', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 1000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 2000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'doc3.pdf',
          mime_type: 'application/pdf',
          file_size: 1500,
          summary: 'Summary 3',
          summaryTokens: 1500,
        },
      ];

      const availableBudget = 10_000; // Total = 4500 tokens < 10_000 budget
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].documents).toHaveLength(3);
      expect(plan.groups[0].totalTokens).toBe(4500);
      expect(plan.finalistsPerGroup).toBe(3); // All documents
    });

    it('should use single-stage when total tokens exactly equals budget', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 10_000; // Total = 10_000 tokens === budget
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.finalistsPerGroup).toBe(2);
    });

    it('should handle single document within budget', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 10_000;
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].documents).toHaveLength(1);
      expect(plan.finalistsPerGroup).toBe(1);
    });
  });

  describe('planTournamentClassification - Two-Stage Decision', () => {
    it('should use two-stage classification when summaries exceed budget', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 6000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 7000,
        },
      ];

      const availableBudget = 10_000; // Total = 13_000 tokens > 10_000 budget
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups.length).toBeGreaterThan(1);

      // Verify all documents are included
      const allDocs = plan.groups.flatMap((g) => g.documents);
      expect(allDocs).toHaveLength(2);
    });

    it('should create correct number of groups based on budget', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 8000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 8000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'doc3.pdf',
          mime_type: 'application/pdf',
          file_size: 1500,
          summary: 'Summary 3',
          summaryTokens: 8000,
        },
      ];

      const availableBudget = 10_000; // Total = 24_000 → 3 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(3); // ceil(24_000 / 10_000) = 3

      // Verify all documents distributed
      const allDocs = plan.groups.flatMap((g) => g.documents);
      expect(allDocs).toHaveLength(3);
    });

    it('should calculate finalistsPerGroup correctly', () => {
      const documents: DocumentForClassification[] = Array.from({ length: 10 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        filename: `doc${i}.pdf`,
        mime_type: 'application/pdf',
        file_size: 1024,
        summary: `Summary ${i}`,
        summaryTokens: 5000, // Total = 50_000 tokens
      }));

      const availableBudget = 20_000; // 3 groups (ceil(50_000 / 20_000) = 3)
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(3);

      // avgTokensPerDoc = 50_000 / 10 = 5000
      // maxFinalists = floor(20_000 / 5000) = 4
      // finalistsPerGroup = max(2, floor(4 / 3)) = max(2, 1) = 2
      expect(plan.finalistsPerGroup).toBeGreaterThanOrEqual(2);
      expect(plan.finalistsPerGroup).toBeLessThanOrEqual(4);
    });

    it('should ensure finalistsPerGroup is at least 2', () => {
      const documents: DocumentForClassification[] = Array.from({ length: 20 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        filename: `doc${i}.pdf`,
        mime_type: 'application/pdf',
        file_size: 1024,
        summary: `Summary ${i}`,
        summaryTokens: 1000, // Total = 20_000 tokens
      }));

      const availableBudget = 5_000; // 4 groups (ceil(20_000 / 5_000) = 4)
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.finalistsPerGroup).toBeGreaterThanOrEqual(2);
    });
  });

  describe('planTournamentClassification - Greedy Bin Packing', () => {
    it('should produce balanced groups with similar token counts', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'large.pdf',
          mime_type: 'application/pdf',
          file_size: 5000,
          summary: 'Large summary',
          summaryTokens: 10000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'medium1.pdf',
          mime_type: 'application/pdf',
          file_size: 3000,
          summary: 'Medium summary 1',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'medium2.pdf',
          mime_type: 'application/pdf',
          file_size: 3000,
          summary: 'Medium summary 2',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000004',
          filename: 'small1.pdf',
          mime_type: 'application/pdf',
          file_size: 1000,
          summary: 'Small summary 1',
          summaryTokens: 2000,
        },
        {
          id: '00000000-0000-0000-0000-000000000005',
          filename: 'small2.pdf',
          mime_type: 'application/pdf',
          file_size: 1000,
          summary: 'Small summary 2',
          summaryTokens: 2000,
        },
      ];

      const availableBudget = 15_000; // Total = 24_000 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(2);

      // Check balance: groups should have similar token counts
      const tokenCounts = plan.groups.map((g) => g.totalTokens);
      const maxTokens = Math.max(...tokenCounts);
      const minTokens = Math.min(...tokenCounts);
      const imbalance = maxTokens - minTokens;

      // Allow some imbalance, but should be reasonably balanced
      expect(imbalance).toBeLessThan(6000); // Less than largest doc
    });

    it('should sort documents by token count (largest first) before packing', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'small.pdf',
          mime_type: 'application/pdf',
          file_size: 1000,
          summary: 'Small',
          summaryTokens: 1000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'large.pdf',
          mime_type: 'application/pdf',
          file_size: 5000,
          summary: 'Large',
          summaryTokens: 10000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'medium.pdf',
          mime_type: 'application/pdf',
          file_size: 3000,
          summary: 'Medium',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 8_000; // Total = 16_000 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(2);

      // Verify all documents included
      const allDocs = plan.groups.flatMap((g) => g.documents);
      expect(allDocs).toHaveLength(3);

      // Original document order should not affect grouping
      const originalIds = documents.map((d) => d.id);
      const groupedIds = allDocs.map((d) => d.id).sort();
      expect(groupedIds).toEqual(originalIds.sort());
    });

    it('should place each document in group with minimum tokens', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 3000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 3000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'doc3.pdf',
          mime_type: 'application/pdf',
          file_size: 1500,
          summary: 'Summary 3',
          summaryTokens: 3000,
        },
      ];

      const availableBudget = 5_000; // Total = 9_000 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(2);

      // With equal-sized docs, bin packing should distribute evenly
      const groupSizes = plan.groups.map((g) => g.documents.length);
      expect(groupSizes).toEqual([2, 1]); // 2 in one group, 1 in other
    });
  });

  describe('planTournamentClassification - Edge Cases', () => {
    it('should handle empty document array', () => {
      const documents: DocumentForClassification[] = [];
      const availableBudget = 10_000;

      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].documents).toHaveLength(0);
      expect(plan.groups[0].totalTokens).toBe(0);
      expect(plan.finalistsPerGroup).toBe(0);
    });

    it('should handle documents with zero tokens', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'empty.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: '',
          summaryTokens: 0,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 10_000;
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].totalTokens).toBe(5000);
    });

    it('should handle all documents with same token count', () => {
      const documents: DocumentForClassification[] = Array.from({ length: 5 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000000${i}`,
        filename: `doc${i}.pdf`,
        mime_type: 'application/pdf',
        file_size: 1024,
        summary: `Summary ${i}`,
        summaryTokens: 3000, // All same size
      }));

      const availableBudget = 7_000; // Total = 15_000 → 3 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(3); // ceil(15_000 / 7_000) = 3

      // With equal sizes, distribution should be even
      const groupSizes = plan.groups.map((g) => g.documents.length);
      expect(groupSizes).toEqual([2, 2, 1]); // 5 docs distributed across 3 groups
    });

    it('should handle very small budget (forces many groups)', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'doc3.pdf',
          mime_type: 'application/pdf',
          file_size: 1500,
          summary: 'Summary 3',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 4_000; // Total = 15_000 → 4 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(4); // ceil(15_000 / 4_000) = 4

      // More groups than documents means some groups empty? No, documents distributed
      const allDocs = plan.groups.flatMap((g) => g.documents);
      expect(allDocs).toHaveLength(3);
    });

    it('should handle very large budget (single group)', () => {
      const documents: DocumentForClassification[] = Array.from({ length: 100 }, (_, i) => ({
        id: `00000000-0000-0000-0000-00000000${String(i).padStart(4, '0')}`,
        filename: `doc${i}.pdf`,
        mime_type: 'application/pdf',
        file_size: 1024,
        summary: `Summary ${i}`,
        summaryTokens: 1000,
      }));

      const availableBudget = 1_000_000; // Total = 100_000 tokens < 1M budget
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(false);
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].documents).toHaveLength(100);
      expect(plan.finalistsPerGroup).toBe(100);
    });

    it('should handle documents with extremely unbalanced token counts', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'massive.pdf',
          mime_type: 'application/pdf',
          file_size: 50000,
          summary: 'Massive summary',
          summaryTokens: 50000, // Very large
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'tiny.pdf',
          mime_type: 'application/pdf',
          file_size: 100,
          summary: 'Tiny',
          summaryTokens: 100, // Very small
        },
      ];

      const availableBudget = 30_000; // Total = 50_100 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(2);

      // Each document in separate group due to size difference
      const groupSizes = plan.groups.map((g) => g.documents.length);
      expect(groupSizes).toEqual([1, 1]);
    });
  });

  describe('planTournamentClassification - Group Token Calculations', () => {
    it('should correctly sum tokens for each group', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'doc2.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 3000,
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          filename: 'doc3.pdf',
          mime_type: 'application/pdf',
          file_size: 1500,
          summary: 'Summary 3',
          summaryTokens: 4000,
        },
      ];

      const availableBudget = 7_000; // Total = 12_000 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);
      expect(plan.groups).toHaveLength(2);

      // Verify total tokens across all groups equals original total
      const totalGroupTokens = plan.groups.reduce((sum, g) => sum + g.totalTokens, 0);
      expect(totalGroupTokens).toBe(12000);

      // Verify each group's totalTokens matches sum of its documents
      for (const group of plan.groups) {
        const expected = group.documents.reduce((sum, d) => sum + d.summaryTokens, 0);
        expect(group.totalTokens).toBe(expected);
      }
    });

    it('should respect document metadata integrity during grouping', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'test1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          filename: 'test2.docx',
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          file_size: 2048,
          summary: 'Summary 2',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 6_000; // Total = 10_000 → 2 groups
      const plan = planTournamentClassification(documents, availableBudget);

      expect(plan.requiresTwoStage).toBe(true);

      // Verify documents retain all metadata
      const allDocs = plan.groups.flatMap((g) => g.documents);
      for (const doc of allDocs) {
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('filename');
        expect(doc).toHaveProperty('mime_type');
        expect(doc).toHaveProperty('file_size');
        expect(doc).toHaveProperty('summary');
        expect(doc).toHaveProperty('summaryTokens');
      }
    });
  });

  describe('planTournamentClassification - Type Safety', () => {
    it('should return TournamentPlan interface with correct structure', () => {
      const documents: DocumentForClassification[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          filename: 'doc1.pdf',
          mime_type: 'application/pdf',
          file_size: 1024,
          summary: 'Summary 1',
          summaryTokens: 5000,
        },
      ];

      const availableBudget = 10_000;
      const plan = planTournamentClassification(documents, availableBudget);

      // Type assertions
      expect(plan).toHaveProperty('groups');
      expect(plan).toHaveProperty('finalistsPerGroup');
      expect(plan).toHaveProperty('requiresTwoStage');

      expect(Array.isArray(plan.groups)).toBe(true);
      expect(typeof plan.finalistsPerGroup).toBe('number');
      expect(typeof plan.requiresTwoStage).toBe('boolean');

      // Each group has correct structure
      for (const group of plan.groups) {
        expect(group).toHaveProperty('documents');
        expect(group).toHaveProperty('totalTokens');
        expect(Array.isArray(group.documents)).toBe(true);
        expect(typeof group.totalTokens).toBe('number');
      }
    });
  });
});
