/**
 * Shared Test Fixtures
 *
 * Centralized test data setup and cleanup for all test suites.
 * This module provides stable test data that respects database foreign key constraints.
 *
 * Usage:
 * - Import TEST_ORGS, TEST_USERS, TEST_COURSES constants
 * - Call setupTestFixtures() in beforeAll hooks
 * - Call cleanupTestJobs() in afterEach hooks
 * - Call cleanupTestFixtures() in afterAll hooks
 *
 * Foreign key dependency order:
 * organizations → users → courses → job_status
 *
 * Cleanup must happen in reverse order.
 */

import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Stage 6 Test Helper Types
import type { Stage6JobInput } from '../../src/stages/stage6-lesson-content/handler';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';

// ============================================================================
// Type Definitions
// ============================================================================

export interface TestOrganization {
  id: string;
  name: string;
  tier: 'free' | 'premium' | 'enterprise';
}

export interface TestUser {
  id: string;
  email: string;
  role: 'admin' | 'instructor' | 'student';
  organizationId: string;
}

export interface TestCourse {
  id: string;
  title: string;
  slug: string;
  organizationId: string;
  userId: string; // instructor who owns it
  status: 'draft' | 'published' | 'archived';
}

export interface TestAuthUser {
  id: string;
  email: string;
  password: string;
}

// ============================================================================
// Test Data Helper Functions
// ============================================================================

/**
 * Generate unique test fixtures per test file to prevent race conditions
 * in parallel test execution.
 *
 * @param testFileName - Name of the test file (e.g., 'stage4-detailed-requirements.test.ts')
 * @returns Test fixtures with unique user IDs and emails
 */
export function getTestFixtures(testFileName: string) {
  // Generate unique 12-character ID from filename hash
  const uniqueId = createHash('md5')
    .update(testFileName)
    .digest('hex')
    .slice(0, 12);

  // Base organization (shared across all tests)
  const TEST_ORGS = {
    premium: {
      id: '759ba851-3f16-4294-9627-dc5a0a366c8e',
      name: 'Premium Test Org',
      tier: 'premium' as const,
    },
  };

  const users = {
      instructor1: {
        id: `00000000-0000-0000-0000-${uniqueId.substring(0, 12)}`,
        email: `test-instructor1-${testFileName.replace(/\.test\.ts$/, '')}@megacampus.com`,
        password: 'TestPassword123!',
        role: 'instructor' as const,
        organizationId: TEST_ORGS.premium.id,
      },
      instructor2: {
        id: `11111111-1111-1111-1111-${uniqueId.substring(0, 12)}`,
        email: `test-instructor2-${testFileName.replace(/\.test\.ts$/, '')}@megacampus.com`,
        password: 'TestPassword123!',
        role: 'instructor' as const,
        organizationId: TEST_ORGS.premium.id,
      },
      student: {
        id: `22222222-2222-2222-2222-${uniqueId.substring(0, 12)}`,
        email: `test-student-${testFileName.replace(/\.test\.ts$/, '')}@megacampus.com`,
        password: 'TestPassword123!',
        role: 'student' as const,
        organizationId: TEST_ORGS.premium.id,
      },
    };

  return {
    TEST_ORGS,
    TEST_USERS: users,
    TEST_COURSES: {
      course1: {
        id: `00000000-0000-0000-0000-${uniqueId.substring(0, 10)}21`,
        title: `Test Course 1 - ${testFileName}`,
        slug: `test-course-1-${uniqueId}`,
        organizationId: TEST_ORGS.premium.id,
        userId: users.instructor1.id,
        status: 'draft' as const,
      },
      course2: {
        id: `00000000-0000-0000-0000-${uniqueId.substring(0, 10)}22`,
        title: `Test Course 2 - ${testFileName}`,
        slug: `test-course-2-${uniqueId}`,
        organizationId: TEST_ORGS.premium.id,
        userId: users.instructor2.id,
        status: 'published' as const,
      },
    },
  };
}

// ============================================================================
// Test Data Constants
// ============================================================================

/**
 * Test organizations with stable UUIDs
 * Using existing Premium org ID from seed data
 */
export const TEST_ORGS: Record<string, TestOrganization> = {
  premium: {
    id: '759ba851-3f16-4294-9627-dc5a0a366c8e', // Existing Premium org from seed
    name: 'Test Premium Org',
    tier: 'premium',
  },
  free: {
    id: '850e8400-e29b-41d4-a716-446655440001',
    name: 'Test Free Org',
    tier: 'free',
  },
};

/**
 * Test users with stable UUIDs
 * All belong to Premium org for simplicity
 */
