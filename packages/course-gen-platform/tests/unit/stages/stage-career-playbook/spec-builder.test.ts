import { describe, expect, it } from 'vitest';
import type { CareerPlaybookQAData } from '@megacampus/shared-types';
import {
  applyCareerPlaybookLedgers,
  CAREER_PLAYBOOK_SPEC_MAX_TOKENS,
  buildSpecBuilderPromptVariables,
  buildCanonicalBlockTopicCorrectionPrompt,
  buildCareerPlaybookResearchQueries,
  createSpecBuilderNode,
  findCanonicalBlockTopicDeviations,
  normalizeRoleProfileSpecToCanonicalBlockTopics,
  parseRoleProfileSpecFromLLM,
  runCareerPlaybookWebResearch,
} from '@/stages/stage-career-playbook/nodes/spec-builder';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';
import {
  CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS,
  CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS,
} from '@/shared/prompts/career-playbook-block-topics';

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

function canonicalBlockBoundaries(): Record<
  string,
  { primary_topics: string[]; do_not_repeat: string[] }
> {
  return Object.fromEntries(
    CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS.map(entry => [
      entry.blockId,
      { primary_topics: [entry.primaryTopic], do_not_repeat: [] },
    ])
  );
}

const canonicalRoleProfileSpec = {
  ...roleProfileSpec,
  block_boundaries: canonicalBlockBoundaries(),
};

// Mirrors the block-topic reassignment seen in A/B run b866d2f5 (bead mc2-1slzl):
// block_11=Forecasting, block_23=Career Pathing, block_25=Compliance.
const deviantRoleProfileSpec = {
  ...roleProfileSpec,
  block_boundaries: {
    ...canonicalBlockBoundaries(),
    block_11: {
      primary_topics: ['Forecasting / Revenue Projections'],
      do_not_repeat: ['career path'],
    },
    block_23: { primary_topics: ['Career Pathing'], do_not_repeat: [] },
    block_25: { primary_topics: ['Compliance'], do_not_repeat: [] },
  },
};

