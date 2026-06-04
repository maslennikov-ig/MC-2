import { describe, expect, it } from 'vitest';
import type { CareerPlaybookQAData } from '@megacampus/shared-types';
import {
  buildSpecBuilderPromptVariables,
  buildCareerPlaybookResearchQueries,
  createSpecBuilderNode,
  parseRoleProfileSpecFromLLM,
  runCareerPlaybookWebResearch,
} from '@/stages/stage-career-playbook/nodes/spec-builder';

const qaData: CareerPlaybookQAData = {
  fixed: [
    { question_key: 'position', value: 'B2B Sales Manager' },
    { question_key: 'department', value: 'sales' },
    { question_key: 'level', value: 'senior' },
    { question_key: 'team_size', value: '51-200' },
    { question_key: 'reporting', value: 'Reports to CRO. Leads 3 SDRs.' },
    { question_key: 'content_language', value: 'ru' },
  ],
  followups: [],
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
      user_edited: true,
    },
  },
};

const roleProfileSpec = {
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
    subordinates_description: '3 SDRs',
  },
  focus_areas: {
    primary_kpis: ['Qualified pipeline', 'Closed revenue', 'Win rate'],
    key_tools: ['CRM', 'Sales engagement'],
    critical_competencies: ['Discovery', 'Negotiation', 'Forecasting'],
    anti_goals: ['Own product roadmap', 'Approve legal terms'],
    failure_patterns: ['Poor CRM hygiene', 'Discount-first selling'],
  },
  research: {
    kpis_insights: ['Pipeline coverage should be reviewed weekly'],
    trends_insights: ['AI copilots improve account preparation'],
    onboarding_insights: ['Shadowing shortens ramp time'],
    sources: ['https://example.com/sales-kpi'],
  },
  business_context: {
    mode: 'company_specific',
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
      user_edited: true,
    },
    source_ids: ['00000000-0000-4000-8000-000000000010'],
  },
  block_boundaries: {
    block_1: {
      primary_topics: ['mission', 'north star metric'],
      do_not_repeat: ['decision authority'],
    },
    block_5: {
      primary_topics: ['decision authority'],
      do_not_repeat: ['competency matrix'],
    },
  },
  content_language: 'ru',
};

describe('Career Playbook spec builder', () => {
  it('parses RoleProfileSpec from fenced LLM JSON', () => {
    const parsed = parseRoleProfileSpecFromLLM(
      `Here is the spec:\n\n\`\`\`json\n${JSON.stringify(roleProfileSpec)}\n\`\`\``
    );

    expect(parsed.position.title).toBe('B2B Sales Manager');
    expect(parsed.focus_areas.primary_kpis).toContain('Qualified pipeline');
    expect(parsed.block_boundaries.block_5.primary_topics).toContain('decision authority');
  });

  it('drops blank optional string fields before validating RoleProfileSpec', () => {
    const parsed = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...roleProfileSpec,
        position: {
          ...roleProfileSpec.position,
          specialization: '',
        },
        context: {
          ...roleProfileSpec.context,
          has_subordinates: false,
          subordinates_description: '',
          industry: '   ',
          region: '',
        },
      })
    );

    expect(parsed.position.specialization).toBeUndefined();
    expect(parsed.context.subordinates_description).toBeUndefined();
    expect(parsed.context.industry).toBeUndefined();
    expect(parsed.context.region).toBeUndefined();
  });

  it('builds exactly three role-specific web research queries', () => {
    const queries = buildCareerPlaybookResearchQueries(qaData);

    expect(queries).toHaveLength(3);
    expect(queries.map(query => query.category)).toEqual(['kpis', 'trends', 'onboarding']);
    expect(queries[0].query).toContain('B2B Sales Manager');
    expect(queries[1].query).toContain('2026');
  });

  it('builds spec prompt variables with client business context separated from web research', () => {
    const variables = buildSpecBuilderPromptVariables(
      qaData,
      {
        kpis_insights: ['External benchmark: pipeline coverage is commonly reviewed weekly'],
        trends_insights: ['External benchmark: AI copilots improve account preparation'],
        onboarding_insights: ['External benchmark: shadowing shortens ramp time'],
        sources: ['https://example.com/sales-kpi'],
        errors: [],
      },
      'ru',
      'Source excerpt: customer onboarding requires security review.'
    );

    expect(variables.business_context_mode).toBe('company_specific');
    expect(variables.business_context_digest).toContain('AI course generation platform');
    expect(variables.business_context_source_excerpts).toContain(
      'customer onboarding requires security review'
    );
    expect(variables.business_context_digest).toContain('B2B education teams');
    expect(variables.business_context_missing_signals).toContain('pricing model');
    expect(variables.kpi_insights).toContain('External benchmark');
    expect(variables.business_context_digest).not.toContain('External benchmark');
  });

  it('returns empty research with error metadata when every web search times out', async () => {
    const research = await runCareerPlaybookWebResearch(qaData, {
      timeoutMs: 1,
      client: () => new Promise(resolve => setTimeout(() => resolve([]), 50)),
    });

    expect(research.kpis_insights).toEqual([]);
    expect(research.trends_insights).toEqual([]);
    expect(research.onboarding_insights).toEqual([]);
    expect(research.sources).toEqual([]);
    expect(research.errors).toHaveLength(3);
  });

  it('retries spec generation with fallback model instructions when primary output fails schema validation', async () => {
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          position: 'B2B Sales Manager',
          block_boundaries: [],
        }),
        model: 'fast-model',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(roleProfileSpec),
        model: 'fallback-model',
        inputTokens: 20,
        outputTokens: 20,
        costUsd: 0,
      });
    const specBuilderNode = createSpecBuilderNode({
      runtime: {
        renderPrompt: vi.fn().mockResolvedValue('base spec prompt'),
        invokeLLM,
      },
      webResearch: { client: () => Promise.resolve([]) },
      businessContextSourceExcerpts: () => Promise.resolve('- none'),
    });

    const result = await specBuilderNode({
      playbookId: '33333333-3333-4333-8333-333333333333',
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      language: 'ru',
      qaData,
      currentNode: 'specBuilder',
      roleProfileSpec: null,
      webResearch: null,
      generatedBlocks: {},
      nodeCosts: [],
      errors: [],
    });

    expect(result.errors).toBeUndefined();
    expect(result.roleProfileSpec?.position.title).toBe('B2B Sales Manager');
    expect(result.currentNode).toBe('group1Generator');
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(invokeLLM).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Previous RoleProfileSpec response failed validation'),
      expect.objectContaining({
        preferFallbackModel: true,
        maxTokensMultiplier: 1.25,
      })
    );
  });
});