export const TEST_USERS: Record<string, TestUser> = {
  admin: {
    id: '00000000-0000-0000-0000-000000000011',
    email: 'test-admin@megacampus.com',
    role: 'admin',
    organizationId: TEST_ORGS.premium.id,
  },
  instructor1: {
    id: '00000000-0000-0000-0000-000000000012',
    email: 'test-instructor1@megacampus.com',
    role: 'instructor',
    organizationId: TEST_ORGS.premium.id,
  },
  instructor2: {
    id: '00000000-0000-0000-0000-000000000013',
    email: 'test-instructor2@megacampus.com',
    role: 'instructor',
    organizationId: TEST_ORGS.premium.id,
  },
  student: {
    id: '00000000-0000-0000-0000-000000000014',
    email: 'test-student@megacampus.com',
    role: 'student',
    organizationId: TEST_ORGS.premium.id,
  },
};

/**
 * Test courses with stable UUIDs
 */
export const TEST_COURSES: Record<string, TestCourse> = {
  course1: {
    id: '00000000-0000-0000-0000-000000000021',
    title: 'Test Course 1 - Introduction to Testing',
    slug: 'test-course-1',
    organizationId: TEST_ORGS.premium.id,
    userId: TEST_USERS.instructor1.id,
    status: 'draft',
  },
  course2: {
    id: '00000000-0000-0000-0000-000000000022',
    title: 'Test Course 2 - Advanced Testing',
    slug: 'test-course-2',
    organizationId: TEST_ORGS.premium.id,
    userId: TEST_USERS.instructor2.id,
    status: 'published',
  },
};

/**
 * Test auth users with passwords for authentication
 *
 * These are created in auth.users table (Supabase Auth) and are required
 * for any tests that use signInWithPassword() or authenticated endpoints.
 *
 * Note: Admin user doesn't need auth since admins use service role key
 */
export const TEST_AUTH_USERS: Record<string, TestAuthUser> = {
  instructor1: {
    id: TEST_USERS.instructor1.id,
    email: TEST_USERS.instructor1.email,
    password: 'test-password-123',
  },
  instructor2: {
    id: TEST_USERS.instructor2.id,
    email: TEST_USERS.instructor2.email,
    password: 'test-password-456',
  },
  student: {
    id: TEST_USERS.student.id,
    email: TEST_USERS.student.email,
    password: 'test-password-789',
  },
};

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Create auth user in Supabase Auth
 *
 * This function creates a user in the auth.users table with a specific ID.
 * It checks if the user already exists and handles ID mismatches.
 *
 * IMPORTANT: This is separate from creating users in the public.users table.
 * The handle_new_user() trigger will automatically create a public.users entry
 * when an auth user is created, BUT we manually create public.users entries
 * first to ensure proper organization_id and role.
 *
 * @param email - User email
 * @param password - User password
 * @param userId - User ID (must match users table)
 * @param role - User role (admin, instructor, student) - for JWT claims
 * @throws Error if auth user creation fails
 */
export async function createAuthUser(email: string, password: string, userId: string, role: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    console.log(`🔍 [createAuthUser] Starting for ${email} at:`, new Date().toISOString());

    // Step 1: Hash the password using PostgreSQL RPC function
    const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
      password: password,
    });

    if (hashError) {
      throw new Error(`Failed to hash password: ${hashError.message}`);
    }

    if (!hashedPassword) {
      throw new Error('hash_password returned NULL - check pgcrypto extension');
    }

    // Step 2: Create auth user with predefined ID and role using RPC function
    const { data: result, error: createError } = await supabase.rpc('create_test_auth_user', {
      p_user_id: userId,
      p_email: email,
      p_encrypted_password: hashedPassword,
      p_role: role,
      p_email_confirmed: true,
    });

    if (createError) {
      throw new Error(`Failed to create auth user via RPC: ${createError.message}`);
    }

    if (!result) {
      throw new Error('create_test_auth_user returned NULL');
    }

    // Check RPC response
    if (result.success === false) {
      throw new Error(`Auth user creation failed: ${result.error || 'Unknown error'}`);
    }

    console.log(`✅ Created auth user: ${email} (ID: ${result.user_id}, Role: ${result.role})`);
    console.log(`   Message: ${result.message}`);

    // CRITICAL: Check public.users IMMEDIATELY after RPC call
    const { data: usersAfterRPC, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId);

    console.log(`🔍 [createAuthUser] public.users for ${email}:`, usersAfterRPC?.length || 0, 'entries');
    if (usersAfterRPC && usersAfterRPC.length > 0) {
      console.log(`🔍 [createAuthUser] public.users data:`, JSON.stringify(usersAfterRPC[0]));
    } else {
      console.error(`❌ [createAuthUser] WARNING: public.users entry NOT found for ${email} (ID: ${userId})`);
    }
  } catch (error) {
    // Enhanced error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Auth user creation failed for ${email}:`, errorMessage);
    throw new Error(`Failed to create auth user for ${email}: ${errorMessage}`);
  }
}

