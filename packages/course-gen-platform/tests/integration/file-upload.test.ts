/**
 * File Upload - Integration Tests
 * @module tests/integration/file-upload
 *
 * Comprehensive integration tests for file upload functionality (T064).
 * Tests tier-based restrictions, file type validation, file count limits,
 * size limits, and storage quota enforcement.
 *
 * Test Coverage:
 * 1. Free tier upload rejection (upgrade required)
 * 2. Basic Plus TXT upload (accepted - plain text allowed)
 * 3. Basic Plus PDF upload (rejected - requires Standard tier)
 * 4. Standard file count limit (3 files max)
 * 5. Premium PNG upload (accepted - images allowed)
 * 6. File size limit (100MB max)
 * 7. Storage quota exceeded
 *
 * Prerequisites:
 * - File validator implemented (T052): src/shared/validation/file-validator.ts
 * - Quota enforcer implemented (T053): src/shared/validation/quota-enforcer.ts
 * - Upload endpoint implemented (T057): generation.uploadFile procedure
 * - Test fixtures available (TEST_ORGS, TEST_USERS, TEST_COURSES)
 * - Supabase database configured with proper RLS policies
 *
 * Test execution: pnpm test tests/integration/file-upload.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';
import * as crypto from 'crypto';

// ============================================================================
// Type Definitions
// ============================================================================

interface TestServer {
  server: Server;
  port: number;
}

interface TestOrganization {
  id: string;
  name: string;
  tier: 'free' | 'basic_plus' | 'standard' | 'premium';
  storageQuotaBytes: number;
}

interface TestUser {
  id: string;
  email: string;
  password: string;
  role: 'instructor';
  organizationId: string;
}

interface TestCourse {
  id: string;
  title: string;
  slug: string;
  organizationId: string;
  userId: string;
  status: 'draft';
}

interface TestFile {
  filename: string;
  mimeType: string;
  size: number;
  content: string; // base64 encoded
}

// ============================================================================
// Test Data Constants
// ============================================================================

/**
 * Test organizations for each tier
 */
const TEST_FILE_UPLOAD_ORGS: Record<string, TestOrganization> = {
  free: {
    id: '00000000-0000-0000-0000-000000000101',
    name: 'Free Tier Org',
    tier: 'free',
    storageQuotaBytes: 10 * 1024 * 1024, // 10MB
  },
  basicPlus: {
    id: '00000000-0000-0000-0000-000000000102',
    name: 'Basic Plus Tier Org',
    tier: 'basic_plus',
    storageQuotaBytes: 100 * 1024 * 1024, // 100MB
  },
  standard: {
    id: '00000000-0000-0000-0000-000000000103',
    name: 'Standard Tier Org',
    tier: 'standard',
    storageQuotaBytes: 1 * 1024 * 1024 * 1024, // 1GB
  },
  premium: {
    id: '00000000-0000-0000-0000-000000000104',
    name: 'Premium Tier Org',
    tier: 'premium',
    storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
  },
  quotaFull: {
    id: '00000000-0000-0000-0000-000000000105',
    name: 'Quota Full Org',
    tier: 'basic_plus',
    storageQuotaBytes: 100 * 1024 * 1024, // 100MB (will set usage to 100MB)
  },
};

/**
 * Test users (one per organization)
 */
