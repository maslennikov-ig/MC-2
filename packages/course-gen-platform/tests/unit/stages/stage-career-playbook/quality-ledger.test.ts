import { describe, expect, it } from 'vitest';
import type { CareerPlaybookMetricLedgerEntry } from '@megacampus/shared-types';
import {
  buildCareerPlaybookEvidenceLedger,
  formatCareerPlaybookEvidenceLedgerForPrompt,
  formatCareerPlaybookMetricLedgerForPrompt,
  normalizeCareerPlaybookMetricLedger,
  reconcileMetricLedgerSourceRefs,
} from '@/stages/stage-career-playbook/nodes/quality-ledger';
import { buildCareerPlaybookPriorBlocksDigest } from '@/stages/stage-career-playbook/nodes/prior-blocks-digest';
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
});
