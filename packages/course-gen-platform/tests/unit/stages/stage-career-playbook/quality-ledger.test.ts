import { describe, expect, it } from 'vitest';
import type { CareerPlaybookMetricLedgerEntry } from '@megacampus/shared-types';
import {
  buildCareerPlaybookEvidenceLedger,
  formatCareerPlaybookCadenceLedgerForPrompt,
  formatCareerPlaybookEvidenceLedgerForPrompt,
  formatCareerPlaybookMetricLedgerForPrompt,
  normalizeCareerPlaybookCadence,
  normalizeCareerPlaybookCadenceLedger,
  normalizeCareerPlaybookMetricLedger,
  reconcileMetricLedgerSourceRefs,
} from '@/stages/stage-career-playbook/nodes/quality-ledger';
import {
  CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS,
  buildCareerPlaybookPriorBlocksDigest,
} from '@/stages/stage-career-playbook/nodes/prior-blocks-digest';
import { getCareerPlaybookGroupSpec } from '@/stages/stage-career-playbook/nodes/group-generator';
import { parseRoleProfileSpecFromLLM } from '@/stages/stage-career-playbook/nodes/spec-builder';
import type { CareerPlaybookWebResearchResult } from '@/stages/stage-career-playbook/rag/web-research';

function metric(
  overrides: Partial<CareerPlaybookMetricLedgerEntry> = {}
): CareerPlaybookMetricLedgerEntry {
  return {
    key: 'pipeline_coverage',
    label: 'Pipeline coverage',
    unit: 'x',
    target: '>=3x',
    green: '>=3x',
    yellow: '2-2.9x',
    red: '<2x',
    review_period: 'quarter',
    provenance: 'benchmark',
    source_ref: null,
    ...overrides,
  };
}

function research(
  findings: CareerPlaybookWebResearchResult['findings']
): CareerPlaybookWebResearchResult {
  return {
    kpis_insights: [],
    trends_insights: [],
    onboarding_insights: [],
    sources: findings.map(finding => finding.url),
    findings,
    errors: [],
    unavailable: findings.length === 0,
  };
}

describe('normalizeCareerPlaybookMetricLedger', () => {
  it('keeps the first definition when the model repeats a metric', () => {
    // A duplicate key is exactly how conflicting thresholds entered the guide.
    const normalized = normalizeCareerPlaybookMetricLedger([
      metric({ target: '>=3x' }),
      metric({ target: '>=2x' }),
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].target).toBe('>=3x');
  });

  it('drops an entry with no target, which could not constrain anything', () => {
    expect(normalizeCareerPlaybookMetricLedger([metric({ target: '   ' })])).toEqual([]);
  });

  it('normalizes the key to snake_case and lowercases the unit', () => {
    const [normalized] = normalizeCareerPlaybookMetricLedger([
      metric({ key: 'Pipeline Coverage!', unit: 'X' }),
    ]);

    expect(normalized.key).toBe('pipeline_coverage');
    expect(normalized.unit).toBe('x');
  });
});

describe('buildCareerPlaybookEvidenceLedger', () => {
  it('assigns S-ids in retrieval order and keeps each claim with its url', () => {
    const ledger = buildCareerPlaybookEvidenceLedger(
      research([
        { category: 'kpis', title: 'A', url: 'https://a.example', claim: 'claim a' },
        { category: 'trends', title: 'B', url: 'https://b.example', claim: 'claim b' },
      ]),
      '2026-08-11'
    );

    expect(ledger.map(entry => entry.id)).toEqual(['S1', 'S2']);
    expect(ledger[0]).toMatchObject({ url: 'https://a.example', claim: 'claim a' });
  });

  it('deduplicates repeated urls across categories', () => {
    const ledger = buildCareerPlaybookEvidenceLedger(
      research([
        { category: 'kpis', title: 'A', url: 'https://a.example', claim: 'claim a' },
        { category: 'trends', title: 'A again', url: 'https://a.example', claim: 'claim a2' },
      ]),
      '2026-08-11'
    );

    expect(ledger).toHaveLength(1);
  });

  it('returns nothing when research produced no findings', () => {
    expect(buildCareerPlaybookEvidenceLedger(research([]), '2026-08-11')).toEqual([]);
  });
});

