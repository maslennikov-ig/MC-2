import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context, UserContext } from '../../src/server/trpc';
import type { CareerPlaybookRow } from '../../src/server/routers/career-playbook/service-mappers';

const fromMock = vi.fn();

vi.mock('../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: fromMock,
  })),
}));

const {
  getCareerPlaybookFromLibrary,
  listCareerPlaybooks,
  toggleCareerPlaybookShare,
  updateCareerPlaybookNumericFact,
  updateCareerPlaybookVisibility,
} = await import('../../src/server/routers/career-playbook/library-service');

const owner: UserContext = {
  id: 'owner-user',
  email: 'owner@example.com',
  role: 'student',
  organizationId: 'org-1',
};

const orgMember: UserContext = {
  id: 'member-user',
  email: 'member@example.com',
  role: 'student',
  organizationId: 'org-1',
};

const baseRow: CareerPlaybookRow = {
  id: '00000000-0000-4000-8000-000000002001',
  user_id: owner.id,
  organization_id: 'org-1',
  status: 'completed',
  language: 'ru',
  slug: null,
  position_title: 'Менеджер по продажам',
  department: 'sales',
  specialization: null,
  level: 'middle',
  q_a_data: {},
  role_profile_spec: null,
  generated_blocks: {
    header: {
      content: '# Header',
      status: 'generated',
      attempt: 0,
    },
  },
  final_markdown: '# Менеджер по продажам',
  web_research: null,
  cost_breakdown: null,
  share_slug: 'sales-manager',
  is_public: false,
  visibility: 'organization',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  completed_at: '2026-06-01T10:10:00.000Z',
};

function ctx(user: UserContext): Context {
  return {
    user,
    req: new Request('https://example.test'),
  };
}

