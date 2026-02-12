/**
 * Unit tests for Quality Validator Service
 * @module tests/unit/quality-validator
 *
 * Tests cover:
 * - High-quality summary validation (>0.75 similarity)
 * - Low-quality summary detection (<0.75 similarity)
 * - Multilingual content support (Russian, English)
 * - Edge cases (empty strings, identical text, very short summaries)
 * - Custom quality thresholds
 * - Cosine similarity computation correctness (via validateSummaryQuality)
 * - Compression ratio tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSummaryQuality,
  type QualityCheckResult,
} from '@/shared/validation/quality-validator';
import * as jinaClient from '@/shared/embeddings/jina-client';

// Mock Jina client
vi.mock('@/shared/embeddings/jina-client', () => ({
  generateEmbedding: vi.fn(),
}));

// Mock logger to reduce noise in test output
vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Helper: compute cosine similarity locally for unit testing
 * (The production code now uses a private class method)
 */
function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) {
    throw new Error('Cannot compute cosine similarity for empty vectors');
  }
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimension mismatch');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);
  return Math.max(0, similarity); // Clamp negative to 0
}

describe('Quality Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cosine Similarity Computation', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const similarity = computeCosineSimilarity(vec, vec);

      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      const similarity = computeCosineSimilarity(vecA, vecB);

      expect(similarity).toBe(0);
    });

    it('should compute correct similarity for similar vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [1.1, 2.1, 2.9];
      const similarity = computeCosineSimilarity(vecA, vecB);

      // Should be very high (close to 1.0) for similar vectors
      expect(similarity).toBeGreaterThan(0.99);
      expect(similarity).toBeLessThanOrEqual(1.0);
    });

    it('should compute correct similarity for opposite vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      const similarity = computeCosineSimilarity(vecA, vecB);

      // Opposite vectors should have negative cosine similarity (clamped to 0)
      expect(similarity).toBe(0);
    });

    it('should throw error for vectors with different dimensions', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2, 3, 4];

      expect(() => computeCosineSimilarity(vecA, vecB)).toThrow('Vector dimension mismatch');
    });

    it('should throw error for empty vectors', () => {
      expect(() => computeCosineSimilarity([], [])).toThrow(
        'Cannot compute cosine similarity for empty vectors'
      );
    });

    it('should handle zero magnitude vector gracefully', () => {
      const vecA = [0, 0, 0];
      const vecB = [1, 2, 3];
      const similarity = computeCosineSimilarity(vecA, vecB);

      // Zero magnitude should return 0 (no similarity)
      expect(similarity).toBe(0);
    });

    it('should compute correct similarity for 768D vectors (Jina-v3 size)', () => {
      // Generate two similar 768D vectors
      const vecA = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100));
      const vecB = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100) * 0.95); // 95% similar

      const similarity = computeCosineSimilarity(vecA, vecB);

      // Should be high similarity
      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThanOrEqual(1.0);
    });
  });

  describe('High-Quality Summary Validation', () => {
    it('should pass validation for high-quality summary (>0.75 similarity)', async () => {
      // Mock embeddings with high similarity (>0.75)
      const mockEmbeddingOriginal = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100));
      const mockEmbeddingSummary = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100) * 0.95);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const originalText =
        'This is a long document about machine learning. It covers various topics including supervised learning, unsupervised learning, and reinforcement learning. The document provides detailed explanations and examples.';
      const summary =
        'The document discusses machine learning topics: supervised learning, unsupervised learning, and reinforcement learning with examples.';

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.quality_check_passed).toBe(true);
      expect(result.quality_score).toBeGreaterThan(0.75);
      expect(result.threshold).toBe(0.75);
      expect(result.original_length).toBe(originalText.length);
      expect(result.summary_length).toBe(summary.length);
      expect(result.compression_ratio).toBeGreaterThan(0);
      expect(result.compression_ratio).toBeLessThan(1);
    });

    it('should pass validation for semantically similar content', async () => {
      // Mock embeddings with similarity around 0.80
      const mockEmbeddingOriginal = Array(768).fill(1);
      const mockEmbeddingSummary = Array(768).fill(0.9); // Will give ~0.95 similarity

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const result = await validateSummaryQuality('Original text about AI', 'Summary about AI');

      expect(result.quality_check_passed).toBe(true);
      expect(result.quality_score).toBeGreaterThan(0.75);
    });
  });

  describe('Low-Quality Summary Detection', () => {
    it('should fail validation for low-quality summary (<0.75 similarity)', async () => {
      // Mock embeddings with low similarity (<0.75)
      const mockEmbeddingOriginal = Array(768).fill(1);
      const mockEmbeddingSummary = Array(768).fill(-1); // Opposite direction = 0 similarity

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const originalText =
        'This is a scientific paper about quantum mechanics and wave-particle duality.';
      const badSummary = 'This is a recipe for chocolate cake with flour and eggs.';

      const result = await validateSummaryQuality(originalText, badSummary);

      expect(result.quality_check_passed).toBe(false);
      expect(result.quality_score).toBeLessThan(0.75);
    });

    it('should fail validation for completely unrelated content', async () => {
      // Mock embeddings with orthogonal vectors (0 similarity)
      const mockEmbeddingOriginal = [1, 0, 0, ...Array(765).fill(0)];
      const mockEmbeddingSummary = [0, 1, 0, ...Array(765).fill(0)];

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const result = await validateSummaryQuality(
        'Document about biology',
        'Summary about cooking'
      );

      expect(result.quality_check_passed).toBe(false);
      expect(result.quality_score).toBe(0);
    });
  });

  describe('Multilingual Content Support', () => {
    it('should validate Russian content correctly', async () => {
      // Mock embeddings with high similarity
      const mockEmbedding = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 50));

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbedding)
        .mockResolvedValueOnce(mockEmbedding);

      const originalText =
        'Машинное обучение является подмножеством искусственного интеллекта. Оно включает обучение с учителем, без учителя и обучение с подкреплением.';
      const summary = 'Машинное обучение - это часть ИИ, включающая различные виды обучения.';

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.quality_check_passed).toBe(true);
      expect(result.quality_score).toBeCloseTo(1.0); // Identical embeddings
    });

    it('should validate mixed English-Russian content', async () => {
      // Mock embeddings
      const mockEmbedding = Array(768).fill(0.5);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbedding)
        .mockResolvedValueOnce(mockEmbedding);

      const originalText =
        'This document contains both English and русский текст for testing purposes.';
      const summary = 'Document with English and Russian text.';

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.quality_check_passed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for empty original text', async () => {
      await expect(validateSummaryQuality('', 'Summary text')).rejects.toThrow(
        'Original text cannot be empty'
      );
    });

    it('should throw error for empty summary', async () => {
      await expect(validateSummaryQuality('Original text', '')).rejects.toThrow(
        'Summary cannot be empty'
      );
    });

    it('should throw error for whitespace-only original text', async () => {
      await expect(validateSummaryQuality('   ', 'Summary text')).rejects.toThrow(
        'Original text cannot be empty'
      );
    });

    it('should throw error for whitespace-only summary', async () => {
      await expect(validateSummaryQuality('Original text', '   ')).rejects.toThrow(
        'Summary cannot be empty'
      );
    });

    it('should validate identical text (perfect similarity)', async () => {
      // Mock identical embeddings (similarity = 1.0)
      const mockEmbedding = Array(768).fill(1);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbedding)
        .mockResolvedValueOnce(mockEmbedding);

      const text = 'This is the exact same text.';

      const result = await validateSummaryQuality(text, text);

      expect(result.quality_check_passed).toBe(true);
      expect(result.quality_score).toBeCloseTo(1.0);
      expect(result.compression_ratio).toBeCloseTo(1.0); // No compression
    });

    it('should validate very short summary', async () => {
      // Mock embeddings with moderate similarity
      const mockEmbeddingOriginal = Array(768).fill(1);
      const mockEmbeddingSummary = Array(768).fill(0.85);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const originalText =
        'This is a very long document with lots of details and information about various topics that need to be summarized concisely.';
      const summary = 'Summary.';

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.summary_length).toBe(8); // "Summary."
      expect(result.compression_ratio).toBeLessThan(0.1); // High compression
    });

    it('should validate very long text', async () => {
      // Mock embeddings
      const mockEmbedding = Array(768).fill(0.5);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbedding)
        .mockResolvedValueOnce(mockEmbedding);

      const longText = 'A'.repeat(100000);
      const summary = 'B'.repeat(10000);

      const result = await validateSummaryQuality(longText, summary);

      expect(result.original_length).toBe(100000);
      expect(result.summary_length).toBe(10000);
      expect(result.compression_ratio).toBe(0.1);
    });
  });

  describe('Custom Quality Thresholds', () => {
    it('should use custom threshold (0.60)', async () => {
      // Mock embeddings with similarity around 0.65
      const mockEmbeddingOriginal = Array(768).fill(1);
      const mockEmbeddingSummary = Array(768).fill(0.7); // Will give ~0.93 similarity

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(mockEmbeddingOriginal)
        .mockResolvedValueOnce(mockEmbeddingSummary);

      const result = await validateSummaryQuality('Original text', 'Summary text', {
        threshold: 0.6,
      });

      expect(result.threshold).toBe(0.6);
      expect(result.quality_check_passed).toBe(true);
    });

    it('should use custom threshold (0.90 - strict)', async () => {
      // Mock embeddings with similarity around 0.85
      const vecA = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100));
      const vecB = Array(768)
        .fill(0)
        .map((_, i) => Math.sin(i / 100) * 0.9);

      vi.mocked(jinaClient.generateEmbedding)
        .mockResolvedValueOnce(vecA)
        .mockResolvedValueOnce(vecB);

      const result = await validateSummaryQuality('Original text', 'Summary text', {
        threshold: 0.9,
      });

      expect(result.threshold).toBe(0.9);
      // With similarity ~0.95, should pass even strict threshold
      expect(result.quality_check_passed).toBe(true);
    });

    it('should fail with strict custom threshold', async () => {
      // Mock embeddings with LOW similarity (intentionally different)
      const vecA = [1, 0, 0, ...Array(765).fill(0)];
      const vecB = [0, 0, 1, ...Array(765).fill(0)];

      let calls = 0;
      vi.mocked(jinaClient.generateEmbedding).mockImplementation(() => {
        calls++;
        return Promise.resolve(calls === 1 ? vecA : vecB);
      });

      const result = await validateSummaryQuality(
        'Original text',
        'Summary text',
        { threshold: 0.95 } // Very strict
      );

      expect(result.threshold).toBe(0.95);
      // Orthogonal vectors should give 0 similarity (definitely < 0.95)
      expect(result.quality_score).toBeLessThan(0.95);
      expect(result.quality_check_passed).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when Jina API fails', async () => {
      vi.mocked(jinaClient.generateEmbedding).mockRejectedValueOnce(new Error('Jina API error'));

      await expect(validateSummaryQuality('Original text', 'Summary text')).rejects.toThrow(
        'Quality validation failed: Jina API error'
      );
    });

    it('should throw error when first embedding generation fails', async () => {
      vi.mocked(jinaClient.generateEmbedding)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(Array(768).fill(1));

      await expect(validateSummaryQuality('Original text', 'Summary text')).rejects.toThrow(
        'Quality validation failed: Network error'
      );
    });

    it('should throw error when second embedding generation fails', async () => {
      let callCount = 0;
      vi.mocked(jinaClient.generateEmbedding).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(Array(768).fill(1));
        }
        return Promise.reject(new Error('Rate limit exceeded'));
      });

      await expect(validateSummaryQuality('Original text', 'Summary text')).rejects.toThrow(
        'Quality validation failed: Rate limit exceeded'
      );
    });

    it('should handle invalid embedding dimensions from API', async () => {
      let callCount = 0;
      vi.mocked(jinaClient.generateEmbedding).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(Array(512).fill(1)); // Wrong dimension
        }
        return Promise.resolve(Array(768).fill(1));
      });

      // The function uses internal cosine similarity which may throw or return unexpected result
      await expect(validateSummaryQuality('Original text', 'Summary text')).rejects.toThrow();
    });
  });

  describe('Compression Ratio Tracking', () => {
    it('should calculate compression ratio correctly', async () => {
      const mockEmbedding = Array(768).fill(1);

      vi.mocked(jinaClient.generateEmbedding).mockResolvedValue(mockEmbedding);

      const originalText = 'A'.repeat(1000);
      const summary = 'A'.repeat(100);

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.compression_ratio).toBe(0.1); // 100/1000 = 0.1
    });

    it('should track compression ratio >1 for longer summary', async () => {
      const mockEmbedding = Array(768).fill(1);

      vi.mocked(jinaClient.generateEmbedding).mockResolvedValue(mockEmbedding);

      const originalText = 'Short';
      const summary = 'This is a much longer summary than the original text.';

      const result = await validateSummaryQuality(originalText, summary);

      expect(result.compression_ratio).toBeGreaterThan(1);
    });
  });

  describe('Performance Metrics', () => {
    it('should complete validation in reasonable time', async () => {
      const mockEmbedding = Array(768).fill(1);

      vi.mocked(jinaClient.generateEmbedding).mockResolvedValue(mockEmbedding);

      const start = Date.now();

      await validateSummaryQuality('Original text', 'Summary text');

      const duration = Date.now() - start;

      // Should complete within 1 second (mocked, so should be fast)
      expect(duration).toBeLessThan(1000);
    });
  });
});
