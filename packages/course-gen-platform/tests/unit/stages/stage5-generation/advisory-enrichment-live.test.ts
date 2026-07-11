import { describe, expect, it, vi } from 'vitest';
import type {
  CourseMetadata,
  CourseStructure,
  GenerationJobInput,
  Stage5DocumentEvidenceEnrichment,
} from '@megacampus/shared-types';

const pinoMocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('pino', () => {
  const factory = vi.fn(() => pinoMocks.logger) as ReturnType<typeof vi.fn> & {
    destination: ReturnType<typeof vi.fn>;
  };
  factory.destination = vi.fn(() => ({ write: vi.fn() }));
  return { default: factory };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/stages/stage5-generation/orchestrator-helpers', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/stages/stage5-generation/orchestrator-helpers')>();
  return {
    ...actual,
    performPostGenerationQualityGate: vi.fn(() =>
      Promise.resolve({
        qualityResult: { passed: true, score: 1, failedSections: [] },
        lessonsResult: {
          passed: true,
          totalLessons: 1,
          minimumRequired: 1,
          deficit: 0,
          exceedsMax: false,
        },
        overlapResult: null,
        structuralResult: {
          passed: true,
          hasCriticalIssues: false,
          profileId: 'micro',
          totalLessons: 1,
          computedDurationHours: 0.5,
          criticalIssues: [],
          warnings: [],
        },
      })
    ),
  };
});

import { GenerationOrchestrator } from '@/stages/stage5-generation/orchestrator';
import { logTrace } from '@/shared/trace-logger';
import { Stage5EvidenceEnrichmentFailure } from '@/stages/stage5-generation/evidence/types';

const runId = '10000000-0000-4000-8000-000000000001';
const courseId = '20000000-0000-4000-8000-000000000001';
const organizationId = '30000000-0000-4000-8000-000000000001';

function section() {
  return {
    section_number: 1,
    section_title: 'Retention Policy Foundations',
    section_description: 'Baseline requirements and structure of a retention policy.',
    learning_objectives: ['Explain baseline retention rules'],
    lessons: [
      {
        lesson_number: 1,
        lesson_title: 'Retention Period Model',
        lesson_objectives: ['Define a safe retention period'],
        key_topics: ['Baseline retention period', 'Required policy controls'],
        estimated_duration_minutes: 30,
      },
    ],
  };
}

function metadata(): CourseMetadata {
  return {
    course_title: 'Data Retention Policies',
    course_description: 'A practical course about safe enterprise data retention policies.',
    estimated_duration_hours: 0.5,
    difficulty_level: 'intermediate',
    prerequisites: [],
    learning_outcomes: [
      {
        id: '80000000-0000-4000-8000-000000000001',
        text: 'Explain safe retention policy design',
        language: 'en',
      },
      {
        id: '80000000-0000-4000-8000-000000000002',
        text: 'Apply retention rules to realistic cases',
        language: 'en',
      },
      {
        id: '80000000-0000-4000-8000-000000000003',
        text: 'Evaluate retention controls and tradeoffs',
        language: 'en',
      },
    ],
    course_tags: ['retention', 'security', 'policy', 'governance', 'compliance'],
  };
}