const baseSpecBuilderState = {
  playbookId: '33333333-3333-4333-8333-333333333333',
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  language: 'ru',
  qaData,
  currentNode: 'specBuilder' as const,
  roleProfileSpec: null,
  webResearch: null,
  generatedBlocks: {},
  nodeCosts: [],
  errors: [],
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

  it('treats null optional string fields as missing and preserves valid optional strings', () => {
    const parsedWithNulls = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...roleProfileSpec,
        position: {
          ...roleProfileSpec.position,
          specialization: null,
        },
        context: {
          ...roleProfileSpec.context,
          subordinates_description: null,
          industry: null,
          region: null,
        },
      })
    );

    expect(parsedWithNulls.position.specialization).toBeUndefined();
    expect(parsedWithNulls.context.subordinates_description).toBeUndefined();
    expect(parsedWithNulls.context.industry).toBeUndefined();
    expect(parsedWithNulls.context.region).toBeUndefined();

    const parsedWithStrings = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...roleProfileSpec,
        position: {
          ...roleProfileSpec.position,
          specialization: 'Enterprise sales',
        },
        context: {
          ...roleProfileSpec.context,
          subordinates_description: '3 SDRs',
          industry: 'B2B SaaS',
          region: 'EMEA',
        },
      })
    );

    expect(parsedWithStrings.position.specialization).toBe('Enterprise sales');
    expect(parsedWithStrings.context.subordinates_description).toBe('3 SDRs');
    expect(parsedWithStrings.context.industry).toBe('B2B SaaS');
    expect(parsedWithStrings.context.region).toBe('EMEA');
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
        content: JSON.stringify(canonicalRoleProfileSpec),
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
    // The repair now stays on the PRIMARY model with a larger budget. The
    // dominant cause of a spec parse failure is truncation, which is a budget
    // problem: on 2026-08-11 the forced downgrade to the fallback model cost
    // 17.5 minutes and produced the degraded spec all 26 blocks inherited.
    expect(invokeLLM).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Previous RoleProfileSpec response failed validation'),
      expect.objectContaining({
        maxTokens: CAREER_PLAYBOOK_SPEC_MAX_TOKENS,
        maxTokensMultiplier: 1.5,
      })
    );
    expect(invokeLLM.mock.calls[1][1]).not.toHaveProperty('preferFallbackModel');
  });

  it('exposes a single canonical layout of the header plus 26 boundary blocks', () => {
    expect(CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS).toHaveLength(27);
    expect(CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS[0].blockId).toBe('header');
    expect(CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS[0].hasBoundaries).toBe(false);
    expect(CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS).toHaveLength(26);
    expect(CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS.every(entry => entry.hasBoundaries)).toBe(
      true
    );
  });

  it('injects the canonical 26-block layout and routing rules into the spec builder prompt', () => {
    const specPrompt = careerPlaybookPrompts.find(
      prompt => prompt.promptKey === 'career_playbook_spec_builder'
    );

    expect(specPrompt?.promptTemplate).toContain('block_11: career growth');
    expect(specPrompt?.promptTemplate).toContain('block_23: continuity protocol');
    expect(specPrompt?.promptTemplate).toContain(
      'block_25: footer, revision cadence, and MegaCampus CTA'
    );
    expect(specPrompt?.promptTemplate).toMatch(/MUST NOT move a topic to a different block id/);
  });

  it('flags block topic reassignment against the canonical layout', () => {
    const deviations = findCanonicalBlockTopicDeviations(
      parseRoleProfileSpecFromLLM(JSON.stringify(deviantRoleProfileSpec))
    );

    // block_11 lost its own topic and forecasting belongs to block_6.
    expect(
      deviations.some(
        deviation => deviation.blockId === 'block_11' && deviation.kind === 'missing_anchor'
      )
    ).toBe(true);
    expect(
      deviations.some(
        deviation =>
          deviation.blockId === 'block_11' &&
          deviation.kind === 'cross_assignment' &&
          deviation.conflictingBlockIds?.includes('block_6')
      )
    ).toBe(true);
    // block_23 borrowed block_11's career pathing.
    expect(
      deviations.some(
        deviation =>
          deviation.blockId === 'block_23' &&
          deviation.kind === 'cross_assignment' &&
          deviation.conflictingBlockIds?.includes('block_11')
      )
    ).toBe(true);
    // block_25 lost its footer/CTA anchor.
    expect(
      deviations.some(
        deviation => deviation.blockId === 'block_25' && deviation.kind === 'missing_anchor'
      )
    ).toBe(true);
  });

  it('normalizes deviant block boundaries back to the canonical layout', () => {
    const { spec, changedBlockIds } = normalizeRoleProfileSpecToCanonicalBlockTopics(
      parseRoleProfileSpecFromLLM(JSON.stringify(deviantRoleProfileSpec))
    );

    expect(spec.block_boundaries.block_11.primary_topics).toEqual(['career growth']);
    expect(spec.block_boundaries.block_23.primary_topics).toEqual(['continuity protocol']);
    expect(spec.block_boundaries.block_25.primary_topics[0]).toContain('MegaCampus');
    // Foreign topic dropped and self-contradicting do_not_repeat stripped.
    expect(spec.block_boundaries.block_11.primary_topics).not.toContain(
      'Forecasting / Revenue Projections'
    );
    expect(spec.block_boundaries.block_11.do_not_repeat).toEqual([]);
    // Every content block has a canonical boundary and no deviations remain.
    expect(Object.keys(spec.block_boundaries)).toHaveLength(26);
    expect(findCanonicalBlockTopicDeviations(spec)).toEqual([]);
    expect(changedBlockIds).toEqual(expect.arrayContaining(['block_11', 'block_23', 'block_25']));
  });

  it('preserves role-specific wording that still belongs to the block', () => {
    const spec = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...roleProfileSpec,
        block_boundaries: {
          ...canonicalBlockBoundaries(),
          block_6: {
            primary_topics: ['KPI and metrics', 'forecast accuracy for enterprise pipeline'],
            do_not_repeat: [],
          },
        },
      })
    );

    const { spec: normalized } = normalizeRoleProfileSpecToCanonicalBlockTopics(spec);

    expect(normalized.block_boundaries.block_6.primary_topics[0]).toBe('KPI and metrics');
    expect(normalized.block_boundaries.block_6.primary_topics).toContain(
      'forecast accuracy for enterprise pipeline'
    );
  });

  it('builds a correction prompt that names the deviating block ids', () => {
    const spec = parseRoleProfileSpecFromLLM(JSON.stringify(deviantRoleProfileSpec));
    const correction = buildCanonicalBlockTopicCorrectionPrompt(
      'base spec prompt',
      findCanonicalBlockTopicDeviations(spec)
    );

    expect(correction).toContain('did not follow the fixed 26-block layout');
    expect(correction).toContain('block_25');
    expect(correction).toContain('footer + revision cadence + MegaCampus CTA');
  });

  it('retries the spec once then normalizes to canonical topics when boundaries deviate', async () => {
    const invokeLLM = vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(deviantRoleProfileSpec),
        model: 'fast-model',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(canonicalRoleProfileSpec),
        model: 'fast-model',
        inputTokens: 12,
        outputTokens: 12,
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

    const result = await specBuilderNode(baseSpecBuilderState);

    expect(result.errors).toBeUndefined();
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(invokeLLM).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('did not follow the fixed 26-block layout'),
      expect.objectContaining({ node: 'specBuilder' })
    );
    expect(result.roleProfileSpec?.block_boundaries.block_11.primary_topics).toEqual([
      'career growth',
    ]);
    expect(result.roleProfileSpec?.block_boundaries.block_25.primary_topics[0]).toContain(
      'MegaCampus'
    );
    expect(findCanonicalBlockTopicDeviations(result.roleProfileSpec!)).toEqual([]);
    expect(result.nodeCosts).toHaveLength(2);
  });

  it('falls back to deterministic normalization when the single retry still deviates', async () => {
    const invokeLLM = vi.fn().mockResolvedValue({
      content: JSON.stringify(deviantRoleProfileSpec),
      model: 'fast-model',
      inputTokens: 10,
      outputTokens: 10,
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

    const result = await specBuilderNode(baseSpecBuilderState);

    expect(result.errors).toBeUndefined();
    // First spec call plus exactly one bounded topic-correction retry.
    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(result.roleProfileSpec?.block_boundaries.block_23.primary_topics).toEqual([
      'continuity protocol',
    ]);
    expect(findCanonicalBlockTopicDeviations(result.roleProfileSpec!)).toEqual([]);
  });
});
