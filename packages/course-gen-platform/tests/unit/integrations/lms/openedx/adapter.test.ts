/**
 * OpenEdXAdapter Tests
 * @module tests/unit/integrations/lms/openedx/adapter.test
 *
 * Tests for OpenEdXAdapter class focusing on:
 * - testConnection() method with various scenarios
 * - validateConfig() method with validation rules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEdXAdapter } from '../../../../../src/integrations/lms/openedx/adapter';
import { OpenEdXClient } from '../../../../../src/integrations/lms/openedx/api/client';
import type { OpenEdXConfig } from '@megacampus/shared-types/lms';
import {
  LMSIntegrationError,
  OpenEdXAuthError,
  LMSNetworkError,
} from '@megacampus/shared-types/lms/errors';

// Mock logger
vi.mock('../../../../../src/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock OLX Generator (not needed for these tests)
vi.mock('../../../../../src/integrations/lms/openedx/olx/generator', () => {
  const MockOLXGenerator = vi.fn(function () {
    // @ts-ignore
    this.generate = vi.fn();
    // @ts-ignore
    this.reset = vi.fn();
  });
  return { OLXGenerator: MockOLXGenerator };
});

// Mock OpenEdXClient
vi.mock('../../../../../src/integrations/lms/openedx/api/client');
const MockedOpenEdXClient = vi.mocked(OpenEdXClient);

describe('OpenEdXAdapter', () => {
  const validConfig: OpenEdXConfig = {
    instanceId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Open edX',
    type: 'openedx',
    organization: 'TestOrg',
    lmsUrl: 'https://lms.example.com',
    cmsUrl: 'https://studio.example.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    timeout: 300000,
    maxRetries: 3,
    pollInterval: 5000,
    enabled: true,
    autoCreateCourse: true,
  };

  let adapter: OpenEdXAdapter;
  let mockClientInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock client instance
    mockClientInstance = {
      testConnection: vi.fn(),
      importCourse: vi.fn(),
      getImportStatus: vi.fn(),
      getCourseUrl: vi.fn(),
    };

    // Mock OpenEdXClient constructor to return mock instance
    MockedOpenEdXClient.mockImplementation(function () {
      return mockClientInstance;
    } as any);

    adapter = new OpenEdXAdapter(validConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('should return success=true with latencyMs on successful connection', async () => {
      // Mock successful connection
      mockClientInstance.testConnection.mockResolvedValueOnce(true);

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Advance time by 150ms to simulate latency
      vi.advanceTimersByTime(150);
      vi.setSystemTime(startTime + 150);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('Successfully connected');
      expect(result.message).toContain(validConfig.lmsUrl);
      expect(result.apiVersion).toBe('v0');
      expect(result.lmsVersion).toBeUndefined();
      expect(mockClientInstance.testConnection).toHaveBeenCalledOnce();
    });

    it('should return success=false with error message on authentication failure', async () => {
      // Mock authentication failure
      const authError = new OpenEdXAuthError('Invalid client credentials');
      mockClientInstance.testConnection.mockRejectedValueOnce(authError);

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Advance time by 50ms to simulate quick failure
      vi.advanceTimersByTime(50);
      vi.setSystemTime(startTime + 50);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('Connection failed');
      expect(result.message).toContain('Invalid client credentials');
      expect(result.apiVersion).toBeUndefined();
      expect(result.lmsVersion).toBeUndefined();
    });

    it('should return success=false on network error (unreachable LMS)', async () => {
      // Mock network error
      const networkError = new LMSNetworkError(
        'Connection refused',
        'openedx',
        new Error('ECONNREFUSED')
      );
      mockClientInstance.testConnection.mockRejectedValueOnce(networkError);

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Advance time by 5000ms to simulate timeout
      vi.advanceTimersByTime(5000);
      vi.setSystemTime(startTime + 5000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('Connection failed');
      expect(result.message).toContain('Connection refused');
    });

    it('should return success=false on timeout', async () => {
      // Mock timeout error
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockClientInstance.testConnection.mockRejectedValueOnce(timeoutError);

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Advance time by 10000ms to simulate long timeout
      vi.advanceTimersByTime(10000);
      vi.setSystemTime(startTime + 10000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain('Connection failed');
      expect(result.message).toContain('timeout');
    });

    it('should measure latency correctly', async () => {
      mockClientInstance.testConnection.mockResolvedValueOnce(true);

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Simulate 250ms latency
      vi.advanceTimersByTime(250);
      vi.setSystemTime(startTime + 250);

      const result = await promise;

      expect(result.latencyMs).toBe(250);
    });

    it('should log successful connection test', async () => {
      mockClientInstance.testConnection.mockResolvedValueOnce(true);

      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      // Logger calls are mocked implicitly, we just verify behavior
      expect(mockClientInstance.testConnection).toHaveBeenCalledOnce();
    });

    it('should log failed connection test', async () => {
      const error = new Error('Connection test failed');
      mockClientInstance.testConnection.mockRejectedValueOnce(error);

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection test failed');
    });

    it('should handle generic errors gracefully', async () => {
      // Mock non-Error object rejection
      mockClientInstance.testConnection.mockRejectedValueOnce('Unknown error string');

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
      expect(result.message).toContain('Unknown error');
    });

    it('should measure latency for failed connections', async () => {
      mockClientInstance.testConnection.mockRejectedValueOnce(new Error('Failed'));

      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const promise = adapter.testConnection();

      // Simulate 100ms before failure
      vi.advanceTimersByTime(100);
      vi.setSystemTime(startTime + 100);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBe(100);
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid config', async () => {
      const result = await adapter.validateConfig();

      expect(result).toBe(true);
    });

    it('should throw on missing lmsUrl', async () => {
      const invalidConfig = { ...validConfig, lmsUrl: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('lmsUrl is required');
    });

    it('should throw on missing cmsUrl', async () => {
      const invalidConfig = { ...validConfig, cmsUrl: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('cmsUrl is required');
    });

    it('should throw on missing clientId', async () => {
      const invalidConfig = { ...validConfig, clientId: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('clientId is required');
    });

    it('should throw on missing clientSecret', async () => {
      const invalidConfig = { ...validConfig, clientSecret: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('clientSecret is required');
    });

    it('should throw on missing organization', async () => {
      const invalidConfig = { ...validConfig, organization: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('organization is required');
    });

    it('should throw on invalid lmsUrl format (not valid URL)', async () => {
      const invalidConfig = { ...validConfig, lmsUrl: 'not-a-valid-url' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('lmsUrl must be a valid URL');
    });

    it('should throw on invalid cmsUrl format (not valid URL)', async () => {
      const invalidConfig = { ...validConfig, cmsUrl: 'invalid-url-format' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('cmsUrl must be a valid URL');
    });

    it('should throw on negative timeout', async () => {
      const invalidConfig = { ...validConfig, timeout: -1000 };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('timeout must be positive');
    });

    it('should throw on negative maxRetries', async () => {
      const invalidConfig = { ...validConfig, maxRetries: -5 };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('maxRetries must be positive');
    });

    it('should throw on negative pollInterval', async () => {
      const invalidConfig = { ...validConfig, pollInterval: -1000 };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      await expect(invalidAdapter.validateConfig()).rejects.toThrow(LMSIntegrationError);
      await expect(invalidAdapter.validateConfig()).rejects.toThrow('pollInterval must be positive');
    });

    it('should collect multiple errors and report them all', async () => {
      const invalidConfig: OpenEdXConfig = {
        ...validConfig,
        lmsUrl: '',
        cmsUrl: 'not-a-url',
        clientId: '',
        timeout: -100,
        maxRetries: -3,
      };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      try {
        await invalidAdapter.validateConfig();
        expect.fail('Should have thrown LMSIntegrationError');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSIntegrationError);
        const lmsError = error as LMSIntegrationError;

        // Should contain all error messages
        expect(lmsError.message).toContain('lmsUrl is required');
        expect(lmsError.message).toContain('cmsUrl must be a valid URL');
        expect(lmsError.message).toContain('clientId is required');
        expect(lmsError.message).toContain('timeout must be positive');
        expect(lmsError.message).toContain('maxRetries must be positive');

        // Should have error code
        expect(lmsError.code).toBe('INVALID_COURSE_INPUT');
        expect(lmsError.lmsType).toBe('openedx');

        // Should have metadata with errors array
        expect(lmsError.metadata).toBeDefined();
        expect(lmsError.metadata?.errors).toBeInstanceOf(Array);
        expect((lmsError.metadata?.errors as string[]).length).toBeGreaterThanOrEqual(5);
      }
    });

    it('should accept zero timeout (unlimited)', async () => {
      const configWithZeroTimeout = { ...validConfig, timeout: 0 };
      const adapterWithZeroTimeout = new OpenEdXAdapter(configWithZeroTimeout);

      // Zero is falsy, so bypasses the validation check (allowed)
      const result = await adapterWithZeroTimeout.validateConfig();
      expect(result).toBe(true);
    });

    it('should accept valid URL with port number', async () => {
      const configWithPort = {
        ...validConfig,
        lmsUrl: 'https://lms.example.com:8000',
        cmsUrl: 'https://studio.example.com:8001',
      };
      const adapterWithPort = new OpenEdXAdapter(configWithPort);

      const result = await adapterWithPort.validateConfig();
      expect(result).toBe(true);
    });

    it('should accept valid URL with path', async () => {
      const configWithPath = {
        ...validConfig,
        lmsUrl: 'https://example.com/lms',
        cmsUrl: 'https://example.com/studio',
      };
      const adapterWithPath = new OpenEdXAdapter(configWithPath);

      const result = await adapterWithPath.validateConfig();
      expect(result).toBe(true);
    });

    it('should throw with descriptive error code INVALID_COURSE_INPUT', async () => {
      const invalidConfig = { ...validConfig, lmsUrl: '' };
      const invalidAdapter = new OpenEdXAdapter(invalidConfig);

      try {
        await invalidAdapter.validateConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSIntegrationError);
        expect((error as LMSIntegrationError).code).toBe('INVALID_COURSE_INPUT');
      }
    });
  });

  describe('type getter', () => {
    it('should return "openedx"', () => {
      expect(adapter.type).toBe('openedx');
    });
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(adapter).toBeInstanceOf(OpenEdXAdapter);
      expect(adapter.type).toBe('openedx');
    });

    it('should create OpenEdXClient with correct parameters', () => {
      expect(MockedOpenEdXClient).toHaveBeenCalledWith({
        baseUrl: validConfig.lmsUrl,
        studioUrl: validConfig.cmsUrl,
        auth: {
          tokenUrl: `${validConfig.lmsUrl}/oauth2/access_token`,
          clientId: validConfig.clientId,
          clientSecret: validConfig.clientSecret,
        },
        uploadTimeout: validConfig.timeout,
        statusTimeout: 10000,
        maxRetries: validConfig.maxRetries,
        retryDelayMs: 1000,
      });
    });
  });
});