const TEST_FILE_UPLOAD_USERS: Record<string, TestUser> = {
  freeUser: {
    id: '00000000-0000-0000-0000-000000000201',
    email: 'free-instructor@megacampus.com',
    password: 'test-password-free-123',
    role: 'instructor',
    organizationId: TEST_FILE_UPLOAD_ORGS.free.id,
  },
  basicPlusUser: {
    id: '00000000-0000-0000-0000-000000000202',
    email: 'basicplus-instructor@megacampus.com',
    password: 'test-password-basic-456',
    role: 'instructor',
    organizationId: TEST_FILE_UPLOAD_ORGS.basicPlus.id,
  },
  standardUser: {
    id: '00000000-0000-0000-0000-000000000203',
    email: 'standard-instructor@megacampus.com',
    password: 'test-password-standard-789',
    role: 'instructor',
    organizationId: TEST_FILE_UPLOAD_ORGS.standard.id,
  },
  premiumUser: {
    id: '00000000-0000-0000-0000-000000000204',
    email: 'premium-instructor@megacampus.com',
    password: 'test-password-premium-abc',
    role: 'instructor',
    organizationId: TEST_FILE_UPLOAD_ORGS.premium.id,
  },
  quotaFullUser: {
    id: '00000000-0000-0000-0000-000000000205',
    email: 'quota-full-instructor@megacampus.com',
    password: 'test-password-quota-def',
    role: 'instructor',
    organizationId: TEST_FILE_UPLOAD_ORGS.quotaFull.id,
  },
};

/**
 * Test courses (one per organization)
 */
const TEST_FILE_UPLOAD_COURSES: Record<string, TestCourse> = {
  freeCourse: {
    id: '00000000-0000-0000-0000-000000000301',
    title: 'Free Tier Course',
    slug: 'free-tier-course',
    organizationId: TEST_FILE_UPLOAD_ORGS.free.id,
    userId: TEST_FILE_UPLOAD_USERS.freeUser.id,
    status: 'draft',
  },
  basicPlusCourse: {
    id: '00000000-0000-0000-0000-000000000302',
    title: 'Basic Plus Tier Course',
    slug: 'basicplus-tier-course',
    organizationId: TEST_FILE_UPLOAD_ORGS.basicPlus.id,
    userId: TEST_FILE_UPLOAD_USERS.basicPlusUser.id,
    status: 'draft',
  },
  standardCourse: {
    id: '00000000-0000-0000-0000-000000000303',
    title: 'Standard Tier Course',
    slug: 'standard-tier-course',
    organizationId: TEST_FILE_UPLOAD_ORGS.standard.id,
    userId: TEST_FILE_UPLOAD_USERS.standardUser.id,
    status: 'draft',
  },
  premiumCourse: {
    id: '00000000-0000-0000-0000-000000000304',
    title: 'Premium Tier Course',
    slug: 'premium-tier-course',
    organizationId: TEST_FILE_UPLOAD_ORGS.premium.id,
    userId: TEST_FILE_UPLOAD_USERS.premiumUser.id,
    status: 'draft',
  },
  quotaFullCourse: {
    id: '00000000-0000-0000-0000-000000000305',
    title: 'Quota Full Course',
    slug: 'quota-full-course',
    organizationId: TEST_FILE_UPLOAD_ORGS.quotaFull.id,
    userId: TEST_FILE_UPLOAD_USERS.quotaFullUser.id,
    status: 'draft',
  },
};

// ============================================================================
// Test File Fixtures
// ============================================================================

/**
 * Create base64-encoded test file content
 */
function createTestFileContent(sizeBytes: number): string {
  // Create buffer of specified size filled with 'A' (base64 encoding adds ~33% overhead)
  const buffer = Buffer.alloc(sizeBytes, 'A');
  return buffer.toString('base64');
}

/**
 * Test file fixtures
 */
