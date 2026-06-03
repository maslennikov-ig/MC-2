import { describe, expect, it } from 'vitest';
import {
  CareerPlaybookBlockStateSchema,
  CareerPlaybookBusinessContextSchema,
  CareerPlaybookBusinessContextDigestSchema,
  CareerPlaybookBusinessContextSourceSchema,
  CAREER_PLAYBOOK_COMPLETENESS_READY_THRESHOLD,
  CareerPlaybookCostBreakdownSchema,
  CareerPlaybookFollowupAnswerSchema,
  CareerPlaybookFixedQuestionSchema,
  CareerPlaybookPlaybookStatusSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookRoleProfileSpecSchema,
  SUPPORTED_CAREER_PLAYBOOK_CONTENT_LANGUAGES,
  isCareerPlaybookFollowupResponseReady,
  normalizeCareerPlaybookFollowupResponseReadiness,
} from '../src/career-playbook';
import { DEFAULT_JOB_OPTIONS, JobDataSchema, JobType } from '../src/bullmq-jobs';

const baseRoleProfileSpec = {
  position: {
    title: 'B2B Sales Manager',
    slug: 'b2b-sales-manager',
    department: 'sales',
    level: 'senior',
  },
  context: {
    company_stage: 'growth',
    team_size: '51-200',
    reports_to: 'CRO',
    has_subordinates: true,
    subordinates_description: '3 SDRs and 2 account executives',
  },
  focus_areas: {
    primary_kpis: ['Qualified pipeline', 'Closed revenue', 'Win rate'],
    key_tools: ['CRM', 'Sales engagement platform'],
    critical_competencies: ['Discovery', 'Negotiation', 'Forecasting'],
    anti_goals: ['Own product roadmap', 'Approve legal terms'],
    failure_patterns: ['Poor CRM hygiene', 'Discount-first selling'],
  },
  research: {
    kpis_insights: ['Pipeline coverage is commonly tracked weekly'],
    trends_insights: ['AI copilots change sales preparation workflows'],
    onboarding_insights: ['Shadowing improves ramp quality'],
    sources: ['https://example.com/sales-kpi'],
  },
  block_boundaries: {
    block_1: {
      primary_topics: ['mission', 'north star metric'],
      do_not_repeat: ['decision authority'],
    },
  },
  content_language: 'pl',
};

