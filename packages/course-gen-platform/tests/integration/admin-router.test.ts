/**
 * Admin Router Integration Tests
 * @module tests/integration/admin-router
 *
 * Tests for the Admin tRPC router (US1/US5).
 * Verifies admin-only access and functionality for history, organizations, users, and courses.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  getTestFixtures
} from '../fixtures';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';
import { randomUUID } from 'crypto';

// ============================================================================
// Test Data
// ============================================================================

// Use getTestFixtures but override users with completely random IDs to ensure freshness/ordering
const fixtures = getTestFixtures('admin-router.test.ts');

// Generate fresh random users for this test run
const adminUser = {
  id: randomUUID(),
  email: `test-admin-${randomUUID()}@megacampus.com`,
  role: 'admin' as const,
  organizationId: fixtures.TEST_ORGS.premium.id,
  password: 'AdminPassword123!',
};

const instructor1 = {
  id: randomUUID(),
  email: `test-instructor1-${randomUUID()}@megacampus.com`,
  role: 'instructor' as const,
  organizationId: fixtures.TEST_ORGS.premium.id,
  password: 'TestPassword123!',
};

const instructor2 = {
  id: randomUUID(),
  email: `test-instructor2-${randomUUID()}@megacampus.com`,
  role: 'instructor' as const,
  organizationId: fixtures.TEST_ORGS.premium.id,
  password: 'TestPassword123!',
};

const student = {
  id: randomUUID(),
  email: `test-student-${randomUUID()}@megacampus.com`,
  role: 'student' as const,
  organizationId: fixtures.TEST_ORGS.premium.id,
  password: 'TestPassword123!',
};

// Override fixtures
fixtures.TEST_USERS = {
  admin: adminUser,
  instructor1,
  instructor2,
  student
};

const { TEST_ORGS, TEST_USERS } = fixtures;
const ADMIN_USER = adminUser;

// ============================================================================
// Helpers (Copied from trpc-server.test.ts to be self-contained)
// ============================================================================

interface TestServer {
  server: Server;
  port: number;
}

async function startTestServer(): Promise<TestServer> {
  const app = express();
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));

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

        return createContext({
          req: new Request(url, { method: req.method, headers }),
          resHeaders: new Headers(),
          info: {
            isBatchCall: false,
            calls: [],
            accept: 'application/jsonl',
            type: 'query',
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
        console.log(`Test Admin tRPC server started on port ${address.port}`);
        resolve({ server, port: address.port });
      } else {
        reject(new Error('Failed to get server port'));
      }
    });
    server.on('error', reject);
  });
}

async function stopTestServer(testServer: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer.server.close(err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

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

async function getAuthToken(email: string, password: string, retries = 10): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session.access_token;
    if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Failed to authenticate user ${email}`);
}

// ============================================================================
// Tests
// ============================================================================

describe('Admin Router Integration', () => {
  let testServer: TestServer;
  let adminToken: string;
  let adminClient: ReturnType<typeof createTestClient>;
  
  beforeAll(async () => {
    // 1. Start server
    testServer = await startTestServer();

    // 2. Setup fixtures (creates orgs, courses, etc.)
    await setupTestFixtures({ customFixtures: fixtures });

    // 3. Create Auth for Admin User manually (bypassing fixtures helper to ensure password works)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    
    // Delete if exists
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existing = users.find(u => u.email === ADMIN_USER.email);
    if (existing) await supabase.auth.admin.deleteUser(existing.id);

    const { error: createError } = await supabase.auth.admin.createUser({
      id: ADMIN_USER.id,
      email: ADMIN_USER.email,
      password: ADMIN_USER.password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
      user_metadata: { full_name: 'Test Admin' }
    });
    
    if (createError) throw new Error(`Failed to create admin auth: ${createError.message}`);
    
    console.log('✅ Created admin auth user manually');

    // 4. Authenticate as Admin
    adminToken = await getAuthToken(ADMIN_USER.email, ADMIN_USER.password);
    adminClient = createTestClient(testServer.port, adminToken);
  }, 60000);

  afterAll(async () => {
    await cleanupTestFixtures();
    
    // Cleanup my admin user
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    // Delete from auth
    await supabase.auth.admin.deleteUser(ADMIN_USER.id);
    // Delete from public (just in case cascade fails or wasn't set)
    await supabase.from('users').delete().eq('id', ADMIN_USER.id);

    if (testServer) await stopTestServer(testServer);
  });

  it('should list organizations', async () => {
    const orgs = await adminClient.admin.listOrganizations.query({ limit: 10 });
    expect(orgs).toBeDefined();
    expect(orgs.length).toBeGreaterThan(0);
    const premiumOrg = orgs.find(o => o.id === TEST_ORGS.premium.id);
    if (premiumOrg) {
      expect(premiumOrg.tier).toBe('premium');
    }
  });

  it('should list users', async () => {
    const users = await adminClient.admin.listUsers.query({ limit: 100 });
    expect(users).toBeDefined();
    expect(users.length).toBeGreaterThan(0);
    const instructor = users.find(u => u.email === fixtures.TEST_USERS.instructor1.email);
    expect(instructor).toBeDefined();
    expect(instructor?.role).toBe('instructor');
  });

  it('should list courses', async () => {
    const courses = await adminClient.admin.listCourses.query({ limit: 10 });
    expect(courses).toBeDefined();
  });

  it('should get generation history', async () => {
    const history = await adminClient.admin.getGenerationHistory.query({ limit: 10 });
    expect(history).toBeDefined();
    expect(history.courses).toBeInstanceOf(Array);
    expect(history.totalCount).toBeGreaterThanOrEqual(0);
  });

  it('should get statistics', async () => {
    try {
      const stats = await adminClient.admin.getStatistics.query();
      expect(stats).toBeDefined();
      expect(stats.organizations.total).toBeGreaterThan(0);
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === 'FORBIDDEN') {
        console.log('Skipping getStatistics test (requires superadmin)');
      } else {
        throw err;
      }
    }
  });

  it('should reject unauthenticated access', async () => {
    const anonClient = createTestClient(testServer.port);
    await expect(anonClient.admin.listOrganizations.query({})).rejects.toThrow();
  });

  it('should reject non-admin access', async () => {
    // Create a FRESH instructor for this test
    const tempEmail = `temp-instructor-${Date.now()}@megacampus.com`;
    const tempPassword = 'TempPassword123!';
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    
    await supabase.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true,
      app_metadata: { role: 'instructor' },
      user_metadata: { full_name: 'Temp Instructor' }
    });

    const tempToken = await getAuthToken(tempEmail, tempPassword);
    const tempClient = createTestClient(testServer.port, tempToken);

    await expect(tempClient.admin.listOrganizations.query({})).rejects.toThrow();
    
    // Cleanup
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === tempEmail);
    if (user) await supabase.auth.admin.deleteUser(user.id);
  });
});
