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
  totalCount: number;
  statistics: CareerPlaybookLibraryStatistics;
  facets: CareerPlaybookLibraryFacets;
}

export interface CareerPlaybookLibraryStatistics {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  publicCount: number;
}

export interface CareerPlaybookLibraryFacets {
  statuses: CareerPlaybookPlaybookStatus[];
  departments: string[];
  levels: string[];
}

export type CareerPlaybookLibrarySort = 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc';

export interface CareerPlaybookLibraryListInput {
  limit: number;
  cursor?: string;
  search?: string;
  status?: CareerPlaybookPlaybookStatus;
  department?: string;
  level?: string;
  sort?: CareerPlaybookLibrarySort;
}

export interface CareerPlaybookLibraryDetailResponse extends CareerPlaybookLibraryItem {
  generatedBlocks: Record<string, CareerPlaybookBlockState>;
  finalMarkdown: string | null;
}

export interface CareerPlaybookPublicShareResponse extends CareerPlaybookLibraryItem {
  finalMarkdown: string;
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

const PUBLIC_PLAYBOOK_COLUMNS = [
  'id',
  'user_id',
  'organization_id',
  'status',
  'language',
  'slug',
  'position_title',
  'department',
  'specialization',
  'level',
  'final_markdown',
  'share_slug',
  'is_public',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

function assertShareable(row: CareerPlaybookRow): void {
  if (row.status === 'completed' && row.final_markdown?.trim()) return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Career Playbook must be completed before sharing',
  });
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

function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (!cursor.startsWith('offset:')) return 0;
  const offset = Number.parseInt(cursor.slice('offset:'.length), 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function buildFacet(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b)
  );
}

function buildStatistics(rows: CareerPlaybookRow[]): CareerPlaybookLibraryStatistics {
  const inProgressStatuses = new Set<CareerPlaybookPlaybookStatus>([
    'answering_fixed',
    'awaiting_followups',
    'answering_followups',
    'ready_to_generate',
    'generating',
  ]);

  return {
    totalCount: rows.length,
    completedCount: rows.filter(row => row.status === 'completed').length,
    inProgressCount: rows.filter(row => inProgressStatuses.has(row.status)).length,
    publicCount: rows.filter(row => row.is_public).length,
  };
}

function buildFacets(rows: CareerPlaybookRow[]): CareerPlaybookLibraryFacets {
  const statusOrder: CareerPlaybookPlaybookStatus[] = [
    'draft',
    'answering_fixed',
    'awaiting_followups',
    'answering_followups',
    'ready_to_generate',
    'generating',
    'completed',
    'failed',
  ];
  const statuses = new Set(rows.map(row => row.status));

  return {
    statuses: statusOrder.filter(status => statuses.has(status)),
    departments: buildFacet(rows.map(row => row.department)),
    levels: buildFacet(rows.map(row => row.level)),
  };
}

function sortRows(
  rows: CareerPlaybookRow[],
  sort: CareerPlaybookLibrarySort = 'created_desc'
): CareerPlaybookRow[] {
  const titleOf = (row: CareerPlaybookRow) => row.position_title ?? '';
  const dateOf = (row: CareerPlaybookRow) => Date.parse(row.created_at) || 0;
  return [...rows].sort((left, right) => {
    if (sort === 'created_asc') return dateOf(left) - dateOf(right);
    if (sort === 'title_asc') return titleOf(left).localeCompare(titleOf(right));
    if (sort === 'title_desc') return titleOf(right).localeCompare(titleOf(left));
    return dateOf(right) - dateOf(left);
  });
}

function mapRowToLibraryDetail(row: CareerPlaybookRow): CareerPlaybookLibraryDetailResponse {
  const mapped = mapPlaybookRow(row);
  return {
    ...toLibraryItemFromMappedRow(mapped),
    generatedBlocks: normalizeGeneratedBlocks(mapped.generated_blocks),
    finalMarkdown: mapped.final_markdown,
  };
}

function mapRowToPublicShare(row: CareerPlaybookRow): CareerPlaybookPublicShareResponse {
  const mapped = mapPlaybookRow(row);
  return {
    ...toLibraryItemFromMappedRow(mapped),
    finalMarkdown: mapped.final_markdown ?? '',
  };
}

export async function listCareerPlaybooks(
  ctx: Context,
  input: CareerPlaybookLibraryListInput
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
  const ownedRows = (data ?? []).map(mapPlaybookRow).filter(row => isOwnedByUser(row, user));

  const scopedRows = ownedRows
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
  const items = pageRows.map(mapRowToLibraryItem);

  return {
    items,
    nextCursor: hasMore ? `offset:${offset + input.limit}` : undefined,
    totalCount: scopedRows.length,
    statistics: buildStatistics(ownedRows),
    facets: buildFacets(ownedRows),
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
  const user = requireUser(ctx);
  const row = await loadOwnedPlaybook(input.playbookId, user);
  if (input.isPublic) assertShareable(row);
  const shareSlug = input.isPublic ? (row.share_slug ?? buildShareSlug()) : row.share_slug;
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      is_public: input.isPublic,
      share_slug: shareSlug,
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
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
}): Promise<CareerPlaybookPublicShareResponse> {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select(PUBLIC_PLAYBOOK_COLUMNS)
    .eq('share_slug', input.shareSlug)
    .eq('is_public', true)
    .eq('status', 'completed')
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  }

  const mapped = mapPlaybookRow(data);
  if (!mapped.is_public || mapped.status !== 'completed' || !mapped.final_markdown?.trim()) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  }

  return mapRowToPublicShare(mapped);
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
