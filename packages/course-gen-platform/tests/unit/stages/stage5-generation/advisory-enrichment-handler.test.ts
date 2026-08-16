import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalysisResult,
  CourseStructure,
  GenerationJobInput,
  GenerationResult,
} from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  productionEnricher: vi.fn(),
  createProductionEnricher: vi.fn(),
  orchestratorConstructor: vi.fn(),
  processWithFallback: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  updateStatusForGenerationStart: vi.fn(),
  materializeSectionsAndLessons: vi.fn(),
  trackStage5Tokens: vi.fn(),
  handleStageCompletion: vi.fn(),
  writeCourseNodes: vi.fn(),
}));

vi.mock('@/stages/stage5-generation/evidence/production', () => ({
  createProductionStage5EvidenceEnricher: mocks.createProductionEnricher,
}));
vi.mock('@/stages/stage5-generation/orchestrator', () => ({
  GenerationOrchestrator: class {
    readonly evidenceEnricher?: typeof mocks.productionEnricher;

    constructor(...args: unknown[]) {
      mocks.orchestratorConstructor(...args);
      this.evidenceEnricher = args[4] as typeof mocks.productionEnricher;
    }

    async execute() {
      await this.evidenceEnricher?.({ marker: 'handler-production-path' });
      return generationResult();
    }
  },
}));
vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('@/shared/auto-approval', () => ({ handleStageCompletion: mocks.handleStageCompletion }));
vi.mock('@/shared/course-nodes/writer', () => ({ writeCourseNodes: mocks.writeCourseNodes }));
vi.mock('@/stages/stage5-generation/handler-db-helpers', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/stages/stage5-generation/handler-db-helpers')>();
  return {
    ...actual,
    updateStatusForGenerationStart: mocks.updateStatusForGenerationStart,
    materializeSectionsAndLessons: mocks.materializeSectionsAndLessons,
    trackStage5Tokens: mocks.trackStage5Tokens,
  };
});
vi.mock('@/stages/stage5-generation/handler-helpers', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/stages/stage5-generation/handler-helpers')>();
  return { ...actual, processWithFallback: mocks.processWithFallback };
});

import { Stage5GenerationHandler } from '@/stages/stage5-generation/handler';

const runId = '10000000-0000-4000-8000-000000000001';
const courseId = '20000000-0000-4000-8000-000000000001';
const organizationId = '30000000-0000-4000-8000-000000000001';
const originalRolloutEnvironment = {
  DOCUMENT_EVIDENCE_ENABLED: process.env.DOCUMENT_EVIDENCE_ENABLED,
  DOCUMENT_EVIDENCE_MODE: process.env.DOCUMENT_EVIDENCE_MODE,
  DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT: process.env.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT,
};

function restoreEnvironment(name: keyof typeof originalRolloutEnvironment): void {
  const value = originalRolloutEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function structure(): CourseStructure {
  return {
    course_title: 'Data Retention Policies',
    course_description: 'A practical course about safe enterprise retention policies.',
    estimated_duration_hours: 0.5,
    difficulty_level: 'intermediate',
    prerequisites: [],
    learning_outcomes: [
      { id: '80000000-0000-4000-8000-000000000001', text: 'Explain retention', language: 'en' },
      { id: '80000000-0000-4000-8000-000000000002', text: 'Apply retention', language: 'en' },
      { id: '80000000-0000-4000-8000-000000000003', text: 'Evaluate retention', language: 'en' },
    ],
    course_tags: ['retention', 'security', 'policy', 'governance', 'compliance'],
    sections: [
      {
        section_number: 1,
        section_title: 'Retention foundations',
        section_description: 'Baseline retention requirements and controls.',
        learning_objectives: ['Explain baseline retention rules'],
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Retention model',
            lesson_objectives: ['Define a safe retention period'],
            key_topics: ['Baseline retention period'],
            estimated_duration_minutes: 30,
          },
        ],
      },
    ],
  };
}

function analysis(): AnalysisResult {
  return {
    document_evidence: {
      accepted_run_id: runId,
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
      current_decision_ids: [],
      unresolved_informational_conflict_ids: [],
      enrichment_status: 'not_applicable',
    },
  } as AnalysisResult;
}

function generationResult(): GenerationResult {
  return {
    course_structure: structure(),
    generation_metadata: {
      model_used: { metadata: 'metadata-model', sections: 'sections-model' },
      total_tokens: { metadata: 1, sections: 2, validation: 0, total: 3 },
      cost_usd: 0,
      duration_ms: { metadata: 1, sections: 2, validation: 0, total: 3 },
      quality_scores: { metadata_similarity: 1, sections_similarity: [1], overall: 1 },
      batch_count: 1,
      retry_count: { metadata: 0, sections: [0] },
      document_evidence_enrichment: {
        schema_version: 'stage5-document-evidence-enrichment-v1',
        status: 'applied',
        accepted_run_id: runId,
        accepted_decision_ids: [],
        section_evidence: [],
        provenance_hash: `sha256:${'a'.repeat(64)}`,
        attempted_patches: 1,
        retrieved_ref_count: 0,
        fallback_section_count: 0,
      },
      created_at: '2026-07-11T12:00:00.000Z',
    },
  };
}

const jobLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

describe('Stage 5 handler evidence wiring and atomic persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProductionEnricher.mockReturnValue(mocks.productionEnricher);
    mocks.productionEnricher.mockResolvedValue({});
    mocks.processWithFallback.mockImplementation(async orchestrator => orchestrator.execute());
    mocks.updateStatusForGenerationStart.mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreEnvironment('DOCUMENT_EVIDENCE_ENABLED');
    restoreEnvironment('DOCUMENT_EVIDENCE_MODE');
    restoreEnvironment('DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT');
  });

  it('constructs and reaches the production evidence adapter from the real handler pipeline', async () => {
    process.env.DOCUMENT_EVIDENCE_ENABLED = 'true';
    process.env.DOCUMENT_EVIDENCE_MODE = 'active';
    process.env.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT = '100';
    const handler = new Stage5GenerationHandler();
    const input = {
      course_id: courseId,
      organization_id: organizationId,
      vectorized_documents: true,
    } as GenerationJobInput;

    await (handler as unknown as { executeGenerationPipeline: Function }).executeGenerationPipeline(
      input,
      jobLogger
    );

    expect(mocks.createProductionEnricher).toHaveBeenCalledTimes(1);
    expect(mocks.orchestratorConstructor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      mocks.productionEnricher
    );
    expect(mocks.productionEnricher).toHaveBeenCalledWith({ marker: 'handler-production-path' });
  });

  it('runs the ordinary generation pipeline without constructing the adapter outside the cohort', async () => {
    process.env.DOCUMENT_EVIDENCE_ENABLED = 'true';
    process.env.DOCUMENT_EVIDENCE_MODE = 'active';
    process.env.DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT = '0';
    const handler = new Stage5GenerationHandler();
    const input = {
      course_id: courseId,
      organization_id: organizationId,
      vectorized_documents: true,
    } as GenerationJobInput;

    await expect(
      (handler as unknown as { executeGenerationPipeline: Function }).executeGenerationPipeline(
        input,
        jobLogger
      )
    ).resolves.toEqual(generationResult());

    expect(mocks.createProductionEnricher).not.toHaveBeenCalled();
    expect(mocks.orchestratorConstructor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined
    );
    expect(mocks.processWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.productionEnricher).not.toHaveBeenCalled();
  });

  it('aborts every Stage 5 write when the evidence CAS update matches zero rows', async () => {
    // The compare-and-swap happens in the database now. Sending the previous
    // `analysis_result` as a PostgREST URL filter put ten kilobytes of JSON in
    // the request line and every commit came back `400 Bad Request`
    // (mc2-2pplo, 2026-08-15).
    const persisted = {
      course_structure: { existing: true },
      generation_metadata: { existing: true },
      analysis_result: analysis(),
    };
    // A null return is the guard reporting that the snapshot had moved.
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const database = { from: vi.fn(), rpc };
    mocks.getSupabaseAdmin.mockReturnValue(database);
    const handler = new Stage5GenerationHandler();
    const originalAnalysis = analysis();

    await expect(
      (handler as unknown as { commitAndFinalize: Function }).commitAndFinalize(
        courseId,
        organizationId,
        undefined,
        structure(),
        generationResult(),
        originalAnalysis,
        { pause_at_stage_5: false },
        { heartbeatInterval: 0, release: vi.fn() },
        jobLogger
      )
    ).rejects.toThrow('document evidence snapshot changed');

    expect(rpc).toHaveBeenCalledWith(
      'commit_course_structure_guarded',
      expect.objectContaining({
        p_course_id: courseId,
        p_expected_analysis_result: originalAnalysis,
        p_course_structure: expect.any(Object),
        p_generation_metadata: expect.any(Object),
        p_analysis_result: expect.any(Object),
      })
    );
    // The snapshot travels as an object, not as a serialised URL parameter.
    expect(typeof rpc.mock.calls[0][1].p_expected_analysis_result).toBe('object');
    expect(persisted).toEqual({
      course_structure: { existing: true },
      generation_metadata: { existing: true },
      analysis_result: analysis(),
    });
    expect(mocks.materializeSectionsAndLessons).not.toHaveBeenCalled();
    expect(mocks.writeCourseNodes).not.toHaveBeenCalled();
    expect(mocks.trackStage5Tokens).not.toHaveBeenCalled();
    expect(mocks.handleStageCompletion).not.toHaveBeenCalled();
  });
});