function input(): GenerationJobInput {
  return {
    course_id: courseId,
    organization_id: organizationId,
    user_id: '90000000-0000-4000-8000-000000000001',
    frontend_parameters: {
      course_title: 'Data Retention Policies',
      language: 'en',
      course_size: 'micro',
      lesson_duration_minutes: 30,
    },
    analysis_result: {
      course_category: { primary: 'professional', confidence: 1, reasoning: 'x'.repeat(60) },
      topic_analysis: {
        determined_topic: 'Data retention',
        information_completeness: 100,
        complexity: 'medium',
        reasoning: 'x'.repeat(60),
        target_audience: 'intermediate',
        missing_elements: null,
        key_concepts: ['retention', 'security', 'governance'],
        domain_keywords: ['retention', 'security', 'policy', 'governance', 'compliance'],
      },
      recommended_structure: {
        estimated_content_hours: 0.5,
        scope_reasoning: 'x'.repeat(120),
        lesson_duration_minutes: 30,
        calculation_explanation: 'One focused lesson.',
        total_lessons: 1,
        total_sections: 1,
        scope_warning: null,
        sections_breakdown: [],
      },
      pedagogical_strategy: {
        assessment_approach: 'x'.repeat(60),
        progression_logic: 'x'.repeat(120),
      },
      research_flags: [],
      generation_guidance: {
        tone: 'professional',
        style: 'practical',
        specific_analogies: [],
        real_world_examples: [],
      },
      document_relevance_mapping: {},
      document_evidence: {
        accepted_run_id: runId,
        coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
        current_decision_ids: [],
        unresolved_informational_conflict_ids: [],
        enrichment_status: 'not_applicable',
      },
      metadata: {
        analysis_version: 'test',
        total_duration_ms: 0,
        phase_durations_ms: {},
        model_usage: {},
        total_tokens: { input: 0, output: 0, total: 0 },
        total_cost_usd: 0,
        retry_count: 0,
        quality_scores: {},
        created_at: '2026-07-11T12:00:00.000Z',
      },
    } as never,
    document_summaries: [],
    vectorized_documents: true,
  } as GenerationJobInput;
}

