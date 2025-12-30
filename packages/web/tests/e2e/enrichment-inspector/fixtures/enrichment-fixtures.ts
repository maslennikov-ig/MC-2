/**
 * Test fixtures for Enrichment Inspector E2E tests
 *
 * Provides mock data and helper functions for consistent testing
 * of the Stage 7 Enrichment Inspector functionality.
 *
 * @module e2e/enrichment-inspector/fixtures/enrichment-fixtures
 */

import type { EnrichmentType, EnrichmentStatus } from '@megacampus/shared-types';

/**
 * Mock enrichment data structure
 */
export interface MockEnrichment {
  id: string;
  type: EnrichmentType;
  status: EnrichmentStatus;
  display_order: number;
  error_message?: string | null;
  progress?: number;
}

/**
 * Mock lesson data structure
 */
export interface MockLesson {
  id: string;
  title: string;
  enrichments: MockEnrichment[];
}

/**
 * Mock course data structure
 */
export interface MockCourse {
  slug: string;
  lessons: MockLesson[];
}

/**
 * Test course data for E2E tests
 */
export const TEST_COURSES: Record<string, MockCourse> = {
  'test-course': {
    slug: 'test-course',
    lessons: [
      {
        id: 'lesson-1',
        title: 'Empty Lesson',
        enrichments: [],
      },
      {
        id: 'lesson-with-enrichments',
        title: 'Lesson with Enrichments',
        enrichments: [
          { id: 'e1', type: 'quiz', status: 'completed', display_order: 1 },
          { id: 'e2', type: 'video', status: 'pending', display_order: 2 },
          { id: 'e3', type: 'audio', status: 'generating', display_order: 3 },
        ],
      },
      {
        id: 'lesson-generating',
        title: 'Generating Lesson',
        enrichments: [
          { id: 'e4', type: 'presentation', status: 'generating', display_order: 1, progress: 45 },
        ],
      },
      {
        id: 'lesson-with-failed-enrichment',
        title: 'Failed Lesson',
        enrichments: [
          {
            id: 'e5',
            type: 'quiz',
            status: 'failed',
            display_order: 1,
            error_message: 'Generation failed due to insufficient content',
          },
        ],
      },
      {
        id: 'lesson-multiple-enrichments',
        title: 'Multiple Enrichments Lesson',
        enrichments: [
          { id: 'e6', type: 'quiz', status: 'completed', display_order: 1 },
          { id: 'e7', type: 'video', status: 'completed', display_order: 2 },
          { id: 'e8', type: 'audio', status: 'completed', display_order: 3 },
          { id: 'e9', type: 'presentation', status: 'completed', display_order: 4 },
        ],
      },
      {
        id: 'lesson-draft-ready',
        title: 'Draft Ready Lesson',
        enrichments: [
          { id: 'e10', type: 'quiz', status: 'draft_ready', display_order: 1 },
        ],
      },
    ],
  },
};

/**
 * Get a mock lesson by ID
 */
export function getMockLesson(courseSlug: string, lessonId: string): MockLesson | undefined {
  const course = TEST_COURSES[courseSlug];
  if (!course) return undefined;
  return course.lessons.find((l) => l.id === lessonId);
}

/**
 * Get enrichments for a lesson
 */
export function getMockEnrichments(courseSlug: string, lessonId: string): MockEnrichment[] {
  const lesson = getMockLesson(courseSlug, lessonId);
  return lesson?.enrichments ?? [];
}

/**
 * Test user credentials
 */
export const TEST_USER = {
  id: process.env.TEST_USER_ID || '5a6f0557-613f-45bc-b591-059ffc7c7960',
  email: process.env.TEST_USER_EMAIL || 'tester@megacampus.ai',
};

/**
 * Expected UI texts for English locale
 */
