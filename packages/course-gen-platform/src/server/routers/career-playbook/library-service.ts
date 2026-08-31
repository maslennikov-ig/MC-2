import { TRPCError } from '@trpc/server';
import { CareerPlaybookRoleProfileSpecSchema, JobType } from '@megacampus/shared-types';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookGenerateImageJobData,
  CareerPlaybookRegenerateBlockJobData,
  CareerPlaybookVisibility,
} from '@megacampus/shared-types';
import type { Context } from '../../trpc';
import { logger } from '../../../shared/logger';
import { renderCareerPlaybookPdf } from '../../../services/career-playbook-pdf';
import { mapPlaybookRow, normalizeGeneratedBlocks } from './service-mappers';
import { buildRoleGuideViewFromSpec } from '../../../stages/stage-career-playbook/nodes/final-assembler';
import { buildCareerPlaybookViewLinks, resolveCareerPlaybookViewAudience } from './view-share';
import { addJob, removeTerminalJobById } from '@/orchestrator/queue';
import { joinCareerPlaybookFinalBlocks } from '@/stages/stage-career-playbook/nodes/final-assembler';

// The public response shapes moved next door with the mapping that produces them; re-exported
// here so that every existing import path keeps working.
export type {
  CareerPlaybookLibraryItem,
  CareerPlaybookLibraryListResponse,
  CareerPlaybookLibraryStatistics,
  CareerPlaybookLibraryFacets,
  CareerPlaybookLibrarySort,
  CareerPlaybookLibraryListInput,
  CareerPlaybookLibraryDetailResponse,
  CareerPlaybookPublicShareResponse,
  CareerPlaybookDeleteResponse,
  CareerPlaybookShareToggleResponse,
  CareerPlaybookVisibilityUpdateResponse,
  CareerPlaybookImageRegenerateResponse,
  CareerPlaybookBlockMutationResponse,
  CareerPlaybookPdfExportResponse,
  CareerPlaybookViewLinksResponse,
  CareerPlaybookViewShareResponse,
} from './library-access';
import type {
  CareerPlaybookLibraryListResponse,
  CareerPlaybookLibraryListInput,
  CareerPlaybookLibraryDetailResponse,
  CareerPlaybookPublicShareResponse,
  CareerPlaybookDeleteResponse,
  CareerPlaybookShareToggleResponse,
  CareerPlaybookVisibilityUpdateResponse,
  CareerPlaybookImageRegenerateResponse,
  CareerPlaybookBlockMutationResponse,
  CareerPlaybookPdfExportResponse,
  CareerPlaybookViewLinksResponse,
  CareerPlaybookViewShareResponse,
} from './library-access';

// The permission model and row mapping live next door.
import {
  LIBRARY_PLAYBOOK_COLUMNS,
  LIBRARY_PLAYBOOK_COLUMNS_WITHOUT_IMAGE,
  PUBLIC_PLAYBOOK_COLUMNS,
  PUBLIC_PLAYBOOK_COLUMNS_WITHOUT_IMAGE,
  assertShareable,
  buildFacets,
  buildStatistics,
  buildUniqueShareSlug,
  canListPlaybook,
  getCareerPlaybookSupabase,
  getViewerPermissions,
  getVisibility,
  isLegacyShareSlug,
  isMissingCareerPlaybookImageColumnError,
  isNotFoundDbError,
  loadLinkedCourseMap,
  loadManageablePlaybook,
  loadOrganizationSlug,
  loadOrganizationSlugMap,
  loadReadablePlaybook,
  mapRowToLibraryDetail,
  mapRowToLibraryItem,
  mapRowToPublicShare,
  parseOffsetCursor,
  queryCareerPlaybookListRows,
  requireUser,
  sortRows,
  throwOnDbError,
  throwPublicShareNotFound,
  withNullImageFields,
} from './library-access';

