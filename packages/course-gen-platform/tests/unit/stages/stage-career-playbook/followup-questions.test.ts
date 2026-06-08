import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookQAData } from '@megacampus/shared-types';

const sourceMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: sourceMocks.from,
  })),
}));

import {
  buildFollowupPromptVariables,
  generateCareerPlaybookFollowups,
  parseFollowupResponseFromLLM,
} from '@/stages/stage-career-playbook/nodes/followup-questions';

const qaData: CareerPlaybookQAData = {
  fixed: [
    { question_key: 'position', value: 'B2B Sales Manager' },
    { question_key: 'department', value: 'sales' },
    { question_key: 'level', value: 'senior' },
    { question_key: 'team_size', value: '51-200' },
    { question_key: 'company_stage', value: 'growth' },
    { question_key: 'reporting', value: 'Reports to CRO. Leads 3 SDRs.' },
  ],
  followups: [
    {
      question_id: '00000000-0000-4000-8000-000000000001',
      question_text: 'What sales cycle do you support?',
      question_type: 'open',
      value: 'Enterprise cycle',
    },
  ],
  freeform: [{ text: 'Enterprise sales, consultative deals, CRM discipline.' }],
  business_context: {
    mode: 'company_specific',
    status: 'ready',
    source_ids: ['00000000-0000-4000-8000-000000000010'],
    digest: {
      product: ['AI course generation platform'],
      customers: ['B2B education teams'],
      sales_channels: ['Inbound demos'],
      processes: ['Course generation from uploaded materials'],
      metrics: ['Qualified pipeline'],
      org_structure: ['Sales reports to CRO'],
      constraints: ['No customer secrets in generated documents'],
      source_ids: ['00000000-0000-4000-8000-000000000010'],
      missing_signals: ['pricing model'],
      user_edited: false,
    },
  },
};

const followupResponse = {
  questions: [
    {
      question_id: '00000000-0000-4000-8000-000000000002',
      question_text: 'Which CRM metric should define success?',
      question_type: 'single_choice',
      options: [
        { value: 'pipeline_coverage', label: 'Pipeline coverage' },
        { value: 'win_rate', label: 'Win rate' },
      ],
      rationale: 'The Role Guide needs one measurable success anchor.',
    },
  ],
  completeness_score: 0.82,
  stop_recommendation: 'ask_more',
};

const mixedLanguageFollowupResponse = {
  questions: [
    {
      question_id: '00000000-0000-4000-8000-000000000004',
      question_text: 'Which CRM-метрика should define success?',
      question_type: 'single_choice',
      options: [
        { value: 'pipeline_coverage', label: 'Pipeline покрытие' },
        { value: 'win_rate', label: 'Win rate ставка' },
      ],
      rationale: 'The инструкция needs one measurable anchor.',
    },
  ],
  completeness_score: 0.82,
  stop_recommendation: 'ask_more',
};

const russianFollowupResponse = {
  questions: [
    {
      question_id: '00000000-0000-4000-8000-000000000003',
      question_text: 'Какая CRM-метрика должна определять успех роли?',
      question_type: 'single_choice',
      options: [
        { value: 'pipeline_coverage', label: 'Покрытие воронки' },
        { value: 'win_rate', label: 'Процент выигранных сделок' },
      ],
      rationale: 'Должностная инструкция должна опираться на один измеримый критерий.',
    },
  ],
  completeness_score: 0.82,
  stop_recommendation: 'ask_more',
};

function createSourceRowsBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    neq: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

function createFileRowsBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data, error })),
  };

  return builder;
}