export const EN_TEXTS = {
  // Inspector views
  enrichments: 'Enrichments',
  create: 'Create',
  details: 'Details',

  // Empty state
  noEnrichments: 'No enrichments',
  emptyDescription: 'Add video, quiz, audio, or presentation to this lesson',

  // Types
  video: 'Video',
  quiz: 'Quiz',
  audio: 'Audio',
  presentation: 'Presentation',

  // Statuses
  pending: 'Pending',
  generating: 'Generating',
  completed: 'Completed',
  failed: 'Failed',
  draftReady: 'Draft Ready',

  // Actions
  cancel: 'Cancel',
  createButton: 'Create',
  retry: 'Try Again',
  back: 'Back',

  // Form labels
  questionCount: 'Question Count',
  difficulty: 'Difficulty',
  voice: 'Voice',
  speed: 'Speed',

  // Drag handle
  dragToReorder: 'Drag to reorder',

  // Error
  error: 'An error occurred',
  generationError: 'Generation Error',
};

/**
 * Expected UI texts for Russian locale
 */
export const RU_TEXTS = {
  // Inspector views
  enrichments: 'Обогащения',
  create: 'Создание',
  details: 'Детали',

  // Empty state
  noEnrichments: 'Нет обогащений',
  emptyDescription: 'Добавьте видео, тест, аудио или презентацию к уроку',

  // Types
  video: 'Видео',
  quiz: 'Тест',
  audio: 'Аудио',
  presentation: 'Презентация',

  // Statuses
  pending: 'В очереди',
  generating: 'Генерация',
  completed: 'Готово',
  failed: 'Ошибка',
  draftReady: 'Черновик готов',

  // Actions
  cancel: 'Отмена',
  createButton: 'Создать',
  retry: 'Попробовать снова',
  back: 'Назад',

  // Form labels
  questionCount: 'Количество вопросов',
  difficulty: 'Сложность',
  voice: 'Голос',
  speed: 'Скорость',

  // Drag handle
  dragToReorder: 'Перетащите для сортировки',

  // Error
  error: 'Произошла ошибка',
  generationError: 'Ошибка генерации',
};

/**
 * Get texts for specific locale
 */
export function getTextsForLocale(locale: 'en' | 'ru') {
  return locale === 'ru' ? RU_TEXTS : EN_TEXTS;
}

/**
 * API mock helper - intercept enrichment API calls
 */
export async function mockEnrichmentApi(page: import('@playwright/test').Page, lessonId: string) {
  const lesson = getMockLesson('test-course', lessonId);
  const enrichments = lesson?.enrichments ?? [];

  await page.route('**/api/trpc/enrichment.list*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: enrichments,
        },
      }),
    });
  });

  await page.route('**/api/trpc/enrichment.create*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: {
            id: `e-new-${Date.now()}`,
            status: 'pending',
          },
        },
      }),
    });
  });

  await page.route('**/api/trpc/enrichment.reorder*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: { success: true },
        },
      }),
    });
  });
}

/**
 * API mock helper - simulate generation progress
 */
export async function mockGenerationProgress(
  page: import('@playwright/test').Page,
  enrichmentId: string,
  progressSteps: number[]
) {
  let currentStep = 0;

  await page.route(`**/api/trpc/enrichment.progress*${enrichmentId}*`, async (route) => {
    const progress = progressSteps[currentStep] ?? 100;
    currentStep++;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          data: {
            progress,
            status: progress >= 100 ? 'completed' : 'generating',
            logs: [`Step ${currentStep} completed`],
          },
        },
      }),
    });
  });
}

/**
 * API mock helper - simulate API error
 */
export async function mockApiError(page: import('@playwright/test').Page, pattern: string, errorMessage: string) {
  await page.route(pattern, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          message: errorMessage,
        },
      }),
    });
  });
}

/**
 * Wait helper for animations
 */
export async function waitForAnimation(page: import('@playwright/test').Page, ms: number = 500) {
  await page.waitForTimeout(ms);
}

/**
 * Screenshot helper for debugging
 */
export async function takeDebugScreenshot(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string
) {
  if (testInfo.status !== 'passed') {
    await page.screenshot({ path: `screenshots/${testInfo.title}-${name}.png` });
  }
}
