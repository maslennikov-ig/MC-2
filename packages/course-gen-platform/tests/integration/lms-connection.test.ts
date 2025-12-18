/**
 * LMS Connection Test Integration Tests (T085)
 * @module tests/integration/lms-connection.test
 *
 * Integration tests for the LMS connection test feature using nock to mock HTTP requests.
 * Tests the full flow from OpenEdXAdapter through OpenEdXClient to the actual HTTP layer.
 *
 * Test Coverage:
 * 1. Successful connection tests (returns success, measures latency, returns apiVersion)
 * 2. Authentication failure tests (401, invalid_client, invalid_grant)
 * 3. Network/connectivity tests (connection refused, DNS failure, socket timeout)
 * 4. Timeout tests (10 second timeout enforcement)
 *
 * Prerequisites:
 * - nock package installed for HTTP mocking
 * - Tests run in isolation (no real network calls)
 *
 * Test execution: pnpm vitest packages/course-gen-platform/tests/integration/lms-connection.test.ts
 *
 * Reference: T085 - Write integration test for connection test (mocked HTTP)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { OpenEdXAdapter } from '../../src/integrations/lms/openedx/adapter';
import type { OpenEdXConfig } from '@megacampus/shared-types/lms';

describe('LMS Connection Test Integration', () => {
  const baseConfig: OpenEdXConfig = {
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

  beforeEach(() => {
    nock.cleanAll();
    nock.enableNetConnect('127.0.0.1'); // Allow localhost for Redis/DB if needed
  });

  afterEach(() => {
    nock.cleanAll();
    nock.abortPendingRequests();
  });

  describe('successful connection', () => {
    it('should return success when OAuth2 token request succeeds and API endpoint is reachable', async () => {
      // Mock successful OAuth2 token request
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token-12345',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock successful API endpoint check
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token-12345')
        .reply(200, {
          results: [],
          count: 0,
          next: null,
          previous: null,
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected to Open edX');
      expect(result.message).toContain('https://lms.example.com');
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.lmsVersion).toBeUndefined(); // Not available from Import API
    });

    it('should measure latency end-to-end', async () => {
      // Mock OAuth2 token with 100ms delay
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .delay(100)
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock API endpoint with 50ms delay
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .delay(50)
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const startTime = Date.now();
      const result = await adapter.testConnection();
      const totalDuration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(150); // At least 100 + 50 ms
      expect(result.latencyMs).toBeLessThanOrEqual(totalDuration + 50); // Allow some variance
    });

    it('should return apiVersion "v0" on success', async () => {
      // Mock successful OAuth2 token
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock successful API endpoint
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.apiVersion).toBe('v0');
    });
  });

  describe('authentication failures', () => {
    it('should return success=false with "Authentication failed - check client ID and secret" when OAuth2 returns 401', async () => {
      // Mock OAuth2 401 error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/authentication failed/i);
      expect(result.message).toMatch(/client authentication failed/i);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.apiVersion).toBeUndefined();
    });

    it('should return success=false when OAuth2 returns invalid_client error', async () => {
      // Mock OAuth2 invalid_client error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid client credentials');
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should return success=false when OAuth2 returns invalid_grant error', async () => {
      // Mock OAuth2 invalid_grant error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(400, {
          error: 'invalid_grant',
          error_description: 'Invalid grant type',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid grant type');
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should handle 403 forbidden error with specific message', async () => {
      // Mock OAuth2 403 error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(403, {
          error: 'access_denied',
          error_description: 'Access denied for this client',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Access denied');
      expect(result.latencyMs).toBeGreaterThan(0);
    });
  });

  describe('network/connectivity tests', () => {
    it('should return success=false with "Cannot reach LMS - check URL and network connectivity" on connection refused', async () => {
      // Mock connection refused error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .replyWithError({
          code: 'ECONNREFUSED',
          message: 'connect ECONNREFUSED 127.0.0.1:443',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/connection|network|reach/i);
      expect(result.message).toMatch(/ECONNREFUSED/i);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.apiVersion).toBeUndefined();
    });

    it('should return success=false on DNS resolution failure', async () => {
      // Mock DNS resolution failure
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .replyWithError({
          code: 'ENOTFOUND',
          message: 'getaddrinfo ENOTFOUND lms.example.com',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/ENOTFOUND/i);
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should return success=false on socket timeout', async () => {
      // Mock socket timeout
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .replyWithError({
          code: 'ETIMEDOUT',
          message: 'Socket timeout',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/timeout|ETIMEDOUT/i);
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should handle network error during API endpoint check', async () => {
      // Mock successful OAuth2
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock network error on API endpoint
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .replyWithError({
          code: 'ECONNRESET',
          message: 'socket hang up',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/ECONNRESET|socket hang up/i);
    });

    it('should handle 404 not found error for OAuth2 endpoint', async () => {
      // Mock 404 for token endpoint
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(404, {
          error: 'not_found',
          error_description: 'OAuth2 endpoint not found',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found|404/i);
    });
  });

  describe('timeout handling', () => {
    it('should connection test complete within 10 second timeout', async () => {
      // Mock OAuth2 with 200ms delay
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .delay(200)
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock API endpoint with 200ms delay
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .delay(200)
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const startTime = Date.now();
      const result = await adapter.testConnection();
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete well under 10 seconds
      expect(result.latencyMs).toBeLessThan(10000);
    });

    it('should return timeout error when OAuth2 request exceeds timeout', async () => {
      // Mock OAuth2 with excessive delay (15 seconds)
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .delay(15000) // 15 seconds delay
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/timeout/i);
    });

    it('should return timeout error when API endpoint check exceeds timeout', async () => {
      // Mock successful OAuth2
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock API endpoint with excessive delay (10 seconds)
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .delay(10000)
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/timeout/i);
    });

    it('should handle ECONNABORTED timeout error from axios', async () => {
      // Mock timeout error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .replyWithError({
          code: 'ECONNABORTED',
          message: 'timeout of 10000ms exceeded',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/timeout|ECONNABORTED/i);
    });
  });

  describe('error message formatting', () => {
    it('should include LMS URL in success message', async () => {
      // Mock successful connection
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('https://lms.example.com');
    });

    it('should include error details in failure message', async () => {
      // Mock error with detailed message
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'The client credentials are invalid. Please check your client ID and secret.',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('The client credentials are invalid');
      expect(result.message).toContain('client ID and secret');
    });
  });

  describe('edge cases', () => {
    it('should handle OAuth2 response without scope field', async () => {
      // Mock OAuth2 response missing optional scope
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          // scope is optional
        });

      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
    });

    it('should handle OAuth2 response with missing access_token', async () => {
      // Mock malformed OAuth2 response
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          token_type: 'Bearer',
          expires_in: 3600,
          // Missing access_token
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/access_token|invalid response/i);
    });

    it('should handle OAuth2 response with missing expires_in', async () => {
      // Mock OAuth2 response missing expires_in
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          // Missing expires_in
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/expires_in|invalid response/i);
    });

    it('should handle 500 internal server error from OAuth2 endpoint', async () => {
      // Mock 500 error
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(500, {
          error: 'server_error',
          error_description: 'Internal server error',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/server error|500/i);
    });

    it('should handle 503 service unavailable from API endpoint', async () => {
      // Mock successful OAuth2
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      // Mock 503 from API endpoint
      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .reply(503, {
          error: 'service_unavailable',
          error_description: 'Service temporarily unavailable',
        });

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/unavailable|503/i);
    });

    it('should handle empty response body from OAuth2', async () => {
      // Mock empty response
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, '');

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/invalid|empty/i);
    });

    it('should handle malformed JSON from OAuth2', async () => {
      // Mock malformed JSON
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, '{"access_token": "token", invalid json}');

      const adapter = new OpenEdXAdapter(baseConfig);
      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/parse|invalid/i);
    });
  });

  describe('nock cleanup verification', () => {
    it('should verify all nock interceptors are used', async () => {
      // This test verifies nock cleanup works correctly
      nock('https://lms.example.com')
        .post('/oauth2/access_token')
        .reply(200, {
          access_token: 'mock-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read write',
        });

      nock('https://lms.example.com')
        .get('/api/courses/v0/')
        .matchHeader('Authorization', 'Bearer mock-token')
        .reply(200, { results: [] });

      const adapter = new OpenEdXAdapter(baseConfig);
      await adapter.testConnection();

      // Verify all mocks were consumed
      expect(nock.isDone()).toBe(true);
    });

    it('should not allow unmocked HTTP requests', () => {
      // Disable net connect to ensure no real HTTP calls
      nock.disableNetConnect();

      const adapter = new OpenEdXAdapter(baseConfig);

      // This should fail because no mock is defined
      expect(adapter.testConnection()).rejects.toThrow();

      // Re-enable for cleanup
      nock.enableNetConnect('127.0.0.1');
    });
  });
});
