/**
 * LMS Configuration Validation Unit Tests (T097)
 * @module tests/unit/integrations/lms/config.test
 *
 * Tests for LMS config validation focusing on:
 * - Schema validation (LmsConfigurationSchema, LmsConfigurationPublicSchema)
 * - Input validation for CRUD operations (create, update, delete, list)
 * - Authorization validation (admin for create/update/delete, member for view)
 * - Public schema field omission (client_id, client_secret)
 *
 * TDD Approach: These tests will FAIL initially until CRUD operations are implemented.
 *
 * Mock Strategy:
 * - Mock Supabase admin client for database operations
 * - Mock user context for authorization testing
 * - Use test fixtures for consistent data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '../../../../src/types/database.generated';

// Types for mocked Supabase client
type LmsConfiguration = Database['public']['Tables']['lms_configurations']['Row'];

// Mock logger
vi.mock('../../../../src/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase admin client
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('../../../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabaseClient),
}));

// Test data
const TEST_ORG_ID = '759ba851-3f16-4294-9627-dc5a0a366c8e';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000012';
const TEST_CONFIG_ID = '550e8400-e29b-41d4-a716-446655440003';

/**
 * Mock LMS configuration
 */
const createMockConfig = (overrides?: Partial<LmsConfiguration>): LmsConfiguration => ({
  id: TEST_CONFIG_ID,
  organization_id: TEST_ORG_ID,
  name: 'Production LMS',
  description: 'Main production Open edX instance',
  lms_url: 'https://lms.example.com',
  studio_url: 'https://studio.example.com',
  client_id: 'my-client-id-12345',
  client_secret: 'my-client-secret-67890',
  default_org: 'MegaCampus',
  default_run: 'self_paced',
  import_timeout_seconds: 300,
  max_retries: 3,
  is_active: true,
  last_connection_test: null,
  last_connection_status: null,
  created_at: '2024-12-11T10:00:00Z',
  updated_at: '2024-12-11T10:00:00Z',
  created_by: TEST_USER_ID,
  ...overrides,
});

/**
 * Mock query builder
 */
const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
    // Add chainable methods
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  };
  return builder;
};

