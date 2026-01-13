import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
  db: {
    schema: 'public',
  },
});

// Helper to generate unique names for test isolation
const uniqueName = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

describe('Course Structure Acceptance Tests', () => {
  // Track created entities for cleanup
  let testOrg: any;
  let testInstructor: any;
  let testCourse: any;
  let testSections: any[] = [];
  let testLessons: any[] = [];

  // Helper to measure query performance
  const measureQueryTime = async (queryFn: () => Promise<any>) => {
    const start = performance.now();
    const result = await queryFn();
    const duration = performance.now() - start;
    return { result, duration };
  };

  // Setup test data hierarchy once
  beforeAll(async () => {
    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: uniqueName('test_org_structure'),
        tier: 'standard',
        storage_quota_bytes: 1073741824, // 1GB for standard tier
        storage_used_bytes: 0,
      })
      .select()
      .single();

    expect(orgError).toBeNull();
    testOrg = org;

    // Create instructor
    const { data: instructor, error: instrError } = await supabase
      .from('users')
      .insert({
        id: randomUUID(), // Must provide ID since auth.uid() requires authenticated context
        email: `instructor_${randomUUID()}@test.com`,
        organization_id: testOrg.id,
        role: 'instructor',
      })
      .select()
      .single();

    expect(instrError).toBeNull();
    testInstructor = instructor;

    // Create course with settings
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        title: 'Complete Test Course',
        slug: uniqueName('complete-course'),
        user_id: testInstructor.id,
        organization_id: testOrg.id,
        status: 'published',
        settings: {
          max_retries: 3,
          passing_score: 80,
          allow_download: true,
        },
      })
      .select()
      .single();

    expect(courseError).toBeNull();
    testCourse = course;

    // Create 3 sections with multiple lessons each
    for (let sectionIdx = 1; sectionIdx <= 3; sectionIdx++) {
      const { data: section, error: sectionError } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: `Section ${sectionIdx}: ${sectionIdx === 1 ? 'Introduction' : sectionIdx === 2 ? 'Core Concepts' : 'Advanced Topics'}`,
          description: `Description for section ${sectionIdx}`,
          order_index: sectionIdx,
          metadata: {
            difficulty:
              sectionIdx === 1 ? 'beginner' : sectionIdx === 2 ? 'intermediate' : 'advanced',
            estimated_hours: sectionIdx * 2,
          },
        })
        .select()
        .single();

      expect(sectionError).toBeNull();
      testSections.push(section);

      // Create 4 lessons per section
      for (let lessonIdx = 1; lessonIdx <= 4; lessonIdx++) {
        const lessonTypes = ['video', 'text', 'quiz', 'interactive'] as const;
        const lessonType = lessonTypes[(lessonIdx - 1) % lessonTypes.length];

        const { data: lesson, error: lessonError } = await supabase
          .from('lessons')
          .insert({
            section_id: section.id,
            title: `Lesson ${sectionIdx}.${lessonIdx}: ${lessonType.charAt(0).toUpperCase() + lessonType.slice(1)} Content`,
            order_index: lessonIdx,
            duration_minutes: lessonType === 'video' ? 15 : lessonType === 'quiz' ? 10 : null,
            lesson_type: lessonType,
            status: 'published',
            metadata: {
              points: lessonType === 'quiz' ? 100 : 0,
              attempts_allowed: lessonType === 'quiz' ? 3 : null,
            },
          })
          .select()
          .single();

        expect(lessonError).toBeNull();
        testLessons.push(lesson);

        // Create lesson content for each lesson
        const contentData: any = {
          lesson_id: lesson.id,
          updated_at: new Date().toISOString(),
        };

        if (lessonType === 'video') {
          contentData.media_urls = [`https://example.com/video_${lesson.id}.mp4`];
          contentData.text_content = `Video transcript for lesson ${sectionIdx}.${lessonIdx}`;
        } else if (lessonType === 'text') {
          contentData.text_content = `# Lesson ${sectionIdx}.${lessonIdx}\n\nThis is the text content for lesson ${sectionIdx}.${lessonIdx}. It contains detailed explanations and examples.`;
        } else if (lessonType === 'quiz') {
          contentData.quiz_data = {
            questions: [
              {
                id: 'q1',
                type: 'multiple_choice',
                question: `Question 1 for lesson ${sectionIdx}.${lessonIdx}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correct_answer: 'Option A',
                points: 25,
              },
              {
                id: 'q2',
                type: 'true_false',
                question: `True or False question for lesson ${sectionIdx}.${lessonIdx}`,
                correct_answer: true,
                points: 25,
              },
            ],
            passing_score: 50,
            time_limit_minutes: 10,
          };
        } else if (lessonType === 'interactive') {
          contentData.interactive_elements = {
            type: 'code_playground',
            language: 'javascript',
            starter_code: `// Interactive lesson ${sectionIdx}.${lessonIdx}\nconsole.log('Hello, World!');`,
            test_cases: [{ input: '', expected_output: 'Hello, World!' }],
          };
          contentData.text_content = `Instructions for interactive lesson ${sectionIdx}.${lessonIdx}`;
        }

        const { error: contentError } = await supabase.from('lesson_content').insert(contentData);

        expect(contentError).toBeNull();
      }
    }
  });

  // Clean up any orphaned data before each test to ensure isolation
  beforeEach(async () => {
    // Clean up any orphaned courses from previous failed runs
    // Only keep the test course we created in beforeAll
    if (testOrg?.id && testCourse?.id) {
      await supabase
        .from('courses')
        .delete()
        .neq('id', testCourse.id)
        .eq('organization_id', testOrg.id);
    }
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Delete organization (cascades to all child records)
    if (testOrg?.id) {
      await supabase.from('organizations').delete().eq('id', testOrg.id);
    }
  });

  describe('Test 1: Query full course hierarchy', () => {
    it('should successfully retrieve all levels from organization down to lesson content', async () => {
      // Given: Complete course with sections, lessons, and content

      // When: Querying from organization down to lesson content
      const { result, duration } = await measureQueryTime(async () => {
        return await supabase
          .from('organizations')
          .select(
            `
            id,
            name,
            tier,
            courses!inner (
              id,
              title,
              slug,
              status,
              settings,
              sections!inner (
                id,
                title,
                description,
                order_index,
                metadata,
                lessons!inner (
                  id,
                  title,
                  order_index,
                  lesson_type,
                  duration_minutes,
                  metadata,
                  lesson_content (
                    text_content,
                    media_urls,
                    quiz_data,
                    interactive_elements
                  )
                )
              )
            )
          `
          )
          .eq('id', testOrg.id)
          .eq('courses.id', testCourse.id)
          .order('order_index', { foreignTable: 'courses.sections' })
          .order('order_index', { foreignTable: 'courses.sections.lessons' })
          .single();
      });

      // Then: Should successfully retrieve all levels with proper relationships
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();

      // Verify organization level
      expect(result.data.id).toBe(testOrg.id);
      expect(result.data.name).toBe(testOrg.name);
      expect(result.data.tier).toBe('standard');

      // Verify course level
      expect(result.data.courses).toHaveLength(1);
      const course = result.data.courses[0];
      expect(course.title).toBe('Complete Test Course');
      expect(course.status).toBe('published');
      expect(course.settings).toEqual({
        max_retries: 3,
        passing_score: 80,
        allow_download: true,
      });

      // Verify sections level
      expect(course.sections).toHaveLength(3);
      course.sections.forEach((section: any, idx: number) => {
        expect(section.order_index).toBe(idx + 1);
        expect(section.metadata).toBeDefined();

        // Verify lessons level
        expect(section.lessons).toHaveLength(4);
        section.lessons.forEach((lesson: any, lessonIdx: number) => {
          expect(lesson.order_index).toBe(lessonIdx + 1);

          // Verify lesson content exists
          expect(lesson.lesson_content).toBeDefined();

          // Verify content based on lesson type
          if (lesson.lesson_type === 'video') {
            expect(lesson.lesson_content.media_urls).toBeDefined();
            expect(lesson.lesson_content.media_urls).toHaveLength(1);
          } else if (lesson.lesson_type === 'text') {
            expect(lesson.lesson_content.text_content).toContain('This is the text content');
          } else if (lesson.lesson_type === 'quiz') {
            expect(lesson.lesson_content.quiz_data).toBeDefined();
            expect(lesson.lesson_content.quiz_data.questions).toHaveLength(2);
          } else if (lesson.lesson_type === 'interactive') {
            expect(lesson.lesson_content.interactive_elements).toBeDefined();
            expect(lesson.lesson_content.interactive_elements.type).toBe('code_playground');
          }
        });
      });

      // Verify performance
      expect(duration).toBeLessThan(500); // Query should complete in < 500ms
    });

    it('should correctly filter hierarchy by course status', async () => {
      // When: Querying only published courses
      const { data, error } = await supabase
        .from('courses')
        .select(
          `
          id,
          title,
          status,
          sections (
            id,
            title,
            lessons (
              id,
              title,
              status
            )
          )
        `
        )
        .eq('organization_id', testOrg.id)
        .eq('status', 'published');

      // Then: Should return only published courses
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe('published');
    });
  });

  describe('Test 2: Lesson content is loaded separately', () => {
    it('should NOT include content fields when querying lessons table directly', async () => {
      // Given: Lesson with content
      const lessonId = testLessons[0].id;

      // When: Querying lessons table without joining
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .single();

      // Then: Should NOT include text_content, media_urls, quiz_data
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.text_content).toBeUndefined();
      expect(data.media_urls).toBeUndefined();
      expect(data.quiz_data).toBeUndefined();
      expect(data.interactive_elements).toBeUndefined();

      // Should include metadata fields
      expect(data.id).toBe(lessonId);
      expect(data.title).toBeDefined();
      expect(data.order_index).toBeDefined();
      expect(data.lesson_type).toBeDefined();
      expect(data.metadata).toBeDefined();
    });

    it('should include content fields when explicitly joining lesson_content', async () => {
      // Given: Lesson with content
      const lessonId = testLessons.find(l => l.lesson_type === 'quiz')?.id;

      // When: Explicitly joining lesson_content
      const { data, error } = await supabase
        .from('lessons')
        .select(
          `
          *,
          lesson_content (
            text_content,
            media_urls,
            quiz_data,
            interactive_elements,
            updated_at
          )
        `
        )
        .eq('id', lessonId)
        .single();

      // Then: Should include content fields
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.lesson_content).toBeDefined();
      expect(data.lesson_content.quiz_data).toBeDefined();
      expect(data.lesson_content.quiz_data.questions).toHaveLength(2);
    });

    it('should allow querying lesson_content directly by lesson_id', async () => {
      // Given: A text lesson
      const textLesson = testLessons.find(l => l.lesson_type === 'text');

      // When: Querying lesson_content table directly
      const { data, error } = await supabase
        .from('lesson_content')
        .select('*')
        .eq('lesson_id', textLesson.id)
        .single();

      // Then: Should return content
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.text_content).toContain('This is the text content');
      expect(data.lesson_id).toBe(textLesson.id);
    });
  });

  describe('Test 3: Order indices maintain correct sequence', () => {
    it('should return sections in correct order with no gaps or duplicates', async () => {
      // Given: Course with 3 sections (order 1, 2, 3)

      // When: Querying with ORDER BY order_index
      const { data, error } = await supabase
        .from('sections')
        .select('id, title, order_index')
        .eq('course_id', testCourse.id)
        .order('order_index', { ascending: true });

      // Then: Sections should return in correct order
      expect(error).toBeNull();
      expect(data).toHaveLength(3);

      // Verify order sequence
      expect(data![0].order_index).toBe(1);
      expect(data![1].order_index).toBe(2);
      expect(data![2].order_index).toBe(3);

      // Verify titles match expected order
      expect(data![0].title).toContain('Introduction');
      expect(data![1].title).toContain('Core Concepts');
      expect(data![2].title).toContain('Advanced Topics');

      // Verify no gaps in order_index
      const orderIndices = data!.map(s => s.order_index);
      for (let i = 1; i <= 3; i++) {
        expect(orderIndices).toContain(i);
      }

      // Verify no duplicates
      const uniqueIndices = new Set(orderIndices);
      expect(uniqueIndices.size).toBe(orderIndices.length);
    });

    it('should return lessons in correct order within each section', async () => {
      // Given: Multiple lessons per section

      // When: Querying lessons for each section
      for (const section of testSections) {
        const { data, error } = await supabase
          .from('lessons')
          .select('id, title, order_index, section_id')
          .eq('section_id', section.id)
          .order('order_index', { ascending: true });

        // Then: Lessons should be in correct order
        expect(error).toBeNull();
        expect(data).toHaveLength(4);

        // Verify sequential order
        data!.forEach((lesson, idx) => {
          expect(lesson.order_index).toBe(idx + 1);
        });

        // Verify no duplicates per section
        const orderIndices = data!.map(l => l.order_index);
        const uniqueIndices = new Set(orderIndices);
        expect(uniqueIndices.size).toBe(4);
      }
    });

    it('should handle reordering of sections correctly', async () => {
      // Given: Existing sections
      const sectionToMove = testSections[0];

      // When: Updating order_index to move section to end
      const { error: updateError } = await supabase
        .from('sections')
        .update({ order_index: 99 })
        .eq('id', sectionToMove.id);

      expect(updateError).toBeNull();

      // Query updated order
      const { data, error } = await supabase
        .from('sections')
        .select('id, order_index')
        .eq('course_id', testCourse.id)
        .order('order_index', { ascending: true });

      // Then: Section should be at the end
      expect(error).toBeNull();
      expect(data![2].id).toBe(sectionToMove.id);
      expect(data![2].order_index).toBe(99);

      // Restore original order
      await supabase.from('sections').update({ order_index: 1 }).eq('id', sectionToMove.id);
    });
  });

  describe('Test 4: Cascade deletes work through hierarchy', () => {
    it('should cascade delete from section to lessons and content', async () => {
      // Given: Create a new section with lessons for deletion testing
      const { data: deleteSection } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Section to Delete',
          order_index: 99,
        })
        .select()
        .single();

      const { data: deleteLesson } = await supabase
        .from('lessons')
        .insert({
          section_id: deleteSection!.id,
          title: 'Lesson to Delete',
          order_index: 1,
          lesson_type: 'text',
        })
        .select()
        .single();

      await supabase.from('lesson_content').insert({
        lesson_id: deleteLesson!.id,
        text_content: 'Content to be deleted',
      });

      // When: Delete section
      const { error: deleteError } = await supabase
        .from('sections')
        .delete()
        .eq('id', deleteSection!.id);

      expect(deleteError).toBeNull();

      // Then: Lessons and content should be deleted
      const { data: checkLesson } = await supabase
        .from('lessons')
        .select()
        .eq('id', deleteLesson!.id)
        .single();

      const { data: checkContent } = await supabase
        .from('lesson_content')
        .select()
        .eq('lesson_id', deleteLesson!.id)
        .single();

      expect(checkLesson).toBeNull();
      expect(checkContent).toBeNull();

      // Other sections should remain
      const { data: remainingSections } = await supabase
        .from('sections')
        .select()
        .eq('course_id', testCourse.id);

      expect(remainingSections).toHaveLength(3);
    });

    it('should cascade delete from lesson to content only', async () => {
      // Given: Create a test lesson with content
      const { data: tempSection } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Temp Section',
          order_index: 100,
        })
        .select()
        .single();

      const { data: tempLesson } = await supabase
        .from('lessons')
        .insert({
          section_id: tempSection!.id,
          title: 'Temp Lesson',
          order_index: 1,
          lesson_type: 'video',
        })
        .select()
        .single();

      await supabase.from('lesson_content').insert({
        lesson_id: tempLesson!.id,
        media_urls: ['https://example.com/temp.mp4'],
      });

      // When: Delete only the lesson
      const { error: deleteError } = await supabase
        .from('lessons')
        .delete()
        .eq('id', tempLesson!.id);

      expect(deleteError).toBeNull();

      // Then: Content should be deleted but section remains
      const { data: checkContent } = await supabase
        .from('lesson_content')
        .select()
        .eq('lesson_id', tempLesson!.id)
        .single();

      const { data: checkSection } = await supabase
        .from('sections')
        .select()
        .eq('id', tempSection!.id)
        .single();

      expect(checkContent).toBeNull();
      expect(checkSection).toBeDefined();
      expect(checkSection!.id).toBe(tempSection!.id);

      // Cleanup
      await supabase.from('sections').delete().eq('id', tempSection!.id);
    });
  });

  describe('Test 5: JSONB fields work correctly', () => {
    it('should properly store and retrieve course settings JSONB', async () => {
      // Given: Course with complex settings
      const complexSettings = {
        max_retries: 5,
        passing_score: 85,
        allow_download: false,
        features: {
          certificates: true,
          discussion_forum: true,
          live_sessions: false,
        },
        prerequisites: ['course-101', 'course-102'],
        custom_branding: {
          primary_color: '#007bff',
          logo_url: 'https://example.com/logo.png',
        },
      };

      // When: Creating course with complex settings
      const { data: newCourse, error: createError } = await supabase
        .from('courses')
        .insert({
          title: 'Course with Complex Settings',
          slug: uniqueName('complex-settings'),
          user_id: testInstructor.id,
          organization_id: testOrg.id,
          settings: complexSettings,
        })
        .select()
        .single();

      expect(createError).toBeNull();

      // Then: Settings should be retrieved correctly
      expect(newCourse!.settings).toEqual(complexSettings);

      // Verify querying JSONB fields
      const { data: queryResult } = await supabase
        .from('courses')
        .select('settings')
        .eq('id', newCourse!.id)
        .single();

      expect(queryResult!.settings.features.certificates).toBe(true);
      expect(queryResult!.settings.prerequisites).toHaveLength(2);

      // Cleanup
      await supabase.from('courses').delete().eq('id', newCourse!.id);
    });

    it('should properly store and retrieve section metadata JSONB', async () => {
      // Given: Section metadata
      const sectionId = testSections[0].id;

      // When: Updating section metadata
      const updatedMetadata = {
        difficulty: 'intermediate',
        estimated_hours: 4,
        learning_objectives: [
          'Understand core concepts',
          'Apply best practices',
          'Build real projects',
        ],
        resources: {
          downloads: ['slides.pdf', 'exercises.zip'],
          external_links: ['https://docs.example.com'],
        },
      };

      const { error: updateError } = await supabase
        .from('sections')
        .update({ metadata: updatedMetadata })
        .eq('id', sectionId);

      expect(updateError).toBeNull();

      // Then: Metadata should be retrieved correctly
      const { data, error } = await supabase
        .from('sections')
        .select('metadata')
        .eq('id', sectionId)
        .single();

      expect(error).toBeNull();
      expect(data!.metadata).toEqual(updatedMetadata);
      expect(data!.metadata.learning_objectives).toHaveLength(3);
    });

    it('should properly store and retrieve enrollment progress JSONB', async () => {
      // Given: Create enrollment with progress tracking
      const { data: student } = await supabase
        .from('users')
        .insert({
          id: randomUUID(), // Must provide ID since auth.uid() requires authenticated context
          email: `student_${randomUUID()}@test.com`,
          organization_id: testOrg.id,
          role: 'student',
        })
        .select()
        .single();

      const progressData = {
        last_accessed: new Date().toISOString(),
        lessons_completed: [testLessons[0].id, testLessons[1].id],
        quiz_scores: {
          [testLessons[2].id]: {
            score: 85,
            attempts: 2,
            passed: true,
            completed_at: new Date().toISOString(),
          },
        },
        bookmarks: [
          {
            lesson_id: testLessons[3].id,
            timestamp: 125,
            note: 'Review this concept',
          },
        ],
        completion_percentage: 25,
      };

      // When: Creating enrollment with progress
      const { data: enrollment, error: enrollError } = await supabase
        .from('course_enrollments')
        .insert({
          user_id: student!.id,
          course_id: testCourse.id,
          progress: progressData,
        })
        .select()
        .single();

      expect(enrollError).toBeNull();

      // Then: Progress should be stored and retrieved correctly
      expect(enrollment!.progress).toEqual(progressData);
      expect(enrollment!.progress.lessons_completed).toHaveLength(2);
      expect(enrollment!.progress.quiz_scores[testLessons[2].id].score).toBe(85);

      // Cleanup
      await supabase.from('course_enrollments').delete().eq('id', enrollment!.id);
      await supabase.from('users').delete().eq('id', student!.id);
    });

    it('should handle complex quiz_data JSONB in lesson_content', async () => {
      // Given: Complex quiz data structure
      const complexQuizData = {
        questions: [
          {
            id: 'q1',
            type: 'multiple_choice',
            question: 'What is the capital of France?',
            options: ['London', 'Berlin', 'Paris', 'Madrid'],
            correct_answer: 'Paris',
            points: 10,
            explanation: 'Paris is the capital and largest city of France.',
            tags: ['geography', 'europe', 'capitals'],
          },
          {
            id: 'q2',
            type: 'multiple_select',
            question: 'Select all programming languages',
            options: ['Python', 'HTML', 'JavaScript', 'CSS', 'Ruby'],
            correct_answers: ['Python', 'JavaScript', 'Ruby'],
            points: 20,
            partial_credit: true,
          },
          {
            id: 'q3',
            type: 'short_answer',
            question: 'What does API stand for?',
            acceptable_answers: [
              'Application Programming Interface',
              'application programming interface',
              'API',
            ],
            points: 15,
            case_sensitive: false,
          },
        ],
        passing_score: 75,
        time_limit_minutes: 30,
        randomize_questions: true,
        show_results_immediately: false,
        allow_review: true,
      };

      // When: Creating a new quiz lesson with complex data
      const { data: quizSection } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Quiz Section',
          order_index: 101,
        })
        .select()
        .single();

      const { data: quizLesson } = await supabase
        .from('lessons')
        .insert({
          section_id: quizSection!.id,
          title: 'Complex Quiz',
          order_index: 1,
          lesson_type: 'quiz',
        })
        .select()
        .single();

      const { error: contentError } = await supabase.from('lesson_content').insert({
        lesson_id: quizLesson!.id,
        quiz_data: complexQuizData,
      });

      expect(contentError).toBeNull();

      // Then: Complex quiz data should be retrieved correctly
      const { data, error } = await supabase
        .from('lesson_content')
        .select('quiz_data')
        .eq('lesson_id', quizLesson!.id)
        .single();

      expect(error).toBeNull();
      expect(data!.quiz_data).toEqual(complexQuizData);
      expect(data!.quiz_data.questions).toHaveLength(3);
      expect(data!.quiz_data.questions[1].correct_answers).toHaveLength(3);

      // Cleanup
      await supabase.from('sections').delete().eq('id', quizSection!.id);
    });
  });

  describe('Test 6: Timestamps are automatically managed', () => {
    it('should set created_at on insert for all tables', async () => {
      // Given: Current time before insert
      const beforeInsert = new Date();

      // When: Creating new records
      const { data: newSection } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Timestamp Test Section',
          order_index: 102,
        })
        .select()
        .single();

      const { data: newLesson } = await supabase
        .from('lessons')
        .insert({
          section_id: newSection!.id,
          title: 'Timestamp Test Lesson',
          order_index: 1,
          lesson_type: 'text',
        })
        .select()
        .single();

      // Then: created_at should be set automatically
      const sectionCreatedAt = new Date(newSection!.created_at);
      const lessonCreatedAt = new Date(newLesson!.created_at);

      expect(sectionCreatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
      expect(lessonCreatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());

      // Verify timestamps are recent (within last 5 seconds)
      const now = new Date();
      expect(now.getTime() - sectionCreatedAt.getTime()).toBeLessThan(5000);
      expect(now.getTime() - lessonCreatedAt.getTime()).toBeLessThan(5000);

      // Cleanup
      await supabase.from('sections').delete().eq('id', newSection!.id);
    });

    it('should update updated_at on modifications via triggers', async () => {
      // Given: Get current updated_at for organization
      const { data: orgBefore } = await supabase
        .from('organizations')
        .select('updated_at')
        .eq('id', testOrg.id)
        .single();

      const updatedAtBefore = new Date(orgBefore!.updated_at);

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // When: Updating the organization
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ name: uniqueName('updated_org') })
        .eq('id', testOrg.id);

      expect(updateError).toBeNull();

      // Then: updated_at should be newer
      const { data: orgAfter } = await supabase
        .from('organizations')
        .select('updated_at')
        .eq('id', testOrg.id)
        .single();

      const updatedAtAfter = new Date(orgAfter!.updated_at);

      expect(updatedAtAfter.getTime()).toBeGreaterThan(updatedAtBefore.getTime());

      // Verify the update is recent
      const now = new Date();
      expect(now.getTime() - updatedAtAfter.getTime()).toBeLessThan(5000);
    });

    it('should track lesson_content updated_at separately', async () => {
      // Given: A lesson with content
      const textLesson = testLessons.find(l => l.lesson_type === 'text');

      // Get current updated_at
      const { data: contentBefore } = await supabase
        .from('lesson_content')
        .select('updated_at')
        .eq('lesson_id', textLesson!.id)
        .single();

      const updatedAtBefore = new Date(contentBefore!.updated_at);

      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // When: Updating lesson content
      const { error: updateError } = await supabase
        .from('lesson_content')
        .update({
          text_content: 'Updated content with new information',
          updated_at: new Date().toISOString(),
        })
        .eq('lesson_id', textLesson!.id);

      expect(updateError).toBeNull();

      // Then: updated_at should be newer
      const { data: contentAfter } = await supabase
        .from('lesson_content')
        .select('updated_at')
        .eq('lesson_id', textLesson!.id)
        .single();

      const updatedAtAfter = new Date(contentAfter!.updated_at);

      expect(updatedAtAfter.getTime()).toBeGreaterThan(updatedAtBefore.getTime());
    });
  });

  describe('Edge Cases and Additional Validations', () => {
    it('should handle empty sections (sections without lessons)', async () => {
      // Given: Create an empty section
      const { data: emptySection, error: sectionError } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Empty Section',
          description: 'This section has no lessons yet',
          order_index: 103,
        })
        .select()
        .single();

      expect(sectionError).toBeNull();

      // When: Querying course with empty section
      const { data, error } = await supabase
        .from('sections')
        .select(
          `
          *,
          lessons (*)
        `
        )
        .eq('id', emptySection!.id)
        .single();

      // Then: Should return section with empty lessons array
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.title).toBe('Empty Section');
      expect(data!.lessons).toEqual([]);

      // Cleanup
      await supabase.from('sections').delete().eq('id', emptySection!.id);
    });

    it('should handle lessons without content', async () => {
      // Given: Create a lesson without content
      const { data: tempSection } = await supabase
        .from('sections')
        .insert({
          course_id: testCourse.id,
          title: 'Temp Section for No Content',
          order_index: 104,
        })
        .select()
        .single();

      const { data: lessonNoContent, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          section_id: tempSection!.id,
          title: 'Lesson Without Content',
          order_index: 1,
          lesson_type: 'text',
          status: 'draft',
        })
        .select()
        .single();

      expect(lessonError).toBeNull();

      // When: Querying lesson with its content
      const { data, error } = await supabase
        .from('lessons')
        .select(
          `
          *,
          lesson_content (*)
        `
        )
        .eq('id', lessonNoContent!.id)
        .single();

      // Then: Should return lesson with null content
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.title).toBe('Lesson Without Content');
      expect(data!.lesson_content).toBeNull();

      // Cleanup
      await supabase.from('sections').delete().eq('id', tempSection!.id);
    });

    it('should enforce referential integrity when creating lessons', async () => {
      // Given: A non-existent section ID
      const fakeSectionId = randomUUID();

      // When: Attempting to create a lesson with invalid section_id
      const { error } = await supabase.from('lessons').insert({
        section_id: fakeSectionId,
        title: 'Orphan Lesson',
        order_index: 1,
        lesson_type: 'text',
      });

      // Then: Should fail with foreign key violation
      expect(error).toBeDefined();
      expect(error!.message).toContain('violates foreign key constraint');
    });

    it('should handle complex hierarchy queries with filtering', async () => {
      // When: Querying with multiple filters
      const { data, error } = await supabase
        .from('courses')
        .select(
          `
          id,
          title,
          status,
          sections!inner (
            id,
            title,
            metadata,
            lessons!inner (
              id,
              title,
              lesson_type,
              status
            )
          )
        `
        )
        .eq('organization_id', testOrg.id)
        .eq('status', 'published')
        .eq('sections.lessons.status', 'published')
        .in('sections.lessons.lesson_type', ['video', 'quiz']);

      // Then: Should return filtered results
      expect(error).toBeNull();
      expect(data).toBeDefined();

      // Verify filtering worked
      if (data && data.length > 0) {
        data[0].sections.forEach((section: any) => {
          section.lessons.forEach((lesson: any) => {
            expect(['video', 'quiz']).toContain(lesson.lesson_type);
            expect(lesson.status).toBe('published');
          });
        });
      }
    });

    it('should support pagination for large course structures', async () => {
      // When: Querying lessons with pagination for this test course only
      const pageSize = 5;

      // Get section IDs for this course to filter lessons
      const sectionIds = testSections.map(s => s.id);

      const { data: page1, error: error1 } = await supabase
        .from('lessons')
        .select('id, title, order_index, section_id')
        .in('section_id', sectionIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }) // Secondary sort for stable ordering
        .range(0, pageSize - 1);

      const { data: page2, error: error2 } = await supabase
        .from('lessons')
        .select('id, title, order_index, section_id')
        .in('section_id', sectionIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }) // Secondary sort for stable ordering
        .range(pageSize, pageSize * 2 - 1);

      // Then: Should return different pages
      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(page1).toHaveLength(pageSize);
      expect(page2).toHaveLength(pageSize);

      // Verify pages contain different lessons
      const page1Ids = page1!.map(l => l.id);
      const page2Ids = page2!.map(l => l.id);
      const intersection = page1Ids.filter(id => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });
  });
});
