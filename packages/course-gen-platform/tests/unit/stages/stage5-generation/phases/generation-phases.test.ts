import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GenerationPhases,
  buildSectionDigest,
  sanitizeDigest,
} from '@/stages/stage5-generation/phases/generation-phases';
import { GenerationJobInputSchema } from '@megacampus/shared-types/generation-job';

// ---- MOCKS ----
vi.mock('@/stages/stage5-generation/utils/metadata-generator');
vi.mock('@/stages/stage5-generation/utils/section-batch-generator');
vi.mock('@/shared/validation/quality-validator');
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/stages/stage5-generation/phases/phase3-v2-spec-generator');
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(() => ({
    getModelForPhase: vi.fn().mockResolvedValue({ source: 'test' }),
  })),
  getEffectiveStageConfig: vi.fn(() => ({ maxRetries: 3 })),
}));
vi.mock('pino', () => {
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const pino = vi.fn(() => mockLogger) as any;
  pino.destination = vi.fn();
  return { default: pino };
});

import { MetadataGenerator } from '@/stages/stage5-generation/utils/metadata-generator';
import { SectionBatchGenerator } from '@/stages/stage5-generation/utils/section-batch-generator';
import { QualityValidator } from '@/shared/validation/quality-validator';
import { V2LessonSpecGenerator } from '@/stages/stage5-generation/phases/phase3-v2-spec-generator';

const baseInput: any = {
  course_id: 'test-course-id',
  frontend_parameters: { course_title: 'Test Course', language: 'en' },
  options: { ai_creativity: 0.7, advanced_prompting: false },
};

const baseAnalysisResult: any = {
  recommended_structure: {
    total_sections: 2,
    sections_breakdown: [{ area: 'Intro' }, { area: 'Advanced' }],
  },
  topic_analysis: {
    determined_topic: 'Testing',
    key_concepts: ['A', 'B'],
  },
  pedagogical_strategy: { methodology: 'Practical' },
};

const baseState: any = {
  input: { ...baseInput },
  sections: [],
  errors: [],
  phaseDurations: {},
  tokenUsage: { total: 0 },
  modelUsed: {},
  retryCount: {},
};

describe('GenerationPhases Helpers', () => {
  describe('sanitizeDigest', () => {
    it('strips newlines and limits length', () => {
      expect(sanitizeDigest('foo\nbar\r\nbaz', 10)).toBe('foo bar ba');
    });
  });

  describe('buildSectionDigest', () => {
    it('returns empty string if no lessons', () => {
      expect(buildSectionDigest({} as any, 0)).toBe('');
    });
    it('formats lessons cleanly', () => {
      const section: any = {
        section_title: 'Sec 1',
        lessons: [{ lesson_title: 'L1', key_topics: ['T1', 'T2'] }],
      };
      const digest = buildSectionDigest(section, 0);
      expect(digest).toContain('Section 1 "Sec 1"');
      expect(digest).toContain('- L1 (Topics: T1, T2)');
    });
  });
});