/**
 * Initialize all test fixtures
 *
 * Creates organizations, auth users, users, and courses in the database.
 * Uses upsert with onConflict for idempotency (safe to call multiple times).
 *
 * IMPORTANT ORDER:
 * 1. Organizations (no dependencies)
 * 2. Auth users (if needed) - trigger creates basic public.users entries
 * 3. Update public.users with correct organization_id and role
 * 4. Create remaining users (admin, who doesn't need auth)
 * 5. Courses (depends on users)
 *
 * Call this in beforeAll hooks.
 *
 * @param options - Setup options
 * @param options.skipAuthUsers - Skip creating auth users (default: false)
 * @param options.customFixtures - Custom fixtures to use (optional, defaults to global TEST_USERS/TEST_ORGS)
 * @throws Error if database operations fail
 */
export async function setupTestFixtures(options: {
  skipAuthUsers?: boolean;
  customFixtures?: ReturnType<typeof getTestFixtures>;
} = {}): Promise<void> {
  const supabase = getSupabaseAdmin();

  console.log('🔍 [FIXTURE SETUP] Starting at:', new Date().toISOString());
  console.log('🔍 [FIXTURE SETUP] Options:', JSON.stringify(options));

  // Use custom fixtures if provided, otherwise use global constants
  const fixtureOrgs = options.customFixtures?.TEST_ORGS || TEST_ORGS;
  const fixtureUsers = options.customFixtures?.TEST_USERS || TEST_USERS;

  // Build auth users from fixture users (for custom fixtures)
  const fixtureAuthUsers = options.customFixtures
    ? {
        instructor1: {
          id: fixtureUsers.instructor1.id,
          email: fixtureUsers.instructor1.email,
          password: fixtureUsers.instructor1.password || 'TestPassword123!',
        },
        instructor2: {
          id: fixtureUsers.instructor2.id,
          email: fixtureUsers.instructor2.email,
          password: fixtureUsers.instructor2.password || 'TestPassword123!',
        },
        student: {
          id: fixtureUsers.student.id,
          email: fixtureUsers.student.email,
          password: fixtureUsers.student.password || 'TestPassword123!',
        },
      }
    : TEST_AUTH_USERS;

  // 1. Create organizations (no dependencies)
  // Note: Premium org already exists from seed data, but upsert is idempotent
  for (const org of Object.values(fixtureOrgs)) {
    // Calculate storage_quota_bytes based on tier (from schema check constraints)
    let storageQuota: number;
    switch (org.tier) {
      case 'free':
        storageQuota = 10485760; // 10MB
        break;
      case 'basic_plus':
        storageQuota = 104857600; // 100MB
        break;
      case 'standard':
        storageQuota = 1073741824; // 1GB
        break;
      case 'premium':
        storageQuota = 10737418240; // 10GB
        break;
      case 'enterprise':
        storageQuota = 107374182400; // 100GB
        break;
      default:
        storageQuota = 10485760; // Default to free tier
    }

    const { error } = await supabase.from('organizations').upsert(
      {
        id: org.id,
        name: org.name,
        tier: org.tier,
        storage_quota_bytes: storageQuota,
        storage_used_bytes: 0,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(`Failed to create organization ${org.name}: ${error.message}`);
    }
  }

  // 2. Create auth users FIRST (if needed)
  // The handle_new_user() trigger will automatically create public.users entries
  // with Default Organization. We'll update them in the next step.
  if (!options.skipAuthUsers) {
    console.log('🔍 [FIXTURE SETUP] Creating auth users...');
    for (const authUser of Object.values(fixtureAuthUsers)) {
      // Find corresponding user to get role
      const testUser = Object.values(fixtureUsers).find(u => u.id === authUser.id);
      if (!testUser) {
        throw new Error(`No corresponding TEST_USER found for auth user: ${authUser.email}`);
      }
      await createAuthUser(authUser.email, authUser.password, authUser.id, testUser.role);
    }

    console.log('🔍 [FIXTURE SETUP] Auth users created, verifying public.users entries...');

    // CRITICAL: Verify public.users entries exist BEFORE updating
    const { data: usersBeforeUpdate, error: checkError } = await supabase
      .from('users')
      .select('*')
      .in('email', Object.values(fixtureAuthUsers).map(u => u.email));

    console.log('🔍 [FIXTURE SETUP] public.users count BEFORE update:', usersBeforeUpdate?.length || 0);
    console.log('🔍 [FIXTURE SETUP] public.users data:', JSON.stringify(usersBeforeUpdate));

    // 3. Update public.users entries created by trigger with correct org and role
    for (const user of Object.values(fixtureUsers)) {
      // Skip admin user (no auth account)
      if (user.role === 'admin') continue;

      const { error } = await supabase
        .from('users')
        .upsert(
          {
            id: user.id,
            email: user.email,
            organization_id: user.organizationId,
            role: user.role,
          },
          { onConflict: 'id' }
        );

      if (error) {
        throw new Error(`Failed to update user ${user.email}: ${error.message}`);
      }
    }
  }

  // 4. Create users WITHOUT auth accounts (e.g., admin)
  const usersWithoutAuth = Object.values(fixtureUsers).filter(u => u.role === 'admin');
  for (const user of usersWithoutAuth) {
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

  // If skipAuthUsers is true, create ALL users manually
  // This ensures public.users entries exist when auth users are created externally
  if (options.skipAuthUsers) {
    for (const user of Object.values(fixtureUsers)) {
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
  }

  // 5. Create courses (depends on organizations and users)
  const fixtureCourses = options.customFixtures?.TEST_COURSES || TEST_COURSES;
  for (const course of Object.values(fixtureCourses)) {
    const { error } = await supabase.from('courses').upsert(
      {
        id: course.id,
        title: course.title,
        slug: course.slug,
        user_id: course.userId,
        organization_id: course.organizationId,
        status: course.status,
        settings: {}, // Default empty settings
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(`Failed to create course ${course.title}: ${error.message}`);
    }
  }

  // FINAL VERIFICATION: Check public.users at the END of setup
  const { data: finalUsers } = await supabase
    .from('users')
    .select('*')
    .in('email', Object.values(fixtureAuthUsers).map(u => u.email));

  console.log('🔍 [FIXTURE SETUP] FINAL public.users count:', finalUsers?.length || 0);
  console.log('🔍 [FIXTURE SETUP] FINAL public.users data:', JSON.stringify(finalUsers));

  // Add small delay to ensure all database operations complete and propagate
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('🔍 [FIXTURE SETUP] Completed at:', new Date().toISOString());
}

/**
 * Clean up all test fixtures
 *
 * Deletes test organizations, users, and courses from the database.
 * Deletion happens in reverse order of creation to respect foreign keys.
 *
 * Call this in afterAll hooks.
 *
 * @throws Error if database operations fail
 */
export async function cleanupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete in reverse order (respect foreign keys):
  // job_status → courses → users → organizations

  // 1. Delete courses (depends on users and organizations)
  const courseIds = Object.values(TEST_COURSES).map(c => c.id);
  const { error: coursesError } = await supabase.from('courses').delete().in('id', courseIds);

  if (coursesError) {
    console.error('Failed to cleanup courses:', coursesError.message);
  }

  // 2. Delete users (depends on organizations)
  const userIds = Object.values(TEST_USERS).map(u => u.id);
  const { error: usersError } = await supabase.from('users').delete().in('id', userIds);

  if (usersError) {
    console.error('Failed to cleanup users:', usersError.message);
  }

  // 3. Delete organizations (no dependencies)
  // Note: Keep Premium org since it's used by seed data
  const orgIds = Object.values(TEST_ORGS)
    .filter(o => o.id !== TEST_ORGS.premium.id) // Don't delete Premium org
    .map(o => o.id);

  if (orgIds.length > 0) {
    const { error: orgsError } = await supabase.from('organizations').delete().in('id', orgIds);

    if (orgsError) {
      console.error('Failed to cleanup organizations:', orgsError.message);
    }
  }
}

/**
 * Clean up test jobs only (keep fixtures)
 *
 * Deletes job_status records for test job types AND cleans BullMQ queue in Redis.
 * This is faster than cleanupTestFixtures() and useful for afterEach hooks.
 *
 * Call this in afterEach hooks.
 *
 * @param obliterate - If true, force removes ALL jobs (use in beforeAll). If false (default), only clean completed/failed (use in afterEach)
 * @throws Error if database operations fail
 */
export async function cleanupTestJobs(obliterate = false): Promise<void> {
  const supabase = getSupabaseAdmin();

  // 1. Delete ALL job_status records (not just test jobs) to ensure clean state
  // This is safe because we're in test environment
  const { error } = await supabase
    .from('job_status')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition always true)

  if (error) {
    console.error('Failed to cleanup job_status from database:', error.message);
  }

  // 2. Clean BullMQ queue in Redis to remove pending/completed jobs
  // This prevents old test jobs from being processed by subsequent tests
  try {
    // Import getQueue function which reuses the existing queue singleton
    const { getQueue } = await import('../../src/orchestrator/queue');
    const queue = getQueue();

    if (obliterate) {
      // Obliterate removes ALL jobs including active ones (use in beforeAll/afterAll)
      await queue.obliterate({ force: true });
    } else {
      // Comprehensive cleanup for afterEach (remove all job states)
      await queue.drain(true); // Remove waiting/delayed jobs
      await queue.clean(0, 1000, 'completed'); // Remove completed jobs
      await queue.clean(0, 1000, 'failed'); // Remove failed jobs
      await queue.clean(0, 1000, 'active'); // Remove active/stalled jobs (CRITICAL!)
      await queue.clean(0, 1000, 'paused'); // Remove paused jobs
      await queue.clean(0, 1000, 'wait'); // Remove any remaining waiting jobs
    }
  } catch (queueError) {
    console.error('Failed to cleanup BullMQ queue:', queueError);
  }
}

// ============================================================================
// Authentication Context Helpers (for RLS Testing)
// ============================================================================

/**
 * Sets authentication context for the current database transaction
 *
 * This enables auth.uid() to work in RLS policies during tests by setting
 * the PostgreSQL session JWT context.
 *
 * IMPORTANT: Call this AFTER creating an authenticated client and BEFORE
 * executing any RLS-protected queries.
 *
 * @param client - Authenticated Supabase client
 * @param userId - User UUID (from auth.users.id or users.id)
 * @param role - User role (admin, instructor, student, or 'authenticated')
 * @param email - User email (optional)
 * @param organizationId - Organization UUID (optional, required for org isolation tests)
 * @throws Error if setting auth context fails
 *
 * @example
 * ```typescript
 * const userClient = await getAuthenticatedClient(user);
 * await setAuthContext(userClient, user.authId, 'admin', user.email, user.organizationId);
 * const { data, error } = await userClient.from('courses').select();
 * ```
 */
export async function setAuthContext(
  client: SupabaseClient,
  userId: string,
  role: 'admin' | 'instructor' | 'student' | 'authenticated' = 'authenticated',
  email?: string,
  organizationId?: string
): Promise<void> {
  // Use simplified test_set_jwt function
  const { error } = await client.rpc('test_set_jwt', {
    user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to set auth context: ${error.message}`);
  }
}

/**
 * Verify auth context is set correctly (for debugging)
 *
 * This function retrieves the current authentication context from PostgreSQL
 * session configuration. Useful for debugging RLS policy issues.
 *
 * @param client - Supabase client
 * @returns Auth context object with current_role, jwt_claims, and auth_uid
 *
 * @example
 * ```typescript
 * const context = await getAuthContext(client);
 * console.log('Auth context:', context);
 * // { current_role: 'authenticated', jwt_claims: {...}, auth_uid: '...' }
 * ```
 */
export async function getAuthContext(client: SupabaseClient): Promise<unknown> {
  const { data, error } = await client.rpc('get_current_auth_context');

  if (error) {
    console.error('Failed to get auth context:', error);
    return null;
  }

  return data;
}

// ============================================================================
// Stage 6 Test Helpers
// ============================================================================

/**
 * Default Stage 6 lesson specification for testing
 *
 * Provides a valid LessonSpecificationV2 structure that passes Zod validation.
 * Use mockStage6JobInput() to get a complete job input with this spec.
 */
const DEFAULT_LESSON_SPEC_V2: LessonSpecificationV2 = {
  lesson_id: '1.1',
  title: 'Introduction to TypeScript',
  description: 'Learn the fundamentals of TypeScript type system and how to apply static typing to your JavaScript code.',
  metadata: {
    target_audience: 'practitioner',
    tone: 'conversational-professional',
    compliance_level: 'standard',
    content_archetype: 'code_tutorial',
  },
  learning_objectives: [
    {
      id: 'LO-1.1.1',
      objective: 'Explain the benefits of static typing in TypeScript over vanilla JavaScript',
      bloom_level: 'understand',
    },
    {
      id: 'LO-1.1.2',
      objective: 'Apply basic type annotations to variables, functions, and objects',
      bloom_level: 'apply',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'question',
    hook_topic: 'runtime errors from undefined values',
    key_learning_objectives: 'Type safety, type inference, basic type annotations',
  },
  sections: [
    {
      title: 'What is TypeScript?',
      content_archetype: 'concept_explainer',
      rag_context_id: 'doc-typescript-intro',
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['superset', 'JavaScript', 'compilation'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'TypeScript is a superset of JavaScript',
        'TypeScript compiles to plain JavaScript',
        'Static type checking catches errors at compile time',
      ],
      analogies_to_use: 'TypeScript is like a spell-checker for code',
    },
    {
      title: 'Basic Type Annotations',
      content_archetype: 'code_tutorial',
      rag_context_id: 'doc-typescript-basics',
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['string', 'number', 'boolean', 'array'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Primitive types: string, number, boolean',
        'Array types with generics',
        'Type inference reduces verbosity',
      ],
    },
  ],
  exercises: [
    {
      type: 'coding',
      difficulty: 'easy',
      learning_objective_id: 'LO-1.1.2',
      structure_template: 'Given a JavaScript function [scenario], add TypeScript type annotations [requirement] that [acceptance criteria]',
      rubric_criteria: [
        { criteria: ['Correct parameter types', 'Correct return type'], weight: 60 },
        { criteria: ['Code compiles without errors'], weight: 40 },
      ],
    },
  ],
  rag_context: {
    primary_documents: ['doc-typescript-intro', 'doc-typescript-basics'],
    search_queries: ['TypeScript basics', 'type annotations', 'static typing'],
    expected_chunks: 8,
  },
  estimated_duration_minutes: 15,
  difficulty_level: 'beginner',
};

/**
 * Default RAG chunks for testing Stage 6
 *
 * Provides sample chunks that match the DEFAULT_LESSON_SPEC_V2 context requirements.
 */
const DEFAULT_RAG_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-ts-001',
    document_id: '00000000-0000-0000-0000-000000000100',
    document_name: 'typescript-handbook.pdf',
    content: 'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
    page_or_section: 'Chapter 1, Page 1',
    relevance_score: 0.95,
    metadata: { source: 'handbook', topic: 'introduction' },
  },
  {
    chunk_id: 'chunk-ts-002',
    document_id: '00000000-0000-0000-0000-000000000100',
    document_name: 'typescript-handbook.pdf',
    content: 'TypeScript adds optional static typing and class-based object-oriented programming to the language.',
    page_or_section: 'Chapter 1, Page 2',
    relevance_score: 0.92,
    metadata: { source: 'handbook', topic: 'features' },
  },
  {
    chunk_id: 'chunk-ts-003',
    document_id: '00000000-0000-0000-0000-000000000101',
    document_name: 'typescript-basics.md',
    content: 'The basic types in TypeScript include boolean, number, string, array, tuple, enum, any, void, null, and undefined.',
    page_or_section: 'Basic Types',
    relevance_score: 0.88,
    metadata: { source: 'tutorial', topic: 'types' },
  },
  {
    chunk_id: 'chunk-ts-004',
    document_id: '00000000-0000-0000-0000-000000000101',
    document_name: 'typescript-basics.md',
    content: 'Type inference allows TypeScript to automatically determine types based on values, reducing the need for explicit annotations.',
    page_or_section: 'Type Inference',
    relevance_score: 0.85,
    metadata: { source: 'tutorial', topic: 'inference' },
  },
];

/**
 * Create a mock Stage6JobInput for BullMQ testing
 *
 * Generates a valid Stage6JobInput with sensible defaults that can be
 * overridden for specific test scenarios.
 *
 * @param overrides - Partial overrides for the default job input
 * @returns Complete Stage6JobInput ready for queue submission
 *
 * @example
 * ```typescript
 * // Default input
 * const jobInput = mockStage6JobInput();
 *
 * // Custom lesson title
 * const customInput = mockStage6JobInput({
 *   lessonSpec: { ...mockStage6JobInput().lessonSpec, title: 'Custom Title' }
 * });
 *
 * // Custom course ID
 * const courseInput = mockStage6JobInput({ courseId: 'my-course-id' });
 * ```
 */
export function mockStage6JobInput(overrides?: Partial<Stage6JobInput>): Stage6JobInput {
  return {
    lessonSpec: overrides?.lessonSpec ?? { ...DEFAULT_LESSON_SPEC_V2 },
    courseId: overrides?.courseId ?? TEST_COURSES.course1.id,
    ragChunks: overrides?.ragChunks ?? [...DEFAULT_RAG_CHUNKS],
    ragContextId: overrides?.ragContextId ?? null,
    modelOverride: overrides?.modelOverride,
  };
}

/**
 * Create a test course with lesson specs ready for Stage 6
 *
 * Sets up a complete test course in the database with:
 * - Course record in courses table
 * - Sections with proper ordering
 * - Lesson records linked to sections
 * - Lesson specification data stored in lessons.metadata
 *
 * This provides the full database structure needed for Stage 6 integration tests.
 *
 * @param options - Configuration options
 * @param options.lessonCount - Number of lessons to create (default: 5)
 * @param options.courseId - Course ID to use (default: generate new UUID)
 * @param options.userId - User ID for course ownership (default: TEST_USERS.instructor1.id)
 * @returns Course ID and array of lesson specifications
 *
 * @example
 * ```typescript
 * const { courseId, lessonSpecs } = await setupStage6TestCourse({
 *   lessonCount: 3,
 *   userId: TEST_USERS.instructor2.id,
 * });
 *
 * // Use in test
 * for (const spec of lessonSpecs) {
 *   const jobInput = mockStage6JobInput({
 *     courseId,
 *     lessonSpec: spec,
 *   });
 *   await queue.add(spec.lesson_id, jobInput);
 * }
 * ```
 */
export async function setupStage6TestCourse(options?: {
  lessonCount?: number;
  courseId?: string;
  userId?: string;
}): Promise<{
  courseId: string;
  lessonSpecs: LessonSpecificationV2[];
}> {
  const supabase = getSupabaseAdmin();

  const lessonCount = options?.lessonCount ?? 5;
  const courseId = options?.courseId ?? crypto.randomUUID();
  const userId = options?.userId ?? TEST_USERS.instructor1.id;
  const organizationId = TEST_ORGS.premium.id;

  // 1. Create course
  const { error: courseError } = await supabase.from('courses').upsert(
    {
      id: courseId,
      title: `Stage 6 Test Course - ${courseId.slice(0, 8)}`,
      slug: `stage6-test-${courseId.slice(0, 8)}`,
      user_id: userId,
      organization_id: organizationId,
      status: 'draft',
      settings: {},
      generation_status: 'stage_5_complete',
    },
    { onConflict: 'id' }
  );

  if (courseError) {
    throw new Error(`Failed to create course: ${courseError.message}`);
  }

  // 2. Create section for lessons
  const sectionId = crypto.randomUUID();
  const { error: sectionError } = await supabase.from('sections').upsert(
    {
      id: sectionId,
      course_id: courseId,
      title: 'Stage 6 Test Section',
      description: 'Section for Stage 6 integration tests',
      order_index: 1,
      metadata: {},
    },
    { onConflict: 'id' }
  );

  if (sectionError) {
    throw new Error(`Failed to create section: ${sectionError.message}`);
  }

  // 3. Generate lesson specifications and create lessons
  const lessonSpecs: LessonSpecificationV2[] = [];

  for (let i = 1; i <= lessonCount; i++) {
    const lessonId = crypto.randomUUID();
    const lessonNumber = `1.${i}`;

    // Create lesson specification based on template
    const lessonSpec: LessonSpecificationV2 = {
      ...DEFAULT_LESSON_SPEC_V2,
      lesson_id: lessonNumber,
      title: `Test Lesson ${lessonNumber}: ${DEFAULT_LESSON_SPEC_V2.title}`,
      description: `Lesson ${i} of ${lessonCount} for Stage 6 testing. ${DEFAULT_LESSON_SPEC_V2.description}`,
      estimated_duration_minutes: 10 + (i % 3) * 5, // Varies between 10-20 minutes
      difficulty_level: i <= 2 ? 'beginner' : i <= 4 ? 'intermediate' : 'advanced',
    };

    // Insert lesson record
    const { error: lessonError } = await supabase.from('lessons').insert({
      id: lessonId,
      section_id: sectionId,
      title: lessonSpec.title,
      order_index: i,
      duration_minutes: lessonSpec.estimated_duration_minutes,
      lesson_type: 'text',
      status: 'draft',
      metadata: { lesson_spec_v2: lessonSpec },
      objectives: lessonSpec.learning_objectives.map(lo => lo.objective),
    });

    if (lessonError) {
      throw new Error(`Failed to create lesson ${lessonNumber}: ${lessonError.message}`);
    }

    // Insert lesson_contents record (pending status)
    const { error: contentError } = await supabase.from('lesson_contents').insert({
      lesson_id: lessonId,
      course_id: courseId,
      content: {},
      metadata: {},
      status: 'pending',
    });

    if (contentError) {
      throw new Error(`Failed to create lesson_contents for ${lessonNumber}: ${contentError.message}`);
    }

    lessonSpecs.push(lessonSpec);
  }

  return { courseId, lessonSpecs };
}

/**
 * Clean up Stage 6 test data
 *
 * Removes all Stage 6 related data for a specific course:
 * - lesson_contents records
 * - rag_context_cache records
 * - lessons records
 * - sections records
 * - Optionally the course record itself
 *
 * Call this in afterEach or afterAll hooks to ensure clean test state.
 *
 * @param courseId - Course ID to clean up
 * @param options - Cleanup options
 * @param options.deleteCourse - Also delete the course record (default: false)
 *
 * @example
 * ```typescript
 * afterEach(async () => {
 *   await cleanupStage6TestData(testCourseId);
 * });
 *
 * afterAll(async () => {
 *   await cleanupStage6TestData(testCourseId, { deleteCourse: true });
 * });
 * ```
 */
export async function cleanupStage6TestData(
  courseId: string,
  options?: { deleteCourse?: boolean }
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete in reverse dependency order:
  // 1. lesson_contents (depends on lessons and courses)
  const { error: contentsError } = await supabase
    .from('lesson_contents')
    .delete()
    .eq('course_id', courseId);

  if (contentsError) {
    console.warn(`Failed to cleanup lesson_contents for course ${courseId}:`, contentsError.message);
  }

  // 2. rag_context_cache (depends on lessons and courses)
  const { error: ragError } = await supabase
    .from('rag_context_cache')
    .delete()
    .eq('course_id', courseId);

  if (ragError) {
    console.warn(`Failed to cleanup rag_context_cache for course ${courseId}:`, ragError.message);
  }

  // 3. Get section IDs for this course before deleting lessons
  const { data: sections } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', courseId);

  const sectionIds = sections?.map(s => s.id) ?? [];

  // 4. lessons (depends on sections)
  if (sectionIds.length > 0) {
    const { error: lessonsError } = await supabase
      .from('lessons')
      .delete()
      .in('section_id', sectionIds);

    if (lessonsError) {
      console.warn(`Failed to cleanup lessons for course ${courseId}:`, lessonsError.message);
    }
  }

  // 5. sections (depends on courses)
  const { error: sectionsError } = await supabase
    .from('sections')
    .delete()
    .eq('course_id', courseId);

  if (sectionsError) {
    console.warn(`Failed to cleanup sections for course ${courseId}:`, sectionsError.message);
  }

  // 6. Optionally delete the course itself
  if (options?.deleteCourse) {
    const { error: courseError } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId);

    if (courseError) {
      console.warn(`Failed to delete course ${courseId}:`, courseError.message);
    }
  }
}

/**
 * Wait for Stage 6 job completion with timeout
 *
 * Polls the lesson_contents table for the specified course until all lessons
 * reach a terminal state (completed, failed, or review_required) or timeout.
 *
 * Useful for integration tests that need to wait for async job processing.
 *
 * @param courseId - Course ID to monitor
 * @param options - Polling options
 * @param options.timeout - Maximum wait time in milliseconds (default: 120000ms = 2 minutes)
 * @param options.pollInterval - Time between polls in milliseconds (default: 2000ms)
 * @returns Summary of lesson statuses
 *
 * @example
 * ```typescript
 * // Submit jobs
 * for (const spec of lessonSpecs) {
 *   await queue.add(spec.lesson_id, jobInput);
 * }
 *
 * // Wait for completion
 * const result = await waitForStage6Completion(courseId, { timeout: 180000 });
 *
 * expect(result.failed).toBe(0);
 * expect(result.completed).toBe(lessonSpecs.length);
 * ```
 */
export async function waitForStage6Completion(
  courseId: string,
  options?: {
    timeout?: number;
    pollInterval?: number;
  }
): Promise<{
  completed: number;
  failed: number;
  pending: number;
  reviewRequired: number;
}> {
  const supabase = getSupabaseAdmin();

  const timeout = options?.timeout ?? 120_000;
  const pollInterval = options?.pollInterval ?? 2_000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const { data: contents, error } = await supabase
      .from('lesson_contents')
      .select('status')
      .eq('course_id', courseId);

    if (error) {
      throw new Error(`Failed to query lesson_contents: ${error.message}`);
    }

    const statuses = contents ?? [];
    const completed = statuses.filter(c => c.status === 'completed').length;
    const failed = statuses.filter(c => c.status === 'failed').length;
    const reviewRequired = statuses.filter(c => c.status === 'review_required').length;
    const pending = statuses.filter(c => c.status === 'pending' || c.status === 'generating').length;

    // All lessons reached terminal state
    if (pending === 0 && statuses.length > 0) {
      return { completed, failed, pending, reviewRequired };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Timeout - return current state
  const { data: finalContents } = await supabase
    .from('lesson_contents')
    .select('status')
    .eq('course_id', courseId);

  const statuses = finalContents ?? [];
  return {
    completed: statuses.filter(c => c.status === 'completed').length,
    failed: statuses.filter(c => c.status === 'failed').length,
    pending: statuses.filter(c => c.status === 'pending' || c.status === 'generating').length,
    reviewRequired: statuses.filter(c => c.status === 'review_required').length,
  };
}

/**
 * Get Stage 6 test metrics for a course
 *
 * Aggregates metrics from all lesson_contents records for a course:
 * - Completion counts
 * - Quality scores
 * - Token usage and costs
 * - Processing durations
 *
 * Useful for performance testing and cost analysis.
 *
 * @param courseId - Course ID to get metrics for
 * @returns Aggregated metrics for the course
 *
 * @example
 * ```typescript
 * const metrics = await getStage6TestMetrics(courseId);
 *
 * console.log(`Completed: ${metrics.completedLessons}/${metrics.totalLessons}`);
 * console.log(`Avg Quality: ${metrics.averageQualityScore.toFixed(2)}`);
 * console.log(`Total Cost: $${metrics.totalCostUsd.toFixed(4)}`);
 * ```
 */
export async function getStage6TestMetrics(courseId: string): Promise<{
  totalLessons: number;
  completedLessons: number;
  averageQualityScore: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  averageDurationMs: number;
}> {
  const supabase = getSupabaseAdmin();

  const { data: contents, error } = await supabase
    .from('lesson_contents')
    .select('status, metadata')
    .eq('course_id', courseId);

  if (error) {
    throw new Error(`Failed to query lesson_contents: ${error.message}`);
  }

  const lessons = contents ?? [];
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter(l => l.status === 'completed').length;

  // Extract metrics from metadata
  let totalQualityScore = 0;
  let totalTokensUsed = 0;
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let metricsCount = 0;

  for (const lesson of lessons) {
    const metadata = lesson.metadata as {
      quality_score?: number;
      total_tokens?: number;
      cost_usd?: number;
      generation_duration_ms?: number;
    } | null;

    if (metadata) {
      if (typeof metadata.quality_score === 'number') {
        totalQualityScore += metadata.quality_score;
        metricsCount++;
      }
      if (typeof metadata.total_tokens === 'number') {
        totalTokensUsed += metadata.total_tokens;
      }
      if (typeof metadata.cost_usd === 'number') {
        totalCostUsd += metadata.cost_usd;
      }
      if (typeof metadata.generation_duration_ms === 'number') {
        totalDurationMs += metadata.generation_duration_ms;
      }
    }
  }

  return {
    totalLessons,
    completedLessons,
    averageQualityScore: metricsCount > 0 ? totalQualityScore / metricsCount : 0,
    totalTokensUsed,
    totalCostUsd,
    averageDurationMs: completedLessons > 0 ? totalDurationMs / completedLessons : 0,
  };
}
