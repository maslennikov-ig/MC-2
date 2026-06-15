import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertCourseRagReadyWithRetry, mockLogger, mockThrowOnSupabaseError } = vi.hoisted(
  () => ({
    mockAssertCourseRagReadyWithRetry: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    mockThrowOnSupabaseError: vi.fn(),
  })
);

vi.mock('@/shared/rag/required-rag-retry', () => ({
  assertCourseRagReadyWithRetry: vi.fn((...args) => mockAssertCourseRagReadyWithRetry(...args)),
}));

vi.mock('@/shared/notifications', () => ({
  notifyCourseError: vi.fn(),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

vi.mock('@/server/utils/supabase-query-guard', () => ({
  throwOnSupabaseError: vi.fn((...args) => mockThrowOnSupabaseError(...args)),
}));

import { buildStage5JobInput } from '@/server/routers/generation/_shared/helpers';

describe('buildStage5JobInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThrowOnSupabaseError.mockReturnValue(undefined);
    mockAssertCourseRagReadyWithRetry.mockResolvedValue({
      availability: 'optional_no_documents',
    });
  });

  it('preserves course_size and settings for Stage 5 profile resolution on restart/full regenerate', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'courses') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  title: 'Head of Enterprise Sales',
                  settings: {
                    source: 'career_playbook',
                    bridgeVersion: 1,
                    desired_lessons_count: 22,
                    desired_modules_count: 6,
                    lesson_duration_minutes: 15,
                  },
                  language: 'ru',
                  style: 'professional',
                  target_audience: 'sales leadership',
                  difficulty: 'advanced',
                  course_size: 'auto',
                  analysis_result: { summary: 'analysis' },
                  organization_id: '22222222-2222-4222-8222-222222222222',
                },
                error: null,
              }),
            })),
          })),
        };
      }),
    };

    const { jobInput } = await buildStage5JobInput(
      supabase as never,
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
      'req-123'
    );

    expect(jobInput).toEqual(
      expect.objectContaining({
        frontend_parameters: expect.objectContaining({
          course_size: 'auto',
          desired_lessons_count: 22,
          desired_modules_count: 6,
          lesson_duration_minutes: 15,
          settings: expect.objectContaining({
            source: 'career_playbook',
            bridgeVersion: 1,
          }),
        }),
      })
    );
  });
});