describe('live Stage 5 evidence caller', () => {
  it('runs only after the baseline graph and persists the returned audit record', async () => {
    const privateSentinel = 'PRIVATE_EVIDENCE_SENTINEL';
    const enriched: CourseStructure = {
      ...metadata(),
      sections: [
        {
          ...section(),
          lessons: [
            {
              ...section().lessons[0],
              key_topics: [...section().lessons[0].key_topics, privateSentinel],
            },
          ],
        },
      ],
    };
    const audit: Stage5DocumentEvidenceEnrichment = {
      schema_version: 'stage5-document-evidence-enrichment-v1',
      status: 'applied',
      accepted_run_id: runId,
      accepted_decision_ids: [],
      section_evidence: [],
      provenance_hash: `sha256:${'a'.repeat(64)}`,
      attempted_patches: 1,
      retrieved_ref_count: 0,
      fallback_section_count: 0,
    };
    const evidenceEnricher = vi.fn(() =>
      Promise.resolve({ courseStructure: enriched, enrichment: audit, retrievalAttempts: 0 })
    );
    const publishMetrics = vi.fn(() => Promise.resolve());
    const orchestrator = new GenerationOrchestrator(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      evidenceEnricher,
      publishMetrics
    );
    (orchestrator as never as { graph: { invoke: (value: unknown) => Promise<unknown> } }).graph = {
      invoke: vi.fn(() =>
        Promise.resolve({
          input: input(),
          metadata: metadata(),
          sections: [section()],
          qualityScores: { metadata_similarity: 1, sections_similarity: [1], overall: 1 },
          tokenUsage: { metadata: 1, sections: 1, validation: 0, total: 2 },
          modelUsed: { metadata: 'metadata-model', sections: 'sections-model' },
          retryCount: { metadata: 0, sections: [0] },
          currentPhase: 'validate_quality',
          phaseDurations: {},
          errors: [],
          modelOverride: null,
        })
      ),
    };

    const result = await orchestrator.execute(input());

    expect(evidenceEnricher).toHaveBeenCalledTimes(1);
    expect(evidenceEnricher).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId,
        organizationId,
        baseline: expect.objectContaining({
          sections: [expect.objectContaining({ section_title: 'Retention Policy Foundations' })],
        }),
        snapshot: expect.objectContaining({ accepted_run_id: runId }),
      })
    );
    expect(result.course_structure.sections[0].lessons[0].key_topics).toContain(privateSentinel);
    expect(result.generation_metadata.document_evidence_enrichment).toEqual(audit);
    expect(publishMetrics).toHaveBeenCalledOnce();
    expect(publishMetrics).toHaveBeenCalledWith(
      { stage: 'stage5', status: 'applied', retrievals: 0, fallbacks: 0 },
      pinoMocks.logger
    );
    const serializedTrace = JSON.stringify(vi.mocked(logTrace).mock.calls);
    expect(serializedTrace).not.toContain(privateSentinel);
    expect(serializedTrace).not.toContain('provenanceHash');
    expect(serializedTrace).not.toContain('acceptedRunId');
    expect(serializedTrace).toContain('decisionCount');
    expect(
      JSON.stringify(Object.values(pinoMocks.logger).flatMap(spy => spy.mock.calls))
    ).not.toContain(privateSentinel);
  });

  it('fails open and sanitizes an unexpected evidence error before trace logging', async () => {
    const privateSentinel = 'PRIVATE_ERROR_SENTINEL source body';
    const evidenceEnricher = vi.fn(() => Promise.reject(new Error(privateSentinel)));
    const publishMetrics = vi.fn(() => Promise.resolve());
    const orchestrator = new GenerationOrchestrator(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      evidenceEnricher,
      publishMetrics
    );
    (orchestrator as never as { graph: { invoke: (value: unknown) => Promise<unknown> } }).graph = {
      invoke: vi.fn(() =>
        Promise.resolve({
          input: input(),
          metadata: metadata(),
          sections: [section()],
          qualityScores: { metadata_similarity: 1, sections_similarity: [1], overall: 1 },
          tokenUsage: { metadata: 1, sections: 1, validation: 0, total: 2 },
          modelUsed: { metadata: 'metadata-model', sections: 'sections-model' },
          retryCount: { metadata: 0, sections: [0] },
          currentPhase: 'validate_quality',
          phaseDurations: {},
          errors: [],
          modelOverride: null,
        })
      ),
    };

    const result = await orchestrator.execute(input());

    expect(result.course_structure.sections[0].lessons[0].key_topics).toEqual(
      section().lessons[0].key_topics
    );
    expect(result.generation_metadata.document_evidence_enrichment).toEqual(
      expect.objectContaining({ status: 'degraded', accepted_run_id: runId })
    );
    expect(publishMetrics).toHaveBeenCalledOnce();
    expect(publishMetrics).toHaveBeenCalledWith(
      { stage: 'stage5', status: 'degraded', retrievals: 0, fallbacks: 0 },
      pinoMocks.logger
    );
    expect(JSON.stringify(vi.mocked(logTrace).mock.calls)).not.toContain(privateSentinel);
    expect(
      JSON.stringify(Object.values(pinoMocks.logger).flatMap(spy => spy.mock.calls))
    ).not.toContain(privateSentinel);
  });

  it('publishes completed retrievals carried by a sanitized production evidence failure', async () => {
    const evidenceEnricher = vi.fn(() => Promise.reject(new Stage5EvidenceEnrichmentFailure(1)));
    const publishMetrics = vi.fn(() => Promise.resolve());
    const orchestrator = new GenerationOrchestrator(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      evidenceEnricher,
      publishMetrics
    );
    (orchestrator as never as { graph: { invoke: (value: unknown) => Promise<unknown> } }).graph = {
      invoke: vi.fn(() =>
        Promise.resolve({
          input: input(),
          metadata: metadata(),
          sections: [section()],
          qualityScores: { metadata_similarity: 1, sections_similarity: [1], overall: 1 },
          tokenUsage: { metadata: 1, sections: 1, validation: 0, total: 2 },
          modelUsed: { metadata: 'metadata-model', sections: 'sections-model' },
          retryCount: { metadata: 0, sections: [0] },
          currentPhase: 'validate_quality',
          phaseDurations: {},
          errors: [],
          modelOverride: null,
        })
      ),
    };

    await orchestrator.execute(input());

    expect(publishMetrics).toHaveBeenCalledWith(
      { stage: 'stage5', status: 'degraded', retrievals: 1, fallbacks: 0 },
      pinoMocks.logger
    );
  });
});
