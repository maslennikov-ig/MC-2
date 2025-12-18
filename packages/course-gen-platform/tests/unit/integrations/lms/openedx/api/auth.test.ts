/**
 * OAuth2 Authentication Tests
 * @module tests/unit/integrations/lms/openedx/api/auth.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OpenEdXAuth } from '../../../../../../src/integrations/lms/openedx/api/auth';
import { OpenEdXAuthError } from '@megacampus/shared-types/lms/errors';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('OpenEdXAuth', () => {
  const mockConfig = {
    tokenUrl: 'https://lms.example.com/oauth2/access_token',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    timeout: 5000,
  };

  let auth: OpenEdXAuth;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    auth = new OpenEdXAuth(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAccessToken', () => {
    it('should acquire token on first call', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-token-123',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      };

      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const token = await auth.getAccessToken();

      expect(token).toBe('test-token-123');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        mockConfig.tokenUrl,
        expect.stringContaining('grant_type=client_credentials')
      );
    });

    it('should cache token and reuse on subsequent calls', async () => {
      const mockResponse = {
        data: {
          access_token: 'cached-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      };

      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      // First call - acquires token
      const token1 = await auth.getAccessToken();
      expect(token1).toBe('cached-token');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Second call - should use cached token
      const token2 = await auth.getAccessToken();
      expect(token2).toBe('cached-token');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1); // Still only 1 call

      // Third call - should use cached token
      const token3 = await auth.getAccessToken();
      expect(token3).toBe('cached-token');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expired', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      // First token with short expiry
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'expired-token',
          token_type: 'Bearer',
          expires_in: 1, // 1 second (will expire immediately with 60s buffer)
          scope: 'read write',
        },
      });

      // First call - acquires token
      const token1 = await auth.getAccessToken();
      expect(token1).toBe('expired-token');

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second token after expiry
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'refreshed-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Second call - should refresh token
      const token2 = await auth.getAccessToken();
      expect(token2).toBe('refreshed-token');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should throw OpenEdXAuthError on 401 response', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            error: 'invalid_grant',
            error_description: 'Invalid client credentials',
          },
        },
        message: 'Request failed with status code 401',
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      // Single promise stored to test both conditions
      const promise = auth.getAccessToken();
      await expect(promise).rejects.toThrow(OpenEdXAuthError);
    });

    it('should throw OpenEdXAuthError on network error', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Network Error',
        code: 'ECONNREFUSED',
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      // Single promise stored to test both conditions
      const promise = auth.getAccessToken();
      await expect(promise).rejects.toThrow(OpenEdXAuthError);
    });

    it('should throw OpenEdXAuthError on 404 (endpoint not found)', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 404,
          data: {
            detail: 'Not found',
          },
        },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      // Single promise stored to test both conditions
      const promise = auth.getAccessToken();
      await expect(promise).rejects.toThrow(OpenEdXAuthError);
    });

    it('should handle missing expires_in in response', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          // Missing expires_in
        },
      });

      // Single promise stored to test both conditions
      const promise = auth.getAccessToken();
      await expect(promise).rejects.toThrow(OpenEdXAuthError);
    });

    it('should handle concurrent token requests', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'concurrent-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Make 3 concurrent requests
      const [token1, token2, token3] = await Promise.all([
        auth.getAccessToken(),
        auth.getAccessToken(),
        auth.getAccessToken(),
      ]);

      // All should return same token
      expect(token1).toBe('concurrent-token');
      expect(token2).toBe('concurrent-token');
      expect(token3).toBe('concurrent-token');

      // Should only make one HTTP request
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateToken', () => {
    it('should force token refresh on next call', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      // First token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'first-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      const token1 = await auth.getAccessToken();
      expect(token1).toBe('first-token');

      // Invalidate token
      auth.invalidateToken();

      // Second token after invalidation
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'second-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      const token2 = await auth.getAccessToken();
      expect(token2).toBe('second-token');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      const result = await auth.testConnection();
      expect(result).toBe(true);
    });

    it('should throw on connection failure', async () => {
      const mockAxiosInstance = mockedAxios.create.mock.results[0]?.value;

      mockAxiosInstance.post.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Connection timeout',
        code: 'ETIMEDOUT',
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(auth.testConnection()).rejects.toThrow(OpenEdXAuthError);
    });
  });
});
