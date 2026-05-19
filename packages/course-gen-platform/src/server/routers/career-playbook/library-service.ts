import { TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import type {
  CareerPlaybookBlockState,
  CareerPlaybookPlaybookStatus,
  Language,
} from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { renderCareerPlaybookPdf } from '../../../services/career-playbook-pdf';
import {
  mapPlaybookRow,
  normalizeGeneratedBlocks,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from './service-mappers';

export interface CareerPlaybookLibraryItem {
  id: string;
  status: CareerPlaybookPlaybookStatus;
  language: Language;
  positionTitle: string | null;
  department: string | null;
  specialization: string | null;
  level: string | null;
  isPublic: boolean;
  shareSlug: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CareerPlaybookLibraryListResponse {
  items: CareerPlaybookLibraryItem[];
  nextCursor?: string;
}

export interface CareerPlaybookLibraryDetailResponse extends CareerPlaybookLibraryItem {
  generatedBlocks: Record<string, CareerPlaybookBlockState>;
  finalMarkdown: string | null;
}

export interface CareerPlaybookDeleteResponse {
  deleted: true;
  playbookId: string;
}

export interface CareerPlaybookShareToggleResponse {
  playbookId: string;
  isPublic: boolean;
  shareSlug: string | null;
}

export interface CareerPlaybookPdfExportResponse {
  pdfBase64: string;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

function getCareerPlaybookSupabase(): CareerPlaybookSupabase {
  return getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
}

function requireUser(ctx: Context): UserContext {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  return ctx.user;
}

function throwOnDbError(error: unknown, message: string): never {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
    cause: error,
  });
}

function assertWritable(row: CareerPlaybookRow, user: UserContext): void {
  if (user.role === 'superadmin' || row.user_id === user.id) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

function isOwnedByUser(row: CareerPlaybookRow, user: UserContext): boolean {
  return user.role === 'superadmin' || row.user_id === user.id;
}

function buildShareSlug(): string {
  return `cp-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

async function loadOwnedPlaybook(playbookId: string, user: UserContext) {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('id', playbookId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
      cause: error,
    });
  }

  const row = mapPlaybookRow(data);
  assertWritable(row, user);
  return row;
}

function toLibraryItemFromMappedRow(mapped: CareerPlaybookRow): CareerPlaybookLibraryItem {
  return {
    id: mapped.id,
    status: mapped.status,
    language: mapped.language,
    positionTitle: mapped.position_title,
    department: mapped.department,
    specialization: mapped.specialization,
    level: mapped.level,
    isPublic: mapped.is_public,
    shareSlug: mapped.share_slug,
    createdAt: mapped.created_at,
    updatedAt: mapped.updated_at,
    completedAt: mapped.completed_at,
  };
}

function mapRowToLibraryItem(row: CareerPlaybookRow): CareerPlaybookLibraryItem {
  const mapped = mapPlaybookRow(row);
  return toLibraryItemFromMappedRow(mapped);
}

function mapRowToLibraryDetail(row: CareerPlaybookRow): CareerPlaybookLibraryDetailResponse {
  const mapped = mapPlaybookRow(row);
  return {
    ...toLibraryItemFromMappedRow(mapped),
    generatedBlocks: normalizeGeneratedBlocks(mapped.generated_blocks),
    finalMarkdown: mapped.final_markdown,
  };
}

export async function listCareerPlaybooks(
  ctx: Context,
  input: { limit: number; cursor?: string; search?: string }
): Promise<CareerPlaybookLibraryListResponse> {
  const user = requireUser(ctx);
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throwOnDbError(error, 'Failed to list Career Playbooks');

  const lowerSearch = input.search?.trim().toLowerCase();
  const scopedRows = (data ?? [])
    .map(mapPlaybookRow)
    .filter(row => isOwnedByUser(row, user))
    .filter(row => (input.cursor ? row.created_at < input.cursor : true))
    .filter(row => {
      if (!lowerSearch) return true;
      const fields = [row.position_title, row.department, row.specialization, row.level];
      return fields.some(field => field?.toLowerCase().includes(lowerSearch));
    });

  const page = scopedRows.slice(0, input.limit + 1);
  const hasMore = page.length > input.limit;
  const items = page.slice(0, input.limit).map(mapRowToLibraryItem);

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.createdAt : undefined,
  };
}

export async function getCareerPlaybookFromLibrary(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookLibraryDetailResponse> {
  const user = requireUser(ctx);
  const row = await loadOwnedPlaybook(input.playbookId, user);
  return mapRowToLibraryDetail(row);
}

export async function deleteCareerPlaybookFromLibrary(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookDeleteResponse> {
  const user = requireUser(ctx);
  const row = await loadOwnedPlaybook(input.playbookId, user);
  const supabase = getCareerPlaybookSupabase();
  const { error } = await supabase
    .from('career_playbooks')
    .delete()
    .eq('id', row.id)
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
  const user = requireUser(ctx);
  const row = await loadOwnedPlaybook(input.playbookId, user);
  const shareSlug = input.isPublic ? (row.share_slug ?? buildShareSlug()) : row.share_slug;
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      is_public: input.isPublic,
      share_slug: shareSlug,
    })
    .eq('id', row.id)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to update Career Playbook sharing');

  const mapped = mapPlaybookRow(data);
  return {
    playbookId: mapped.id,
    isPublic: mapped.is_public,
    shareSlug: mapped.is_public ? mapped.share_slug : null,
  };
}

export async function getPublicCareerPlaybookBySlug(input: {
  shareSlug: string;
}): Promise<CareerPlaybookLibraryDetailResponse> {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('share_slug', input.shareSlug)
    .eq('is_public', true)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  }

  const mapped = mapPlaybookRow(data);
  if (!mapped.is_public) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  }

  return mapRowToLibraryDetail(mapped);
}

export async function exportCareerPlaybookPdf(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookPdfExportResponse> {
  const user = requireUser(ctx);
  const row = await loadOwnedPlaybook(input.playbookId, user);
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

  const pdf = await renderCareerPlaybookPdf({
    playbookId: row.id,
    positionTitle: row.position_title,
    department: row.department,
    level: row.level,
    language: row.language,
    generatedBlocks,
    finalMarkdown: row.final_markdown,
    completedAt: row.completed_at,
  });

  return {
    pdfBase64: pdf.buffer.toString('base64'),
    fileName: pdf.fileName,
    contentType: pdf.contentType,
    sizeBytes: pdf.buffer.byteLength,
  };
}
