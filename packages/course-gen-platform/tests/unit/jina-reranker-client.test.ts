/**
 * Jina Reranker Client - Unit Tests
 *
 * Comprehensive unit tests for the Jina Reranker v2 API client.
 * Tests configuration validation, input validation, successful reranking,
 * error handling, retries, and edge cases.
 *
 * Test execution: pnpm --filter course-gen-platform test -- tests/unit/jina-reranker-client.test.ts
 *
 * Test coverage:
 * 1. API configuration validation
 * 2. Input validation (empty documents, empty query)
 * 3. Successful reranking with mocked API responses
 * 4. Error handling (rate limits, server errors, client errors)
 * 5. Retry logic with exponential backoff
 * 6. Edge cases (single document, topN handling, truncation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rerankDocuments,
  JinaRerankerError,
  healthCheck,
  type RerankResult,
} from '../../src/shared/jina/reranker-client';

// ============================================================================
// Test Setup and Mocking
// ============================================================================

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Store original environment
const originalEnv = process.env;

beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...originalEnv, JINA_API_KEY: 'test-api-key' };
});

afterEach(() => {
  process.env = originalEnv;
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock successful Jina Reranker API response
 */
function createMockResponse(results: Array<{ index: number; relevance_score: number }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results,
      usage: { total_tokens: 100 },
    }),
  };
}

/**
 * Creates a mock error response
 */
function createMockErrorResponse(
  status: number,
  errorMessage: string,
  errorType = 'API_ERROR'
) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({
      error: {
        message: errorMessage,
        type: errorType,
      },
    }),
  };
}

/**
 * Creates a mock network error
 */
