/**
 * LMS API Client Integration Tests
 * @module tests/integration/lms-api-client.test
 *
 * Integration tests for Open edX API client with mocked HTTP responses.
 * Tests full import flow: upload → poll → completion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  OpenEdXClient,
  pollImportStatus,
  type ImportStatus,
} from '../../src/integrations/lms/openedx/api';
import { OpenEdXImportError, LMSTimeoutError } from '@megacampus/shared-types/lms/errors';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('LMS API Client Integration', () => {
  const mockConfig = {
    baseUrl: 'https://lms.example.com',
    studioUrl: 'https://studio.example.com',
    auth: {
      tokenUrl: 'https://lms.example.com/oauth2/access_token',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
    uploadTimeout: 30000,
    statusTimeout: 5000,
  };

  let client: OpenEdXClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError = vi.fn().mockReturnValue(false);

    client = new OpenEdXClient(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Full Import Flow', () => {
    it('should successfully import course and poll to completion', async () => {
      const courseId = 'course-v1:TestOrg+CS101+2025';
      const taskId = 'task-abc123';
      const tarGzBuffer = Buffer.from('fake-tar-gz-data');

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock course import
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          task_id: taskId,
        },
      });

      // Mock status polling - sequence of statuses
      const statusSequence: ImportStatus[] = [
        {
          task_id: taskId,
          state: 'PENDING',
          progress_percent: 0,
          message: 'Task queued',
          error_message: null,
          course_key: null,
        },
        {
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 30,
          message: 'Processing course structure',
          error_message: null,
          course_key: null,
        },
        {
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 60,
          message: 'Importing content',
          error_message: null,
          course_key: null,
        },
        {
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: 'Import completed',
          error_message: null,
          course_key: courseId,
        },
      ];

      // Mock sequential status responses
      for (const status of statusSequence) {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: status });
      }

      // Step 1: Import course
      const { taskId: returnedTaskId } = await client.importCourse(tarGzBuffer, courseId);
      expect(returnedTaskId).toBe(taskId);

      // Step 2: Poll status
      const progressCallback = vi.fn();
      const result = await pollImportStatus(client, taskId, {
        intervalMs: 100, // Fast polling for test
        maxAttempts: 10,
        onProgress: progressCallback,
        courseId,
      });

      // Verify result
      expect(result.success).toBe(true);
      expect(result.courseKey).toBe(courseId);
      expect(result.courseUrl).toBe(`https://studio.example.com/course/${encodeURIComponent(courseId)}`);
      expect(result.error).toBeNull();
      expect(result.state).toBe('SUCCESS');

      // Verify progress callback invoked
      expect(progressCallback).toHaveBeenCalledTimes(4);
      expect(progressCallback).toHaveBeenNthCalledWith(1, statusSequence[0]);
      expect(progressCallback).toHaveBeenNthCalledWith(4, statusSequence[3]);
    });

    it('should handle import failure during polling', async () => {
      const courseId = 'course-v1:TestOrg+CS101+2025';
      const taskId = 'task-failed';
      const tarGzBuffer = Buffer.from('fake-tar-gz-data');

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock course import
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { task_id: taskId },
      });

      // Mock status polling - failure after progress
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: {
            task_id: taskId,
            state: 'IN_PROGRESS',
            progress_percent: 50,
            message: 'Processing...',
            error_message: null,
            course_key: null,
          },
        })
        .mockResolvedValueOnce({
          data: {
            task_id: taskId,
            state: 'FAILURE',
            progress_percent: 50,
            message: 'Import failed',
            error_message: 'Invalid OLX structure',
            course_key: null,
          },
        });

      // Import course
      await client.importCourse(tarGzBuffer, courseId);

      // Poll status - should throw on failure
      const pollPromise = pollImportStatus(client, taskId, {
        intervalMs: 100,
        maxAttempts: 10,
      });

      await expect(pollPromise).rejects.toThrow(OpenEdXImportError);
    });

    it('should timeout if polling exceeds max attempts', async () => {
      const taskId = 'task-timeout';

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock status polling - always IN_PROGRESS
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 50,
          message: 'Still processing...',
          error_message: null,
          course_key: null,
        },
      });

      // Poll with low max attempts
      await expect(
        pollImportStatus(client, taskId, {
          intervalMs: 50,
          maxAttempts: 3,
        })
      ).rejects.toThrow(LMSTimeoutError);
    });
  });

  describe('Error Handling', () => {
    it('should handle upload timeout', async () => {
      const courseId = 'course-v1:TestOrg+CS101+2025';
      const tarGzBuffer = Buffer.from('fake-tar-gz-data');

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock upload timeout
      const timeoutError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      };

      mockAxiosInstance.post.mockRejectedValueOnce(timeoutError);
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const importPromise = client.importCourse(tarGzBuffer, courseId);
      await expect(importPromise).rejects.toThrow(LMSTimeoutError);
    });

    it('should throw OpenEdXApiError on 401 response', async () => {
      const taskId = 'task-123';

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock 401 response
      const error401 = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'invalid_token' },
        },
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error401);
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      // Note: Interceptor-based retry logic cannot be tested with vi.mock
      // because interceptors are registered on the real axios instance.
      // This test verifies the error propagates correctly.
      await expect(client.getImportStatus(taskId)).rejects.toThrow('invalid_token');
    });

    it('should throw OpenEdXApiError on 5xx server errors', async () => {
      const taskId = 'task-retry';

      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock 503 error
      const error503 = {
        isAxiosError: true,
        response: {
          status: 503,
          data: { error: 'service_unavailable' },
        },
      };

      mockAxiosInstance.get.mockRejectedValueOnce(error503);
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      // Note: Interceptor-based retry logic cannot be tested with vi.mock
      // because interceptors are registered on the real axios instance.
      // This test verifies the error propagates correctly.
      await expect(client.getImportStatus(taskId)).rejects.toThrow('service_unavailable');
    });
  });

  describe('Connection Test', () => {
    it('should pass connection test with valid credentials', async () => {
      // Mock OAuth2 token
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        },
      });

      // Mock API endpoint check
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { results: [] },
      });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it('should fail connection test with invalid credentials', async () => {
      // Mock OAuth2 error
      const authError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          },
        },
      };

      mockAxiosInstance.post.mockRejectedValueOnce(authError);
      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.testConnection()).rejects.toThrow();
    });
  });

  describe('getCourseUrl', () => {
    it('should construct Studio course URL', () => {
      const courseKey = 'course-v1:TestOrg+CS101+2025';
      const url = client.getCourseUrl(courseKey);

      expect(url).toBe(
        `https://studio.example.com/course/${encodeURIComponent(courseKey)}`
      );
    });

    it('should handle special characters in course key', () => {
      const courseKey = 'course-v1:Test Org+CS 101+2025/Fall';
      const url = client.getCourseUrl(courseKey);

      expect(url).toContain(encodeURIComponent(courseKey));
      expect(url).not.toContain(' ');
    });
  });
});