export async function listCareerPlaybooks(
  ctx: Context,
  input: CareerPlaybookLibraryListInput
): Promise<CareerPlaybookLibraryListResponse> {
  const user = requireUser(ctx);
  const primary = await queryCareerPlaybookListRows(user, LIBRARY_PLAYBOOK_COLUMNS);
  let error = primary.error;
  let rows = primary.data ?? [];

  // Rollout-safe fallback: the same image-column migration gap that the public
  // share path handles can also break the authenticated library list. Retry
  // without image fields instead of taking the whole catalog down.
  if (isMissingCareerPlaybookImageColumnError(error)) {
    logger.warn(
      { userId: user.id, error },
      'Career Playbook library image columns unavailable; retrying without image fields'
    );
    const fallback = await queryCareerPlaybookListRows(
      user,
      LIBRARY_PLAYBOOK_COLUMNS_WITHOUT_IMAGE
    );
    error = fallback.error;
    rows = (fallback.data ?? []).map(withNullImageFields);
  }

  if (error) throwOnDbError(error, 'Failed to list Career Playbooks');

  const lowerSearch = input.search?.trim().toLowerCase();
  const readableRows = rows.map(mapPlaybookRow).filter(row => canListPlaybook(row, user));

  const scopedRows = readableRows
    .filter(row => {
      if (!lowerSearch) return true;
      const fields = [row.position_title, row.department, row.specialization, row.level];
      return fields.some(field => field?.toLowerCase().includes(lowerSearch));
    })
    .filter(row => (input.status ? row.status === input.status : true))
    .filter(row => (input.department ? row.department === input.department : true))
    .filter(row => (input.level ? row.level === input.level : true));

  const sortedRows = sortRows(scopedRows, input.sort);
  const offset = parseOffsetCursor(input.cursor);
  const page = sortedRows.slice(offset, offset + input.limit + 1);
  const pageRows = page.slice(0, input.limit);
  const hasMore = page.length > input.limit;
  const organizationSlugById = await loadOrganizationSlugMap(pageRows);
  const linkedCourseByPlaybookId = await loadLinkedCourseMap(pageRows, organizationSlugById);
  const items = pageRows.map(row =>
    mapRowToLibraryItem(
      row,
      user,
      organizationSlugById.get(row.organization_id) ?? null,
      linkedCourseByPlaybookId.get(row.id) ?? null
    )
  );

  return {
    items,
    nextCursor: hasMore ? `offset:${offset + input.limit}` : undefined,
    totalCount: scopedRows.length,
    statistics: buildStatistics(readableRows),
    facets: buildFacets(readableRows),
  };
}

export async function getCareerPlaybookFromLibrary(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookLibraryDetailResponse> {
  const user = requireUser(ctx);
  const row = await loadReadablePlaybook(input.playbookId, user);
  const organizationSlug = await loadOrganizationSlug(row.organization_id);
  const linkedCourseByPlaybookId = await loadLinkedCourseMap(
    [row],
    new Map([[row.organization_id, organizationSlug]])
  );
  return await mapRowToLibraryDetail(
    row,
    user,
    organizationSlug,
    linkedCourseByPlaybookId.get(row.id) ?? null
  );
}

export async function editCareerPlaybookBlock(
  ctx: Context,
  input: { playbookId: string; blockId: CareerPlaybookBlockId; content: string }
): Promise<CareerPlaybookBlockMutationResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  const generatedBlocks = normalizeGeneratedBlocks(row.generated_blocks);
  const previousBlock = generatedBlocks[input.blockId];

  if (!previousBlock) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Career Playbook block not found' });
  }

  const updatedBlock: CareerPlaybookBlockState = {
    ...previousBlock,
    content: input.content,
    status: 'generated',
    generated_at: new Date().toISOString(),
  };
  const updatedBlocks = {
    ...generatedBlocks,
    [input.blockId]: updatedBlock,
  };
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      generated_blocks: updatedBlocks,
      final_markdown: joinCareerPlaybookFinalBlocks(updatedBlocks),
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to edit Career Playbook block');

  const persistedBlock = normalizeGeneratedBlocks(data.generated_blocks)[input.blockId];
  if (!persistedBlock) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Edited Career Playbook block was not persisted',
    });
  }

  return { blockId: input.blockId, ...persistedBlock };
}