describe('GenerationPhases', () => {
  let phases: GenerationPhases;
  let metadataGen: any;
  let sectionBatchGen: any;
  let qualityVal: any;

  beforeEach(() => {
    vi.clearAllMocks();
    metadataGen = new MetadataGenerator();
    sectionBatchGen = new SectionBatchGenerator();
    qualityVal = new QualityValidator();
    phases = new GenerationPhases(metadataGen, sectionBatchGen, qualityVal);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('validateInput', () => {
    it('validates correct input successfully', async () => {
      // make it strict correct based on Zod if possible, or mock Zod
      vi.spyOn(GenerationJobInputSchema, 'safeParse').mockReturnValue({
        success: true,
        data: baseInput,
      });
      const state = await phases.validateInput(baseState);
      expect(state.currentPhase).toBe('generate_metadata');
      expect(state.errors).toHaveLength(0);
    });

    it('returns errors on validation failure', async () => {
      vi.spyOn(GenerationJobInputSchema, 'safeParse').mockReturnValue({
        success: false,
        error: { errors: [{ path: ['frontend_parameters'], message: 'Required' }] } as any,
      });
      const state = await phases.validateInput(baseState);
      expect(state.errors).toContain('Input validation failed: frontend_parameters: Required');
      expect(state.currentPhase).toBeUndefined(); // doesn't advance
    });

    it('catches and returns unexpected errors', async () => {
      vi.spyOn(GenerationJobInputSchema, 'safeParse').mockImplementation(() => {
        throw new Error('Boom');
      });
      const state = await phases.validateInput(baseState);
      expect(state.errors).toContain('Input validation failed: Boom');
    });
  });

  describe('generateMetadata', () => {
    it('generates metadata successfully on first try', async () => {
      const mockResult = {
        metadata: { course_title: 'MTA' },
        tokensUsed: 100,
        modelUsed: 'gpt',
        retryCount: 0,
      };
      metadataGen.generate.mockResolvedValueOnce(mockResult);

      const state = await phases.generateMetadata(baseState);

      expect(state.metadata?.course_title).toBe('MTA');
      expect(state.tokenUsage.metadata).toBe(100);
      expect(state.currentPhase).toBe('generate_sections');
    });

    it('retries on failure and throws if all fail', async () => {
      vi.useFakeTimers();
      metadataGen.generate.mockRejectedValue(new Error('Flake'));

      const promise = phases.generateMetadata(baseState);

      // fast forward thru 3 retries
      await vi.advanceTimersByTimeAsync(8000);

      const state = await promise;
      expect(state.errors[0]).toContain('Metadata generation failed after 3 attempts: Flake');
    });
  });

  describe('generateSections', () => {
    it('throws if no analysis_result', async () => {
      const state = await phases.generateSections(baseState);
      expect(state.errors[0]).toContain('Cannot generate sections: analysis_result is null');
    });

    it('generates sections sequentially with digest', async () => {
      const stateWithAnalysis = {
        ...baseState,
        input: { ...baseInput, analysis_result: baseAnalysisResult },
      };

      sectionBatchGen.generateBatch
        .mockResolvedValueOnce({
          sections: [
            { section_title: 'S1', lessons: [{ lesson_title: 'L1', key_topics: ['T1'] }] },
          ],
          tokensUsed: 100,
          modelUsed: 'oss',
          tier: 1,
          retryCount: 0,
        })
        .mockResolvedValueOnce({
          sections: [{ section_title: 'S2', lessons: [] }],
          tokensUsed: 150,
          modelUsed: 'oss',
          tier: 1,
          retryCount: 0,
        });

      const state = await phases.generateSections(stateWithAnalysis);

      expect(state.sections).toHaveLength(2);
      expect(state.tokenUsage.sections).toBe(250);
      expect(state.currentPhase).toBe('validate_quality');

      // Ensure digest was passed to 2nd call
      expect(sectionBatchGen.generateBatch).toHaveBeenNthCalledWith(
        2,
        2,
        1,
        2, // batchNum, start, end
        expect.anything(),
        undefined,
        undefined,
        expect.stringContaining('T1') // Contains digest from first call
      );
    });

    it('retries failed sections', async () => {
      vi.useFakeTimers();
      const stateWithAnalysis = {
        ...baseState,
        input: { ...baseInput, analysis_result: baseAnalysisResult },
      };

      // Fails first time, succeds on retry
      sectionBatchGen.generateBatch
        .mockRejectedValueOnce(new Error('Section 1 fail API'))
        .mockResolvedValueOnce({
          sections: [{ section_title: 'S2', lessons: [] }],
          tokensUsed: 100,
          modelUsed: 'oss',
          tier: 1,
          retryCount: 0,
        })
        .mockResolvedValueOnce({
          // This is the retry for section 1
          sections: [{ section_title: 'S1', lessons: [] }],
          tokensUsed: 100,
          modelUsed: 'oss',
          tier: 1,
          retryCount: 0,
        });

      const promise = phases.generateSections(stateWithAnalysis);
      await vi.advanceTimersByTimeAsync(3000); // 2000ms base retry delay
      const state = await promise;

      expect(state.sections).toHaveLength(2); // Should have recovered
      expect(state.errors).toHaveLength(0);
    });
  });

  describe('validateQuality', () => {
    it('throws if metadata or sections missing', async () => {
      let state = await phases.validateQuality(baseState);
      expect(state.errors[0]).toContain('metadata not generated');

      state = await phases.validateQuality({ ...baseState, metadata: {} });
      expect(state.errors[0]).toContain('no sections generated');
    });

    it('validates quality successfully and combines scores', async () => {
      const stateToValidate = {
        ...baseState,
        input: { ...baseInput, analysis_result: baseAnalysisResult },
        metadata: { course_title: 'M' },
        sections: [{}],
      };

      qualityVal.validateMetadata.mockResolvedValueOnce({ score: 0.8, passed: true });
      qualityVal.validateSections.mockResolvedValueOnce([{ score: 0.9, passed: true }]);

      const state = await phases.validateQuality(stateToValidate);

      expect(state.qualityScores.metadata_similarity).toBe(0.8);
      expect(state.qualityScores.overall).toBe(0.8 * 0.4 + 0.9 * 0.6); // 0.86
    });

    it('handles title-only mode correctly', async () => {
      const stateToValidate = {
        ...baseState, // No analysis_result
        metadata: { course_title: 'M' },
        sections: [{}],
      };

      qualityVal.validateSections.mockResolvedValueOnce([{ score: 0.9, passed: true }]);

      const state = await phases.validateQuality(stateToValidate);
      expect(state.qualityScores.metadata_similarity).toBeUndefined();
      expect(state.qualityScores.overall).toBe(0.9);
    });
  });

  describe('generateV2Specs', () => {
    it('generates specs using external generator', () => {
      const stateWithAnalysis = {
        ...baseState,
        input: { ...baseInput, analysis_result: baseAnalysisResult },
      };

      const v2GenMock = vi.mocked(V2LessonSpecGenerator).mock.instances[0];
      v2GenMock.generateV2Specs.mockReturnValueOnce([{}] as any);

      const specs = phases.generateV2Specs(stateWithAnalysis);
      expect(specs).toHaveLength(1);
    });

    it('throws if no analysis_result', () => {
      expect(() => phases.generateV2Specs(baseState)).toThrow('analysis_result is null');
    });
  });

  describe('regenerateSingleSection', () => {
    it('calls generator with overlap feedback', async () => {
      sectionBatchGen.generateBatch.mockResolvedValueOnce({
        sections: [{ section_title: 'New S1' }],
      });

      const sections = await phases.regenerateSingleSection(2, baseInput, 'It overlaps');

      expect(sections).toHaveLength(1);
      expect(sectionBatchGen.generateBatch).toHaveBeenCalledWith(
        3,
        2,
        3,
        baseInput,
        undefined,
        'It overlaps'
      );
    });
  });

  describe('buildInputRequirementsText helper private method', () => {
    it('uses buildInputRequirementsText with all fields correctly', async () => {
      // Just testing via validateQuality internally
      const stateToValidate = {
        ...baseState,
        input: { ...baseInput, analysis_result: baseAnalysisResult },
        metadata: {},
        sections: [{}],
      };

      qualityVal.validateMetadata.mockResolvedValueOnce({ score: 0.8, passed: true });
      qualityVal.validateSections.mockResolvedValueOnce([{ score: 0.9, passed: true }]);

      await phases.validateQuality(stateToValidate);

      const args = qualityVal.validateMetadata.mock.calls[0];
      const requirementsText = args[0] as string;
      expect(requirementsText).toContain('Test Course');
      expect(requirementsText).toContain('Testing');
      expect(requirementsText).toContain('A, B');
    });
  });
});