function createNetworkError() {
  return new Error('Network error: fetch failed');
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Jina Reranker Client - Unit Tests', () => {
  // ==========================================================================
  // Test Group 1: API Configuration Tests
  // ==========================================================================

  describe('API Configuration Validation', () => {
    it('should throw JinaRerankerError when JINA_API_KEY is missing', async () => {
      // Given: Missing API key
      delete process.env.JINA_API_KEY;

      // When/Then: Should throw configuration error
      await expect(
        rerankDocuments('test query', ['doc1', 'doc2'])
      ).rejects.toThrow(JinaRerankerError);

      await expect(
        rerankDocuments('test query', ['doc1', 'doc2'])
      ).rejects.toThrow('Missing required environment variable: JINA_API_KEY');

      // Verify error details
      try {
        await rerankDocuments('test query', ['doc1', 'doc2']);
      } catch (error) {
        expect(error).toBeInstanceOf(JinaRerankerError);
        expect((error as JinaRerankerError).errorType).toBe('CONFIG_ERROR');
        expect((error as JinaRerankerError).statusCode).toBeUndefined();
      }
    });

    it('should pass validation when JINA_API_KEY is set', async () => {
      // Given: Valid API key and mock response
      process.env.JINA_API_KEY = 'valid-api-key';

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 0.95 },
          { index: 1, relevance_score: 0.85 },
        ])
      );

      // When: Making API request
      const result = await rerankDocuments('test query', ['doc1', 'doc2']);

      // Then: Should succeed without throwing
      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-api-key',
          }),
        })
      );
    });

    it('should include correct headers in API request', async () => {
      // Given: Valid configuration
      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Making request
      await rerankDocuments('query', ['document']);

      // Then: Should include all required headers
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
    });
  });

  // ==========================================================================
  // Test Group 2: Input Validation Tests
  // ==========================================================================

  describe('Input Validation', () => {
    it('should return empty array when documents array is empty', async () => {
      // Given: Empty documents array
      const query = 'test query';
      const documents: string[] = [];

      // When: Reranking empty documents
      const result = await rerankDocuments(query, documents);

      // Then: Should return empty results without API call
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle single document correctly', async () => {
      // Given: Single document
      const query = 'test query';
      const documents = ['single document'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.88 }])
      );

      // When: Reranking single document
      const result = await rerankDocuments(query, documents);

      // Then: Should return single result
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(0);
      expect(result[0].relevance_score).toBe(0.88);
    });

    it('should throw error when query is empty string', async () => {
      // Given: Empty query
      const query = '';
      const documents = ['doc1', 'doc2'];

      // When/Then: Should throw validation error
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        JinaRerankerError
      );

      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Query cannot be empty'
      );

      try {
        await rerankDocuments(query, documents);
      } catch (error) {
        expect(error).toBeInstanceOf(JinaRerankerError);
        expect((error as JinaRerankerError).errorType).toBe('INVALID_INPUT');
      }
    });

    it('should throw error when query is whitespace only', async () => {
      // Given: Whitespace query
      const query = '   ';
      const documents = ['doc1', 'doc2'];

      // When/Then: Should throw validation error
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Query cannot be empty'
      );
    });

    it('should throw error when all documents are empty', async () => {
      // Given: All empty documents
      const query = 'test query';
      const documents = ['', '  ', ''];

      // When/Then: Should throw validation error
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        JinaRerankerError
      );

      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'All documents are empty'
      );
    });

    it('should throw error when some documents are empty', async () => {
      // Given: Mixed empty and non-empty documents
      const query = 'test query';
      const documents = ['valid doc', '', 'another doc'];

      // When/Then: Should throw validation error
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        JinaRerankerError
      );

      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        '1 empty documents found'
      );
    });

    it('should trim query whitespace before sending to API', async () => {
      // Given: Query with leading/trailing whitespace
      const query = '  test query  ';
      const documents = ['doc1'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Reranking with whitespace query
      await rerankDocuments(query, documents);

      // Then: Should trim query in API request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'jina-reranker-v2-base-multilingual',
            query: 'test query', // Trimmed
            documents: ['doc1'],
            top_n: undefined,
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Test Group 3: Successful Reranking (Mock API)
  // ==========================================================================

  describe('Successful Reranking', () => {
    it('should return results sorted by relevance_score descending', async () => {
      // Given: Mock API response (API returns results sorted by relevance)
      const query = 'machine learning';
      const documents = ['doc1', 'doc2', 'doc3'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 1, relevance_score: 0.95 }, // Highest
          { index: 2, relevance_score: 0.85 }, // Middle
          { index: 0, relevance_score: 0.75 }, // Lowest
        ])
      );

      // When: Reranking documents
      const result = await rerankDocuments(query, documents);

      // Then: Results should be sorted by relevance score (API returns sorted)
      expect(result).toHaveLength(3);
      expect(result[0].relevance_score).toBe(0.95);
      expect(result[1].relevance_score).toBe(0.85);
      expect(result[2].relevance_score).toBe(0.75);
    });

    it('should preserve correct index mapping', async () => {
      // Given: Documents with specific indices
      const query = 'test';
      const documents = ['first', 'second', 'third'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 2, relevance_score: 0.9 }, // 'third'
          { index: 0, relevance_score: 0.8 }, // 'first'
          { index: 1, relevance_score: 0.7 }, // 'second'
        ])
      );

      // When: Reranking
      const result = await rerankDocuments(query, documents);

      // Then: Indices should map to original documents
      expect(result[0].index).toBe(2); // 'third' ranked first
      expect(result[1].index).toBe(0); // 'first' ranked second
      expect(result[2].index).toBe(1); // 'second' ranked third

      // Verify we can retrieve original documents
      expect(documents[result[0].index]).toBe('third');
      expect(documents[result[1].index]).toBe('first');
      expect(documents[result[2].index]).toBe('second');
    });

    it('should send correct model and payload to API', async () => {
      // Given: Test query and documents
      const query = 'test query';
      const documents = ['doc1', 'doc2'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
        ])
      );

      // When: Reranking
      await rerankDocuments(query, documents);

      // Then: Should use correct model and payload
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'jina-reranker-v2-base-multilingual',
            query: 'test query',
            documents: ['doc1', 'doc2'],
            top_n: undefined,
          }),
        })
      );
    });

    it('should support topN parameter', async () => {
      // Given: Multiple documents with topN=2
      const query = 'test';
      const documents = ['doc1', 'doc2', 'doc3', 'doc4'];
      const topN = 2;

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.85 },
        ])
      );

      // When: Reranking with topN
      const result = await rerankDocuments(query, documents, topN);

      // Then: Should return only top 2 results
      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'jina-reranker-v2-base-multilingual',
            query: 'test',
            documents: ['doc1', 'doc2', 'doc3', 'doc4'],
            top_n: 2,
          }),
        })
      );
    });

    it('should handle topN larger than documents length', async () => {
      // Given: topN larger than document count
      const query = 'test';
      const documents = ['doc1', 'doc2'];
      const topN = 10; // Larger than documents.length

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
        ])
      );

      // When: Reranking with large topN
      const result = await rerankDocuments(query, documents, topN);

      // Then: Should return all documents
      expect(result).toHaveLength(2);
    });

    it('should return RerankResult objects with correct structure', async () => {
      // Given: Valid request
      const query = 'test';
      const documents = ['doc'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.88 }])
      );

      // When: Reranking
      const result = await rerankDocuments(query, documents);

      // Then: Should return properly structured RerankResult
      expect(result[0]).toEqual(
        expect.objectContaining({
          index: expect.any(Number),
          relevance_score: expect.any(Number),
        })
      );

      expect(result[0].index).toBe(0);
      expect(result[0].relevance_score).toBe(0.88);
    });
  });

  // ==========================================================================
  // Test Group 4: Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should retry on 429 rate limit error', async () => {
      // Given: Rate limit error followed by success
      const query = 'test';
      const documents = ['doc1'];

      mockFetch
        .mockResolvedValueOnce(
          createMockErrorResponse(429, 'Rate limit exceeded', 'RATE_LIMIT')
        )
        .mockResolvedValueOnce(
          createMockResponse([{ index: 0, relevance_score: 0.9 }])
        );

      // When: Reranking with rate limit
      const result = await rerankDocuments(query, documents);

      // Then: Should retry and succeed
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 server error', async () => {
      // Given: Server error followed by success
      const query = 'test';
      const documents = ['doc1'];

      mockFetch
        .mockResolvedValueOnce(
          createMockErrorResponse(500, 'Internal server error', 'SERVER_ERROR')
        )
        .mockResolvedValueOnce(
          createMockResponse([{ index: 0, relevance_score: 0.9 }])
        );

      // When: Reranking with server error
      const result = await rerankDocuments(query, documents);

      // Then: Should retry and succeed
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 service unavailable', async () => {
      // Given: Service unavailable followed by success
      const query = 'test';
      const documents = ['doc1'];

      mockFetch
        .mockResolvedValueOnce(
          createMockErrorResponse(503, 'Service unavailable', 'SERVICE_UNAVAILABLE')
        )
        .mockResolvedValueOnce(
          createMockResponse([{ index: 0, relevance_score: 0.9 }])
        );

      // When: Reranking with service unavailable
      const result = await rerankDocuments(query, documents);

      // Then: Should retry and succeed
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 400 client error (bad request)', async () => {
      // Given: Client error (bad request)
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue(
        createMockErrorResponse(400, 'Bad request', 'BAD_REQUEST')
      );

      // When/Then: Should throw immediately without retry
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        JinaRerankerError
      );

      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Bad request'
      );

      // Should only call API once per call (no retry for 400 errors)
      expect(mockFetch).toHaveBeenCalledTimes(2); // Two separate calls above
    });

    it('should NOT retry on 401 unauthorized error', async () => {
      // Given: Unauthorized error (invalid API key)
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(401, 'Unauthorized', 'UNAUTHORIZED')
      );

      // When/Then: Should throw immediately without retry
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Unauthorized'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 403 forbidden error', async () => {
      // Given: Forbidden error
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(403, 'Forbidden', 'FORBIDDEN')
      );

      // When/Then: Should throw immediately without retry
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Forbidden'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on network error', async () => {
      // Given: Network error followed by success
      const query = 'test';
      const documents = ['doc1'];

      mockFetch
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce(
          createMockResponse([{ index: 0, relevance_score: 0.9 }])
        );

      // When: Reranking with network error
      const result = await rerankDocuments(query, documents);

      // Then: Should retry and succeed
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries after max attempts (3 retries)', async () => {
      // Given: Continuous server errors
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue(
        createMockErrorResponse(500, 'Server error', 'SERVER_ERROR')
      );

      // When/Then: Should fail after 4 attempts (1 initial + 3 retries)
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        JinaRerankerError
      );

      // Total attempts: 1 initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 60000); // Increased timeout for retry delays

    it('should throw JinaRerankerError with correct error details', async () => {
      // Given: API error
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(
          400,
          'Invalid model specified',
          'INVALID_MODEL'
        )
      );

      // When/Then: Should throw with correct error details
      try {
        await rerankDocuments(query, documents);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaRerankerError);
        const jinaError = error as JinaRerankerError;
        expect(jinaError.message).toBe('Invalid model specified');
        expect(jinaError.statusCode).toBe(400);
        expect(jinaError.errorType).toBe('INVALID_MODEL');
      }
    });

    it('should handle error response without JSON body', async () => {
      // Given: Error response with no JSON body
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      // When/Then: Should use statusText as error message (after retries)
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Internal Server Error'
      );
    }, 60000); // Increased timeout for retries

    it('should handle invalid response structure', async () => {
      // Given: Response with invalid structure (missing results)
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          usage: { total_tokens: 100 },
          // Missing 'results' array
        }),
      });

      // When/Then: Should throw validation error (after retries)
      try {
        await rerankDocuments(query, documents);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JinaRerankerError);
        expect((error as JinaRerankerError).message).toContain(
          'Invalid response from Jina Reranker API'
        );
        expect((error as JinaRerankerError).errorType).toBe('INVALID_RESPONSE');
      }
    }, 60000); // Increased timeout for retries

    it('should handle response with non-array results', async () => {
      // Given: Response with results as non-array
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: 'not an array',
          usage: { total_tokens: 100 },
        }),
      });

      // When/Then: Should throw validation error (after retries)
      await expect(rerankDocuments(query, documents)).rejects.toThrow(
        'Invalid response from Jina Reranker API'
      );
    }, 60000); // Increased timeout for retries
  });

  // ==========================================================================
  // Test Group 5: Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle exactly 1 document', async () => {
      // Given: Single document
      const query = 'query';
      const documents = ['only one document'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.92 }])
      );

      // When: Reranking single document
      const result = await rerankDocuments(query, documents);

      // Then: Should return single result
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(0);
      expect(result[0].relevance_score).toBe(0.92);
    });

    it('should handle topN=1 (return only top result)', async () => {
      // Given: Multiple documents with topN=1
      const query = 'query';
      const documents = ['doc1', 'doc2', 'doc3'];
      const topN = 1;

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 1, relevance_score: 0.98 }])
      );

      // When: Reranking with topN=1
      const result = await rerankDocuments(query, documents, topN);

      // Then: Should return only 1 result
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(1);
    });

    it('should handle very long documents (truncation scenario)', async () => {
      // Given: Very long document
      const query = 'query';
      const longDoc = 'word '.repeat(10000); // ~10k words
      const documents = [longDoc];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.85 }])
      );

      // When: Reranking with long document
      const result = await rerankDocuments(query, documents);

      // Then: Should handle long document successfully
      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(0);

      // Verify API was called with long document
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.documents[0]).toBe(longDoc);
    });

    it('should handle special characters in query', async () => {
      // Given: Query with special characters
      const query = 'What is "machine learning" & AI?';
      const documents = ['doc1'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Reranking with special characters
      const result = await rerankDocuments(query, documents);

      // Then: Should handle special characters correctly
      expect(result).toHaveLength(1);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toBe(query);
    });

    it('should handle Unicode and emoji in documents', async () => {
      // Given: Documents with Unicode and emoji
      const query = 'test';
      const documents = [
        'Document with émojis 😀 and symbols ∑∫∂π',
        'Документ на русском языке',
      ];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
        ])
      );

      // When: Reranking with Unicode
      const result = await rerankDocuments(query, documents);

      // Then: Should handle Unicode correctly
      expect(result).toHaveLength(2);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.documents).toEqual(documents);
    });

    it('should handle relevance scores at boundaries (0 and 1)', async () => {
      // Given: Response with boundary scores
      const query = 'query';
      const documents = ['doc1', 'doc2', 'doc3'];

      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 1.0 }, // Perfect match
          { index: 1, relevance_score: 0.5 }, // Medium
          { index: 2, relevance_score: 0.0 }, // No match
        ])
      );

      // When: Reranking
      const result = await rerankDocuments(query, documents);

      // Then: Should handle boundary scores
      expect(result[0].relevance_score).toBe(1.0);
      expect(result[1].relevance_score).toBe(0.5);
      expect(result[2].relevance_score).toBe(0.0);
    });

    it('should handle large batch of documents', async () => {
      // Given: Large batch (100 documents)
      const query = 'query';
      const documents = Array.from({ length: 100 }, (_, i) => `doc${i}`);

      const mockResults = Array.from({ length: 100 }, (_, i) => ({
        index: i,
        relevance_score: 1 - i * 0.01,
      }));

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResults));

      // When: Reranking large batch
      const result = await rerankDocuments(query, documents);

      // Then: Should handle all documents
      expect(result).toHaveLength(100);
      expect(result[0].index).toBe(0);
      expect(result[0].relevance_score).toBe(1.0);
    });
  });

  // ==========================================================================
  // Test Group 6: Health Check
  // ==========================================================================

  describe('Health Check', () => {
    it('should pass health check with valid configuration', async () => {
      // Given: Valid API configuration
      mockFetch.mockResolvedValueOnce(
        createMockResponse([
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
        ])
      );

      // When: Running health check
      const isHealthy = await healthCheck();

      // Then: Should return true
      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.jina.ai/v1/rerank',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'jina-reranker-v2-base-multilingual',
            query: 'test query',
            documents: ['test document 1', 'test document 2'],
            top_n: undefined,
          }),
        })
      );
    });

    it('should fail health check when API key is missing', async () => {
      // Given: Missing API key
      delete process.env.JINA_API_KEY;

      // When/Then: Should throw configuration error
      await expect(healthCheck()).rejects.toThrow(JinaRerankerError);
      await expect(healthCheck()).rejects.toThrow(
        'Missing required environment variable'
      );
    });

    it('should fail health check when API is unreachable', async () => {
      // Given: Network error
      mockFetch.mockRejectedValueOnce(createNetworkError());

      // When/Then: Should throw health check error
      await expect(healthCheck()).rejects.toThrow(JinaRerankerError);

      // After retries, should wrap error
      try {
        await healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(JinaRerankerError);
        // Could be network error or wrapped health check error
      }
    }, 60000); // Increased timeout for retries

    it('should fail health check on invalid API response', async () => {
      // Given: Invalid response (not 2 results)
      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Running health check
      const isHealthy = await healthCheck();

      // Then: Should return false (expected 2 results, got 1)
      expect(isHealthy).toBe(false);
    });
  });

  // ==========================================================================
  // Test Group 7: Rate Limiting
  // ==========================================================================

  describe('Rate Limiting', () => {
    it('should respect rate limit (40ms minimum between requests)', async () => {
      // Given: Two consecutive requests
      const query = 'test';
      const documents = ['doc1'];

      mockFetch.mockResolvedValue(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Making two requests back-to-back
      const start = Date.now();
      await rerankDocuments(query, documents);
      await rerankDocuments(query, documents);
      const elapsed = Date.now() - start;

      // Then: Should take at least 40ms between requests
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should include timeout in fetch request', async () => {
      // Given: Valid request
      mockFetch.mockResolvedValueOnce(
        createMockResponse([{ index: 0, relevance_score: 0.9 }])
      );

      // When: Making request
      await rerankDocuments('query', ['doc']);

      // Then: Should include AbortSignal timeout
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].signal).toBeDefined();
      // Note: Can't directly test timeout value due to AbortSignal.timeout implementation
    });
  });
});
