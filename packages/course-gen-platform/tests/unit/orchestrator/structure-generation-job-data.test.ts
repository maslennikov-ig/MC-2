/**
 * StructureGenerationJobData contract tests
 * @module tests/unit/orchestrator/structure-generation-job-data.test
 *
 * StructureGenerationJobDataSchema used to be hand-written and described a
 * payload nobody sent: it required `analysisId` and offered `preferences`,
 * while the two producers (generate.router.ts and auto-approval/helpers.ts)
 * enqueue a GenerationJobInput and the Stage 5 worker reads that. The schema is
 * now derived from GenerationJobInputSchema. These tests pin the derivation, so
 * a future hand-edit that reintroduces drift fails here, and they pin the
 * envelope that buildStructureGenerationJobData attaches at enqueue time.
 */

import { describe, it, expect } from 'vitest';
import {
  buildStructureGenerationJobData,
  StructureGenerationJobDataSchema,
  JobType,
  type GenerationJobInput,
  type StructureGenerationJobData,
} from '@megacampus/shared-types';
import { GenerationJobInputSchema } from '@megacampus/shared-types/generation-job';

/** The payload every Stage 5 producer builds, title-only variant. */
const QUEUED_PAYLOAD: GenerationJobInput = {
  course_id: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
  organization_id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  analysis_result: null,
  frontend_parameters: {
    course_title: 'Основы машинного обучения',
    language: 'ru',
    difficulty: 'intermediate',
  },
  vectorized_documents: false,
  document_summaries: [],
};

/** camelCase envelope keys that BaseJobDataSchema contributes. */
const ENVELOPE_KEYS = ['organizationId', 'courseId', 'userId', 'jobType', 'createdAt', 'locale'];

/** The envelope BaseJobDataSchema requires. See the "known gap" block below. */
const ENVELOPE = {
  jobType: JobType.STRUCTURE_GENERATION,
  organizationId: QUEUED_PAYLOAD.organization_id,
  courseId: QUEUED_PAYLOAD.course_id,
  userId: QUEUED_PAYLOAD.user_id,
  createdAt: '2026-09-05T10:00:00.000Z',
  locale: 'ru' as const,
};

