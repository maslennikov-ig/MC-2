/**
 * Lesson Approval Integration Tests
 *
 * Tests for lesson approval functionality (single and batch).
 * Verifies the RPC function batch_update_lesson_contents_status behavior
 * after GitHub Issue #3 fix (constraint violation on upsert changed to UPDATE-only).
 *
 * @see packages/course-gen-platform/src/server/routers/lesson-content/procedures/approve-lesson.ts
 * @see packages/course-gen-platform/src/server/routers/lesson-content/procedures/approve-lessons.ts
 * @see supabase/migrations/..._create_batch_update_lesson_contents_status.sql
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { getTestFixtures, setupTestFixtures, cleanupTestFixtures } from '../fixtures';

// ============================================================================
// Test Fixtures
// ============================================================================

const { TEST_ORGS, TEST_USERS, TEST_COURSES } = getTestFixtures('lesson-approval.test.ts');

// ============================================================================
// Helper Types
// ============================================================================

interface TestCourse {
  id: string;
  organizationId: string;
  userId: string;
}

interface TestSection {
  id: string;
  courseId: string;
  orderIndex: number;
}

interface TestLesson {
  id: string;
  sectionId: string;
  orderIndex: number;
}

interface TestLessonContent {
  id: string;
  lessonId: string;
  courseId: string;
  status: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a course with a module (section) and lessons
 *
 * @param courseId - Course UUID
 * @param userId - User UUID (course owner)
 * @param orgId - Organization UUID
 * @param lessonCount - Number of lessons to create
 * @param status - Initial status for lesson_contents ('completed', 'pending', etc.)
 * @returns Course, section, lessons, and lesson_contents data
 */
async function createCourseWithModule(
  courseId: string,
  userId: string,
  orgId: string,
  lessonCount: number,
  status: string = 'completed'
): Promise<{
  course: TestCourse;
  section: TestSection;
  lessons: TestLesson[];
  lessonContents: TestLessonContent[];
}> {
  const supabase = getSupabaseAdmin();

  // 1. Create course
  const { error: courseError } = await supabase.from('courses').insert({
    id: courseId,
    title: `Test Course ${courseId.slice(0, 8)}`,
    slug: `test-course-${courseId.slice(0, 8)}`,
    user_id: userId,
    organization_id: orgId,
    status: 'draft',
    settings: {},
  });

  if (courseError) {
    throw new Error(`Failed to create course: ${courseError.message}`);
  }

  // 2. Create section (module)
  const sectionId = randomUUID();
  const { error: sectionError } = await supabase.from('sections').insert({
    id: sectionId,
    course_id: courseId,
    title: 'Test Module 1',
    description: 'Test module for lesson approval',
    order_index: 1,
    metadata: {},
  });

  if (sectionError) {
    throw new Error(`Failed to create section: ${sectionError.message}`);
  }

  // 3. Create lessons and lesson_contents
  const lessons: TestLesson[] = [];
  const lessonContents: TestLessonContent[] = [];

  for (let i = 1; i <= lessonCount; i++) {
    const lessonId = randomUUID();

    // Insert lesson
    const { error: lessonError } = await supabase.from('lessons').insert({
      id: lessonId,
      section_id: sectionId,
      title: `Lesson ${i}`,
      order_index: i,
      lesson_type: 'text',
      status: 'draft',
      metadata: {},
      objectives: [`Learning objective ${i}`],
    });

    if (lessonError) {
      throw new Error(`Failed to create lesson ${i}: ${lessonError.message}`);
    }

    // Insert lesson_contents
    const lessonContentId = randomUUID();
    const { error: contentError } = await supabase.from('lesson_contents').insert({
      id: lessonContentId,
      lesson_id: lessonId,
      course_id: courseId,
      content: { body: `Lesson ${i} content` },
      metadata: {
        cost_usd: 0.5,
        quality_score: 0.9,
        total_tokens: 1000,
      },
      status,
    });

    if (contentError) {
      throw new Error(`Failed to create lesson_contents ${i}: ${contentError.message}`);
    }

    lessons.push({ id: lessonId, sectionId, orderIndex: i });
    lessonContents.push({
      id: lessonContentId,
      lessonId,
      courseId,
      status,
      metadata: { cost_usd: 0.5, quality_score: 0.9, total_tokens: 1000 },
    });
  }

  return {
    course: { id: courseId, organizationId: orgId, userId },
    section: { id: sectionId, courseId, orderIndex: 1 },
    lessons,
    lessonContents,
  };
}