describe('reconcileMetricLedgerSourceRefs', () => {
  it('demotes a benchmark whose source does not exist to an assumption', () => {
    // A dangling [S3] in the guide is worse than an honest unsourced benchmark.
    const [reconciled] = reconcileMetricLedgerSourceRefs(
      [metric({ provenance: 'benchmark', source_ref: 'S3' })],
      []
    );

    expect(reconciled.source_ref).toBeNull();
    expect(reconciled.provenance).toBe('assumption');
  });

  it('leaves a resolvable reference untouched', () => {
    const [reconciled] = reconcileMetricLedgerSourceRefs(
      [metric({ provenance: 'benchmark', source_ref: 'S1' })],
      [
        {
          id: 'S1',
          url: 'https://a.example',
          title: 'A',
          claim: 'claim',
          retrieved_at: '2026-08-11',
        },
      ]
    );

    expect(reconciled.source_ref).toBe('S1');
    expect(reconciled.provenance).toBe('benchmark');
  });
});

describe('prompt formatting', () => {
  it('renders the metric ledger as a table the block prompts can quote', () => {
    const table = formatCareerPlaybookMetricLedgerForPrompt([metric()]);

    expect(table).toContain('| Metric | Target |');
    expect(table).toContain('Pipeline coverage');
    expect(table).toContain('>=3x');
  });

  it('states explicitly that no statistic may be cited when there are no sources', () => {
    expect(formatCareerPlaybookEvidenceLedgerForPrompt([])).toContain(
      'no precise external statistic may be stated'
    );
  });
});