export async function regenerateCareerPlaybookBlockFromLibrary(
  ctx: Context,
  input: { playbookId: string; blockId: CareerPlaybookBlockId; instruction: string }
): Promise<CareerPlaybookBlockMutationResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  if (row.status !== 'completed') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must be completed before block regeneration',
    });
  }

  const roleProfileSpec = CareerPlaybookRoleProfileSpecSchema.safeParse(row.role_profile_spec);
  if (!roleProfileSpec.success) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Career Playbook role profile is unavailable for block regeneration',
      cause: roleProfileSpec.error,
    });
  }

  const generatedBlocks = normalizeGeneratedBlocks(row.generated_blocks);
  const originalBlock = generatedBlocks[input.blockId];
  if (!originalBlock) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Career Playbook block not found' });
  }

  const regeneratingBlock: CareerPlaybookBlockState = {
    ...originalBlock,
    status: 'regenerating',
  };
  const regeneratingBlocks = {
    ...generatedBlocks,
    [input.blockId]: regeneratingBlock,
  };
  const supabase = getCareerPlaybookSupabase();
  const { error } = await supabase
    .from('career_playbooks')
    .update({ generated_blocks: regeneratingBlocks })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select('id')
    .single();

  if (error) throwOnDbError(error, 'Failed to mark Career Playbook block for regeneration');

  const jobId = `career-playbook-regenerate-${row.id}-${input.blockId}`;
  const now = new Date().toISOString();
  const jobData: CareerPlaybookRegenerateBlockJobData = {
    jobType: JobType.CAREER_PLAYBOOK,
    operation: 'REGENERATE_BLOCK',
    playbookId: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    language: row.language,
    locale: row.language === 'en' ? 'en' : 'ru',
    createdAt: now,
    blockId: input.blockId,
    instruction: input.instruction,
    roleProfileSpec: roleProfileSpec.data,
    originalBlock,
    generatedBlocks,
  };

  try {
    await removeTerminalJobById(jobId);
    await addJob(JobType.CAREER_PLAYBOOK, jobData, {
      jobId,
      priority: 2,
    });
  } catch (enqueueError) {
    const compensation = await supabase
      .from('career_playbooks')
      .update({ generated_blocks: generatedBlocks })
      .eq('id', row.id)
      .eq('user_id', row.user_id)
      .select('id')
      .single();

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: compensation.error
        ? 'Failed to enqueue Career Playbook block regeneration and restore its state'
        : 'Failed to enqueue Career Playbook block regeneration',
      cause: compensation.error
        ? { enqueueError, compensationError: compensation.error }
        : enqueueError,
    });
  }

  return { blockId: input.blockId, ...regeneratingBlock };
}

export async function deleteCareerPlaybookFromLibrary(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookDeleteResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  const supabase = getCareerPlaybookSupabase();
  const { error } = await supabase
    .from('career_playbooks')
    .delete()
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select('*')
    .single();

  if (error) throwOnDbError(error, 'Failed to delete Career Playbook');

  return {
    deleted: true,
    playbookId: row.id,
  };
}

export async function toggleCareerPlaybookShare(
  ctx: Context,
  input: { playbookId: string; isPublic: boolean }
): Promise<CareerPlaybookShareToggleResponse> {
  return updateCareerPlaybookVisibility(ctx, {
    playbookId: input.playbookId,
    visibility: input.isPublic ? 'public' : 'private',
  });
}

export async function updateCareerPlaybookVisibility(
  ctx: Context,
  input: { playbookId: string; visibility: CareerPlaybookVisibility }
): Promise<CareerPlaybookVisibilityUpdateResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  const isPublic = input.visibility === 'public';
  if (isPublic) assertShareable(row);
  const shareSlug =
    isPublic && (!row.share_slug || isLegacyShareSlug(row.share_slug))
      ? await buildUniqueShareSlug(row)
      : row.share_slug;
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      visibility: input.visibility,
      is_public: isPublic,
      share_slug: shareSlug,
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to update Career Playbook sharing');

  const mapped = mapPlaybookRow(data);
  const visibility = getVisibility(mapped);
  const organizationSlug = await loadOrganizationSlug(mapped.organization_id);
  return {
    playbookId: mapped.id,
    isPublic: visibility === 'public',
    visibility,
    shareSlug: visibility === 'public' ? mapped.share_slug : null,
    organizationSlug,
    viewerPermissions: getViewerPermissions(mapped, user),
  };
}

