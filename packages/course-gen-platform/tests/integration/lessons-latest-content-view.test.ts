import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { getTestSupabaseClient } from '../helpers/shared-supabase';

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

const supabase = getTestSupabaseClient();
const uniqueName = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

// Helper functions

async function createTestOrg() {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      id: randomUUID(),
      name: uniqueName('test_org'),
      slug: uniqueName('test_org_slug'),
      tier: 'free',
      storage_quota_bytes: 10485760,
      storage_used_bytes: 0,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create org: ${error.message}`);
  return data;
}

async function createTestUser(orgId: string) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: randomUUID(),
      email: uniqueName('user') + '@test.com',
      role: 'instructor',
      organization_id: orgId,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data;
}

async function createTestCourse(orgId: string, userId: string) {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      id: randomUUID(),
      title: uniqueName('course'),
      slug: uniqueName('slug'),
      organization_id: orgId,
      user_id: userId,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create course: ${error.message}`);
  return data;
}

async function createTestSection(courseId: string, orderIndex: number = 1) {
  const { data, error } = await supabase
    .from('sections')
    .insert({
      id: randomUUID(),
      course_id: courseId,
      title: uniqueName('section'),
      order_index: orderIndex,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create section: ${error.message}`);
  return data;
}

async function createTestLesson(sectionId: string, orderIndex: number = 1) {
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      id: randomUUID(),
      section_id: sectionId,
      title: uniqueName('lesson'),
      order_index: orderIndex,
      lesson_type: 'text',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create lesson: ${error.message}`);
  return data;
}

async function createTestLessonContent(
  lessonId: string,
  courseId: string,
  status: 'pending' | 'generating' | 'completed' | 'failed' = 'completed',
  content: Record<string, unknown> = { intro: 'Test content' }
) {
  const { data, error } = await supabase
    .from('lesson_contents')
    .insert({
      id: randomUUID(),
      lesson_id: lessonId,
      course_id: courseId,
      content,
      status,
      metadata: { version: 1 },
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create lesson content: ${error.message}`);
  return data;
}

// Sleep helper for ensuring created_at ordering
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Check if integration tests can run
const canRunIntegrationTests = !!(
  process.env.SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

(canRunIntegrationTests ? describe : describe.skip)('lessons_with_latest_content view', () => {
  // Track created entities for cleanup
  let createdOrgs: string[] = [];
  let createdUsers: string[] = [];
  let createdCourses: string[] = [];
  let createdSections: string[] = [];
  let createdLessons: string[] = [];
  let createdLessonContents: string[] = [];

  // Cleanup helper
  const cleanupTestData = async () => {
    // Clean in reverse order of dependencies
    if (createdLessonContents.length > 0) {
      await supabase.from('lesson_contents').delete().in('id', createdLessonContents);
    }
    if (createdLessons.length > 0) {
      await supabase.from('lessons').delete().in('id', createdLessons);
    }
    if (createdSections.length > 0) {
      await supabase.from('sections').delete().in('id', createdSections);
    }
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
    createdSections = [];
    createdLessons = [];
    createdLessonContents = [];
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

  describe('Test 1: View returns latest completed content per lesson', () => {
    it('should return only the latest completed content version', async () => {
      // Given: A lesson with 3 completed content versions
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      // Create 3 completed content versions with delays to ensure ordering
      const content1 = await createTestLessonContent(lesson.id, course.id, 'completed', {
        intro: 'Version 1',
        version: 1,
      });
      createdLessonContents.push(content1.id);
      await sleep(100);

      const content2 = await createTestLessonContent(lesson.id, course.id, 'completed', {
        intro: 'Version 2',
        version: 2,
      });
      createdLessonContents.push(content2.id);
      await sleep(100);

      const content3 = await createTestLessonContent(lesson.id, course.id, 'completed', {
        intro: 'Version 3',
        version: 3,
      });
      createdLessonContents.push(content3.id);

      // When: Querying the view
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Should return only the latest version (Version 3)
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.lesson_id).toBe(lesson.id);
      expect(data?.content).toEqual({ intro: 'Version 3', version: 3 });
      expect(data?.content_metadata).toEqual({ version: 1 });
    });

    it('should return correct metadata and timestamps for latest content', async () => {
      // Given: A lesson with multiple completed content versions
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      const oldContent = await createTestLessonContent(lesson.id, course.id, 'completed', {
        version: 1,
      });
      createdLessonContents.push(oldContent.id);
      await sleep(100);

      const latestContent = await createTestLessonContent(lesson.id, course.id, 'completed', {
        version: 2,
      });
      createdLessonContents.push(latestContent.id);

      // When: Querying the view
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Should return latest content with correct metadata
      expect(error).toBeNull();
      expect(data?.content_created_at).toBe(latestContent.created_at);
      expect(data?.content_metadata).toEqual({ version: 1 });
    });
  });

  describe('Test 2: View returns NULL content for lessons without completed content', () => {
    it('should return NULL content for lesson with only pending/failed content', async () => {
      // Given: A lesson with pending and failed content, but no completed
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      // Create pending and failed content
      const pendingContent = await createTestLessonContent(lesson.id, course.id, 'pending', {
        intro: 'Pending content',
      });
      createdLessonContents.push(pendingContent.id);

      const failedContent = await createTestLessonContent(lesson.id, course.id, 'failed', {
        intro: 'Failed content',
      });
      createdLessonContents.push(failedContent.id);

      // When: Querying the view
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Lesson exists but content fields are NULL
      expect(error).toBeNull();
      expect(data?.lesson_id).toBe(lesson.id);
      expect(data?.lesson_title).toBe(lesson.title);
      expect(data?.content).toBeNull();
      expect(data?.content_metadata).toBeNull();
      expect(data?.content_created_at).toBeNull();
    });

    it('should return NULL content for lesson with only generating content', async () => {
      // Given: A lesson with generating content
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      const generatingContent = await createTestLessonContent(lesson.id, course.id, 'generating', {
        intro: 'Generating...',
      });
      createdLessonContents.push(generatingContent.id);

      // When: Querying the view
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Lesson exists but content is NULL
      expect(error).toBeNull();
      expect(data?.lesson_id).toBe(lesson.id);
      expect(data?.content).toBeNull();
    });
  });

  describe('Test 3: View returns NULL content for lessons with no content at all', () => {
    it('should return lesson row with NULL content fields when no content exists', async () => {
      // Given: A lesson without any lesson_contents rows
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      // No lesson_contents created

      // When: Querying the view
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Lesson exists but all content fields are NULL
      expect(error).toBeNull();
      expect(data?.lesson_id).toBe(lesson.id);
      expect(data?.section_id).toBe(section.id);
      expect(data?.lesson_title).toBe(lesson.title);
      expect(data?.order_index).toBe(1);
      expect(data?.content).toBeNull();
      expect(data?.content_metadata).toBeNull();
      expect(data?.content_created_at).toBeNull();
    });
  });

  describe('Test 4: View returns exactly one row per lesson (uniqueness)', () => {
    it('should return exactly 1 row for lesson with 5 completed content versions', async () => {
      // Given: A lesson with 5 completed content versions
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      // Create 5 completed content versions
      for (let i = 1; i <= 5; i++) {
        const content = await createTestLessonContent(lesson.id, course.id, 'completed', {
          intro: `Version ${i}`,
          version: i,
        });
        createdLessonContents.push(content.id);
        await sleep(50);
      }

      // When: Querying the view filtering by lesson_id
      const { data, error, count } = await supabase
        .from('lessons_with_latest_content')
        .select('*', { count: 'exact' })
        .eq('lesson_id', lesson.id);

      // Then: Exactly 1 row returned
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(count).toBe(1);
      expect(data?.[0]?.lesson_id).toBe(lesson.id);
      expect(data?.[0]?.content).toEqual({ intro: 'Version 5', version: 5 });
    });

    it('should return one row per lesson when multiple lessons exist', async () => {
      // Given: Multiple lessons in a section
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      // Create 3 lessons with completed content
      const lessonIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const lesson = await createTestLesson(section.id, i);
        createdLessons.push(lesson.id);
        lessonIds.push(lesson.id);

        const content = await createTestLessonContent(lesson.id, course.id, 'completed', {
          lesson: i,
        });
        createdLessonContents.push(content.id);
      }

      // When: Querying the view for the section
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('section_id', section.id)
        .order('order_index', { ascending: true });

      // Then: Exactly 3 rows (one per lesson)
      expect(error).toBeNull();
      expect(data).toHaveLength(3);
      expect(data?.map(row => row.lesson_id)).toEqual(lessonIds);
    });
  });

  describe('Test 5: View filters correctly by section_id', () => {
    it('should return only lessons from specified section', async () => {
      // Given: 2 sections with lessons in each
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      // Create section 1 with 2 lessons
      const section1 = await createTestSection(course.id, 1);
      createdSections.push(section1.id);

      const lesson1 = await createTestLesson(section1.id, 1);
      createdLessons.push(lesson1.id);
      const content1 = await createTestLessonContent(lesson1.id, course.id, 'completed', {
        section: 1,
        lesson: 1,
      });
      createdLessonContents.push(content1.id);

      const lesson2 = await createTestLesson(section1.id, 2);
      createdLessons.push(lesson2.id);
      const content2 = await createTestLessonContent(lesson2.id, course.id, 'completed', {
        section: 1,
        lesson: 2,
      });
      createdLessonContents.push(content2.id);

      // Create section 2 with 1 lesson
      const section2 = await createTestSection(course.id, 2);
      createdSections.push(section2.id);

      const lesson3 = await createTestLesson(section2.id, 1);
      createdLessons.push(lesson3.id);
      const content3 = await createTestLessonContent(lesson3.id, course.id, 'completed', {
        section: 2,
        lesson: 1,
      });
      createdLessonContents.push(content3.id);

      // When: Querying view with section_id filter for section1
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('section_id', section1.id)
        .order('order_index', { ascending: true });

      // Then: Only section1's lessons are returned
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.map(row => row.section_id)).toEqual([section1.id, section1.id]);
      expect(data?.map(row => row.lesson_id)).toEqual([lesson1.id, lesson2.id]);
      expect(data?.[0]?.content).toEqual({ section: 1, lesson: 1 });
      expect(data?.[1]?.content).toEqual({ section: 1, lesson: 2 });
    });
  });

  describe('Test 6: View preserves lesson order_index', () => {
    it('should maintain correct lesson ordering by order_index', async () => {
      // Given: 3 lessons with order_index 1, 2, 3
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson1 = await createTestLesson(section.id, 1);
      createdLessons.push(lesson1.id);
      const content1 = await createTestLessonContent(lesson1.id, course.id, 'completed', {
        order: 1,
      });
      createdLessonContents.push(content1.id);

      const lesson2 = await createTestLesson(section.id, 2);
      createdLessons.push(lesson2.id);
      const content2 = await createTestLessonContent(lesson2.id, course.id, 'completed', {
        order: 2,
      });
      createdLessonContents.push(content2.id);

      const lesson3 = await createTestLesson(section.id, 3);
      createdLessons.push(lesson3.id);
      const content3 = await createTestLessonContent(lesson3.id, course.id, 'completed', {
        order: 3,
      });
      createdLessonContents.push(content3.id);

      // When: Querying view ordered by order_index
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('section_id', section.id)
        .order('order_index', { ascending: true });

      // Then: Lessons returned in correct order
      expect(error).toBeNull();
      expect(data).toHaveLength(3);
      expect(data?.[0]?.order_index).toBe(1);
      expect(data?.[1]?.order_index).toBe(2);
      expect(data?.[2]?.order_index).toBe(3);
      expect(data?.[0]?.lesson_id).toBe(lesson1.id);
      expect(data?.[1]?.lesson_id).toBe(lesson2.id);
      expect(data?.[2]?.lesson_id).toBe(lesson3.id);
    });
  });

  describe('Test 7: View integration with export-lessons scenario', () => {
    it('should support typical export-lessons query pattern', async () => {
      // Given: A section with mixed lesson states (common in export scenario)
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      // Lesson 1: Has completed content
      const lesson1 = await createTestLesson(section.id, 1);
      createdLessons.push(lesson1.id);
      const content1 = await createTestLessonContent(lesson1.id, course.id, 'completed', {
        intro: 'Completed',
      });
      createdLessonContents.push(content1.id);

      // Lesson 2: No content at all
      const lesson2 = await createTestLesson(section.id, 2);
      createdLessons.push(lesson2.id);

      // Lesson 3: Has pending content only
      const lesson3 = await createTestLesson(section.id, 3);
      createdLessons.push(lesson3.id);
      const content3 = await createTestLessonContent(lesson3.id, course.id, 'pending', {
        intro: 'Pending',
      });
      createdLessonContents.push(content3.id);

      // When: Querying all lessons for the section (typical export query)
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('lesson_id, lesson_title, order_index, content')
        .eq('section_id', section.id)
        .order('order_index', { ascending: true });

      // Then: All lessons returned with appropriate content state
      expect(error).toBeNull();
      expect(data).toHaveLength(3);

      // Lesson 1: Has content
      expect(data?.[0]?.lesson_id).toBe(lesson1.id);
      expect(data?.[0]?.content).toEqual({ intro: 'Completed' });

      // Lesson 2: NULL content
      expect(data?.[1]?.lesson_id).toBe(lesson2.id);
      expect(data?.[1]?.content).toBeNull();

      // Lesson 3: NULL content (pending not included)
      expect(data?.[2]?.lesson_id).toBe(lesson3.id);
      expect(data?.[2]?.content).toBeNull();
    });

    it('should handle lessons with multiple content versions correctly in export', async () => {
      // Given: Lessons with multiple content versions (revisions)
      const org = await createTestOrg();
      createdOrgs.push(org.id);

      const user = await createTestUser(org.id);
      createdUsers.push(user.id);

      const course = await createTestCourse(org.id, user.id);
      createdCourses.push(course.id);

      const section = await createTestSection(course.id, 1);
      createdSections.push(section.id);

      const lesson = await createTestLesson(section.id, 1);
      createdLessons.push(lesson.id);

      // Create old completed content
      const oldContent = await createTestLessonContent(lesson.id, course.id, 'completed', {
        intro: 'Old version',
        revision: 1,
      });
      createdLessonContents.push(oldContent.id);
      await sleep(100);

      // Create new completed content
      const newContent = await createTestLessonContent(lesson.id, course.id, 'completed', {
        intro: 'New version',
        revision: 2,
      });
      createdLessonContents.push(newContent.id);

      // When: Exporting lessons
      const { data, error } = await supabase
        .from('lessons_with_latest_content')
        .select('*')
        .eq('lesson_id', lesson.id)
        .single();

      // Then: Only latest version returned (not old version)
      expect(error).toBeNull();
      expect(data?.content).toEqual({ intro: 'New version', revision: 2 });
      expect(data?.content).not.toEqual({ intro: 'Old version', revision: 1 });
    });
  });
});