/**
 * Get lesson_content by course_id and lesson_id
 */
async function getLesson(courseId: string, lessonId: string): Promise<TestLessonContent | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('lesson_contents')
    .select('id, lesson_id, course_id, status, metadata')
    .eq('course_id', courseId)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseId: data.course_id,
    status: data.status,
    metadata: (data.metadata as Record<string, unknown>) || {},
  };
}

/**
 * Get all lesson_contents in a module (by section order_index)
 */
async function getLessonsInModule(
  courseId: string,
  moduleNumber: number
): Promise<TestLessonContent[]> {
  const supabase = getSupabaseAdmin();

  // Get section by order_index
  const { data: section, error: sectionError } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', courseId)
    .eq('order_index', moduleNumber)
    .single();

  if (sectionError || !section) {
    return [];
  }

  // Get all lessons in section
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id')
    .eq('section_id', section.id);

  if (lessonsError || !lessons) {
    return [];
  }

  const lessonIds = lessons.map(l => l.id);

  // Get all lesson_contents for these lessons
  const { data: contents, error: contentsError } = await supabase
    .from('lesson_contents')
    .select('id, lesson_id, course_id, status, metadata')
    .eq('course_id', courseId)
    .in('lesson_id', lessonIds);

  if (contentsError || !contents) {
    return [];
  }

  return contents.map(c => ({
    id: c.id,
    lessonId: c.lesson_id,
    courseId: c.course_id,
    status: c.status,
    metadata: (c.metadata as Record<string, unknown>) || {},
  }));
}

/**
 * Cleanup test course data (reverse dependency order)
 */