describe('Career Playbook shared schemas', () => {
  it('exports the same 19 content languages as the course pipeline', () => {
    expect(SUPPORTED_CAREER_PLAYBOOK_CONTENT_LANGUAGES).toEqual([
      'ru',
      'en',
      'zh',
      'es',
      'fr',
      'de',
      'ja',
      'ko',
      'ar',
      'pt',
      'it',
      'tr',
      'vi',
      'th',
      'id',
      'ms',
      'hi',
      'bn',
      'pl',
    ]);
  });

  it('validates fixed wizard questions with localized options and branching rules', () => {
    const result = CareerPlaybookFixedQuestionSchema.safeParse({
      language: 'ru',
      position: 6,
      question_key: 'company_stage',
      question_type: 'single_choice',
      question_text: 'Какая стадия компании / продукта?',
      helper_text: 'Показывается только для небольших компаний',
      options: [
        { value: 'pre-pmf', label: 'Pre-PMF' },
        { value: 'growth', label: 'Growth' },
      ],
      branching_rules: {
        when: {
          question_key: 'team_size',
          value_in: ['1-10', '11-50', '51-200'],
        },
      },
      is_required: false,
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsupported fixed-question UI languages', () => {
    const result = CareerPlaybookFixedQuestionSchema.safeParse({
      language: 'es',
      position: 1,
      question_key: 'position',
      question_type: 'open',
      question_text: 'Role',
      is_required: true,
    });

    expect(result.success).toBe(false);
  });

  it('validates Q&A data for fixed answers, follow-ups, free-form text, and completeness', () => {
    const result = CareerPlaybookQADataSchema.safeParse({
      fixed: [
        {
          question_key: 'position',
          value: 'B2B Sales Manager',
          answered_at: '2026-05-13T09:00:00.000Z',
        },
      ],
      followups: [
        {
          question_id: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
          question_text: 'What is the typical deal size?',
          question_type: 'single_choice',
          value: 'enterprise',
          skipped: false,
          answered_at: '2026-05-13T09:05:00.000Z',
        },
      ],
      freeform: [
        {
          text: 'This role owns enterprise pipeline quality.',
          parsed_signals: { market: 'enterprise' },
          submitted_at: '2026-05-13T09:02:00.000Z',
        },
      ],
      completeness_score: 0.82,
    });

    expect(result.success).toBe(true);
  });

  it('validates guided business context for company-specific and universal Role Guides', () => {
    const digest = CareerPlaybookBusinessContextDigestSchema.parse({
      product: ['AI course generation platform for internal training teams'],
      customers: ['B2B education and HR departments'],
      sales_channels: ['Founder-led sales', 'Inbound demos'],
      processes: ['Course creation starts from uploaded materials'],
      metrics: ['Qualified pipeline', 'Course completion quality'],
      org_structure: ['Sales reports to CEO'],
      constraints: ['No hardcoded customer data in generated documents'],
      source_ids: ['00000000-0000-4000-8000-000000000010'],
      missing_signals: ['pricing model'],
      user_edited: true,
    });

    expect(digest.user_edited).toBe(true);

    const companyContext = CareerPlaybookBusinessContextSchema.parse({
      mode: 'company_specific',
      digest,
      status: 'ready',
      source_ids: ['00000000-0000-4000-8000-000000000010'],
    });

    expect(companyContext.mode).toBe('company_specific');
    expect(companyContext.digest?.customers).toContain('B2B education and HR departments');

    const universalContext = CareerPlaybookBusinessContextSchema.parse({
      mode: 'universal',
      status: 'skipped',
      skip_reason: 'User chose benchmark generation without company data',
    });

    expect(universalContext.digest).toBeNull();
    expect(universalContext.source_ids).toEqual([]);
  });

  it('validates Career Playbook business context source records without course ownership', () => {
    const source = CareerPlaybookBusinessContextSourceSchema.parse({
      id: '00000000-0000-4000-8000-000000000010',
      playbook_id: '00000000-0000-4000-8000-000000000011',
      organization_id: '00000000-0000-4000-8000-000000000012',
      source_type: 'file',
      status: 'uploaded',
      filename: 'sales-playbook.pdf',
      file_catalog_id: '00000000-0000-4000-8000-000000000013',
      created_at: '2026-06-03T00:00:00.000Z',
    });

    expect(source.status).toBe('uploaded');
    expect(source.file_catalog_id).toBe('00000000-0000-4000-8000-000000000013');
  });

  it('validates Career Playbook queue jobs without requiring a courseId', () => {
    const result = JobDataSchema.safeParse({
      jobType: JobType.CAREER_PLAYBOOK,
      operation: 'GENERATE_PLAYBOOK',
      playbookId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      organizationId: '00000000-0000-4000-8000-000000000003',
      language: 'en',
      locale: 'en',
      createdAt: '2026-05-19T00:00:00.000Z',
      qaData: {
        fixed: [{ question_key: 'position', value: 'Product Lead' }],
        followups: [],
        freeform: [],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty follow-up answers unless explicitly skipped', () => {
    expect(
      CareerPlaybookFollowupAnswerSchema.safeParse({
        question_id: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
        question_text: 'What is the typical deal size?',
        question_type: 'single_choice',
      }).success
    ).toBe(false);

    expect(
      CareerPlaybookFollowupAnswerSchema.safeParse({
        question_id: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
        question_text: 'What is the typical deal size?',
        question_type: 'single_choice',
        skipped: true,
      }).success
    ).toBe(true);
  });

  it('normalizes follow-up readiness recommendations below the completeness threshold', () => {
    expect(CAREER_PLAYBOOK_COMPLETENESS_READY_THRESHOLD).toBe(0.75);

    const lowCompletenessResponse = normalizeCareerPlaybookFollowupResponseReadiness({
      questions: [],
      completeness_score: 0.55,
      stop_recommendation: 'ready_to_generate',
    });

    expect(lowCompletenessResponse.stop_recommendation).toBe('ask_more');
    expect(isCareerPlaybookFollowupResponseReady(lowCompletenessResponse)).toBe(false);

    const readyResponse = normalizeCareerPlaybookFollowupResponseReadiness({
      questions: [],
      completeness_score: 0.82,
      stop_recommendation: 'ready_to_generate',
    });

    expect(readyResponse.stop_recommendation).toBe('ready_to_generate');
    expect(isCareerPlaybookFollowupResponseReady(readyResponse)).toBe(true);
  });

  it('validates RoleProfileSpec with every Stage 6 content language and rejects unknown languages', () => {
    expect(CareerPlaybookRoleProfileSpecSchema.safeParse(baseRoleProfileSpec).success).toBe(true);
    expect(
      CareerPlaybookRoleProfileSpecSchema.safeParse({
        ...baseRoleProfileSpec,
        content_language: 'xx',
      }).success
    ).toBe(false);
  });

  it('validates generated block state with judge verdict metadata', () => {
    const result = CareerPlaybookBlockStateSchema.safeParse({
      content: '## 1. Mission\n\nOwn qualified pipeline growth.',
      status: 'generated',
      judge_verdict: {
        pass: true,
        score: 92,
        issues: [],
        needs_regeneration: [],
      },
      generated_at: '2026-05-13T09:10:00.000Z',
      llm_model: 'openai/gpt-5.4',
      attempt: 1,
    });

    expect(result.success).toBe(true);
  });

  it('validates node cost breakdown for LangGraph telemetry', () => {
    const result = CareerPlaybookCostBreakdownSchema.parse({
      nodeCosts: [
        {
          node: 'specBuilder',
          model: 'openai/gpt-5.4',
          input_tokens: 1200,
          output_tokens: 400,
          cost_usd: 0.013,
        },
      ],
      total_cost_usd: 0.013,
    });

    expect(result.nodeCosts).toHaveLength(1);
    expect(result.total_cost_usd).toBe(0.013);
  });

  it('exposes the full Phase 1 playbook status contract', () => {
    expect(CareerPlaybookPlaybookStatusSchema.options).toEqual([
      'draft',
      'answering_fixed',
      'awaiting_followups',
      'answering_followups',
      'ready_to_generate',
      'generating',
      'completed',
      'failed',
    ]);
  });

  it('registers Career Playbook generation in the BullMQ job contract', () => {
    const parsed = JobDataSchema.parse({
      organizationId: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
      userId: '4b7c5538-2367-4012-9088-c2cad7dac9a9',
      jobType: JobType.CAREER_PLAYBOOK,
      createdAt: '2026-05-19T10:00:00.000Z',
      playbookId: '88de7022-17f5-4d30-b982-5fefb3dbe354',
      operation: 'GENERATE_FOLLOWUPS',
      language: 'en',
      locale: 'en',
      qaData: {
        fixed: [{ question_key: 'position', value: 'Head of Sales' }],
        followups: [],
        freeform: [],
      },
    });

    expect(parsed.jobType).toBe(JobType.CAREER_PLAYBOOK);
    expect(DEFAULT_JOB_OPTIONS[JobType.CAREER_PLAYBOOK].attempts).toBeGreaterThan(0);
  });

  it('requires block and instruction data for Career Playbook block regeneration jobs', () => {
    const result = JobDataSchema.safeParse({
      organizationId: '0f9dc5e4-a2f7-4af5-968f-81c8a92b7253',
      userId: '4b7c5538-2367-4012-9088-c2cad7dac9a9',
      jobType: JobType.CAREER_PLAYBOOK,
      createdAt: '2026-05-19T10:00:00.000Z',
      playbookId: '88de7022-17f5-4d30-b982-5fefb3dbe354',
      operation: 'REGENERATE_BLOCK',
      language: 'en',
      locale: 'en',
      blockId: 'block_1',
    });

    expect(result.success).toBe(false);
  });
});