function mockBusinessContextSourceExcerpt(content: string, markdownContent: string | null = null) {
  const sourceBuilder = createSourceRowsBuilder([
    {
      id: '00000000-0000-4000-8000-000000000010',
      filename: 'sales-deck.pdf',
      status: 'ready',
      file_catalog_id: '00000000-0000-4000-8000-000000000020',
    },
  ]);
  const fileBuilder = createFileRowsBuilder([
    {
      id: '00000000-0000-4000-8000-000000000020',
      filename: 'sales-deck.pdf',
      processed_content: content,
      markdown_content: markdownContent,
    },
  ]);

  sourceMocks.from.mockImplementation((table: string) => {
    if (table === 'career_playbook_sources') return sourceBuilder;
    if (table === 'file_catalog') return fileBuilder;
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('Career Playbook follow-up questions helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceMocks.from.mockReset();
  });

  it('builds prompt variables from Q&A data', () => {
    const variables = buildFollowupPromptVariables(qaData, 'ru');

    expect(variables).toEqual(
      expect.objectContaining({
        position: 'B2B Sales Manager',
        department: 'sales',
        level: 'senior',
        team_size: '51-200',
        company_stage: 'growth',
        reporting: 'Reports to CRO. Leads 3 SDRs.',
        content_language: 'ru',
        content_language_name: 'Russian',
        freeform_text: 'Enterprise sales, consultative deals, CRM discipline.',
        business_context_mode: 'company_specific',
      })
    );
    expect(variables.previous_followups_json).toContain('Enterprise cycle');
    expect(variables.business_context_digest).toContain('AI course generation platform');
    expect(variables.business_context_missing_signals).toContain('pricing model');
  });

  it('parses fenced LLM JSON with the shared follow-up schema', () => {
    const parsed = parseFollowupResponseFromLLM(
      `Here is the result:\n\n\`\`\`json\n${JSON.stringify({
        questions: [],
        completeness_score: 0.82,
        stop_recommendation: 'ready_to_generate',
      })}\n\`\`\``
    );

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.completeness_score).toBe(0.82);
    expect(parsed.stop_recommendation).toBe('ready_to_generate');
  });

  it('normalizes low-completeness ready recommendations back to ask_more', () => {
    const parsed = parseFollowupResponseFromLLM(
      JSON.stringify({
        questions: [],
        completeness_score: 0.55,
        stop_recommendation: 'ready_to_generate',
      })
    );

    expect(parsed.completeness_score).toBe(0.55);
    expect(parsed.stop_recommendation).toBe('ask_more');
  });

  it('normalizes missing or invalid LLM follow-up question ids', () => {
    const parsed = parseFollowupResponseFromLLM(
      JSON.stringify({
        questions: [
          {
            question_id: 'not-a-uuid',
            question_text: 'Which revenue motion matters most?',
            question_type: 'open',
            options: null,
            rationale: 'Needed for role guide focus.',
          },
          {
            question_text: 'Which segment owns the pipeline?',
            question_type: 'open',
            options: null,
            rationale: 'Needed for scope.',
          },
        ],
        completeness_score: 0.7,
        stop_recommendation: 'ask_more',
      })
    );

    expect(parsed.questions).toHaveLength(2);
    for (const question of parsed.questions) {
      expect(question.question_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it('renders the follow-up prompt with Career Playbook source evidence, invokes runtime, and returns parsed response with cost', async () => {
    mockBusinessContextSourceExcerpt(
      'Summary: enterprise onboarding requires security review.',
      'Full markdown: expansion handoff requires a renewal manager approval gate.'
    );
    const renderPrompt = vi.fn().mockResolvedValue('rendered followup prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify(russianFollowupResponse),
      model: 'mock-career-model',
      inputTokens: 90,
      outputTokens: 110,
      costUsd: 0.01,
    });

    const result = await generateCareerPlaybookFollowups(
      {
        playbookId: '33333333-3333-4333-8333-333333333333',
        qaData,
        language: 'ru',
      },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_followup_generator',
      expect.objectContaining({
        position: 'B2B Sales Manager',
        content_language: 'ru',
        business_context_source_excerpts: expect.stringContaining('Source evidence pack'),
      })
    );
    const promptVariables = renderPrompt.mock.calls[0]?.[1] as Record<string, string>;
    expect(promptVariables.business_context_source_excerpts).toContain(
      'Summary: enterprise onboarding requires security review'
    );
    expect(promptVariables.business_context_source_excerpts).toContain(
      'expansion handoff requires a renewal manager approval gate'
    );
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered followup prompt',
      expect.objectContaining({
        phaseName: 'stage_career_playbook_followup',
        promptKey: 'career_playbook_followup_generator',
        node: 'followupGenerator',
        language: 'ru',
      })
    );
    expect(result.response.questions[0]?.question_text).toBe(
      'Какая CRM-метрика должна определять успех роли?'
    );
    expect(result.nodeCost).toEqual({
      node: 'followupGenerator',
      model: 'mock-career-model',
      input_tokens: 90,
      output_tokens: 110,
      cost_usd: 0.01,
    });
  });

  it('requests structured follow-up JSON from the runtime', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered followup prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify(russianFollowupResponse),
      model: 'mock-career-model',
      inputTokens: 90,
      outputTokens: 110,
      costUsd: 0.01,
    });

    await generateCareerPlaybookFollowups(
      {
        qaData,
        language: 'ru',
        businessContextSourceExcerpts: '- none',
      },
      { renderPrompt, invokeLLM }
    );

    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered followup prompt',
      expect.objectContaining({
        structuredOutputName: 'career_playbook_followups',
        structuredOutputMethod: 'jsonSchema',
        structuredOutputStrict: true,
      })
    );
  });

  it('repairs English-heavy follow-up output before returning Russian follow-ups', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered followup prompt');
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(followupResponse),
        model: 'fast-model',
        inputTokens: 90,
        outputTokens: 110,
        costUsd: 0.01,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(russianFollowupResponse),
        model: 'fallback-model',
        inputTokens: 120,
        outputTokens: 130,
        costUsd: 0.02,
      });

    const result = await generateCareerPlaybookFollowups(
      {
        qaData,
        language: 'ru',
        businessContextSourceExcerpts: '- none',
      },
      { renderPrompt, invokeLLM }
    );

    expect(result.response.questions[0]?.question_text).toBe(
      'Какая CRM-метрика должна определять успех роли?'
    );
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(invokeLLM).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Previous follow-up response failed target-language validation'),
      expect.objectContaining({
        preferFallbackModel: true,
        maxTokensMultiplier: 1.1,
        structuredOutputName: 'career_playbook_followups',
      })
    );
    expect(result.nodeCost).toEqual({
      node: 'followupGenerator',
      model: 'fallback-model',
      input_tokens: 210,
      output_tokens: 240,
      cost_usd: 0.03,
    });
  });

  it('repairs mostly English mixed-language Russian follow-up fields', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered followup prompt');
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(mixedLanguageFollowupResponse),
        model: 'fast-model',
        inputTokens: 90,
        outputTokens: 110,
        costUsd: 0.01,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(russianFollowupResponse),
        model: 'fallback-model',
        inputTokens: 120,
        outputTokens: 130,
        costUsd: 0.02,
      });

    const result = await generateCareerPlaybookFollowups(
      {
        qaData,
        language: 'ru',
        businessContextSourceExcerpts: '- none',
      },
      { renderPrompt, invokeLLM }
    );

    expect(result.response.questions[0]?.question_text).toBe(
      'Какая CRM-метрика должна определять успех роли?'
    );
    expect(invokeLLM).toHaveBeenCalledTimes(2);
  });
});