describe('StructureGenerationJobDataSchema', () => {
  describe('derivation from GenerationJobInputSchema', () => {
    it('carries every GenerationJobInput field', () => {
      const inputKeys = Object.keys(GenerationJobInputSchema.shape).sort();
      const jobKeys = Object.keys(StructureGenerationJobDataSchema.shape);

      for (const key of inputKeys) {
        expect(jobKeys).toContain(key);
      }
    });

    it('adds nothing beyond the GenerationJobInput fields and the BullMQ envelope', () => {
      const inputKeys = new Set(Object.keys(GenerationJobInputSchema.shape));
      const envelope = new Set(ENVELOPE_KEYS);
      const unexpected = Object.keys(StructureGenerationJobDataSchema.shape).filter(
        key => !inputKeys.has(key) && !envelope.has(key)
      );

      expect(unexpected).toEqual([]);
    });

    it('no longer declares the fields no producer ever sent', () => {
      const jobKeys = Object.keys(StructureGenerationJobDataSchema.shape);

      expect(jobKeys).not.toContain('analysisId');
      expect(jobKeys).not.toContain('preferences');
    });
  });

  describe('the payload half', () => {
    it('parses the producer payload once the BullMQ envelope is attached', () => {
      const result = StructureGenerationJobDataSchema.safeParse({
        ...QUEUED_PAYLOAD,
        ...ENVELOPE,
      });

      expect(result.success).toBe(true);
    });

    it('agrees with GenerationJobInputSchema field for field', () => {
      const asJobData = StructureGenerationJobDataSchema.parse({
        ...QUEUED_PAYLOAD,
        ...ENVELOPE,
      });
      const asGenerationInput = GenerationJobInputSchema.parse(QUEUED_PAYLOAD);

      for (const key of Object.keys(GenerationJobInputSchema.shape)) {
        expect(asJobData[key as keyof StructureGenerationJobData]).toEqual(
          asGenerationInput[key as keyof typeof asGenerationInput]
        );
      }
    });

    it('rejects a jobType belonging to a different job', () => {
      const result = StructureGenerationJobDataSchema.safeParse({
        ...QUEUED_PAYLOAD,
        ...ENVELOPE,
        jobType: JobType.TEXT_GENERATION,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('the envelope half', () => {
    // This block used to pin the gap: producers enqueued QUEUED_PAYLOAD verbatim
    // and the five camelCase envelope fields were simply absent, which is how a
    // permanently failed Stage 5 job reached the error-log row with no
    // organization. buildStructureGenerationJobData now attaches them at enqueue
    // time, so the assertions are inverted.
    it('is filled in by buildStructureGenerationJobData', () => {
      const jobData = buildStructureGenerationJobData(QUEUED_PAYLOAD);

      const present = ENVELOPE_KEYS.filter(key => jobData[key as keyof typeof jobData] != null);
      expect(present.sort()).toEqual([...ENVELOPE_KEYS].sort());
    });

    it('copies the identifiers straight from the snake_case payload', () => {
      const jobData = buildStructureGenerationJobData(QUEUED_PAYLOAD);

      expect(jobData.organizationId).toBe(QUEUED_PAYLOAD.organization_id);
      expect(jobData.courseId).toBe(QUEUED_PAYLOAD.course_id);
      expect(jobData.userId).toBe(QUEUED_PAYLOAD.user_id);
      expect(jobData.jobType).toBe(JobType.STRUCTURE_GENERATION);
    });

    it('stamps a parseable ISO createdAt', () => {
      const jobData = buildStructureGenerationJobData(QUEUED_PAYLOAD);

      expect(Number.isNaN(Date.parse(jobData.createdAt))).toBe(false);
    });

    it('produces something the schema accepts with no help', () => {
      const result = StructureGenerationJobDataSchema.safeParse(
        buildStructureGenerationJobData(QUEUED_PAYLOAD)
      );

      expect(result.success).toBe(true);
    });

    it('leaves every payload field untouched', () => {
      const jobData = buildStructureGenerationJobData(QUEUED_PAYLOAD);

      for (const key of Object.keys(GenerationJobInputSchema.shape)) {
        expect(jobData[key as keyof typeof jobData]).toEqual(
          QUEUED_PAYLOAD[key as keyof typeof QUEUED_PAYLOAD]
        );
      }
    });

    it('maps locale from the course language, defaulting to ru', () => {
      const english = buildStructureGenerationJobData({
        ...QUEUED_PAYLOAD,
        frontend_parameters: { ...QUEUED_PAYLOAD.frontend_parameters, language: 'en' },
      });
      const spanish = buildStructureGenerationJobData({
        ...QUEUED_PAYLOAD,
        frontend_parameters: { ...QUEUED_PAYLOAD.frontend_parameters, language: 'es' },
      });

      expect(english.locale).toBe('en');
      expect(spanish.locale).toBe('ru');
    });
  });

  describe('rejecting incomplete payloads', () => {
    it('requires course_id', () => {
      const { course_id: _omitted, ...withoutCourseId } = QUEUED_PAYLOAD;

      expect(
        StructureGenerationJobDataSchema.safeParse({ ...withoutCourseId, ...ENVELOPE }).success
      ).toBe(false);
    });

    it('requires frontend_parameters with a course_title', () => {
      const result = StructureGenerationJobDataSchema.safeParse({
        ...QUEUED_PAYLOAD,
        ...ENVELOPE,
        frontend_parameters: {},
      });

      expect(result.success).toBe(false);
    });

    it('rejects the old hand-written shape, which carried no generation input', () => {
      const result = StructureGenerationJobDataSchema.safeParse({
        ...ENVELOPE,
        analysisId: '7d1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
      });

      expect(result.success).toBe(false);
    });
  });
});