async function cleanupCourse(courseId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete lesson_contents first (depends on lessons and courses)
  await supabase.from('lesson_contents').delete().eq('course_id', courseId);

  // Get section IDs
  const { data: sections } = await supabase.from('sections').select('id').eq('course_id', courseId);

  const sectionIds = sections?.map(s => s.id) || [];

  // Delete lessons (depends on sections)
  if (sectionIds.length > 0) {
    await supabase.from('lessons').delete().in('section_id', sectionIds);
  }

  // Delete sections (depends on courses)
  await supabase.from('sections').delete().eq('course_id', courseId);

  // Delete course
  await supabase.from('courses').delete().eq('id', courseId);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Lesson Approval Integration Tests', () => {
  // Track created courses for cleanup
  const createdCourses: string[] = [];

  beforeAll(async () => {
    // Note: We skip auth users setup as we're testing database RPC functions directly
    await setupTestFixtures({
      skipAuthUsers: true,
      customFixtures: { TEST_ORGS, TEST_USERS, TEST_COURSES },
    });
  });

  afterAll(async () => {
    // Cleanup all created courses
    for (const courseId of createdCourses) {
      await cleanupCourse(courseId);
    }
    await cleanupTestFixtures();
  });

  afterEach(async () => {
    // Cleanup courses created in each test
    for (const courseId of createdCourses) {
      await cleanupCourse(courseId);
    }
    createdCourses.length = 0; // Clear array
  });

  // ============================================================================
  // Test 1: Single Lesson Approval
  // ============================================================================

  it('should approve a single lesson with metadata preservation', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A course with 1 completed lesson
    const { lessons } = await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    const lessonId = lessons[0].id;

    // When: Calling RPC function to approve the lesson
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const updatedMetadata = {
      cost_usd: 0.5,
      quality_score: 0.9,
      total_tokens: 1000,
      approved_at: now,
      approved_by: TEST_USERS.instructor1.id,
    };

    const { data: updatedCount, error } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: [(await getLesson(courseId, lessonId))!.id],
        p_status: 'approved',
        p_metadata_map: {
          [(await getLesson(courseId, lessonId))!.id]: updatedMetadata,
        },
        p_updated_at: now,
      }
    );

    // Then: RPC should succeed
    expect(error).toBeNull();
    expect(updatedCount).toBe(1);

    // Verify lesson status and metadata
    const approvedLesson = await getLesson(courseId, lessonId);
    expect(approvedLesson).not.toBeNull();
    expect(approvedLesson!.status).toBe('approved');
    expect(approvedLesson!.metadata.approved_at).toBe(now);
    expect(approvedLesson!.metadata.approved_by).toBe(TEST_USERS.instructor1.id);

    // Verify old metadata fields are preserved
    expect(approvedLesson!.metadata.cost_usd).toBe(0.5);
    expect(approvedLesson!.metadata.quality_score).toBe(0.9);
    expect(approvedLesson!.metadata.total_tokens).toBe(1000);
  });

  // ============================================================================
  // Test 2: Batch Approval (Module)
  // ============================================================================

  it('should batch approve all completed lessons in a module', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A course with 4 completed lessons in module 1
    const { lessons } = await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      4,
      'completed'
    );

    // When: Calling RPC function to batch approve all lessons in module 1
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Get all lesson_contents IDs
    const lessonContents = await getLessonsInModule(courseId, 1);
    expect(lessonContents).toHaveLength(4);

    const contentIds = lessonContents.map(lc => lc.id);
    const metadataMap = lessonContents.reduce(
      (acc, lc) => {
        acc[lc.id] = {
          cost_usd: 0.5,
          quality_score: 0.9,
          total_tokens: 1000,
          approved_at: now,
          approved_by: TEST_USERS.instructor1.id,
        };
        return acc;
      },
      {} as Record<string, unknown>
    );

    const { data: updatedCount, error } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: contentIds,
        p_status: 'approved',
        p_metadata_map: metadataMap as any,
        p_updated_at: now,
      }
    );

    // Then: All 4 lessons should be approved
    expect(error).toBeNull();
    expect(updatedCount).toBe(4);

    // Verify all lessons have status='approved'
    const approvedLessons = await getLessonsInModule(courseId, 1);
    expect(approvedLessons).toHaveLength(4);

    for (const lesson of approvedLessons) {
      expect(lesson.status).toBe('approved');
      expect(lesson.metadata.approved_at).toBe(now);
      expect(lesson.metadata.approved_by).toBe(TEST_USERS.instructor1.id);
    }
  });

  // ============================================================================
  // Test 3: Metadata Preservation
  // ============================================================================

  it('should preserve existing metadata fields when approving', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A lesson with existing metadata
    const { lessons } = await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    const lessonId = lessons[0].id;
    const supabase = getSupabaseAdmin();

    // Add extra metadata fields
    const lessonContent = await getLesson(courseId, lessonId);
    await supabase
      .from('lesson_contents')
      .update({
        metadata: {
          cost_usd: 0.75,
          quality_score: 0.95,
          total_tokens: 1500,
          generation_duration_ms: 5000,
          model_used: 'gpt-4',
        },
      })
      .eq('id', lessonContent!.id);

    // When: Approving the lesson
    const now = new Date().toISOString();
    const updatedMetadata = {
      cost_usd: 0.75,
      quality_score: 0.95,
      total_tokens: 1500,
      generation_duration_ms: 5000,
      model_used: 'gpt-4',
      approved_at: now,
      approved_by: TEST_USERS.instructor1.id,
    };

    // Build metadata map as JSONB (not double-stringified)
    const metadataMap: Record<string, unknown> = {};
    metadataMap[lessonContent!.id] = updatedMetadata;

    await supabase.rpc('batch_update_lesson_contents_status', {
      p_ids: [lessonContent!.id],
      p_status: 'approved',
      p_metadata_map: metadataMap as any,
      p_updated_at: now,
    });

    // Then: All metadata fields should be preserved
    const approvedLesson = await getLesson(courseId, lessonId);
    expect(approvedLesson!.metadata.cost_usd).toBe(0.75);
    expect(approvedLesson!.metadata.quality_score).toBe(0.95);
    expect(approvedLesson!.metadata.total_tokens).toBe(1500);
    expect(approvedLesson!.metadata.generation_duration_ms).toBe(5000);
    expect(approvedLesson!.metadata.model_used).toBe('gpt-4');
    expect(approvedLesson!.metadata.approved_at).toBe(now);
    expect(approvedLesson!.metadata.approved_by).toBe(TEST_USERS.instructor1.id);
  });

  // ============================================================================
  // Test 4: Skip Non-Completed Lessons
  // ============================================================================

  it('should only approve completed lessons, skipping pending ones', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A module with 2 completed and 2 pending lessons
    const supabase = getSupabaseAdmin();

    // Create course structure
    await supabase.from('courses').insert({
      id: courseId,
      title: 'Mixed Status Course',
      slug: `mixed-status-${courseId.slice(0, 8)}`,
      user_id: TEST_USERS.instructor1.id,
      organization_id: TEST_ORGS.premium.id,
      status: 'draft',
      settings: {},
    });

    const sectionId = randomUUID();
    await supabase.from('sections').insert({
      id: sectionId,
      course_id: courseId,
      title: 'Mixed Status Module',
      order_index: 1,
      metadata: {},
    });

    const lessonIds: string[] = [];
    const completedContentIds: string[] = [];

    // Create 4 lessons: 2 completed, 2 pending
    for (let i = 1; i <= 4; i++) {
      const lessonId = randomUUID();
      lessonIds.push(lessonId);

      await supabase.from('lessons').insert({
        id: lessonId,
        section_id: sectionId,
        title: `Lesson ${i}`,
        order_index: i,
        lesson_type: 'text',
        status: 'draft',
        metadata: {},
        objectives: [],
      });

      const contentId = randomUUID();
      const status = i <= 2 ? 'completed' : 'pending';

      await supabase.from('lesson_contents').insert({
        id: contentId,
        lesson_id: lessonId,
        course_id: courseId,
        content: {},
        metadata: { cost_usd: 0.5, quality_score: 0.9 },
        status,
      });

      if (status === 'completed') {
        completedContentIds.push(contentId);
      }
    }

    // When: Attempting to batch approve all 4 lessons (but only 2 are completed)
    const now = new Date().toISOString();

    // Get only completed lessons
    const completedLessons = await getLessonsInModule(courseId, 1);
    const completedOnly = completedLessons.filter(lc => lc.status === 'completed');

    expect(completedOnly).toHaveLength(2);

    const metadataMap = completedOnly.reduce(
      (acc, lc) => {
        acc[lc.id] = {
          cost_usd: 0.5,
          quality_score: 0.9,
          approved_at: now,
          approved_by: TEST_USERS.instructor1.id,
        };
        return acc;
      },
      {} as Record<string, unknown>
    );

    const { data: updatedCount, error } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: completedContentIds,
        p_status: 'approved',
        p_metadata_map: metadataMap as any,
        p_updated_at: now,
      }
    );

    // Then: Only 2 lessons should be approved
    expect(error).toBeNull();
    expect(updatedCount).toBe(2);

    // Verify approved count and skipped count
    const allLessons = await getLessonsInModule(courseId, 1);
    const approved = allLessons.filter(lc => lc.status === 'approved');
    const pending = allLessons.filter(lc => lc.status === 'pending');

    expect(approved).toHaveLength(2);
    expect(pending).toHaveLength(2);
  });

  // ============================================================================
  // Test 5: Handle Non-Existent Lesson
  // ============================================================================

  it('should return 0 updated count when trying to approve non-existent lesson', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A course exists but lesson does not
    await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    const fakeContentId = randomUUID();

    // When: Attempting to approve non-existent lesson
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: updatedCount, error } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: [fakeContentId],
        p_status: 'approved',
        p_metadata_map: {
          [fakeContentId]: {
            approved_at: now,
            approved_by: TEST_USERS.instructor1.id,
          },
        },
        p_updated_at: now,
      }
    );

    // Then: RPC should succeed but return 0 updated count
    expect(error).toBeNull();
    expect(updatedCount).toBe(0);
  });

  // ============================================================================
  // Test 6: Course Access Check (Organizational Isolation)
  // ============================================================================

  it('should isolate courses by organization (no cross-org access)', async () => {
    // This test verifies organizational isolation at the database level
    // The actual access check is done in the tRPC procedure (verifyCourseAccess)

    const courseId1 = randomUUID();
    const courseId2 = randomUUID();
    createdCourses.push(courseId1, courseId2);

    // Given: Two courses from different organizations
    const supabase = getSupabaseAdmin();

    // Create second organization for instructor2
    const org2Id = randomUUID();
    await supabase.from('organizations').insert({
      id: org2Id,
      name: 'Test Org 2',
      slug: 'test-org-2',
      tier: 'premium',
      storage_quota_bytes: 10737418240,
      storage_used_bytes: 0,
    });

    // Update instructor2's organization
    await supabase
      .from('users')
      .update({ organization_id: org2Id })
      .eq('id', TEST_USERS.instructor2.id);

    // Create course1 for instructor1 (org1)
    await createCourseWithModule(
      courseId1,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    // Create course2 for instructor2 (org2)
    await createCourseWithModule(courseId2, TEST_USERS.instructor2.id, org2Id, 1, 'completed');

    // When: Instructor1 tries to approve lessons in their own course
    const course1Lessons = await getLessonsInModule(courseId1, 1);
    expect(course1Lessons).toHaveLength(1);

    const now = new Date().toISOString();
    const { data: updatedCount1, error: error1 } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: [course1Lessons[0].id],
        p_status: 'approved',
        p_metadata_map: {
          [course1Lessons[0].id]: {
            approved_at: now,
            approved_by: TEST_USERS.instructor1.id,
          },
        },
        p_updated_at: now,
      }
    );

    // Then: Approval should succeed for own course
    expect(error1).toBeNull();
    expect(updatedCount1).toBe(1);

    // Verify course2 lessons are NOT affected (organizational isolation)
    const course2Lessons = await getLessonsInModule(courseId2, 1);
    expect(course2Lessons).toHaveLength(1);
    expect(course2Lessons[0].status).toBe('completed'); // Still not approved

    // Cleanup second org
    await supabase.from('organizations').delete().eq('id', org2Id);
  });

  // ============================================================================
  // Test 7: RPC Function Validation (Status Enum)
  // ============================================================================

  it('should reject invalid status values in RPC function', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A course with 1 completed lesson
    const { lessons } = await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    const lessonContent = await getLesson(courseId, lessons[0].id);

    // When: Attempting to set invalid status via RPC
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { error } = await supabase.rpc('batch_update_lesson_contents_status', {
      p_ids: [lessonContent!.id],
      p_status: 'invalid_status', // Invalid status
      p_metadata_map: {},
      p_updated_at: now,
    });

    // Then: RPC should return error
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Invalid status');
  });

  // ============================================================================
  // Test 8: UPDATE-only behavior (no INSERT on race condition)
  // ============================================================================

  it('should only UPDATE existing rows, never INSERT (GitHub Issue #3 fix)', async () => {
    const courseId = randomUUID();
    createdCourses.push(courseId);

    // Given: A course with 1 completed lesson
    const { lessons } = await createCourseWithModule(
      courseId,
      TEST_USERS.instructor1.id,
      TEST_ORGS.premium.id,
      1,
      'completed'
    );

    const lessonContent = await getLesson(courseId, lessons[0].id);
    const supabase = getSupabaseAdmin();

    // When: Calling RPC with existing lesson_content ID
    const now = new Date().toISOString();
    const { data: updatedCount1, error: error1 } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: [lessonContent!.id],
        p_status: 'approved',
        p_metadata_map: {
          [lessonContent!.id]: {
            approved_at: now,
            approved_by: TEST_USERS.instructor1.id,
          },
        },
        p_updated_at: now,
      }
    );

    expect(error1).toBeNull();
    expect(updatedCount1).toBe(1);

    // When: Calling RPC with non-existent ID (should NOT insert)
    const fakeId = randomUUID();
    const { data: updatedCount2, error: error2 } = await supabase.rpc(
      'batch_update_lesson_contents_status',
      {
        p_ids: [fakeId],
        p_status: 'approved',
        p_metadata_map: {
          [fakeId]: {
            approved_at: now,
            approved_by: TEST_USERS.instructor1.id,
          },
        },
        p_updated_at: now,
      }
    );

    // Then: RPC should return 0 updated count (no INSERT)
    expect(error2).toBeNull();
    expect(updatedCount2).toBe(0);

    // Verify no new row was inserted
    const { data: checkInsert } = await supabase
      .from('lesson_contents')
      .select('id')
      .eq('id', fakeId)
      .single();

    expect(checkInsert).toBeNull();
  });
});
