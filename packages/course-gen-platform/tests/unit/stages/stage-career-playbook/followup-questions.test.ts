import { describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookQAData } from '@megacampus/shared-types';
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
  stop_recommendation: 'ready_to_generate',
};

describe('Career Playbook follow-up questions helper', () => {
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
        freeform_text: 'Enterprise sales, consultative deals, CRM discipline.',
      })
    );
    expect(variables.previous_followups_json).toContain('Enterprise cycle');
  });

  it('parses fenced LLM JSON with the shared follow-up schema', () => {
    const parsed = parseFollowupResponseFromLLM(
      `Here is the result:\n\n\`\`\`json\n${JSON.stringify(followupResponse)}\n\`\`\``
    );

    expect(parsed.questions).toHaveLength(1);
    expect(parsed.completeness_score).toBe(0.82);
    expect(parsed.stop_recommendation).toBe('ready_to_generate');
  });

  it('renders the follow-up prompt, invokes runtime, and returns parsed response with cost', async () => {
    const renderPrompt = vi.fn().mockResolvedValue('rendered followup prompt');
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify(followupResponse),
      model: 'mock-career-model',
      inputTokens: 90,
      outputTokens: 110,
      costUsd: 0.01,
    });

    const result = await generateCareerPlaybookFollowups(
      { qaData, language: 'ru' },
      { renderPrompt, invokeLLM }
    );

    expect(renderPrompt).toHaveBeenCalledWith(
      'career_playbook_followup_generator',
      expect.objectContaining({
        position: 'B2B Sales Manager',
        content_language: 'ru',
      })
    );
    expect(invokeLLM).toHaveBeenCalledWith(
      'rendered followup prompt',
      expect.objectContaining({
        phaseName: 'stage_career_playbook_followup',
        promptKey: 'career_playbook_followup_generator',
        node: 'followupGenerator',
      })
    );
    expect(result.response.questions[0]?.question_text).toBe(
      'Which CRM metric should define success?'
    );
    expect(result.nodeCost).toEqual({
      node: 'followupGenerator',
      model: 'mock-career-model',
      input_tokens: 90,
      output_tokens: 110,
      cost_usd: 0.01,
    });
  });
});
