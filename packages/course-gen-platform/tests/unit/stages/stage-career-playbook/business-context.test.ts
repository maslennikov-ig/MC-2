import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookBusinessContext } from '@megacampus/shared-types';

const sourceMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: sourceMocks.from,
  })),
}));

import {
  refreshCareerPlaybookBusinessContextDigest,
  hasPendingCareerPlaybookBusinessContextSources,
  loadCareerPlaybookBusinessContextSourceExcerpts,
} from '@/stages/stage-career-playbook/nodes/business-context';

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

function mockSources(sourceRows: unknown[], fileRows: unknown[]) {
  const sourceBuilder = createSourceRowsBuilder(sourceRows);
  const fileBuilder = createFileRowsBuilder(fileRows);

  sourceMocks.from.mockImplementation((table: string) => {
    if (table === 'career_playbook_sources') return sourceBuilder;
    if (table === 'file_catalog') return fileBuilder;
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('Career Playbook business context digest refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceMocks.from.mockReset();
  });

  it('builds a ready digest from text-only business context', async () => {
    const context: CareerPlaybookBusinessContext = {
      mode: 'company_specific',
      status: 'collecting',
      source_ids: [],
      digest: {
        product: [],
        customers: [],
        sales_channels: [],
        processes: [],
        metrics: [],
        org_structure: [],
        constraints: [],
        source_ids: [],
        missing_signals: [],
        user_edited: true,
      },
    };

    const result = await refreshCareerPlaybookBusinessContextDigest({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context,
      freeformText:
        'Product: AI course generation platform. Customers: HR teams. Metrics: qualified pipeline.',
    });

    expect(result.context.status).toBe('ready');
    expect(result.context.digest?.product.join(' ')).toContain('AI course generation platform');
    expect(result.context.digest?.customers.join(' ')).toContain('HR teams');
    expect(result.context.digest?.metrics.join(' ')).toContain('qualified pipeline');
    expect(result.hasPendingSources).toBe(false);
    expect(sourceMocks.from).not.toHaveBeenCalled();
  });

  it('builds a digest from ready file sources and returns source evidence', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000010';
    const fileId = '00000000-0000-4000-8000-000000000020';
    mockSources(
      [
        {
          id: sourceId,
          filename: 'sales-deck.pdf',
          status: 'ready',
          file_catalog_id: fileId,
        },
      ],
      [
        {
          id: fileId,
          filename: 'sales-deck.pdf',
          processed_content:
            'Product: analytics LMS. Customers: enterprise HR teams. Sales channels: inbound demos. Constraints: no PII in generated docs.',
          markdown_content: null,
        },
      ]
    );

    const result = await refreshCareerPlaybookBusinessContextDigest({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'collecting',
        source_ids: [sourceId],
        digest: null,
      },
      freeformText: '',
    });

    expect(result.context.status).toBe('ready');
    expect(result.context.digest?.product.join(' ')).toContain('analytics LMS');
    expect(result.context.digest?.sales_channels.join(' ')).toContain('inbound demos');
    expect(result.context.digest?.constraints.join(' ')).toContain('no PII');
    expect(result.sourceExcerpts).toContain('sales-deck.pdf');
    expect(result.sourceExcerpts).toContain('enterprise HR teams');
  });

  it('prefers full Docling markdown over summary when building Career Playbook source evidence', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000010';
    const fileId = '00000000-0000-4000-8000-000000000020';
    mockSources(
      [
        {
          id: sourceId,
          filename: 'operating-model.pdf',
          status: 'ready',
          file_catalog_id: fileId,
        },
      ],
      [
        {
          id: fileId,
          filename: 'operating-model.pdf',
          processed_content: 'SUMMARY ONLY: product and market overview.',
          markdown_content:
            '# Operating model\n\nDeep source fact: Renewal managers own the customer health review before expansion handoff.',
        },
      ]
    );

    const result = await loadCareerPlaybookBusinessContextSourceExcerpts({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'ready',
        source_ids: [sourceId],
        digest: null,
      },
      maxCharsPerSource: 20_000,
    });

    expect(result).toContain('Source evidence pack');
    expect(result).toContain('Summary overview');
    expect(result).toContain('SUMMARY ONLY');
    expect(result).toContain('Authoritative source content');
    expect(result).toContain('Renewal managers own the customer health review');
  });

  it('limits Career Playbook source evidence by aggregate token budget across sources', async () => {
    const firstSourceId = '00000000-0000-4000-8000-000000000010';
    const secondSourceId = '00000000-0000-4000-8000-000000000011';
    mockSources(
      [
        {
          id: firstSourceId,
          filename: 'first.md',
          status: 'ready',
          file_catalog_id: '00000000-0000-4000-8000-000000000020',
        },
        {
          id: secondSourceId,
          filename: 'second.md',
          status: 'ready',
          file_catalog_id: '00000000-0000-4000-8000-000000000021',
        },
      ],
      [
        {
          id: '00000000-0000-4000-8000-000000000020',
          filename: 'first.md',
          processed_content: 'First summary.',
          markdown_content: `FIRST_START ${'a'.repeat(320)} FIRST_END`,
        },
        {
          id: '00000000-0000-4000-8000-000000000021',
          filename: 'second.md',
          processed_content: 'Second summary.',
          markdown_content: `SECOND_START ${'b'.repeat(320)} SECOND_END`,
        },
      ]
    );

    const result = await loadCareerPlaybookBusinessContextSourceExcerpts({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'ready',
        source_ids: [firstSourceId, secondSourceId],
        digest: null,
      },
      maxAggregateTokens: 120,
    });

    expect(result).toContain('FIRST_START');
    expect(result).toContain('[truncated to fit Career Playbook source budget]');
    expect(result).not.toContain('SECOND_END');
  });

  it('spends constrained source budget on authoritative markdown before summary overview', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000010';
    const fileId = '00000000-0000-4000-8000-000000000020';
    mockSources(
      [
        {
          id: sourceId,
          filename: 'customer-process.pdf',
          status: 'ready',
          file_catalog_id: fileId,
        },
      ],
      [
        {
          id: fileId,
          filename: 'customer-process.pdf',
          processed_content: `SUMMARY_START ${'s'.repeat(700)} SUMMARY_END`,
          markdown_content:
            'AUTHORITATIVE_START Customer success owns renewal risk review AUTHORITATIVE_END',
        },
      ]
    );

    const result = await loadCareerPlaybookBusinessContextSourceExcerpts({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'ready',
        source_ids: [sourceId],
        digest: null,
      },
      maxAggregateTokens: 130,
    });

    expect(result).toContain('AUTHORITATIVE_START');
    expect(result).toContain('Customer success owns renewal risk review');
    expect(result).not.toContain('SUMMARY_END');
  });

  it('returns a source evidence fallback when source loading throws', async () => {
    sourceMocks.from.mockImplementation(() => {
      throw new Error('database connection lost');
    });

    const result = await loadCareerPlaybookBusinessContextSourceExcerpts({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'ready',
        source_ids: ['00000000-0000-4000-8000-000000000010'],
        digest: null,
      },
    });

    expect(result).toContain('source evidence could not be loaded');
    expect(result).toContain('Do not infer facts from source ids');
  });

  it('keeps context collecting when any selected source is still processing', async () => {
    const sourceId = '00000000-0000-4000-8000-000000000010';
    mockSources(
      [
        {
          id: sourceId,
          filename: 'sales-deck.pdf',
          status: 'processing',
          file_catalog_id: '00000000-0000-4000-8000-000000000020',
        },
      ],
      []
    );

    const result = await refreshCareerPlaybookBusinessContextDigest({
      playbookId: '33333333-3333-4333-8333-333333333333',
      context: {
        mode: 'company_specific',
        status: 'collecting',
        source_ids: [sourceId],
        digest: null,
      },
      freeformText: '',
    });

    expect(result.context.status).toBe('collecting');
    expect(result.hasPendingSources).toBe(true);
    expect(hasPendingCareerPlaybookBusinessContextSources(result)).toBe(true);
    expect(result.context.digest?.missing_signals).toContain('source processing');
  });
});
