/**
 * Permission Error Handling Tests
 * @module tests/unit/integrations/lms/openedx/api/permission-errors.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { OpenEdXClient } from '../../../../../../src/integrations/lms/openedx/api/client';
import { LMSPermissionError } from '@megacampus/shared-types/lms/errors';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock OpenEdXAuth
vi.mock('../../../../../../src/integrations/lms/openedx/api/auth', () => {
  return {
    OpenEdXAuth: class MockOpenEdXAuth {
      getAccessToken = vi.fn().mockResolvedValue('mock-token');
      invalidateToken = vi.fn();
      testConnection = vi.fn().mockResolvedValue(true);
    },
  };
});

describe('OpenEdXClient - Permission Error Handling', () => {
  const mockConfig = {
    baseUrl: 'https://lms.example.com',
    studioUrl: 'https://studio.example.com',
    auth: {
      tokenUrl: 'https://lms.example.com/oauth2/access_token',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
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

    // IMPORTANT: Configure isAxiosError before creating client
    mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

    client = new OpenEdXClient(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('403 Forbidden Error Handling', () => {
    it('should throw LMSPermissionError for 403 with generic permission error', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'permission_denied',
            error_description: 'You are not authorized to perform this action.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(
        client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run')
      ).rejects.toThrow(LMSPermissionError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
        throw new Error('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSPermissionError);
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
        expect(permError.requiredRole).toBe('Course Creator or Staff');
        expect(permError.message).toContain("You don't have permission to import courses");
        expect(permError.message).toContain('Required role: Course Creator or Staff');
        expect(permError.message).toContain('Please contact your LMS administrator');
      }
    });

    it('should throw LMSPermissionError with course:import permission hint', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'permission_denied',
            error_description: 'User lacks course:import permission.',
            detail: 'This action requires course:import permission.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(
        client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run')
      ).rejects.toThrow(LMSPermissionError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSPermissionError);
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
        expect(permError.requiredRole).toBe('Course Creator');
        expect(permError.message).toContain('Current user may be missing course:import permission');
      }
    });

    it('should throw LMSPermissionError with Staff role requirement', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'forbidden',
            error_description: 'Staff access required for this operation.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(
        client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run')
      ).rejects.toThrow(LMSPermissionError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSPermissionError);
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
        expect(permError.requiredRole).toBe('Staff');
      }
    });

    it('should throw LMSPermissionError with 403 and no error details', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: undefined,
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(
        client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run')
      ).rejects.toThrow(LMSPermissionError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSPermissionError);
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
        expect(permError.requiredRole).toBe('Staff or Course Creator');
        expect(permError.message).toContain("You don't have permission");
      }
    });

    it('should throw LMSPermissionError for getImportStatus with 403', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'forbidden',
            error_description: 'You are not authorized to view this import status.',
          },
        },
        config: {
          url: '/api/courses/v0/import/status/task-123',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getImportStatus('task-123')).rejects.toThrow(LMSPermissionError);

      try {
        await client.getImportStatus('task-123');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSPermissionError);
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
        expect(permError.requiredRole).toBe('Course Creator or Staff');
      }
    });
  });

  describe('Operation Extraction', () => {
    it('should extract course:import from import URL', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: 'forbidden' },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        const permError = error as LMSPermissionError;
        expect(permError.operation).toBe('course:import');
      }
    });

    it('should extract course:access from courses URL', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: 'forbidden' },
        },
        config: {
          url: '/api/courses/v0/',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValueOnce(mockError);

      await expect(client.testConnection()).rejects.toThrow();
    });
  });

  describe('Required Role Parsing', () => {
    it('should parse Administrator role from error message', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'forbidden',
            error_description: 'This action requires admin privileges.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        const permError = error as LMSPermissionError;
        expect(permError.requiredRole).toBe('Administrator');
      }
    });

    it('should parse Instructor role from error message', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'forbidden',
            detail: 'Only instructors can perform this action.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        const permError = error as LMSPermissionError;
        expect(permError.requiredRole).toBe('Instructor');
      }
    });
  });

  describe('Error Message Formatting', () => {
    it('should include all message components when hints are available', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'permission_denied',
            error_description: 'You are not authorized to perform this action.',
          },
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        const permError = error as LMSPermissionError;
        expect(permError.message).toContain("You don't have permission");
        expect(permError.message).toContain('Required role:');
        expect(permError.message).toContain('not authorized');
        expect(permError.message).toContain('Please contact your LMS administrator');
      }
    });

    it('should format message correctly without error data', async () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: undefined,
        },
        config: {
          url: '/api/courses/v0/import/course-v1:Org+Course+Run',
        },
        message: 'Request failed with status code 403',
      } as AxiosError;

      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      try {
        await client.importCourse(Buffer.from('test'), 'course-v1:Org+Course+Run');
      } catch (error) {
        const permError = error as LMSPermissionError;
        expect(permError.message).toContain("You don't have permission");
        expect(permError.message).toContain('Required role:');
        expect(permError.message).toContain('Please contact your LMS administrator');
        // Should NOT contain permission hints when no error data
        expect(permError.message).not.toContain('Current user may be missing');
        expect(permError.message).not.toContain('not authorized');
      }
    });
  });
});
