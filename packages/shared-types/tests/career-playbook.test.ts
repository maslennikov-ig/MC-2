import { describe, expect, it } from 'vitest';
import {
  CareerPlaybookBlockStateSchema,
  CareerPlaybookCostBreakdownSchema,
  CareerPlaybookFollowupAnswerSchema,
  CareerPlaybookFixedQuestionSchema,
  CareerPlaybookPlaybookStatusSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookRoleProfileSpecSchema,
  SUPPORTED_CAREER_PLAYBOOK_CONTENT_LANGUAGES,
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
      courseId: 'fe0ca675-8d3f-4372-a7c3-2781916a5cd2',
      userId: '4b7c5538-2367-4012-9088-c2cad7dac9a9',
      jobType: JobType.CAREER_PLAYBOOK,
      createdAt: '2026-05-19T10:00:00.000Z',
      playbookId: '88de7022-17f5-4d30-b982-5fefb3dbe354',
      action: 'GENERATE_FOLLOWUPS',
      language: 'en',
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
      courseId: 'fe0ca675-8d3f-4372-a7c3-2781916a5cd2',
      userId: '4b7c5538-2367-4012-9088-c2cad7dac9a9',
      jobType: JobType.CAREER_PLAYBOOK,
      createdAt: '2026-05-19T10:00:00.000Z',
      playbookId: '88de7022-17f5-4d30-b982-5fefb3dbe354',
      action: 'REGENERATE_BLOCK',
      language: 'en',
      blockId: 'block_1',
    });

    expect(result.success).toBe(false);
  });
});