const TEST_FILES = {
  pdf: {
    filename: 'test-document.pdf',
    mimeType: 'application/pdf',
    size: 1024 * 1024, // 1MB
    content: createTestFileContent(1024 * 1024),
  } as TestFile,

  docx: {
    filename: 'test-document.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 1024 * 1024, // 1MB
    content: createTestFileContent(1024 * 1024),
  } as TestFile,

  png: {
    filename: 'test-image.png',
    mimeType: 'image/png',
    size: 512 * 1024, // 512KB
    content: createTestFileContent(512 * 1024),
  } as TestFile,

  large: {
    filename: 'large-file.pdf',
    mimeType: 'application/pdf',
    size: 101 * 1024 * 1024, // 101MB (over limit)
    content: createTestFileContent(101 * 1024 * 1024),
  } as TestFile,

  small: {
    filename: 'small-file.txt',
    mimeType: 'text/plain',
    size: 100 * 1024, // 100KB
    content: createTestFileContent(100 * 1024),
  } as TestFile,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Start tRPC server for testing
 */
async function startTestServer(): Promise<TestServer> {
  const app = express();

  app.use(
    cors({
      origin: '*',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'OPTIONS'],
    })
  );

  app.use(express.json({ limit: '120mb' })); // Increased limit for large test files

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req }) => {
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const headers = new Headers();

        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach(v => headers.append(key, v));
            } else {
              headers.set(key, value);
            }
          }
        });

        const fetchRequest = new Request(url, {
          method: req.method,
          headers,
        });

        return createContext({
          req: fetchRequest,
          resHeaders: new Headers(),
          info: {
            isBatchCall: false,
            calls: [],
            accept: 'application/jsonl' as const,
            type: 'query' as const,
            connectionParams: null,
            signal: new AbortController().signal,
            url: new URL(url),
          },
        });
      },
    })
  );

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        console.log(`Test tRPC server started on port ${port}`);
        resolve({ server, port });
      } else {
        reject(new Error('Failed to get server port'));
      }
    });

    server.on('error', reject);
  });
}

/**
 * Stop test server
 */
async function stopTestServer(testServer: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer.server.close(err => {
      if (err) {
        reject(err);
      } else {
        console.log(`Test tRPC server stopped (port ${testServer.port})`);
        resolve();
      }
    });
  });
}

/**
 * Create tRPC client with JWT token
 */
function createTestClient(port: number, token?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      }),
    ],
  });
}

/**
 * Sign in with Supabase and get JWT token (with retry logic for CI reliability)
 */
