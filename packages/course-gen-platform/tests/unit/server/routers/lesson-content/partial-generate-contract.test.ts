import { describe, expect, it } from 'vitest';
import { partialGenerateInputSchema } from '@/server/routers/lesson-content/schemas';
import { buildPartialGenerateJobData } from '@/server/routers/lesson-content/helpers/build-partial-generate-job-data';

const lessonSpec = {
  lesson_id: '1.1',
  title: 'Test Lesson',
  sections: [
    {
      id: 'sec-1',
      title: 'Overview',
      learning_objectives: ['Objective 1'],
      content_guidelines: 'Keep it practical.',
    },
  ],
  lesson_context: {},
  depth: 'standard',
  difficulty: 'intermediate',
  learning_objectives: ['Objective 1'],
} as const;

describe('partialGenerate contract', () => {
  it('keeps backward compatibility when manualTopRegeneration is omitted', () => {
    const parsed = partialGenerateInputSchema.parse({
      courseId: '11111111-1111-4111-8111-111111111111',
      lessonIds: ['1.1'],
      priority: 8,
    });

    expect(parsed.manualTopRegeneration).toBeUndefined();

    const jobData = buildPartialGenerateJobData({
      spec: lessonSpec,
      courseId: parsed.courseId,
      language: 'en',
      skipCompletionCheck: true,
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(jobData.executionPolicy).toBeUndefined();
  });

  it('marks user-triggered manual retries as manual_top_regeneration', () => {
    const jobData = buildPartialGenerateJobData({
      spec: lessonSpec,
      courseId: '11111111-1111-4111-8111-111111111111',
      language: 'en',
      skipCompletionCheck: true,
      organizationId: 'org-1',
      userId: 'user-1',
      manualTopRegeneration: true,
    });

    expect(jobData.executionPolicy).toEqual({
      mode: 'manual_top_regeneration',
    });
  });
});
