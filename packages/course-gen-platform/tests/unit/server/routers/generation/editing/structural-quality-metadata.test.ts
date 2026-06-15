import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseStructure, Section } from '@megacampus/shared-types';

const { mockThrowOnSupabaseError } = vi.hoisted(() => ({
  mockThrowOnSupabaseError: vi.fn(),
}));

vi.mock('@/server/utils/supabase-query-guard', () => ({
  throwOnSupabaseError: vi.fn((...args) => mockThrowOnSupabaseError(...args)),
}));

import { buildStage5StructuralQualityMetadataUpdate } from '@/server/routers/generation/editing/structural-quality-metadata';

function makeSection(sectionNumber: number, lessonCount: number): Section {
  return {
    section_number: sectionNumber,
    section_title: `Leadership Practice Section ${sectionNumber}`,
    section_description:
      'Focused role practice for senior leaders with measurable operational outcomes.',
    learning_objectives: ['Apply senior role practices in realistic business scenarios'],
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      lesson_number: index + 1,
      lesson_title: `Senior leadership workflow ${sectionNumber}.${index + 1}`,
      lesson_objectives: ['Apply one focused senior leadership behavior'],
      key_topics: ['role workflow', 'decision quality'],
      estimated_duration_minutes: 15,
      difficulty_level: 'intermediate' as const,
    })),
    estimated_duration_minutes: lessonCount * 15,
  };
}

function makeValidRoleBridgeStructure(): CourseStructure {
  return {
    course_title: 'Head of Enterprise Sales Practical Role Course',
    course_description:
      'A compact applied course for turning a senior sales role guide into repeatable management practice.',
    target_audience: 'Senior sales leaders and heads of enterprise sales',
    estimated_duration_hours: 5,
    difficulty_level: 'advanced',
    prerequisites: ['Experience managing enterprise sales teams and commercial targets'],
    learning_outcomes: [
      'Prioritize senior role decisions using measurable sales leadership criteria',
      'Apply operating rituals that improve forecasting and team execution',
      'Evaluate role performance using practical enterprise sales metrics',
    ],
    course_tags: ['sales', 'leadership', 'enterprise', 'management', 'role practice'],
    sections: Array.from({ length: 5 }, (_, index) => makeSection(index + 1, 4)),
  };
}

describe('buildStage5StructuralQualityMetadataUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThrowOnSupabaseError.mockReturnValue(undefined);
  });

  it('recomputes structural quality metadata after Stage 5 edits and clears stale blockers', async () => {
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
                  id: '33333333-3333-4333-8333-333333333333',
                  user_id: '11111111-1111-4111-8111-111111111111',
                  organization_id: '22222222-2222-4222-8222-222222222222',
                  title: 'Head of Enterprise Sales',
                  settings: {
                    source: 'career_playbook',
                    bridgeVersion: 1,
                    lesson_duration_minutes: 15,
                  },
                  language: 'ru',
                  style: 'professional',
                  target_audience: 'Senior sales leaders',
                  difficulty: 'advanced',
                  course_description: 'Role bridge course',
                  course_size: 'auto',
                  analysis_result: {
                    topic_analysis: {
                      determined_topic: 'Head of Enterprise Sales',
                    },
                  },
                  generation_metadata: {
                    quality_scores: {
                      metadata_similarity: 0.91,
                      structure: {
                        passed: false,
                        hasCriticalIssues: true,
                        profileId: 'role_playbook_bridge',
                        totalLessons: 50,
                        computedDurationHours: 12.5,
                        criticalIssues: [
                          {
                            severity: 'critical',
                            code: 'hard_max_lessons_exceeded',
                            message: 'stale blocker',
                          },
                        ],
                        warnings: [],
                      },
                    },
                  },
                },
                error: null,
              }),
            })),
          })),
        };
      }),
    };

    const metadata = (await buildStage5StructuralQualityMetadataUpdate(
      supabase as never,
      '33333333-3333-4333-8333-333333333333',
      makeValidRoleBridgeStructure(),
      'req-123'
    )) as Record<string, unknown>;
    const qualityScores = metadata.quality_scores as Record<string, unknown>;

    expect(qualityScores.metadata_similarity).toBe(0.91);
    expect(qualityScores.structure).toEqual(
      expect.objectContaining({
        passed: true,
        hasCriticalIssues: false,
        profileId: 'role_playbook_bridge',
        totalLessons: 20,
        computedDurationHours: 5,
        criticalIssues: [],
      })
    );
  });
});
