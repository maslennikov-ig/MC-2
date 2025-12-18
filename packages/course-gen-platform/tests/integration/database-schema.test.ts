import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Helper to generate unique names for test isolation
const uniqueName = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

// Storage quota mappings for tier types
const tierQuotaMap = {
  free: 10485760, // 10 MB
  basic_plus: 104857600, // 100 MB
  standard: 1073741824, // 1 GB
  premium: 10737418240, // 10 GB
} as const;

// Helper: Create test organization with correct quota
async function createTestOrg(tier: 'free' | 'basic_plus' | 'standard' | 'premium' = 'free') {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      id: randomUUID(),
      name: uniqueName('test_org'),
      tier,
      storage_quota_bytes: tierQuotaMap[tier],
      storage_used_bytes: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create org: ${error.message}`);
  return data!;
}

// Helper: Create test user
async function createTestUser(
  orgId: string,
  role: 'admin' | 'instructor' | 'student' = 'instructor'
) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: randomUUID(),
      email: uniqueName('user') + '@test.com',
      role,
      organization_id: orgId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data!;
}

// Helper: Create test course
async function createTestCourse(orgId: string, userId: string) {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      id: randomUUID(),
      title: uniqueName('course'),
      slug: uniqueName('course-slug'),
      organization_id: orgId,
      user_id: userId,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create course: ${error.message}`);
  return data!;
}