describe('buildCareerPlaybookPriorBlocksDigest', () => {
  const antiGoalBlock = {
    content:
      '## 2. Anti-goals\n\n- Do not micromanage individual activity\n- Do not own marketing budget',
    status: 'generated' as const,
    attempt: 1,
  };

  it('returns none for the first group, which has no predecessors', () => {
    expect(buildCareerPlaybookPriorBlocksDigest({}, ['header', 'block_1'])).toBe('none');
  });

  it('carries published anti-goals into the next group', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest({ block_2: antiGoalBlock }, ['block_4']);

    expect(digest).toContain('Anti-goals already published');
    expect(digest).toContain('Do not micromanage individual activity');
  });

  it('excludes the blocks the current group is about to write', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest({ block_2: antiGoalBlock }, ['block_2']);

    expect(digest).toBe('none');
  });

  it('keeps anti-goals when the budget forces truncation', () => {
    const noisy = {
      content: Array.from({ length: 200 }, (_, index) => `- Weekly metric ${index}: 42%`).join(
        '\n'
      ),
      status: 'generated' as const,
      attempt: 1,
    };

    const digest = buildCareerPlaybookPriorBlocksDigest(
      { block_2: antiGoalBlock, block_6: noisy },
      ['block_11'],
      { maxTokens: 120 }
    );

    expect(digest).toContain('Do not micromanage individual activity');
    expect(Math.ceil(digest.length / 4)).toBeLessThanOrEqual(120);
  });

  /**
   * Return the section a given output block must read. A heading either names
   * its blocks or covers the whole group, since targets that would receive
   * identical lines now share one rendering instead of one copy each.
   */
  function targetSection(digest: string, blockId: string): string {
    const sections = digest.split(/\n\n(?=For )/);
    const match = sections.find(section => {
      const heading = section.slice(0, section.indexOf('\n'));
      if (heading === 'For every output block in this group:') return true;
      return heading
        .replace(/^For /, '')
        .replace(/ only:$/, '')
        .split(', ')
        .includes(blockId);
    });
    return match ?? '';
  }

  // mc2-923ku: these four sections are contradiction guards over the single
  // assembled document (anti-goals, decision authority, numeric commitments,
  // cadences), not repetition-avoidance guidance, so a prior block reaches
  // every later target regardless of whether they share a reader. block_12 is
  // HR-only and block_22/block_9 are employee-only — no shared reader, and the
  // digest still carries the content across that boundary.
  it('carries prior content to every later target inside real mixed-audience groups, split per target only by generation status', () => {
    const peopleTargetIds = getCareerPlaybookGroupSpec('group_3_people').blocks.map(
      block => block.blockId
    );
    const peopleDigest = buildCareerPlaybookPriorBlocksDigest(
      {
        block_22: {
          content: '- Weekly employee-only handoff review: 42%',
          status: 'generated',
          attempt: 1,
        },
        block_1: {
          content: '- Draft mission confidence: 99%',
          status: 'generating',
          attempt: 1,
        },
      },
      peopleTargetIds
    );

    expect(targetSection(peopleDigest, 'block_9')).toContain(
      'block_22: Weekly employee-only handoff review: 42%'
    );
    expect(targetSection(peopleDigest, 'block_12')).toContain(
      'block_22: Weekly employee-only handoff review: 42%'
    );
    // block_1 is still "generating", not "generated" — excluded regardless of audience.
    expect(peopleDigest).not.toContain('Draft mission');

    const wrapTargetIds = getCareerPlaybookGroupSpec('group_6_wrap').blocks.map(
      block => block.blockId
    );
    const wrapDigest = buildCareerPlaybookPriorBlocksDigest(
      {
        block_12: {
          content: '- Monthly HR-only candidate calibration: 77%',
          status: 'generated',
          attempt: 1,
        },
      },
      wrapTargetIds
    );

    expect(targetSection(wrapDigest, 'block_26')).toContain(
      'block_12: Monthly HR-only candidate calibration: 77%'
    );
    expect(targetSection(wrapDigest, 'block_22')).toContain(
      'block_12: Monthly HR-only candidate calibration: 77%'
    );
    expect(Math.ceil(wrapDigest.length / 4)).toBeLessThanOrEqual(
      CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
    );
  });
});

/**
 * Spec-shape resilience.
 *
 * The first live run on the quality contract died here: the model returned
 * metric_ledger rows with no key/label and provenance as an array, zod rejected
 * the whole RoleProfileSpec, and 26 blocks were lost to a formatting slip in a
 * secondary field. The ledger must degrade, never abort.
 */
describe('parseRoleProfileSpecFromLLM metric ledger resilience', () => {
  const baseSpec = {
    position: { title: 'Sales Manager B2B', slug: 'smb2b', department: 'sales', level: 'lead' },
    context: { team_size: '51-200', reports_to: 'CRO', has_subordinates: true },
    focus_areas: {
      primary_kpis: ['Pipeline coverage'],
      key_tools: ['CRM'],
      critical_competencies: ['Coaching'],
      anti_goals: ['Do not micromanage'],
      failure_patterns: ['Pipeline neglect'],
    },
    research: null,
    block_boundaries: {},
    content_language: 'en',
  };

  it('coerces the exact malformed shape that failed the first live run', () => {
    const spec = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...baseSpec,
        metric_ledger: [
          {
            metric: 'Pipeline coverage',
            target: '>=3x',
            provenance: ['benchmark'],
            cadence: 'quarter',
          },
        ],
      })
    );

    expect(spec.metric_ledger).toHaveLength(1);
    expect(spec.metric_ledger[0]).toMatchObject({
      label: 'Pipeline coverage',
      target: '>=3x',
      provenance: 'benchmark',
      review_period: 'quarter',
    });
    expect(spec.metric_ledger[0].key).toBeTruthy();
  });

  it('drops an unusable row instead of failing the whole spec', () => {
    const spec = parseRoleProfileSpecFromLLM(
      JSON.stringify({ ...baseSpec, metric_ledger: [{ note: 'no target here' }, 'garbage'] })
    );

    expect(spec.metric_ledger).toEqual([]);
    expect(spec.position.title).toBe('Sales Manager B2B');
  });

  it('discards model-supplied evidence_ledger and generated_on', () => {
    const spec = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...baseSpec,
        evidence_ledger: [{ id: 'S1', url: 'invented', title: 't', claim: 'c', retrieved_at: 'x' }],
        generated_on: '2019-01-01',
      })
    );

    expect(spec.evidence_ledger).toEqual([]);
    expect(spec.generated_on).toBeUndefined();
  });

  it('survives an unknown provenance by treating it as an assumption', () => {
    const spec = parseRoleProfileSpecFromLLM(
      JSON.stringify({
        ...baseSpec,
        metric_ledger: [{ key: 'x', label: 'X', target: '10%', provenance: 'guesswork' }],
      })
    );

    expect(spec.metric_ledger[0].provenance).toBe('assumption');
  });
});