export async function regenerateCareerPlaybookImage(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookImageRegenerateResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);

  if (row.status !== 'completed') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must be completed before image generation',
    });
  }

  const jobId = `career-playbook-image-${row.id}`;
  const now = new Date().toISOString();
  const supabase = getCareerPlaybookSupabase();

  const { error } = await supabase
    .from('career_playbooks')
    .update({
      image_status: 'pending',
      image_error_message: null,
      image_updated_at: now,
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select('id')
    .single();

  if (error) throwOnDbError(error, 'Failed to reset Career Playbook image status');

  await removeTerminalJobById(jobId);

  const jobData: CareerPlaybookGenerateImageJobData = {
    jobType: JobType.CAREER_PLAYBOOK,
    operation: 'GENERATE_IMAGE',
    playbookId: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    language: row.language,
    locale: row.language === 'en' ? 'en' : 'ru',
    createdAt: now,
    force: true,
  };

  await addJob(JobType.CAREER_PLAYBOOK, jobData, {
    jobId,
    priority: 4,
  });

  return {
    playbookId: row.id,
    imageStatus: 'pending',
    imageUrl: null,
    imageErrorMessage: null,
  };
}

/**
 * Serve one reader their own view, decided by the link they were given.
 *
 * The same gate as the slug share — public, completed — because turning sharing
 * off must revoke all three links at once. The view is assembled first, so it
 * carries the diagrams, the sources section and the calibration table that
 * final assembly appends; a view served straight from stored blocks would
 * arrive without any of them.
 */
export async function getCareerPlaybookViewByToken(input: {
  playbookId: string;
  token: string;
}): Promise<CareerPlaybookViewShareResponse> {
  const audience = resolveCareerPlaybookViewAudience(input.playbookId, input.token);
  if (!audience) throwPublicShareNotFound();

  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('id', input.playbookId)
    .single();

  if (error) {
    if (isNotFoundDbError(error)) throwPublicShareNotFound(error);
    throwOnDbError(error, 'Failed to load Career Playbook view share');
  }
  if (!data) throwPublicShareNotFound();

  const mapped = mapPlaybookRow(data);
  if (getVisibility(mapped) !== 'public' || mapped.status !== 'completed') {
    throwPublicShareNotFound();
  }

  const generatedBlocks = normalizeGeneratedBlocks(mapped.generated_blocks);
  if (Object.keys(generatedBlocks).length === 0) throwPublicShareNotFound();

  const organizationSlug = await loadOrganizationSlug(mapped.organization_id);
  const base = await mapRowToPublicShare(mapped, organizationSlug);

  return {
    ...base,
    audience,
    finalMarkdown: buildRoleGuideViewFromSpec(
      {
        generatedBlocks,
        // A spec that no longer parses must not deny the reader their guide: it
        // only feeds the appended sections, which degrade to nothing.
        roleProfileSpec: CareerPlaybookRoleProfileSpecSchema.safeParse(mapped.role_profile_spec)
          .data,
      },
      audience
    ),
  };
}

/**
 * The three links the owner hands out. Owner-only: seeing the manager's link is
 * seeing the manager's guide.
 */
export async function listCareerPlaybookViewLinks(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookViewLinksResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  assertShareable(row);

  return {
    playbookId: row.id,
    isPublic: getVisibility(mapPlaybookRow(row)) === 'public',
    links: buildCareerPlaybookViewLinks(row.id),
  };
}

export async function getPublicCareerPlaybookBySlug(input: {
  shareSlug: string;
}): Promise<CareerPlaybookPublicShareResponse> {
  const supabase = getCareerPlaybookSupabase();
  let { data, error } = await supabase
    .from('career_playbooks')
    .select(PUBLIC_PLAYBOOK_COLUMNS)
    .eq('share_slug', input.shareSlug)
    .eq('visibility', 'public')
    .eq('status', 'completed')
    .single();

  if (isMissingCareerPlaybookImageColumnError(error)) {
    logger.warn(
      { shareSlug: input.shareSlug, error },
      'Career Playbook public share image columns unavailable; retrying without image fields'
    );
    const fallback = await supabase
      .from('career_playbooks')
      .select(PUBLIC_PLAYBOOK_COLUMNS_WITHOUT_IMAGE)
      .eq('share_slug', input.shareSlug)
      .eq('visibility', 'public')
      .eq('status', 'completed')
      .single();
    data = fallback.data ? withNullImageFields(fallback.data) : null;
    error = fallback.error;
  }

  if (error) {
    if (isNotFoundDbError(error)) throwPublicShareNotFound(error);
    throwOnDbError(error, 'Failed to load public Career Playbook share');
  }

  if (!data) {
    throwPublicShareNotFound();
  }

  const mapped = mapPlaybookRow(data);
  if (
    getVisibility(mapped) !== 'public' ||
    mapped.status !== 'completed' ||
    !mapped.final_markdown?.trim()
  ) {
    throwPublicShareNotFound();
  }

  const organizationSlug = await loadOrganizationSlug(mapped.organization_id);
  return await mapRowToPublicShare(mapped, organizationSlug);
}

export async function exportCareerPlaybookPdf(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookPdfExportResponse> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  if (row.status !== 'completed') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must be completed before PDF export',
    });
  }

  const generatedBlocks = normalizeGeneratedBlocks(row.generated_blocks);
  if (!row.final_markdown?.trim() && Object.keys(generatedBlocks).length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook must contain generated content before PDF export',
    });
  }

  let pdf;
  try {
    pdf = await renderCareerPlaybookPdf({
      playbookId: row.id,
      positionTitle: row.position_title,
      department: row.department,
      level: row.level,
      language: row.language,
      generatedBlocks,
      finalMarkdown: row.final_markdown,
      completedAt: row.completed_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message === 'Career Playbook PDF source is too large' ||
      message === 'Career Playbook PDF contains too many Mermaid diagrams' ||
      message === 'Career Playbook PDF contains an oversized Mermaid diagram'
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message,
        cause: error,
      });
    }
    throw error;
  }

  return {
    pdfBase64: pdf.buffer.toString('base64'),
    fileName: pdf.fileName,
    contentType: pdf.contentType,
    sizeBytes: pdf.buffer.byteLength,
  };
}