describe('Database Schema Acceptance Tests', () => {
  // Track created entities for cleanup
  let createdOrgs: string[] = [];
  let createdUsers: string[] = [];
  let createdCourses: string[] = [];

  // Cleanup helper
  const cleanupTestData = async () => {
    // Clean in reverse order of dependencies
    if (createdCourses.length > 0) {
      await supabase.from('courses').delete().in('id', createdCourses);
    }
    if (createdUsers.length > 0) {
      await supabase.from('users').delete().in('id', createdUsers);
    }
    if (createdOrgs.length > 0) {
      await supabase.from('organizations').delete().in('id', createdOrgs);
    }

    // Reset tracking arrays
    createdOrgs = [];
    createdUsers = [];
    createdCourses = [];
  };

  // Clean before and after all tests
  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // Clean after each test for isolation
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Test 1: Organizations table enforces tier enum values', () => {
    it('should accept valid tier values (free, basic_plus, standard, premium)', async () => {
      // Given: Valid tier values with their corresponding storage quotas
      const validTiers = [
        { tier: 'free' as const, quota: 10485760 },
        { tier: 'basic_plus' as const, quota: 104857600 },
        { tier: 'standard' as const, quota: 1073741824 },
        { tier: 'premium' as const, quota: 10737418240 },
      ];

      // When: Inserting organizations with each valid tier
      for (const { tier, quota } of validTiers) {
        const { data, error } = await supabase
          .from('organizations')
          .insert({
            id: randomUUID(),
            name: uniqueName(`org_${tier}`),
            tier,
            storage_quota_bytes: quota,
            storage_used_bytes: 0,
          })
          .select()
          .single();

        // Then: Insert should succeed
        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data?.tier).toBe(tier);

        if (data?.id) createdOrgs.push(data.id);
      }
    });

    it('should reject invalid tier values', async () => {
      // Given: An invalid tier value
      const invalidTier = 'invalid_tier';

      // When: Attempting to insert an organization with invalid tier
      const { error } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_invalid'),
          tier: invalidTier,
        })
        .select()
        .single();

      // Then: Insert should fail with enum constraint violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('invalid input value for enum tier');
    });
  });

  describe('Test 2: Organizations table enforces storage quota constraints', () => {
    const tierQuotas = [
      { tier: 'free', quota: 10485760 }, // 10 MB
      { tier: 'basic_plus', quota: 104857600 }, // 100 MB
      { tier: 'standard', quota: 1073741824 }, // 1 GB
      { tier: 'premium', quota: 10737418240 }, // 10 GB
    ] as const;

    tierQuotas.forEach(({ tier, quota }) => {
      it(`should set correct storage quota for ${tier} tier (${quota} bytes)`, async () => {
        // Given: A specific tier
        // When: Creating an organization with that tier
        const { data, error } = await supabase
          .from('organizations')
          .insert({
            id: randomUUID(),
            name: uniqueName(`org_quota_${tier}`),
            tier,
            storage_quota_bytes: quota,
            storage_used_bytes: 0,
          })
          .select()
          .single();

        // Then: Storage quota should match expected value
        expect(error).toBeNull();
        expect(data?.storage_quota_bytes).toBe(quota);

        if (data?.id) createdOrgs.push(data.id);
      });
    });

    it('should enforce storage_used_bytes <= storage_quota_bytes check constraint', async () => {
      // Given: An organization with free tier (10MB quota)
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_storage_check'),
          tier: 'free',
          storage_quota_bytes: tierQuotaMap['free'],
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      // When: Attempting to set storage_used_bytes > storage_quota_bytes
      const { error } = await supabase
        .from('organizations')
        .update({
          storage_used_bytes: 20971520, // 20MB > 10MB quota
        })
        .eq('id', org?.id);

      // Then: Update should fail with check constraint violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('violates check constraint');
    });

    it('should allow storage_used_bytes when <= storage_quota_bytes', async () => {
      // Given: An organization with free tier (10MB quota)
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_storage_valid'),
          tier: 'free',
          storage_quota_bytes: tierQuotaMap['free'],
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      // When: Setting storage_used_bytes within quota
      const { data, error } = await supabase
        .from('organizations')
        .update({
          storage_used_bytes: 5242880, // 5MB < 10MB quota
        })
        .eq('id', org?.id)
        .select()
        .single();

      // Then: Update should succeed
      expect(error).toBeNull();
      expect(data?.storage_used_bytes).toBe(5242880);
    });
  });

  describe('Test 3: Users table enforces role enum values', () => {
    it('should accept valid role values (admin, instructor, student)', async () => {
      // Given: An organization and valid role values
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const validRoles = ['admin', 'instructor', 'student'] as const;

      // When: Creating users with each valid role
      for (const role of validRoles) {
        const { data, error } = await supabase
          .from('users')
          .insert({
            id: randomUUID(),
            email: `${role}_${randomUUID()}@test.com`,
            organization_id: org.id,
            role,
          })
          .select()
          .single();

        // Then: Insert should succeed
        expect(error).toBeNull();
        expect(data?.role).toBe(role);

        if (data?.id) createdUsers.push(data.id);
      }
    });

    it('should reject invalid role values', async () => {
      // Given: An organization and invalid role
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      // When: Attempting to create user with invalid role
      const { error } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `invalid_${randomUUID()}@test.com`,
          organization_id: org.id,
          role: 'invalid_role',
        })
        .select()
        .single();

      // Then: Insert should fail with enum constraint violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('invalid input value for enum role');
    });
  });

  describe('Test 4: Foreign key constraints work correctly', () => {
    it('should cascade delete from organization to users and courses', async () => {
      // Given: An organization with users and courses
      const org = await createTestOrg();
      const user = await createTestUser(org.id, 'instructor');
      const course = await createTestCourse(org.id, user.id);

      // When: Deleting the organization
      await supabase.from('organizations').delete().eq('id', org.id);

      // Then: Related users and courses should be deleted
      const { data: deletedUser } = await supabase
        .from('users')
        .select()
        .eq('id', user.id)
        .single();

      const { data: deletedCourse } = await supabase
        .from('courses')
        .select()
        .eq('id', course.id)
        .single();

      expect(deletedUser).toBeNull();
      expect(deletedCourse).toBeNull();
    });

    it('should cascade delete from course to sections and lessons', async () => {
      // Given: A course with sections and lessons
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id, 'instructor');
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const { data: section } = await supabase
        .from('sections')
        .insert({
          course_id: course.id,
          title: 'Test Section',
          order_index: 1,
        })
        .select()
        .single();

      const { data: lesson } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Test Lesson',
          order_index: 1,
          lesson_type: 'text',
        })
        .select()
        .single();

      // When: Deleting the course
      await supabase.from('courses').delete().eq('id', course.id);

      // Then: Related sections and lessons should be deleted
      const { data: deletedSection } = await supabase
        .from('sections')
        .select()
        .eq('id', section?.id)
        .single();

      const { data: deletedLesson } = await supabase
        .from('lessons')
        .select()
        .eq('id', lesson?.id)
        .single();

      expect(deletedSection).toBeNull();
      expect(deletedLesson).toBeNull();
    });

    it('should prevent creating user with non-existent organization_id', async () => {
      // Given: A non-existent organization ID
      const fakeOrgId = randomUUID();

      // When: Attempting to create user with non-existent organization
      const { error } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `orphan_${randomUUID()}@test.com`,
          organization_id: fakeOrgId,
          role: 'student',
        })
        .select()
        .single();

      // Then: Insert should fail with foreign key violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('violates foreign key constraint');
    });
  });

  describe('Test 5: Unique constraints prevent duplicates', () => {
    it('should enforce unique organization names', async () => {
      // Given: An existing organization
      const orgName = uniqueName('unique_org');
      const { data: org1 } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: orgName,
        })
        .select()
        .single();

      if (org1?.id) createdOrgs.push(org1.id);

      // When: Attempting to create another organization with same name
      const { error } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: orgName,
        })
        .select()
        .single();

      // Then: Insert should fail with unique violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('duplicate key value violates unique constraint');
    });

    it('should enforce unique user emails', async () => {
      // Given: An existing user
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_unique_email'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const email = `unique_${randomUUID()}@test.com`;
      const { data: user1 } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email,
          organization_id: org?.id,
          role: 'student',
        })
        .select()
        .single();

      if (user1?.id) createdUsers.push(user1.id);

      // When: Attempting to create another user with same email
      const { error } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email,
          organization_id: org?.id,
          role: 'admin',
        })
        .select()
        .single();

      // Then: Insert should fail with unique violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('duplicate key value violates unique constraint');
    });

    it('should enforce unique course slugs per organization', async () => {
      // Given: An organization with a course
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_unique_slug'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      const slug = uniqueName('unique-slug');
      const { data: course1 } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Course 1',
          slug,
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course1?.id) createdCourses.push(course1.id);

      // When: Attempting to create another course with same slug in same org
      const { error } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Course 2',
          slug,
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      // Then: Insert should fail with unique violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('duplicate key value violates unique constraint');
    });

    it('should allow same slug in different organizations', async () => {
      // Given: Two different organizations
      const { data: org1 } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_slug_1'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      const { data: org2 } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_slug_2'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org1?.id) createdOrgs.push(org1.id);
      if (org2?.id) createdOrgs.push(org2.id);

      const { data: user1 } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `user1_${randomUUID()}@test.com`,
          organization_id: org1?.id,
          role: 'instructor',
        })
        .select()
        .single();

      const { data: user2 } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `user2_${randomUUID()}@test.com`,
          organization_id: org2?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user1?.id) createdUsers.push(user1.id);
      if (user2?.id) createdUsers.push(user2.id);

      const sharedSlug = 'shared-slug';

      // When: Creating courses with same slug in different orgs
      const { data: course1, error: error1 } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Org1 Course',
          slug: sharedSlug,
          user_id: user1?.id,
          organization_id: org1?.id,
          status: 'draft',
        })
        .select()
        .single();

      const { data: course2, error: error2 } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Org2 Course',
          slug: sharedSlug,
          user_id: user2?.id,
          organization_id: org2?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course1?.id) createdCourses.push(course1.id);
      if (course2?.id) createdCourses.push(course2.id);

      // Then: Both inserts should succeed
      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(course1?.slug).toBe(sharedSlug);
      expect(course2?.slug).toBe(sharedSlug);
    });

    it('should enforce unique enrollment per user-course pair', async () => {
      // Given: A course and a student
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_enrollment'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: instructor } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      const { data: student } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `student_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'student',
        })
        .select()
        .single();

      if (instructor?.id) createdUsers.push(instructor.id);
      if (student?.id) createdUsers.push(student.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Enrollment Test Course',
          slug: uniqueName('enrollment-course'),
          user_id: instructor?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      // Create first enrollment
      const { data: enrollment1 } = await supabase
        .from('course_enrollments')
        .insert({
          user_id: student?.id,
          course_id: course?.id,
        })
        .select()
        .single();

      // When: Attempting to create duplicate enrollment
      const { error } = await supabase
        .from('course_enrollments')
        .insert({
          user_id: student?.id,
          course_id: course?.id,
        })
        .select()
        .single();

      // Then: Insert should fail with unique violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('duplicate key value violates unique constraint');

      // Cleanup enrollment
      if (enrollment1?.id) {
        await supabase.from('course_enrollments').delete().eq('id', enrollment1.id);
      }
    });
  });

  describe('Test 6: Check constraints validate data integrity', () => {
    it('should enforce storage_used_bytes >= 0', async () => {
      // Given: An organization
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_negative_storage'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      // When: Attempting to set negative storage_used_bytes
      const { error } = await supabase
        .from('organizations')
        .update({
          storage_used_bytes: -100,
        })
        .eq('id', org?.id);

      // Then: Update should fail with check constraint violation
      expect(error).toBeDefined();
      expect(error?.message).toContain('violates check constraint');
    });

    it('should enforce sections.order_index > 0', async () => {
      // Given: A course
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_section_order'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Section Order Test',
          slug: uniqueName('section-order'),
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      // When: Attempting to create section with order_index <= 0
      const { error: error0 } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Invalid Section',
          order_index: 0,
        })
        .select()
        .single();

      const { error: errorNeg } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Negative Section',
          order_index: -1,
        })
        .select()
        .single();

      // Then: Both inserts should fail
      expect(error0).toBeDefined();
      expect(error0?.message).toContain('violates check constraint');
      expect(errorNeg).toBeDefined();
      expect(errorNeg?.message).toContain('violates check constraint');

      // Verify positive order_index works
      const { data: validSection, error: validError } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Valid Section',
          order_index: 1,
        })
        .select()
        .single();

      expect(validError).toBeNull();
      expect(validSection?.order_index).toBe(1);
    });

    it('should enforce lessons.order_index > 0', async () => {
      // Given: A section
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_lesson_order'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Lesson Order Test',
          slug: uniqueName('lesson-order'),
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      const { data: section } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Test Section',
          order_index: 1,
        })
        .select()
        .single();

      // When: Attempting to create lesson with order_index <= 0
      const { error } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Invalid Lesson',
          order_index: 0,
          lesson_type: 'text',
        })
        .select()
        .single();

      // Then: Insert should fail
      expect(error).toBeDefined();
      expect(error?.message).toContain('violates check constraint');

      // Verify positive order_index works
      const { data: validLesson, error: validError } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Valid Lesson',
          order_index: 1,
          lesson_type: 'video',
        })
        .select()
        .single();

      expect(validError).toBeNull();
      expect(validLesson?.order_index).toBe(1);
    });

    it('should enforce lessons.duration_minutes > 0 when not null', async () => {
      // Given: A section
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_lesson_duration'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Lesson Duration Test',
          slug: uniqueName('lesson-duration'),
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      const { data: section } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Test Section',
          order_index: 1,
        })
        .select()
        .single();

      // When: Creating lessons with various duration values

      // Null duration should be allowed
      const { data: nullDuration, error: nullError } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Null Duration Lesson',
          order_index: 1,
          lesson_type: 'text',
          duration_minutes: null,
        })
        .select()
        .single();

      expect(nullError).toBeNull();
      expect(nullDuration?.duration_minutes).toBeNull();

      // Zero duration should fail
      const { error: zeroError } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Zero Duration Lesson',
          order_index: 2,
          lesson_type: 'video',
          duration_minutes: 0,
        })
        .select()
        .single();

      expect(zeroError).toBeDefined();
      expect(zeroError?.message).toContain('violates check constraint');

      // Negative duration should fail
      const { error: negError } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Negative Duration Lesson',
          order_index: 3,
          lesson_type: 'video',
          duration_minutes: -10,
        })
        .select()
        .single();

      expect(negError).toBeDefined();
      expect(negError?.message).toContain('violates check constraint');

      // Positive duration should succeed
      const { data: validDuration, error: validError } = await supabase
        .from('lessons')
        .insert({
          section_id: section?.id,
          title: 'Valid Duration Lesson',
          order_index: 4,
          lesson_type: 'video',
          duration_minutes: 45,
        })
        .select()
        .single();

      expect(validError).toBeNull();
      expect(validDuration?.duration_minutes).toBe(45);
    });

    it('should enforce file_catalog.file_size > 0', async () => {
      // Given: An organization
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_file_size'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      // When: Attempting to create file with size <= 0
      const { error: zeroError } = await supabase
        .from('file_catalog')
        .insert({
          organization_id: org?.id,
          filename: 'zero-size.pdf',
          file_type: 'application/pdf',
          file_size: 0,
          storage_path: '/files/zero-size.pdf',
          hash: 'abc123',
          mime_type: 'application/pdf',
        })
        .select()
        .single();

      const { error: negError } = await supabase
        .from('file_catalog')
        .insert({
          organization_id: org?.id,
          filename: 'negative-size.pdf',
          file_type: 'application/pdf',
          file_size: -100,
          storage_path: '/files/negative-size.pdf',
          hash: 'def456',
          mime_type: 'application/pdf',
        })
        .select()
        .single();

      // Then: Both inserts should fail
      expect(zeroError).toBeDefined();
      expect(zeroError?.message).toContain('violates check constraint');
      expect(negError).toBeDefined();
      expect(negError?.message).toContain('violates check constraint');

      // Verify positive file_size works
      const { data: validFile, error: validError } = await supabase
        .from('file_catalog')
        .insert({
          organization_id: org?.id,
          filename: 'valid-size.pdf',
          file_type: 'application/pdf',
          file_size: 1024,
          storage_path: '/files/valid-size.pdf',
          hash: 'ghi789',
          mime_type: 'application/pdf',
        })
        .select()
        .single();

      expect(validError).toBeNull();
      expect(validFile?.file_size).toBe(1024);
    });
  });

  describe('Additional Data Integrity Tests', () => {
    it('should properly handle enum values for course_status', async () => {
      // Given: Setup for course creation
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_course_status'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      // When: Creating courses with valid statuses
      const validStatuses = ['draft', 'published', 'archived'] as const;

      for (const status of validStatuses) {
        const { data, error } = await supabase
          .from('courses')
          .insert({
            id: randomUUID(),
            title: `Course ${status}`,
            slug: uniqueName(`course-${status}`),
            user_id: user?.id,
            organization_id: org?.id,
            status,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data?.status).toBe(status);

        if (data?.id) createdCourses.push(data.id);
      }
    });

    it('should properly handle enum values for lesson_type', async () => {
      // Given: Setup for lesson creation
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_lesson_type'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: user } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (user?.id) createdUsers.push(user.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Lesson Type Test',
          slug: uniqueName('lesson-type-test'),
          user_id: user?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      const { data: section } = await supabase
        .from('sections')
        .insert({
          course_id: course?.id,
          title: 'Test Section',
          order_index: 1,
        })
        .select()
        .single();

      // When: Creating lessons with valid types
      const validTypes = ['video', 'text', 'quiz', 'interactive', 'assignment'] as const;

      for (let i = 0; i < validTypes.length; i++) {
        const lessonType = validTypes[i];
        const { data, error } = await supabase
          .from('lessons')
          .insert({
            section_id: section?.id,
            title: `Lesson ${lessonType}`,
            order_index: i + 1,
            lesson_type: lessonType,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data?.lesson_type).toBe(lessonType);
      }
    });

    it('should properly handle enrollment_status enum values', async () => {
      // Given: Setup for enrollment
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          id: randomUUID(),
          name: uniqueName('org_enrollment_status'),
          tier: 'free',
          storage_quota_bytes: 10485760,
          storage_used_bytes: 0,
        })
        .select()
        .single();

      if (org?.id) createdOrgs.push(org.id);

      const { data: instructor } = await supabase
        .from('users')
        .insert({
          id: randomUUID(),
          email: `instructor_${randomUUID()}@test.com`,
          organization_id: org?.id,
          role: 'instructor',
        })
        .select()
        .single();

      if (instructor?.id) createdUsers.push(instructor.id);

      const { data: course } = await supabase
        .from('courses')
        .insert({
          id: randomUUID(),
          title: 'Enrollment Status Test',
          slug: uniqueName('enrollment-status'),
          user_id: instructor?.id,
          organization_id: org?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (course?.id) createdCourses.push(course.id);

      // When: Creating enrollments with valid statuses
      const validStatuses = ['active', 'completed', 'dropped', 'expired'] as const;

      for (const status of validStatuses) {
        const { data: student } = await supabase
          .from('users')
          .insert({
            id: randomUUID(),
            email: `student_${status}_${randomUUID()}@test.com`,
            organization_id: org?.id,
            role: 'student',
          })
          .select()
          .single();

        if (student?.id) createdUsers.push(student.id);

        // For 'completed' status, we need to provide completed_at due to check constraint
        const enrollmentData: any = {
          user_id: student?.id,
          course_id: course?.id,
          status,
        };

        if (status === 'completed') {
          enrollmentData.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from('course_enrollments')
          .insert(enrollmentData)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data?.status).toBe(status);
      }
    });
  });
});