// The cadence ledger exists because the 2026-08-30 run stated the pipeline
// review weekly in six blocks and quarterly in five, and no single-block rewrite
// could reconcile them. Same treatment as the metric ledger: the model answers,
// this module makes the answer conform.
describe('normalizeCareerPlaybookCadenceLedger', () => {
  it('normalizes the key and reads a rhythm written in either language', () => {
    const ledger = normalizeCareerPlaybookCadenceLedger([
      {
        key: 'Pipeline Review!',
        label: '  Pipeline review  ',
        cadence: 'Every week',
        owner: 'Manager',
        scope: 'team',
      },
      { key: 'forecast', label: 'Forecast review', cadence: 'ежемесячно', owner: '', scope: '' },
    ]);

    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({
      key: 'pipeline_review',
      label: 'Pipeline review',
      cadence: 'weekly',
    });
    expect(ledger[1]).toMatchObject({ key: 'forecast', cadence: 'monthly' });
  });

  it('keeps the first answer when the model states a commitment twice', () => {
    const ledger = normalizeCareerPlaybookCadenceLedger([
      { key: 'pipeline_review', label: 'Pipeline review', cadence: 'weekly', owner: '', scope: '' },
      {
        key: 'pipeline_review',
        label: 'Pipeline review',
        cadence: 'quarterly',
        owner: '',
        scope: '',
      },
    ]);

    expect(ledger).toHaveLength(1);
    expect(ledger[0].cadence).toBe('weekly');
  });

  it('drops a row whose rhythm cannot be quoted, as it constrains nothing', () => {
    expect(
      normalizeCareerPlaybookCadenceLedger([
        { key: 'ritual', label: 'Deal desk', cadence: 'as needed', owner: '', scope: '' },
      ])
    ).toEqual([]);
  });

  it('recognises only the six words the checker can also see', () => {
    expect(normalizeCareerPlaybookCadence('Quarterly')).toBe('quarterly');
    expect(normalizeCareerPlaybookCadence('раз в две недели')).toBe('biweekly');
    expect(normalizeCareerPlaybookCadence('twice a week')).toBeNull();
    expect(normalizeCareerPlaybookCadence('')).toBeNull();
  });
});

describe('formatCareerPlaybookCadenceLedgerForPrompt', () => {
  it('renders a table a block can quote from', () => {
    const rendered = formatCareerPlaybookCadenceLedgerForPrompt([
      {
        key: 'pipeline_review',
        label: 'Pipeline review',
        cadence: 'weekly',
        owner: 'Manager',
        scope: 'the whole team',
      },
    ]);

    expect(rendered).toContain('| Commitment | Cadence | Owner | Scope |');
    expect(rendered).toContain('| Pipeline review | weekly | Manager | the whole team |');
  });

  it('says so explicitly when no rhythm was declared', () => {
    expect(formatCareerPlaybookCadenceLedgerForPrompt([])).toContain('none —');
  });
});
