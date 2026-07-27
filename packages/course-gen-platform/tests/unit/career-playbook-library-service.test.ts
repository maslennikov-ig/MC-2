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
  getPublicCareerPlaybookBySlug,
  listCareerPlaybooks,
  toggleCareerPlaybookShare,
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
  image_status: null,
  image_content: null,
  image_metadata: null,
  image_generation_attempt: 0,
  image_error_message: null,
  image_updated_at: null,
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
    contains: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
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

  it('exposes completed card images and ignores invalid image content in library rows', async () => {
    const validImageRow: CareerPlaybookRow = {
      ...baseRow,
      id: '00000000-0000-4000-8000-000000002010',
      image_status: 'completed',
      image_content: {
        type: 'card',
        imageUrl: 'https://cdn.example.test/career-playbooks/card.webp',
        altText: 'Role Guide image: Head of Sales',
        dimensions: { width: 1024, height: 1024 },
        visualStyle: {
          colorScheme: 'blue and purple gradients with subtle accents',
          aesthetic: 'modern, professional, clean',
        },
        generation_prompt: 'Create a role-guide card image',
        format: 'webp',
        file_size_bytes: 1234,
      },
      image_error_message: null,
    };
    const invalidImageRow: CareerPlaybookRow = {
      ...baseRow,
      id: '00000000-0000-4000-8000-000000002011',
      image_status: 'completed',
      image_content: { imageUrl: 42 },
      image_error_message: 'Malformed image content',
    };
    fromMock.mockReturnValue(
      chainResult({
        data: [validImageRow, invalidImageRow],
        error: null,
      })
    );

    const result = await listCareerPlaybooks(ctx(owner), {
      limit: 20,
      sort: 'created_desc',
    });

    expect(result.items[0]).toMatchObject({
      id: validImageRow.id,
      imageStatus: 'completed',
      imageUrl: 'https://cdn.example.test/career-playbooks/card.webp',
      imageAltText: 'Role Guide image: Head of Sales',
      imageErrorMessage: null,
    });
    expect(result.items[1]).toMatchObject({
      id: invalidImageRow.id,
      imageStatus: 'completed',
      imageUrl: null,
      imageAltText: null,
      imageErrorMessage: 'Malformed image content',
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

  it('deduplicates legacy quality issues and filters internal retry warnings on detail read', async () => {
    const rowWithDuplicatedDiagnostics: CareerPlaybookRow = {
      ...baseRow,
      q_a_data: {
        generation_warnings: [
          'crossBlockJudge advanced after max regeneration attempts (7/2) for block_4, block_6; unresolved issues remain in judge verdict.',
          'crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: malformed JSON',
        ],
        quality_issues: [
          {
            id: 'cross_block_judge:block_1:0',
            source: 'cross_block_judge',
            severity: 'critical',
            blockId: 'block_4',
            title: 'Проблема качества блока',
            message: 'Block 4 was restored as fallback content.',
            suggestion: 'Regenerate block 4 with concrete duties.',
            action: 'regenerate',
          },
          {
            id: 'cross_block_judge:block_2:0',
            source: 'cross_block_judge',
            severity: 'critical',
            blockId: 'block_4',
            title: 'Проблема качества блока',
            message: 'Block 4 was restored as fallback content.',
            suggestion: 'Regenerate block 4 with concrete duties.',
            action: 'regenerate',
          },
          {
            id: 'system:block_4:0',
            source: 'system',
            severity: 'critical',
            blockId: 'block_4',
            title: 'Блок восстановлен автоматически',
            message: 'Модель не вернула обязательный блок block_4.',
            suggestion: 'Откройте блок и запустите регенерацию.',
            action: 'regenerate',
          },
        ],
      },
    };
    fromMock.mockReturnValue(chainResult({ data: rowWithDuplicatedDiagnostics, error: null }));

    const detail = await getCareerPlaybookFromLibrary(ctx(owner), {
      playbookId: baseRow.id,
    });

    expect(detail.qualityWarnings).toEqual([
      'crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: malformed JSON',
    ]);
    expect(detail.qualityIssues).toEqual([
      expect.objectContaining({
        id: 'cross_block_judge:block_1:0',
        source: 'cross_block_judge',
        blockId: 'block_4',
      }),
      expect.objectContaining({
        id: 'system:block_4:0',
        source: 'system',
        blockId: 'block_4',
      }),
    ]);
  });

  it('returns the linked course for a playbook detail when a course already exists', async () => {
    const playbookQuery = chainResult({ data: baseRow, error: null });
    const organizationQuery = chainResult({ data: { slug: 'mega-campus' }, error: null });
    const coursesQuery = chainResult({
      data: [
        {
          id: 'course-1',
          title: 'Курс для менеджера по продажам',
          slug: 'sales-manager-course',
          organization_id: 'org-1',
          status: 'draft',
          generation_status: 'completed',
          settings: {
            source: 'career_playbook',
            playbookId: baseRow.id,
          },
          created_at: '2026-06-02T10:00:00.000Z',
        },
      ],
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbookQuery;
      if (table === 'organizations') return organizationQuery;
      if (table === 'courses') return coursesQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const detail = await getCareerPlaybookFromLibrary(ctx(owner), {
      playbookId: baseRow.id,
    });

    expect(coursesQuery.contains).toHaveBeenCalledWith('settings', {
      source: 'career_playbook',
    });
    expect(detail.linkedCourse).toEqual({
      id: 'course-1',
      title: 'Курс для менеджера по продажам',
      slug: 'sales-manager-course',
      organizationSlug: 'mega-campus',
      status: 'draft',
      generationStatus: 'completed',
    });
  });

  it('repairs legacy invalid Mermaid before returning library detail', async () => {
    const invalidDiagram = `## 16. Основной процесс

\`\`\`mermaid
flowchart TD
  A[Секретарь (Senior)] --> B{Выбор сценария}
\`\`\``;
    const rowWithInvalidMermaid: CareerPlaybookRow = {
      ...baseRow,
      generated_blocks: {
        block_16: {
          content: invalidDiagram,
          status: 'generated',
          attempt: 1,
        },
      },
      final_markdown: invalidDiagram,
    };
    fromMock.mockReturnValue(chainResult({ data: rowWithInvalidMermaid, error: null }));

    const detail = await getCareerPlaybookFromLibrary(ctx(owner), {
      playbookId: baseRow.id,
    });

    expect(detail.generatedBlocks.block_16?.content).not.toContain('A[Секретарь (Senior)]');
    expect(detail.finalMarkdown).not.toContain('A[Секретарь (Senior)]');
    expect(detail.finalMarkdown).not.toContain('Syntax error in text');
    expect(detail.qualityIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'mermaid',
          blockId: 'block_16',
        }),
      ])
    );
  });

  it('returns linked course metadata in library list items', async () => {
    const playbooksQuery = chainResult({
      data: [baseRow],
      error: null,
    });
    const organizationQuery = chainResult({ data: { slug: 'mega-campus' }, error: null });
    const coursesQuery = chainResult({
      data: [
        {
          id: 'course-1',
          title: 'Курс для менеджера по продажам',
          slug: 'sales-manager-course',
          organization_id: 'org-1',
          status: 'draft',
          generation_status: 'stage_6_generating',
          settings: {
            source: 'career_playbook',
            playbookId: baseRow.id,
          },
          created_at: '2026-06-02T10:00:00.000Z',
        },
      ],
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'career_playbooks') return playbooksQuery;
      if (table === 'organizations') return organizationQuery;
      if (table === 'courses') return coursesQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listCareerPlaybooks(ctx(owner), {
      limit: 20,
      sort: 'created_desc',
    });

    expect(result.items[0]?.linkedCourse).toEqual({
      id: 'course-1',
      title: 'Курс для менеджера по продажам',
      slug: 'sales-manager-course',
      organizationSlug: 'mega-campus',
      status: 'draft',
      generationStatus: 'stage_6_generating',
    });
  });

  it('repairs legacy invalid Mermaid before returning public share markdown', async () => {
    const invalidDiagram = `## 16. Основной процесс

\`\`\`mermaid
flowchart TD
  A[Секретарь (Senior)] --> B{Выбор сценария}
\`\`\``;
    fromMock.mockReturnValue(
      chainResult({
        data: {
          ...baseRow,
          visibility: 'public',
          is_public: true,
          final_markdown: invalidDiagram,
        },
        error: null,
      })
    );

    const share = await getPublicCareerPlaybookBySlug({ shareSlug: 'sales-manager' });

    expect(share.finalMarkdown).not.toContain('A[Секретарь (Senior)]');
    expect(share.finalMarkdown).not.toContain('Syntax error in text');
  });

  it('keeps true missing public share lookups as not found', async () => {
    fromMock.mockReturnValue(
      chainResult({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      })
    );

    await expect(
      getPublicCareerPlaybookBySlug({ shareSlug: 'missing-sales-manager' })
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  });

  it('falls back without image columns when public share lookup hits rollout schema drift', async () => {
    const primaryQuery = chainResult({
      data: null,
      error: {
        code: '42703',
        message: 'column career_playbooks.image_status does not exist',
      },
    });
    const fallbackQuery = chainResult({
      data: {
        ...baseRow,
        visibility: 'public',
        is_public: true,
        share_slug: 'sales-manager',
        final_markdown: '# Менеджер по продажам',
      },
      error: null,
    });

    let careerPlaybookCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'career_playbooks') {
        careerPlaybookCall += 1;
        return careerPlaybookCall === 1 ? primaryQuery : fallbackQuery;
      }
      if (table === 'organizations') {
        return chainResult({ data: { slug: 'mega-campus' }, error: null });
      }
      return {
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };
    });

    const share = await getPublicCareerPlaybookBySlug({ shareSlug: 'sales-manager' });

    expect(primaryQuery.select).toHaveBeenCalledWith(expect.stringContaining('image_status'));
    expect(fallbackQuery.select).toHaveBeenCalledWith(expect.not.stringContaining('image_status'));
    expect(share).toMatchObject({
      shareSlug: 'sales-manager',
      isPublic: true,
      imageUrl: null,
      imageStatus: null,
      imageAltText: null,
      imageErrorMessage: null,
      finalMarkdown: '# Менеджер по продажам',
    });
  });

  it('falls back without image columns when library list hits rollout schema drift', async () => {
    const {
      image_status: _imageStatus,
      image_content: _imageContent,
      image_metadata: _imageMetadata,
      image_generation_attempt: _imageGenerationAttempt,
      image_error_message: _imageErrorMessage,
      image_updated_at: _imageUpdatedAt,
      ...rowWithoutImageColumns
    } = {
      ...baseRow,
      organization_id: null,
      visibility: 'private' as const,
      is_public: false,
    };

    const primaryQuery = chainResult({
      data: null,
      error: {
        code: '42703',
        message: 'column career_playbooks.image_status does not exist',
      },
    });
    const fallbackQuery = chainResult({
      data: [rowWithoutImageColumns],
      error: null,
    });

    let careerPlaybookCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'career_playbooks') {
        careerPlaybookCall += 1;
        return careerPlaybookCall === 1 ? primaryQuery : fallbackQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listCareerPlaybooks(ctx(owner), {
      limit: 20,
      sort: 'created_desc',
    });

    expect(primaryQuery.select).toHaveBeenCalledWith(expect.stringContaining('image_status'));
    expect(fallbackQuery.select).toHaveBeenCalledWith(expect.not.stringContaining('image_status'));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: baseRow.id,
      imageStatus: null,
      imageUrl: null,
      imageAltText: null,
      imageErrorMessage: null,
    });
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
        share_slug: 'menedzher-po-prodazham',
      },
      error: null,
    });
    fromMock
      .mockReturnValueOnce(
        chainResult({ data: { ...baseRow, user_id: owner.id, share_slug: null }, error: null })
      )
      .mockReturnValueOnce(chainResult({ data: null, error: null }))
      .mockReturnValueOnce(update.chain)
      .mockReturnValueOnce(chainResult({ data: { slug: 'mega-campus' }, error: null }));

    const result = await updateCareerPlaybookVisibility(ctx(owner), {
      playbookId: baseRow.id,
      visibility: 'public',
    });

    expect(update.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        share_slug: 'menedzher-po-prodazham',
      })
    );
    expect(result.visibility).toBe('public');
    expect(result.isPublic).toBe(true);
    expect(result.shareSlug).toBe('menedzher-po-prodazham');
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
});
