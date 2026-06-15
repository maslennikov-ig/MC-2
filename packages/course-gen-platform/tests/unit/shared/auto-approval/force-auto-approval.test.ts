import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/supabase/admin');
vi.mock('@/orchestrator/queue');
vi.mock('@/shared/logger/index.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@/shared/sentry/init.js', () => ({
  captureError: vi.fn(),
}));

import { handleStageCompletion } from '@/shared/auto-approval';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { addJob } from '@/orchestrator/queue';

describe('handleStageCompletion force auto-approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bypasses semi-automatic approval for single-document Stage 3 auto-core flow', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'course_123' }], error: null })),
        })),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'courses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      generation_mode: 'semi_automatic',
                      generation_status: 'stage_3_summarizing',
                      user_id: 'user_123',
                      organization_id: 'org_123',
                      title: 'Single Source Course',
                      settings: {
                        topic: 'Single Source Course',
                        lesson_duration_minutes: 30,
                      },
                      language: 'ru',
                      style: 'professional',
                      target_audience: 'managers',
                      difficulty: 'intermediate',
                      course_description: 'Course from one source',
                      course_size: 'auto',
                      analysis_result: null,
                      organization: { tier: 'standard' },
                    },
                    error: null,
                  })
                ),
              })),
            })),
            update,
          };
        }

        if (table === 'file_catalog') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'doc_1',
                        filename: 'career-playbook.md',
                        processed_content: 'Role guide content',
                        processing_method: 'full_text',
                        summary_metadata: {},
                      },
                    ],
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);
    vi.mocked(addJob).mockResolvedValue({ id: 'job_123' } as never);

    const result = await handleStageCompletion('course_123', 3, undefined, {
      forceAutoApprove: true,
      forceReason: 'single_document_auto_core',
    });

    expect(result).toEqual({ autoApproved: true, nextStage: 4 });
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ generation_status: 'stage_3_awaiting_approval' })
    );
    expect(addJob).toHaveBeenCalledWith(
      'structure_analysis',
      expect.objectContaining({
        jobType: 'structure_analysis',
        courseId: 'course_123',
        organizationId: 'org_123',
      }),
      expect.objectContaining({ jobId: 'auto-course_123-stage4', priority: 5 })
    );
  });
});