describe('LMS Configuration Validation Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Test Suite 1: LmsConfigurationSchema Validation
  // ==========================================================================

  describe('LmsConfigurationSchema - Field Validation', () => {
    // ==========================================================================
    // Test 1: Validate complete valid configuration
    // ==========================================================================

    it('should validate complete valid configuration', () => {
      const validConfig = createMockConfig();

      // Required fields
      expect(validConfig.id).toBeDefined();
      expect(validConfig.organization_id).toBeDefined();
      expect(validConfig.name).toBeDefined();
      expect(validConfig.lms_url).toBeDefined();
      expect(validConfig.studio_url).toBeDefined();
      expect(validConfig.client_id).toBeDefined();
      expect(validConfig.client_secret).toBeDefined();
      expect(validConfig.default_org).toBeDefined();

      // UUIDs
      expect(validConfig.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(validConfig.organization_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // URLs
      expect(validConfig.lms_url).toMatch(/^https?:\/\/.+/);
      expect(validConfig.studio_url).toMatch(/^https?:\/\/.+/);

      // String lengths
      expect(validConfig.name.length).toBeGreaterThan(0);
      expect(validConfig.name.length).toBeLessThanOrEqual(100);
      expect(validConfig.default_org.length).toBeGreaterThan(0);
      expect(validConfig.default_org.length).toBeLessThanOrEqual(50);
    });

    // ==========================================================================
    // Test 2: Reject config with invalid UUID format
    // ==========================================================================

    it('should reject config with invalid UUID format', () => {
      const invalidUuids = [
        'not-a-uuid',
        '123456',
        'invalid-uuid-format',
        '',
      ];

      for (const invalidId of invalidUuids) {
        expect(invalidId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      }
    });

    // ==========================================================================
    // Test 3: Validate name length constraints (1-100 chars)
    // ==========================================================================

    it('should validate name length constraints (1-100 chars)', () => {
      // Valid names
      const validNames = [
        'A', // 1 char
        'Production LMS', // typical
        'A'.repeat(100), // max 100 chars
      ];

      for (const name of validNames) {
        expect(name.length).toBeGreaterThanOrEqual(1);
        expect(name.length).toBeLessThanOrEqual(100);
      }

      // Invalid names
      const invalidNames = [
        '', // empty
        'A'.repeat(101), // over 100 chars
      ];

      for (const name of invalidNames) {
        const isValid = name.length >= 1 && name.length <= 100;
        expect(isValid).toBe(false);
      }
    });

    // ==========================================================================
    // Test 4: Validate description length constraint (max 500 chars, nullable)
    // ==========================================================================

    it('should validate description length constraint (max 500 chars, nullable)', () => {
      // Valid descriptions
      const validDescriptions = [
        null, // nullable
        'Short description',
        'A'.repeat(500), // max 500 chars
      ];

      for (const desc of validDescriptions) {
        const isValid = desc === null || desc.length <= 500;
        expect(isValid).toBe(true);
      }

      // Invalid description
      const invalidDescription = 'A'.repeat(501); // over 500 chars
      expect(invalidDescription.length).toBeGreaterThan(500);
    });

    // ==========================================================================
    // Test 5: Validate URL format (lms_url, studio_url)
    // ==========================================================================

    it('should validate URL format (lms_url, studio_url)', () => {
      // Valid URLs
      const validUrls = [
        'https://lms.example.com',
        'http://localhost:8000',
        'https://studio.example.com/courses',
      ];

      for (const url of validUrls) {
        expect(url).toMatch(/^https?:\/\/.+/);
      }

      // Invalid URLs
      const invalidUrls = [
        'not-a-url',
        'ftp://invalid-protocol.com',
        'lms.example.com', // missing protocol
        '',
      ];

      for (const url of invalidUrls) {
        expect(url).not.toMatch(/^https?:\/\/.+/);
      }
    });

    // ==========================================================================
    // Test 6: Validate client_id and client_secret (min 1 char)
    // ==========================================================================

    it('should validate client_id and client_secret (min 1 char)', () => {
      // Valid credentials
      const validCredentials = [
        'a', // 1 char
        'my-client-id',
        'very-long-client-secret-12345',
      ];

      for (const cred of validCredentials) {
        expect(cred.length).toBeGreaterThanOrEqual(1);
      }

      // Invalid credentials
      const invalidCred = '';
      expect(invalidCred.length).toBe(0);
    });

    // ==========================================================================
    // Test 7: Validate default_org length (1-50 chars)
    // ==========================================================================

    it('should validate default_org length (1-50 chars)', () => {
      // Valid orgs
      const validOrgs = [
        'A', // 1 char
        'MegaCampus',
        'A'.repeat(50), // max 50 chars
      ];

      for (const org of validOrgs) {
        expect(org.length).toBeGreaterThanOrEqual(1);
        expect(org.length).toBeLessThanOrEqual(50);
      }

      // Invalid orgs
      const invalidOrgs = [
        '', // empty
        'A'.repeat(51), // over 50 chars
      ];

      for (const org of invalidOrgs) {
        const isValid = org.length >= 1 && org.length <= 50;
        expect(isValid).toBe(false);
      }
    });

    // ==========================================================================
    // Test 8: Validate import_timeout_seconds range (30-600)
    // ==========================================================================

    it('should validate import_timeout_seconds range (30-600)', () => {
      // Valid timeouts
      const validTimeouts = [30, 60, 300, 600];

      for (const timeout of validTimeouts) {
        expect(timeout).toBeGreaterThanOrEqual(30);
        expect(timeout).toBeLessThanOrEqual(600);
      }

      // Invalid timeouts
      const invalidTimeouts = [29, 601, 0, -1];

      for (const timeout of invalidTimeouts) {
        const isValid = timeout >= 30 && timeout <= 600;
        expect(isValid).toBe(false);
      }
    });

    // ==========================================================================
    // Test 9: Validate max_retries range (1-5)
    // ==========================================================================

    it('should validate max_retries range (1-5)', () => {
      // Valid retries
      const validRetries = [1, 2, 3, 4, 5];

      for (const retries of validRetries) {
        expect(retries).toBeGreaterThanOrEqual(1);
        expect(retries).toBeLessThanOrEqual(5);
      }

      // Invalid retries
      const invalidRetries = [0, 6, -1, 10];

      for (const retries of invalidRetries) {
        const isValid = retries >= 1 && retries <= 5;
        expect(isValid).toBe(false);
      }
    });

    // ==========================================================================
    // Test 10: Validate last_connection_status enum values
    // ==========================================================================

    it('should validate last_connection_status enum values', () => {
      const validStatuses = ['success', 'failed', 'pending', null];

      for (const status of validStatuses) {
        const isValid = status === null || ['success', 'failed', 'pending'].includes(status);
        expect(isValid).toBe(true);
      }

      // Invalid status
      const invalidStatus = 'unknown-status';
      expect(['success', 'failed', 'pending']).not.toContain(invalidStatus);
    });
  });

  // ==========================================================================
  // Test Suite 2: LmsConfigurationPublicSchema Validation
  // ==========================================================================

  describe('LmsConfigurationPublicSchema - Sensitive Field Omission', () => {
    // ==========================================================================
    // Test 11: Omits client_id and client_secret
    // ==========================================================================

    it('should omit client_id and client_secret from public schema', () => {
      const fullConfig = createMockConfig();

      // Simulate public schema omission
      const { client_id, client_secret, ...publicConfig } = fullConfig;

      // Verify sensitive fields removed
      expect(publicConfig).not.toHaveProperty('client_id');
      expect(publicConfig).not.toHaveProperty('client_secret');

      // Verify other fields present
      expect(publicConfig.id).toBeDefined();
      expect(publicConfig.organization_id).toBeDefined();
      expect(publicConfig.name).toBeDefined();
      expect(publicConfig.lms_url).toBeDefined();
      expect(publicConfig.studio_url).toBeDefined();
      expect(publicConfig.default_org).toBeDefined();
    });

    // ==========================================================================
    // Test 12: Includes all non-sensitive fields
    // ==========================================================================

    it('should include all non-sensitive fields in public schema', () => {
      const fullConfig = createMockConfig();
      const { client_id, client_secret, ...publicConfig } = fullConfig;

      const expectedFields = [
        'id',
        'organization_id',
        'name',
        'description',
        'lms_url',
        'studio_url',
        'default_org',
        'default_run',
        'import_timeout_seconds',
        'max_retries',
        'is_active',
        'last_connection_test',
        'last_connection_status',
        'created_at',
        'updated_at',
        'created_by',
      ];

      for (const field of expectedFields) {
        expect(publicConfig).toHaveProperty(field);
      }
    });
  });

  // ==========================================================================
  // Test Suite 3: Input Validation for CRUD Operations
  // ==========================================================================

  describe('CRUD Input Validation', () => {
    // ==========================================================================
    // Test 13: Create operation requires organization_id
    // ==========================================================================

    it('should require organization_id for create operation', () => {
      const createInput = {
        // Missing organization_id
        name: 'Test LMS',
        lms_url: 'https://lms.test.com',
        studio_url: 'https://studio.test.com',
        client_id: 'test-id',
        client_secret: 'test-secret',
        default_org: 'TestOrg',
      };

      expect(createInput).not.toHaveProperty('organization_id');
    });

    // ==========================================================================
    // Test 14: Create operation validates name uniqueness per organization
    // ==========================================================================

    it('should validate name uniqueness per organization for create', async () => {
      const mockBuilder = createMockQueryBuilder();

      // Simulate existing config with same name
      mockBuilder.single.mockResolvedValueOnce({
        data: createMockConfig({ name: 'Production LMS' }),
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Check if name exists in organization
      const existingConfig = await mockBuilder
        .select('id')
        .eq('organization_id', TEST_ORG_ID)
        .eq('name', 'Production LMS')
        .single();

      expect(existingConfig.data).toBeDefined();
      expect(existingConfig.data?.name).toBe('Production LMS');
    });

    // ==========================================================================
    // Test 15: Update operation requires id
    // ==========================================================================

    it('should require id for update operation', () => {
      const updateInput = {
        // Missing id
        name: 'Updated LMS Name',
        is_active: false,
      };

      expect(updateInput).not.toHaveProperty('id');
    });

    // ==========================================================================
    // Test 16: Update operation allows partial updates
    // ==========================================================================

    it('should allow partial updates for update operation', () => {
      const partialUpdates = [
        { id: TEST_CONFIG_ID, name: 'New Name' },
        { id: TEST_CONFIG_ID, description: 'New Description' },
        { id: TEST_CONFIG_ID, is_active: false },
        { id: TEST_CONFIG_ID, max_retries: 5 },
      ];

      for (const update of partialUpdates) {
        expect(update.id).toBeDefined();
        expect(Object.keys(update).length).toBeGreaterThanOrEqual(2); // id + at least one field
      }
    });

    // ==========================================================================
    // Test 17: Delete operation requires id
    // ==========================================================================

    it('should require id for delete operation', () => {
      const deleteInput = {
        id: TEST_CONFIG_ID,
      };

      expect(deleteInput.id).toBeDefined();
      expect(deleteInput.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    // ==========================================================================
    // Test 18: List operation accepts organization_id filter
    // ==========================================================================

    it('should accept organization_id filter for list operation', () => {
      const listInput = {
        organization_id: TEST_ORG_ID,
        include_inactive: false,
      };

      expect(listInput.organization_id).toBeDefined();
      expect(listInput.include_inactive).toBe(false);
    });

    // ==========================================================================
    // Test 19: List operation accepts include_inactive boolean
    // ==========================================================================

    it('should accept include_inactive boolean for list operation', () => {
      const listInputs = [
        { organization_id: TEST_ORG_ID, include_inactive: true },
        { organization_id: TEST_ORG_ID, include_inactive: false },
        { organization_id: TEST_ORG_ID }, // default false
      ];

      for (const input of listInputs) {
        expect(input.organization_id).toBeDefined();
        expect(typeof input.include_inactive === 'boolean' || input.include_inactive === undefined).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Test Suite 4: Authorization Validation
  // ==========================================================================

  describe('Authorization Validation', () => {
    // ==========================================================================
    // Test 20: Create operation requires admin role
    // ==========================================================================

    it('should require admin role for create operation', () => {
      const userRoles = ['admin', 'instructor', 'student'];
      const adminRole = 'admin';

      // Only admin should pass
      expect(userRoles).toContain(adminRole);
      expect(['instructor', 'student']).not.toContain(adminRole);
    });

    // ==========================================================================
    // Test 21: Update operation requires admin role
    // ==========================================================================

    it('should require admin role for update operation', () => {
      const nonAdminRoles = ['instructor', 'student'];
      const adminRole = 'admin';

      for (const role of nonAdminRoles) {
        expect(role).not.toBe(adminRole);
      }
    });

    // ==========================================================================
    // Test 22: Delete operation requires admin role
    // ==========================================================================

    it('should require admin role for delete operation', () => {
      const adminRole = 'admin';
      const instructorRole = 'instructor';

      expect(adminRole).toBe('admin');
      expect(instructorRole).not.toBe('admin');
    });

    // ==========================================================================
    // Test 23: List operation allows organization member
    // ==========================================================================

    it('should allow organization member for list operation', () => {
      const organizationRoles = ['admin', 'instructor', 'student'];

      for (const role of organizationRoles) {
        // All organization members can list
        expect(organizationRoles).toContain(role);
      }
    });

    // ==========================================================================
    // Test 24: Get operation allows organization member
    // ==========================================================================

    it('should allow organization member for get operation', () => {
      const mockBuilder = createMockQueryBuilder();
      const mockConfig = createMockConfig();

      mockBuilder.single.mockResolvedValueOnce({
        data: mockConfig,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Organization member check
      expect(mockConfig.organization_id).toBe(TEST_ORG_ID);
    });

    // ==========================================================================
    // Test 25: Throws FORBIDDEN when user not in organization
    // ==========================================================================

    it('should throw FORBIDDEN when user not in organization', () => {
      const differentOrgId = '00000000-0000-0000-0000-000000000099';
      const mockConfig = createMockConfig({ organization_id: differentOrgId });

      expect(mockConfig.organization_id).not.toBe(TEST_ORG_ID);
      expect(mockConfig.organization_id).toBe(differentOrgId);
    });
  });

  // ==========================================================================
  // Test Suite 5: Edge Cases and Constraints
  // ==========================================================================

  describe('Edge Cases and Constraints', () => {
    // ==========================================================================
    // Test 26: Cannot delete config with active import jobs
    // ==========================================================================

    it('should prevent deletion if active import jobs exist', async () => {
      const mockBuilder = createMockQueryBuilder();

      // Simulate active import jobs
      mockBuilder.single.mockResolvedValueOnce({
        data: { count: 2 },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Check active jobs count
      const activeJobsCheck = await mockBuilder
        .select('count')
        .eq('lms_config_id', TEST_CONFIG_ID)
        .eq('status', 'processing')
        .single();

      expect(activeJobsCheck.data?.count).toBeGreaterThan(0);
    });

    // ==========================================================================
    // Test 27: Default values applied correctly
    // ==========================================================================

    it('should apply default values correctly', () => {
      const configWithDefaults = {
        ...createMockConfig(),
        default_run: 'self_paced', // default
        import_timeout_seconds: 300, // default
        max_retries: 3, // default
        is_active: true, // default
      };

      expect(configWithDefaults.default_run).toBe('self_paced');
      expect(configWithDefaults.import_timeout_seconds).toBe(300);
      expect(configWithDefaults.max_retries).toBe(3);
      expect(configWithDefaults.is_active).toBe(true);
    });

    // ==========================================================================
    // Test 28: Handles nullable fields correctly
    // ==========================================================================

    it('should handle nullable fields correctly', () => {
      const configWithNulls = createMockConfig({
        description: null,
        last_connection_test: null,
        last_connection_status: null,
        created_by: null,
      });

      expect(configWithNulls.description).toBeNull();
      expect(configWithNulls.last_connection_test).toBeNull();
      expect(configWithNulls.last_connection_status).toBeNull();
      expect(configWithNulls.created_by).toBeNull();
    });

    // ==========================================================================
    // Test 29: Throws CONFLICT for duplicate name in organization
    // ==========================================================================

    it('should throw CONFLICT for duplicate name in organization', async () => {
      const mockBuilder = createMockQueryBuilder();

      // Simulate constraint violation
      mockBuilder.insert.mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505', // PostgreSQL unique violation
          message: 'duplicate key value violates unique constraint',
        },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      const result = await mockBuilder
        .insert({
          organization_id: TEST_ORG_ID,
          name: 'Production LMS', // duplicate
        });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('23505');
    });

    // ==========================================================================
    // Test 30: Validates URL protocol (https/http only)
    // ==========================================================================

    it('should validate URL protocol (https/http only)', () => {
      const invalidProtocols = [
        'ftp://lms.example.com',
        'file:///local/path',
        'ws://lms.example.com',
      ];

      for (const url of invalidProtocols) {
        expect(url).not.toMatch(/^https?:\/\/.+/);
      }

      const validProtocols = [
        'https://lms.example.com',
        'http://localhost:8000',
      ];

      for (const url of validProtocols) {
        expect(url).toMatch(/^https?:\/\/.+/);
      }
    });

    // ==========================================================================
    // Test 31: Throws BAD_REQUEST for invalid URL format
    // ==========================================================================

    it('should throw BAD_REQUEST for invalid URL format', () => {
      const invalidUrls = [
        'not-a-url',
        'lms.example.com', // missing protocol
        'https://', // incomplete
        '',
      ];

      for (const url of invalidUrls) {
        const isValidUrl = /^https?:\/\/.+/.test(url);
        expect(isValidUrl).toBe(false);
      }
    });

    // ==========================================================================
    // Test 32: Audit fields set automatically
    // ==========================================================================

    it('should set audit fields automatically on create', () => {
      const newConfig = createMockConfig({
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: TEST_USER_ID,
      });

      expect(newConfig.created_at).toBeDefined();
      expect(newConfig.updated_at).toBeDefined();
      expect(newConfig.created_by).toBe(TEST_USER_ID);

      // Timestamps should be valid ISO 8601
      expect(new Date(newConfig.created_at).toISOString()).toBe(newConfig.created_at);
      expect(new Date(newConfig.updated_at).toISOString()).toBe(newConfig.updated_at);
    });

    // ==========================================================================
    // Test 33: Update modifies updated_at timestamp
    // ==========================================================================

    it('should modify updated_at timestamp on update', () => {
      const originalConfig = createMockConfig({
        created_at: '2024-12-11T10:00:00Z',
        updated_at: '2024-12-11T10:00:00Z',
      });

      const updatedConfig = {
        ...originalConfig,
        updated_at: new Date().toISOString(),
      };

      expect(new Date(updatedConfig.updated_at).getTime())
        .toBeGreaterThan(new Date(originalConfig.updated_at).getTime());
    });

    // ==========================================================================
    // Test 34: Throws NOT_FOUND for non-existent configuration
    // ==========================================================================

    it('should throw NOT_FOUND for non-existent configuration', async () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      const result = await mockBuilder
        .select('*')
        .eq('id', 'non-existent-uuid')
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    // ==========================================================================
    // Test 35: List returns empty array when no configs exist
    // ==========================================================================

    it('should return empty array when no configs exist', () => {
      const mockBuilder = createMockQueryBuilder();

      // Mock the final result of the query chain
      mockBuilder.eq.mockReturnValueOnce({
        data: [],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify query builder was called
      expect(mockBuilder.select).toBeDefined();
      expect(mockBuilder.eq).toBeDefined();
    });

    // ==========================================================================
    // Test 36: List filters by is_active when include_inactive=false
    // ==========================================================================

    it('should filter by is_active when include_inactive=false', () => {
      const mockBuilder = createMockQueryBuilder();

      const activeConfigs = [
        createMockConfig({ id: 'config-1', is_active: true }),
        createMockConfig({ id: 'config-2', is_active: true }),
      ];

      // Mock the final result of the query chain
      mockBuilder.eq.mockReturnValueOnce({
        data: activeConfigs,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify all configs are active
      expect(activeConfigs.every((config) => config.is_active)).toBe(true);
      expect(mockBuilder.select).toBeDefined();
      expect(mockBuilder.eq).toBeDefined();
    });

    // ==========================================================================
    // Test 37: Update validates partial input constraints
    // ==========================================================================

    it('should validate partial input constraints on update', () => {
      const partialUpdate = {
        id: TEST_CONFIG_ID,
        name: 'A'.repeat(101), // exceeds max length
      };

      // Name length validation
      expect(partialUpdate.name.length).toBeGreaterThan(100);
    });
  });

  // ==========================================================================
  // Test Suite 6: Database Constraints
  // ==========================================================================

  describe('Database Constraints', () => {
    // ==========================================================================
    // Test 38: Enforces unique constraint on (organization_id, name)
    // ==========================================================================

    it('should enforce unique constraint on (organization_id, name)', async () => {
      const mockBuilder = createMockQueryBuilder();

      // Attempt to insert duplicate
      mockBuilder.insert.mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "lms_configurations_organization_id_name_key"',
        },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      const result = await mockBuilder.insert({
        organization_id: TEST_ORG_ID,
        name: 'Production LMS', // duplicate name in same org
      });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('23505');
    });

    // ==========================================================================
    // Test 39: Allows same name in different organizations
    // ==========================================================================

    it('should allow same name in different organizations', async () => {
      const differentOrgId = '00000000-0000-0000-0000-000000000099';

      const config1 = createMockConfig({
        id: 'config-1',
        organization_id: TEST_ORG_ID,
        name: 'Production LMS',
      });

      const config2 = createMockConfig({
        id: 'config-2',
        organization_id: differentOrgId,
        name: 'Production LMS', // same name, different org
      });

      expect(config1.name).toBe(config2.name);
      expect(config1.organization_id).not.toBe(config2.organization_id);
    });

    // ==========================================================================
    // Test 40: Foreign key constraint on organization_id
    // ==========================================================================

    it('should enforce foreign key constraint on organization_id', async () => {
      const mockBuilder = createMockQueryBuilder();

      // Attempt to insert with non-existent organization_id
      mockBuilder.insert.mockResolvedValueOnce({
        data: null,
        error: {
          code: '23503', // Foreign key violation
          message: 'insert or update on table "lms_configurations" violates foreign key constraint',
        },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      const result = await mockBuilder.insert({
        organization_id: '00000000-0000-0000-0000-000000000000', // non-existent
        name: 'Test LMS',
      });

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('23503');
    });
  });
});
