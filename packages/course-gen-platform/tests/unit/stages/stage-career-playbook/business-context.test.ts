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

  it('builds a digest from ready file sources and returns source excerpts', async () => {
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