function chainResult(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function chainUpdateResult(result: unknown, updateSpy = vi.fn()) {
  const chain = {
    update: vi.fn((values: unknown) => {
      updateSpy(values);
      return chain;
    }),
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, updateSpy };
}

describe('career-playbook library visibility service', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('lists owner and organization-visible playbooks with viewer permissions', async () => {
    const query = chainResult({
      data: [
        { ...baseRow, visibility: 'private', user_id: owner.id, is_public: false },
        { ...baseRow, id: '00000000-0000-4000-8000-000000002002', user_id: 'other-user' },
        {
          ...baseRow,
          id: '00000000-0000-4000-8000-000000002003',
          user_id: 'other-user',
          visibility: 'private',
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    const result = await listCareerPlaybooks(ctx(orgMember), {
      limit: 20,
      sort: 'created_desc',
    });

    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('generated_blocks'));
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('final_markdown'));
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('cost_breakdown'));
    expect(query.or).toHaveBeenCalledWith(
      `user_id.eq.${orgMember.id},and(visibility.eq.organization,organization_id.eq.${orgMember.organizationId})`
    );
    expect(result.items.map(item => item.id)).toEqual(['00000000-0000-4000-8000-000000002002']);
    expect(result.items[0]?.visibility).toBe('organization');
    expect(result.items[0]?.ownerId).toBe('other-user');
    expect(result.items[0]?.viewerPermissions).toEqual({
      canEdit: false,
      canManageVisibility: false,
      canCreateCourse: false,
      canDelete: false,
    });
  });

  it('allows organization members to read organization-visible playbooks but not manage them', async () => {
    fromMock.mockReturnValue(chainResult({ data: baseRow, error: null }));

    const detail = await getCareerPlaybookFromLibrary(ctx(orgMember), {
      playbookId: baseRow.id,
    });

    expect(detail.visibility).toBe('organization');
    expect(detail.viewerPermissions.canEdit).toBe(false);
    expect(detail.viewerPermissions.canManageVisibility).toBe(false);
    expect(detail.generatedBlocks.header?.content).toBe('# Header');
  });

  it('rejects non-owner visibility changes', async () => {
    fromMock.mockReturnValue(chainResult({ data: baseRow, error: null }));

    await expect(
      updateCareerPlaybookVisibility(ctx(orgMember), {
        playbookId: baseRow.id,
        visibility: 'public',
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({ code: 'FORBIDDEN' });
  });

  it('updates visibility and keeps isPublic/shareSlug compatibility for owner', async () => {
    const update = chainUpdateResult({
      data: {
        ...baseRow,
        user_id: owner.id,
        visibility: 'public',
        is_public: true,
        share_slug: 'menedzher-po-prodazham-000000',
      },
      error: null,
    });
    fromMock
      .mockReturnValueOnce(
        chainResult({ data: { ...baseRow, user_id: owner.id, share_slug: null }, error: null })
      )
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(chainResult({ data: { slug: 'mega-campus' }, error: null }));

    const result = await updateCareerPlaybookVisibility(ctx(owner), {
      playbookId: baseRow.id,
      visibility: 'public',
    });

    expect(update.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        share_slug: expect.stringMatching(/^menedzher-po-prodazham-[a-f0-9]{6}$/),
      })
    );
    expect(result.visibility).toBe('public');
    expect(result.isPublic).toBe(true);
    expect(result.shareSlug).toBe('menedzher-po-prodazham-000000');
    expect(result.organizationSlug).toBe('mega-campus');
    expect(result.viewerPermissions.canManageVisibility).toBe(true);
  });

  it('maps legacy share toggle to visibility changes', async () => {
    const update = chainUpdateResult({
      data: { ...baseRow, user_id: owner.id, visibility: 'public', is_public: true },
      error: null,
    });
    fromMock
      .mockReturnValueOnce(chainResult({ data: { ...baseRow, user_id: owner.id }, error: null }))
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(chainResult({ data: { slug: 'mega-campus' }, error: null }));

    const result = await toggleCareerPlaybookShare(ctx(owner), {
      playbookId: baseRow.id,
      isPublic: true,
    });

    expect(update.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', is_public: true })
    );
    expect(result.visibility).toBe('public');
    expect(result.isPublic).toBe(true);
  });

  it('persists owner numeric fact corrections and refreshes final markdown', async () => {
    const rowWithNumericFact: CareerPlaybookRow = {
      ...baseRow,
      generated_blocks: {
        block_6: {
          content: '## 6. KPI\n\nWin rate: 18%. Pipeline coverage: 3x.',
          status: 'generated',
          attempt: 1,
          numeric_facts: [
            {
              id: 'block_6-18-percent-0',
              block_id: 'block_6',
              raw_text: '18%',
              normalized_value: '18%',
              status: 'needs_review',
              source: 'model_suggestion',
              confidence: 0.45,
              occurrence_index: 0,
              explanation: 'Точное значение не найдено в источниках.',
            },
          ],
        },
      },
      final_markdown: '## 6. KPI\n\nWin rate: 18%. Pipeline coverage: 3x.',
    };
    const update = chainUpdateResult({
      data: {
        ...rowWithNumericFact,
        generated_blocks: {
          block_6: {
            content: '## 6. KPI\n\nWin rate: 21%. Pipeline coverage: 3x.',
            status: 'generated',
            attempt: 1,
            numeric_facts: [
              {
                id: 'block_6-21-percent-0',
                block_id: 'block_6',
                raw_text: '21%',
                normalized_value: '21%',
                status: 'verified',
                source: 'user_input',
                confidence: 1,
                occurrence_index: 0,
                explanation: 'Исправлено пользователем.',
              },
            ],
          },
        },
        final_markdown: '## 6. KPI\n\nWin rate: 21%. Pipeline coverage: 3x.',
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(chainResult({ data: rowWithNumericFact, error: null }));
    fromMock.mockReturnValueOnce(update.chain);

    const result = await updateCareerPlaybookNumericFact(ctx(owner), {
      playbookId: baseRow.id,
      blockId: 'block_6',
      factId: 'block_6-18-percent-0',
      replacementText: '21%',
      scope: 'occurrence',
    });

    expect(update.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        final_markdown: '## 6. KPI\n\nWin rate: 21%. Pipeline coverage: 3x.',
      })
    );
    const payload = update.updateSpy.mock.calls[0]?.[0] as {
      generated_blocks?: Record<string, { content?: string; numeric_facts?: unknown[] }>;
    };
    expect(payload.generated_blocks?.block_6.content).toContain('21%');
    expect(payload.generated_blocks?.block_6.numeric_facts?.[0]).toMatchObject({
      raw_text: '21%',
      status: 'verified',
      source: 'user_input',
    });
    expect(result.content).toContain('21%');
    expect(result.numeric_facts?.[0]?.raw_text).toBe('21%');
  });

  it('patches the edited block in final markdown when the same number appears earlier', async () => {
    const oldBlock = '## 6. KPI\n\nWin rate: 18%.';
    const rowWithEarlierNumber: CareerPlaybookRow = {
      ...baseRow,
      generated_blocks: {
        block_6: {
          content: oldBlock,
          status: 'generated',
          attempt: 1,
          numeric_facts: [
            {
              id: 'block_6-18-percent-0',
              block_id: 'block_6',
              raw_text: '18%',
              normalized_value: '18%',
              status: 'needs_review',
              source: 'model_suggestion',
              confidence: 0.45,
              occurrence_index: 0,
              explanation: 'Точное значение не найдено в источниках.',
            },
          ],
        },
      },
      final_markdown: `## Intro\n\nCompany benchmark: 18%.\n\n${oldBlock}`,
    };
    const update = chainUpdateResult({
      data: {
        ...rowWithEarlierNumber,
        generated_blocks: {
          block_6: {
            content: '## 6. KPI\n\nWin rate: 21%.',
            status: 'generated',
            attempt: 1,
            numeric_facts: [],
          },
        },
        final_markdown: '## Intro\n\nCompany benchmark: 18%.\n\n## 6. KPI\n\nWin rate: 21%.',
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(chainResult({ data: rowWithEarlierNumber, error: null }));
    fromMock.mockReturnValueOnce(update.chain);

    await updateCareerPlaybookNumericFact(ctx(owner), {
      playbookId: baseRow.id,
      blockId: 'block_6',
      factId: 'block_6-18-percent-0',
      replacementText: '21%',
      scope: 'occurrence',
    });

    expect(update.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        final_markdown: '## Intro\n\nCompany benchmark: 18%.\n\n## 6. KPI\n\nWin rate: 21%.',
      })
    );
  });

  it('updates block-scoped numeric facts without replacing substrings inside other numbers', async () => {
    const rowWithSingleDigitFact: CareerPlaybookRow = {
      ...baseRow,
      generated_blocks: {
        block_6: {
          content: '## 6. KPI\n\nFirst 5 wins; by day 15 track 50 accounts; repeat 5 rituals.',
          status: 'generated',
          attempt: 1,
          numeric_facts: [
            {
              id: 'block_6-5-0',
              block_id: 'block_6',
              raw_text: '5',
              normalized_value: '5',
              status: 'needs_review',
              source: 'model_suggestion',
              confidence: 0.45,
              occurrence_index: 0,
              explanation: 'Точное значение не найдено в источниках.',
            },
          ],
        },
      },
      final_markdown: '## 6. KPI\n\nFirst 5 wins; by day 15 track 50 accounts; repeat 5 rituals.',
    };
    const expectedContent =
      '## 6. KPI\n\nFirst 7 wins; by day 15 track 50 accounts; repeat 7 rituals.';
    const update = chainUpdateResult({
      data: {
        ...rowWithSingleDigitFact,
        generated_blocks: {
          block_6: {
            content: expectedContent,
            status: 'generated',
            attempt: 1,
            numeric_facts: [],
          },
        },
        final_markdown: expectedContent,
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(chainResult({ data: rowWithSingleDigitFact, error: null }));
    fromMock.mockReturnValueOnce(update.chain);

    await updateCareerPlaybookNumericFact(ctx(owner), {
      playbookId: baseRow.id,
      blockId: 'block_6',
      factId: 'block_6-5-0',
      replacementText: '7',
      scope: 'block',
    });

    const payload = update.updateSpy.mock.calls[0]?.[0] as {
      generated_blocks?: Record<string, { content?: string }>;
      final_markdown?: string | null;
    };
    expect(payload.generated_blocks?.block_6.content).toBe(expectedContent);
    expect(payload.final_markdown).toBe(expectedContent);
    expect(payload.generated_blocks?.block_6.content).toContain('15 track 50 accounts');
  });

  it('rejects numeric fact corrections for organization readers', async () => {
    fromMock.mockReturnValue(chainResult({ data: baseRow, error: null }));

    await expect(
      updateCareerPlaybookNumericFact(ctx(orgMember), {
        playbookId: baseRow.id,
        blockId: 'block_6',
        factId: 'block_6-18-percent-0',
        replacementText: '21%',
        scope: 'occurrence',
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({ code: 'FORBIDDEN' });
  });
});