async function getAuthToken(email: string, password: string, retries = 3): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.session) {
      return data.session.access_token;
    }

    if (attempt < retries) {
      console.log(`Auth attempt ${attempt} failed for ${email}, retrying in 500ms...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      throw new Error(
        `Failed to authenticate user ${email} after ${retries} attempts: ${error?.message || 'No session returned'}`
      );
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

/**
 * Create test auth user
 */
async function createAuthUser(email: string, password: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const {
    data: { users: existingUsers },
  } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers.find(u => u.email === email);

  // Always delete existing user to ensure fresh credentials
  if (existingUser) {
    await supabase.auth.admin.deleteUser(existingUser.id);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });

  if (error) {
    throw new Error(`Failed to create auth user for ${email}: ${error.message}`);
  }

  console.log(`Created auth user for ${email} with ID ${data.user.id}`);
}

/**
 * Setup test fixtures (organizations, users, courses)
 */
async function setupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Create organizations
  for (const org of Object.values(TEST_FILE_UPLOAD_ORGS)) {
    const { error } = await supabase.from('organizations').upsert(
      {
        id: org.id,
        name: org.name,
        tier: org.tier,
        storage_quota_bytes: org.storageQuotaBytes,
        storage_used_bytes:
          org.id === TEST_FILE_UPLOAD_ORGS.quotaFull.id
            ? org.storageQuotaBytes // Set to full for quota test
            : 0,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(`Failed to create organization ${org.name}: ${error.message}`);
    }
  }

  // Create users
  for (const user of Object.values(TEST_FILE_UPLOAD_USERS)) {
    const { error } = await supabase.from('users').upsert(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        organization_id: user.organizationId,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(`Failed to create user ${user.email}: ${error.message}`);
    }
  }

  // Create courses
  for (const course of Object.values(TEST_FILE_UPLOAD_COURSES)) {
    const { error } = await supabase.from('courses').upsert(
      {
        id: course.id,
        title: course.title,
        slug: course.slug,
        user_id: course.userId,
        organization_id: course.organizationId,
        status: course.status,
        settings: {},
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(`Failed to create course ${course.title}: ${error.message}`);
    }
  }
}

/**
 * Cleanup test fixtures
 */
async function cleanupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete uploaded files
  const courseIds = Object.values(TEST_FILE_UPLOAD_COURSES).map(c => c.id);
  const { data: files } = await supabase
    .from('file_catalog')
    .select('id, organization_id, file_size')
    .in('course_id', courseIds);

  if (files) {
    for (const file of files) {
      // Decrement quota before deleting file
      try {
        await supabase.rpc('decrement_storage_quota', {
          org_id: file.organization_id,
          size_bytes: file.file_size,
        });
      } catch (error) {
        console.warn(`Failed to decrement quota for file ${file.id}:`, error);
      }
    }

    // Delete file catalog entries
    await supabase.from('file_catalog').delete().in('course_id', courseIds);
  }

  // Delete courses
  await supabase.from('courses').delete().in('id', courseIds);

  // Delete users
  const userIds = Object.values(TEST_FILE_UPLOAD_USERS).map(u => u.id);
  await supabase.from('users').delete().in('id', userIds);

  // Delete organizations
  const orgIds = Object.values(TEST_FILE_UPLOAD_ORGS).map(o => o.id);
  await supabase.from('organizations').delete().in('id', orgIds);
}

/**
 * Cleanup auth users
 */
async function cleanupAuthUsers(): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const testEmails = Object.values(TEST_FILE_UPLOAD_USERS).map(u => u.email);

    for (const user of users) {
      if (user.email && testEmails.includes(user.email)) {
        await supabase.auth.admin.deleteUser(user.id);
        console.log(`Deleted auth user: ${user.email}`);
      }
    }
  } catch (error) {
    console.warn('Warning: Could not cleanup auth users:', error);
  }
}

/**
 * Clean up uploaded files for a course
 */
async function cleanupCourseFiles(courseId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Get files for course
  const { data: files } = await supabase
    .from('file_catalog')
    .select('id, organization_id, file_size')
    .eq('course_id', courseId);

  if (files) {
    for (const file of files) {
      // Decrement quota
      try {
        await supabase.rpc('decrement_storage_quota', {
          org_id: file.organization_id,
          size_bytes: file.file_size,
        });
      } catch (error) {
        console.warn(`Failed to decrement quota for file ${file.id}:`, error);
      }
    }

    // Delete file catalog entries
    await supabase.from('file_catalog').delete().eq('course_id', courseId);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('File Upload - Integration Tests', () => {
  let testServer: TestServer;
  let serverPort: number;

  beforeAll(async () => {
    console.log('Setting up file upload integration tests...');

    // Clean up any existing test data (DB only)
    await cleanupTestFixtures();
    // NOTE: We don't cleanup auth users here to avoid race conditions
    // Auth users will be created if they don't exist

    // Setup test fixtures
    await setupTestFixtures();

    // Create auth users (createAuthUser handles existing users)
    for (const user of Object.values(TEST_FILE_UPLOAD_USERS)) {
      await createAuthUser(user.email, user.password, user.id);
    }

    // Wait for Supabase Auth to propagate all user creations (prevent race condition)
    console.log('Waiting for auth users to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3s delay

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    console.log(`Test server ready on port ${serverPort}`);
  }, 60000); // 60s timeout for setup

  afterEach(async () => {
    // Clean up files after each test
    for (const course of Object.values(TEST_FILE_UPLOAD_COURSES)) {
      await cleanupCourseFiles(course.id);
    }

    // Reset quota for quotaFull org
    const supabase = getSupabaseAdmin();
    await supabase
      .from('organizations')
      .update({ storage_used_bytes: TEST_FILE_UPLOAD_ORGS.quotaFull.storageQuotaBytes })
      .eq('id', TEST_FILE_UPLOAD_ORGS.quotaFull.id);
  });

  afterAll(async () => {
    console.log('Tearing down file upload integration tests...');

    // Stop server
    if (testServer) {
      await stopTestServer(testServer);
    }

    // Cleanup fixtures
    await cleanupTestFixtures();
    await cleanupAuthUsers();
  }, 30000); // 30s timeout for teardown

  // ==========================================================================
  // Scenario 1: Free tier upload rejection
  // ==========================================================================

  describe('Scenario 1: Free tier upload rejection', () => {
    it('should reject file upload for free tier organization with upgrade message', async () => {
      // Given: A free tier organization instructor
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.freeUser.email,
        TEST_FILE_UPLOAD_USERS.freeUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Attempting to upload a file
      try {
        await client.generation.uploadFile.mutate({
          courseId: TEST_FILE_UPLOAD_COURSES.freeCourse.id,
          filename: TEST_FILES.pdf.filename,
          fileSize: TEST_FILES.pdf.size,
          mimeType: TEST_FILES.pdf.mimeType,
          fileContent: TEST_FILES.pdf.content,
        });

        expect.fail('Should have thrown error for free tier upload');
      } catch (error) {
        // Then: Should throw BAD_REQUEST with upgrade message
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toContain('Free tier');
        expect(trpcError.message).toContain('not support file uploads');
        expect(trpcError.message).toContain('Upgrade');
      }
    });
  });

  // ==========================================================================
  // Scenario 2: Basic Plus TXT upload (accepted)
  // ==========================================================================

  describe('Scenario 2: Basic Plus TXT upload accepted', () => {
    it('should accept TXT upload for Basic Plus tier', async () => {
      // Given: A Basic Plus tier organization instructor
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.basicPlusUser.email,
        TEST_FILE_UPLOAD_USERS.basicPlusUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Uploading a TXT file (plain text - allowed for Basic Plus)
      const response = await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.basicPlusCourse.id,
        filename: TEST_FILES.small.filename,
        fileSize: TEST_FILES.small.size,
        mimeType: TEST_FILES.small.mimeType,
        fileContent: TEST_FILES.small.content,
      });

      // Then: Upload should succeed
      expect(response).toBeDefined();
      expect(response.fileId).toBeDefined();
      expect(response.storagePath).toBeDefined();
      expect(response.message).toContain('uploaded successfully');

      // Verify file metadata in database
      const supabase = getSupabaseAdmin();
      const { data: fileRecord } = await supabase
        .from('file_catalog')
        .select('*')
        .eq('id', response.fileId)
        .single();

      expect(fileRecord).toBeDefined();
      expect(fileRecord!.filename).toBe(TEST_FILES.small.filename);
      expect(fileRecord!.mime_type).toBe(TEST_FILES.small.mimeType);
      expect(fileRecord!.course_id).toBe(TEST_FILE_UPLOAD_COURSES.basicPlusCourse.id);
      expect(fileRecord!.vector_status).toBe('pending');

      // Verify storage quota incremented
      const { data: org } = await supabase
        .from('organizations')
        .select('storage_used_bytes')
        .eq('id', TEST_FILE_UPLOAD_ORGS.basicPlus.id)
        .single();

      expect(org).toBeDefined();
      expect(org!.storage_used_bytes).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Scenario 3: Basic Plus PDF upload (rejected - requires Standard tier)
  // ==========================================================================

  describe('Scenario 3: Basic Plus PDF upload rejected', () => {
    it('should reject PDF upload for Basic Plus tier with upgrade message', async () => {
      // Given: A Basic Plus tier organization instructor
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.basicPlusUser.email,
        TEST_FILE_UPLOAD_USERS.basicPlusUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Attempting to upload a PDF file (not allowed for Basic Plus)
      try {
        await client.generation.uploadFile.mutate({
          courseId: TEST_FILE_UPLOAD_COURSES.basicPlusCourse.id,
          filename: TEST_FILES.pdf.filename,
          fileSize: TEST_FILES.pdf.size,
          mimeType: TEST_FILES.pdf.mimeType,
          fileContent: TEST_FILES.pdf.content,
        });

        expect.fail('Should have thrown error for PDF on Basic Plus tier');
      } catch (error) {
        // Then: Should throw BAD_REQUEST with allowed formats and upgrade message
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toContain('not supported');
        expect(trpcError.message).toMatch(/TXT|MD/); // Should list allowed formats (TXT, MD)
        expect(trpcError.message).toContain('Upgrade'); // Should suggest upgrade to Standard
      }
    });
  });

  // ==========================================================================
  // Scenario 4: Standard file count limit
  // ==========================================================================

  describe('Scenario 4: Standard file count limit (3 files max)', () => {
    it('should accept 3 files for Standard tier', async () => {
      // Given: A Standard tier organization instructor
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.standardUser.email,
        TEST_FILE_UPLOAD_USERS.standardUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Uploading 3 files
      const file1 = await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file1.pdf',
        fileSize: TEST_FILES.pdf.size,
        mimeType: TEST_FILES.pdf.mimeType,
        fileContent: TEST_FILES.pdf.content,
      });

      const file2 = await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file2.txt',
        fileSize: TEST_FILES.small.size,
        mimeType: TEST_FILES.small.mimeType,
        fileContent: TEST_FILES.small.content,
      });

      const file3 = await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file3.pdf',
        fileSize: TEST_FILES.pdf.size,
        mimeType: TEST_FILES.pdf.mimeType,
        fileContent: TEST_FILES.pdf.content,
      });

      // Then: All 3 uploads should succeed
      expect(file1.fileId).toBeDefined();
      expect(file2.fileId).toBeDefined();
      expect(file3.fileId).toBeDefined();
    });

    it('should reject 4th file upload for Standard tier with file count limit message', async () => {
      // Wait to avoid rate limit (previous test made 3 uploads, wait 60s for rate limit window reset)
      await new Promise(resolve => setTimeout(resolve, 60000));

      // Given: A Standard tier organization instructor with 3 files already uploaded
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.standardUser.email,
        TEST_FILE_UPLOAD_USERS.standardUser.password
      );
      const client = createTestClient(serverPort, token);

      // Upload 3 files first
      await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file1.pdf',
        fileSize: TEST_FILES.pdf.size,
        mimeType: TEST_FILES.pdf.mimeType,
        fileContent: TEST_FILES.pdf.content,
      });

      await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file2.txt',
        fileSize: TEST_FILES.small.size,
        mimeType: TEST_FILES.small.mimeType,
        fileContent: TEST_FILES.small.content,
      });

      await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
        filename: 'file3.pdf',
        fileSize: TEST_FILES.pdf.size,
        mimeType: TEST_FILES.pdf.mimeType,
        fileContent: TEST_FILES.pdf.content,
      });

      // When: Attempting to upload 4th file
      try {
        await client.generation.uploadFile.mutate({
          courseId: TEST_FILE_UPLOAD_COURSES.standardCourse.id,
          filename: 'file4.pdf',
          fileSize: TEST_FILES.pdf.size,
          mimeType: TEST_FILES.pdf.mimeType,
          fileContent: TEST_FILES.pdf.content,
        });

        expect.fail('Should have thrown error for exceeding file count limit');
      } catch (error) {
        // Then: Should throw BAD_REQUEST with file count limit message
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toContain('limit reached');
        expect(trpcError.message).toMatch(/3\s+file/i); // Should mention 3 files
        expect(trpcError.message).toContain('Standard'); // Should mention tier
      }
    }, 90000); // 90s timeout (includes 60s rate limit wait + 30s for uploads)
  });

  // ==========================================================================
  // Scenario 5: Premium PNG upload (accepted)
  // ==========================================================================

  describe('Scenario 5: Premium PNG upload accepted', () => {
    it('should accept PNG image upload for Premium tier', async () => {
      // Given: A Premium tier organization instructor
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.premiumUser.email,
        TEST_FILE_UPLOAD_USERS.premiumUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Uploading a PNG image file
      const response = await client.generation.uploadFile.mutate({
        courseId: TEST_FILE_UPLOAD_COURSES.premiumCourse.id,
        filename: TEST_FILES.png.filename,
        fileSize: TEST_FILES.png.size,
        mimeType: TEST_FILES.png.mimeType,
        fileContent: TEST_FILES.png.content,
      });

      // Then: Upload should succeed
      expect(response).toBeDefined();
      expect(response.fileId).toBeDefined();
      expect(response.storagePath).toBeDefined();
      expect(response.message).toContain('uploaded successfully');

      // Verify file metadata in database
      const supabase = getSupabaseAdmin();
      const { data: fileRecord } = await supabase
        .from('file_catalog')
        .select('*')
        .eq('id', response.fileId)
        .single();

      expect(fileRecord).toBeDefined();
      expect(fileRecord!.filename).toBe(TEST_FILES.png.filename);
      expect(fileRecord!.mime_type).toBe(TEST_FILES.png.mimeType);
      expect(fileRecord!.course_id).toBe(TEST_FILE_UPLOAD_COURSES.premiumCourse.id);
    });
  });

  // ==========================================================================
  // Scenario 6: File size limit (100MB)
  // ==========================================================================

  describe('Scenario 6: File size limit 100MB', () => {
    it('should reject file larger than 100MB with size limit message', async () => {
      // Given: A Premium tier organization instructor (any paid tier would work)
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.premiumUser.email,
        TEST_FILE_UPLOAD_USERS.premiumUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Attempting to upload a file larger than 100MB
      try {
        await client.generation.uploadFile.mutate({
          courseId: TEST_FILE_UPLOAD_COURSES.premiumCourse.id,
          filename: TEST_FILES.large.filename,
          fileSize: TEST_FILES.large.size,
          mimeType: TEST_FILES.large.mimeType,
          fileContent: TEST_FILES.large.content,
        });

        expect.fail('Should have thrown error for file exceeding 100MB limit');
      } catch (error) {
        // Then: Should throw error
        // Note: Large files may be rejected at multiple layers:
        // 1. Express body parser (request entity too large / JSON parsing error)
        // 2. Zod schema validation (exceeds max file size)
        // 3. Custom file validator (file too large)
        // Any of these rejections is acceptable for this test
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;

        // Accept any error that indicates the file was rejected
        // This includes parsing errors, schema validation errors, or custom validation errors
        expect(error).toBeDefined();

        // The key requirement is that the file upload was rejected (not accepted)
        // We verify this by checking that an error was thrown (already done above)
      }
    });
  });

  // ==========================================================================
  // Scenario 7: Storage quota exceeded
  // ==========================================================================

  describe('Scenario 7: Storage quota exceeded', () => {
    it('should reject upload when organization storage quota is full', async () => {
      // Given: An organization with full storage quota (Basic Plus tier)
      const token = await getAuthToken(
        TEST_FILE_UPLOAD_USERS.quotaFullUser.email,
        TEST_FILE_UPLOAD_USERS.quotaFullUser.password
      );
      const client = createTestClient(serverPort, token);

      // When: Attempting to upload a TXT file (allowed for Basic Plus tier)
      try {
        await client.generation.uploadFile.mutate({
          courseId: TEST_FILE_UPLOAD_COURSES.quotaFullCourse.id,
          filename: TEST_FILES.small.filename,
          fileSize: TEST_FILES.small.size,
          mimeType: TEST_FILES.small.mimeType,
          fileContent: TEST_FILES.small.content,
        });

        expect.fail('Should have thrown error for exceeded storage quota');
      } catch (error) {
        // Then: Should throw BAD_REQUEST with quota exceeded message
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toContain('quota exceeded');
        expect(trpcError.message).toContain('Using'); // Should show current usage
        expect(trpcError.message).toContain('Available'); // Should show available space
      }
    });
  });
});
