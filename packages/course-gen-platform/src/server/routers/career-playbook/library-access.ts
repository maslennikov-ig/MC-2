/**
 * Who may see a Career Playbook, and how a stored row becomes one.
 *
 * @module library-access
 *
 * Split out of `library-service.ts` at 1121 lines of code. The seam is between POLICY and
 * OPERATION: this module holds the permission model, the share-slug rules, the column lists and
 * the row-to-response mapping, while the service next door holds the eleven things a caller can
 * actually do. Reading "can this user see this playbook" no longer means scrolling past the PDF
 * export.
 *
 * The permission model is the reason to keep this together in one place: `canReadPlaybook`,
 * `canListPlaybook`, `assertReadable`, `assertManageable` and `assertShareable` are five
 * different questions about the same three facts (owner, organization member, visibility), and
 * a change to one of them that misses another is a leak.
 */

import { TRPCError } from '@trpc/server';
import {
  cardEnrichmentContentSchema,
  dedupeCareerPlaybookQualityIssues,
  getUserVisibleCareerPlaybookWarnings,
} from '@megacampus/shared-types';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookImageStatus,
  CareerPlaybookLinkedCourse,
  CareerPlaybookPlaybookStatus,
  CareerPlaybookQualityIssue,
  CareerPlaybookVisibility,
  CareerPlaybookViewerPermissions,
  Language,
} from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger';
import {
  mapPlaybookRow,
  normalizeGeneratedBlocks,
  normalizeStoredQAData,
  type CareerPlaybookLinkedCourseRow,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from './service-mappers';
import { buildSlug } from './course-bridge-helpers';
import {
  remediateCareerPlaybookFinalMarkdown,
  remediateCareerPlaybookMermaidBlocks,
} from '@/stages/stage-career-playbook/nodes/mermaid-quality';

export interface CareerPlaybookLibraryItem {
  id: string;
  status: CareerPlaybookPlaybookStatus;
  language: Language;
  positionTitle: string | null;
  department: string | null;
  specialization: string | null;
  level: string | null;
  isPublic: boolean;
  visibility: CareerPlaybookVisibility;
  ownerId: string;
  viewerPermissions: CareerPlaybookViewerPermissions;
  shareSlug: string | null;
  organizationSlug: string | null;
  imageUrl: string | null;
  imageStatus: CareerPlaybookImageStatus | null;
  imageAltText: string | null;
  imageErrorMessage: string | null;
  linkedCourse: CareerPlaybookLinkedCourse | null;
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
  qualityWarnings: string[];
  qualityIssues: CareerPlaybookQualityIssue[];
}

export interface CareerPlaybookPublicShareResponse extends CareerPlaybookLibraryItem {
  finalMarkdown: string;
  qualityWarnings: string[];
}

export interface CareerPlaybookDeleteResponse {
  deleted: true;
  playbookId: string;
}

export interface CareerPlaybookShareToggleResponse {
  playbookId: string;
  isPublic: boolean;
  visibility: CareerPlaybookVisibility;
  shareSlug: string | null;
  organizationSlug: string | null;
  viewerPermissions: CareerPlaybookViewerPermissions;
}

export type CareerPlaybookVisibilityUpdateResponse = CareerPlaybookShareToggleResponse;

export interface CareerPlaybookImageRegenerateResponse {
  playbookId: string;
  imageStatus: CareerPlaybookImageStatus;
  imageUrl: null;
  imageErrorMessage: null;
}

export interface CareerPlaybookBlockMutationResponse extends CareerPlaybookBlockState {
  blockId: CareerPlaybookBlockId;
}

export interface CareerPlaybookPdfExportResponse {
  pdfBase64: string;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

export function getCareerPlaybookSupabase(): CareerPlaybookSupabase {
  return getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
}

export function requireUser(ctx: Context): UserContext {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  return ctx.user;
}

export function throwOnDbError(error: unknown, message: string): never {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
    cause: error,
  });
}

export const OWNER_PERMISSIONS: CareerPlaybookViewerPermissions = {
  canEdit: true,
  canManageVisibility: true,
  canCreateCourse: true,
  canDelete: true,
};

export const READONLY_PERMISSIONS: CareerPlaybookViewerPermissions = {
  canEdit: false,
  canManageVisibility: false,
  canCreateCourse: false,
  canDelete: false,
};

export function isOwner(row: CareerPlaybookRow, user: UserContext): boolean {
  return user.role === 'superadmin' || row.user_id === user.id;
}

export function isOrganizationMember(row: CareerPlaybookRow, user: UserContext): boolean {
  return Boolean(row.organization_id && row.organization_id === user.organizationId);
}

export function getVisibility(row: CareerPlaybookRow): CareerPlaybookVisibility {
  return row.visibility ?? (row.is_public ? 'public' : 'private');
}

export function canReadPlaybook(row: CareerPlaybookRow, user: UserContext): boolean {
  const visibility = getVisibility(row);
  if (isOwner(row, user)) return true;
  if (visibility === 'organization' && isOrganizationMember(row, user)) return true;
  return visibility === 'public';
}

export function canListPlaybook(row: CareerPlaybookRow, user: UserContext): boolean {
  const visibility = getVisibility(row);
  if (isOwner(row, user)) return true;
  return visibility === 'organization' && isOrganizationMember(row, user);
}

export function assertReadable(row: CareerPlaybookRow, user: UserContext): void {
  if (canReadPlaybook(row, user)) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

export function assertManageable(row: CareerPlaybookRow, user: UserContext): void {
  if (isOwner(row, user)) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

export function getViewerPermissions(
  row: CareerPlaybookRow,
  user: UserContext
): CareerPlaybookViewerPermissions {
  return isOwner(row, user) ? { ...OWNER_PERMISSIONS } : { ...READONLY_PERMISSIONS };
}

export function buildShareSlugBase(positionTitle: string | null | undefined): string {
  const slug = buildSlug(positionTitle?.trim() || 'role-guide');
  return slug === 'course' ? 'role-guide' : slug;
}

export function shareSlugSuffixFromId(playbookId: string): string {
  return (
    playbookId
      .replace(/[^a-f0-9]/gi, '')
      .slice(0, 6)
      .toLowerCase() || 'role'
  );
}

export function isLegacyShareSlug(shareSlug: string | null): boolean {
  return Boolean(shareSlug?.match(/^cp-[a-f0-9]{24,32}$/i));
}

export async function shareSlugBelongsToAnotherPlaybook(
  candidate: string,
  playbookId: string
): Promise<boolean> {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id')
    .eq('share_slug', candidate)
    .maybeSingle();

  if (error) throwOnDbError(error, 'Failed to check Career Playbook share slug');
  return Boolean(data && data.id !== playbookId);
}

export async function buildUniqueShareSlug(row: CareerPlaybookRow): Promise<string> {
  const baseSlug = buildShareSlugBase(row.position_title);
  if (!(await shareSlugBelongsToAnotherPlaybook(baseSlug, row.id))) {
    return baseSlug;
  }

  const suffix = shareSlugSuffixFromId(row.id);
  const suffixed = buildSlug(baseSlug, suffix);
  if (!(await shareSlugBelongsToAnotherPlaybook(suffixed, row.id))) {
    return suffixed;
  }

  for (let index = 2; index <= 9; index += 1) {
    const candidate = buildSlug(baseSlug, `${suffix}${index}`);
    if (!(await shareSlugBelongsToAnotherPlaybook(candidate, row.id))) {
      return candidate;
    }
  }

  throw new TRPCError({
    code: 'CONFLICT',
    message: 'Unable to allocate a unique Career Playbook share slug',
  });
}

export async function loadOrganizationSlug(
  organizationId: string | null | undefined
): Promise<string | null> {
  if (!organizationId) return null;

  const supabase = getCareerPlaybookSupabase() as unknown as {
    from: (table: 'organizations') => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown
        ) => {
          single: () => Promise<{
            data: { slug?: string | null } | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .single();

  if (error || typeof data?.slug !== 'string' || data.slug.trim().length === 0) return null;
  return data.slug;
}

export async function loadOrganizationSlugMap(
  rows: CareerPlaybookRow[]
): Promise<Map<string, string | null>> {
  const organizationIds = Array.from(new Set(rows.map(row => row.organization_id).filter(Boolean)));
  const entries = await Promise.all(
    organizationIds.map(
      async organizationId => [organizationId, await loadOrganizationSlug(organizationId)] as const
    )
  );
  return new Map(entries);
}

export function buildCareerPlaybookImageFields(
  row: CareerPlaybookRow
): Pick<
  CareerPlaybookLibraryItem,
  'imageUrl' | 'imageStatus' | 'imageAltText' | 'imageErrorMessage'
> {
  const parsedContent = cardEnrichmentContentSchema.safeParse(row.image_content);

  if (row.image_status === 'completed' && !parsedContent.success && row.image_content) {
    logger.warn(
      {
        playbookId: row.id,
        imageStatus: row.image_status,
        validationError: parsedContent.error.message,
      },
      'Invalid Career Playbook image content'
    );
  }

  const content = parsedContent.success ? parsedContent.data : null;
  const imageUrl =
    row.image_status === 'completed' && typeof content?.imageUrl === 'string'
      ? content.imageUrl
      : null;

  return {
    imageUrl,
    imageStatus: row.image_status,
    imageAltText: content?.altText ?? null,
    imageErrorMessage: row.image_error_message,
  };
}

export const CAREER_PLAYBOOK_IMAGE_COLUMN_NAMES = [
  'image_status',
  'image_content',
  'image_metadata',
  'image_generation_attempt',
  'image_error_message',
  'image_updated_at',
];

export function errorField(error: unknown, field: 'code' | 'message' | 'details' | 'hint'): string {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

export function isNotFoundDbError(error: unknown): boolean {
  return errorField(error, 'code') === 'PGRST116';
}

export function isMissingCareerPlaybookImageColumnError(error: unknown): boolean {
  if (errorField(error, 'code') !== '42703') return false;

  const text = [
    errorField(error, 'message'),
    errorField(error, 'details'),
    errorField(error, 'hint'),
  ]
    .join(' ')
    .toLowerCase();

  return CAREER_PLAYBOOK_IMAGE_COLUMN_NAMES.some(column => text.includes(column));
}

export function throwPublicShareNotFound(error?: unknown): never {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Career Playbook not found',
    cause: error,
  });
}

export function withNullImageFields(row: CareerPlaybookRow): CareerPlaybookRow {
  return {
    ...row,
    image_status: null,
    image_content: null,
    image_metadata: null,
    image_generation_attempt: 0,
    image_error_message: null,
    image_updated_at: null,
  };
}

export const PUBLIC_PLAYBOOK_COLUMNS = [
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
  'image_status',
  'image_content',
  'image_metadata',
  'image_generation_attempt',
  'image_error_message',
  'image_updated_at',
  'share_slug',
  'is_public',
  'visibility',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

export const PUBLIC_PLAYBOOK_COLUMNS_WITHOUT_IMAGE = [
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
  'visibility',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

export const LIBRARY_PLAYBOOK_COLUMNS_WITHOUT_IMAGE = [
  'id',
  'user_id',
  'organization_id',
  'status',
  'language',
  'position_title',
  'department',
  'specialization',
  'level',
  'share_slug',
  'is_public',
  'visibility',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

export const LIBRARY_PLAYBOOK_COLUMNS = [
  'id',
  'user_id',
  'organization_id',
  'status',
  'language',
  'position_title',
  'department',
  'specialization',
  'level',
  'image_status',
  'image_content',
  'image_metadata',
  'image_generation_attempt',
  'image_error_message',
  'image_updated_at',
  'share_slug',
  'is_public',
  'visibility',
  'created_at',
  'updated_at',
  'completed_at',
].join(',');

export const LINKED_COURSE_COLUMNS = [
  'id',
  'organization_id',
  'title',
  'slug',
  'status',
  'generation_status',
  'settings',
  'created_at',
].join(',');

export function assertShareable(row: CareerPlaybookRow): void {
  if (row.status === 'completed' && row.final_markdown?.trim()) return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Career Playbook must be completed before sharing',
  });
}

export async function loadReadablePlaybook(playbookId: string, user: UserContext) {
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
  assertReadable(row, user);
  return row;
}

export async function loadManageablePlaybook(playbookId: string, user: UserContext) {
  const row = await loadReadablePlaybook(playbookId, user);
  assertManageable(row, user);
  return row;
}

export function toLibraryItemFromMappedRow(
  mapped: CareerPlaybookRow,
  user: UserContext,
  organizationSlug: string | null = null,
  linkedCourse: CareerPlaybookLinkedCourse | null = null
): CareerPlaybookLibraryItem {
  const visibility = getVisibility(mapped);
  return {
    id: mapped.id,
    status: mapped.status,
    language: mapped.language,
    positionTitle: mapped.position_title,
    department: mapped.department,
    specialization: mapped.specialization,
    level: mapped.level,
    isPublic: visibility === 'public',
    visibility,
    ownerId: mapped.user_id,
    viewerPermissions: getViewerPermissions(mapped, user),
    shareSlug: visibility === 'public' ? mapped.share_slug : null,
    organizationSlug,
    ...buildCareerPlaybookImageFields(mapped),
    linkedCourse,
    createdAt: mapped.created_at,
    updatedAt: mapped.updated_at,
    completedAt: mapped.completed_at,
  };
}

export function mapRowToLibraryItem(
  row: CareerPlaybookRow,
  user: UserContext,
  organizationSlug: string | null = null,
  linkedCourse: CareerPlaybookLinkedCourse | null = null
): CareerPlaybookLibraryItem {
  const mapped = mapPlaybookRow(row);
  return toLibraryItemFromMappedRow(mapped, user, organizationSlug, linkedCourse);
}

export function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function linkedPlaybookIdFromCourse(row: CareerPlaybookLinkedCourseRow): string | null {
  const settings = recordFromJson(row.settings);
  return settings.source === 'career_playbook' && typeof settings.playbookId === 'string'
    ? settings.playbookId
    : null;
}

export function toLinkedCourse(
  row: CareerPlaybookLinkedCourseRow,
  organizationSlug: string | null
): CareerPlaybookLinkedCourse | null {
  if (!row.id || !row.slug?.trim()) return null;

  return {
    id: row.id,
    title: row.title?.trim() || 'Course',
    slug: row.slug.trim(),
    organizationSlug,
    status: row.status ?? null,
    generationStatus: row.generation_status ?? null,
  };
}

export async function loadLinkedCourseMap(
  rows: CareerPlaybookRow[],
  organizationSlugById: Map<string, string | null>
): Promise<Map<string, CareerPlaybookLinkedCourse>> {
  const playbookIds = new Set(rows.map(row => row.id));
  const organizationIds = Array.from(
    new Set(rows.map(row => row.organization_id).filter((id): id is string => Boolean(id)))
  );
  const linkedByPlaybookId = new Map<string, CareerPlaybookLinkedCourse>();
  if (playbookIds.size === 0 || organizationIds.length === 0) return linkedByPlaybookId;

  const supabase = getCareerPlaybookSupabase();
  await Promise.all(
    organizationIds.map(async organizationId => {
      // Keep this lookup in the runtime path so existing playbook courses replace the create-course CTA.
      const { data, error } = await supabase
        .from('courses')
        .select(LINKED_COURSE_COLUMNS)
        .eq('organization_id', organizationId)
        .contains('settings', { source: 'career_playbook' })
        .order('created_at', { ascending: false });

      if (error) throwOnDbError(error, 'Failed to load Career Playbook linked courses');

      const organizationSlug = organizationSlugById.get(organizationId) ?? null;
      const courseRows = Array.isArray(data) ? data : [];
      for (const courseRow of courseRows) {
        const playbookId = linkedPlaybookIdFromCourse(courseRow);
        if (!playbookId || !playbookIds.has(playbookId) || linkedByPlaybookId.has(playbookId)) {
          continue;
        }

        const linkedCourse = toLinkedCourse(courseRow, organizationSlug);
        if (linkedCourse) linkedByPlaybookId.set(playbookId, linkedCourse);
      }
    })
  );

  return linkedByPlaybookId;
}

export function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  if (!cursor.startsWith('offset:')) return 0;
  const offset = Number.parseInt(cursor.slice('offset:'.length), 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

export function buildFacet(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b)
  );
}

export function buildStatistics(rows: CareerPlaybookRow[]): CareerPlaybookLibraryStatistics {
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
    publicCount: rows.filter(row => getVisibility(row) === 'public').length,
  };
}

export function buildFacets(rows: CareerPlaybookRow[]): CareerPlaybookLibraryFacets {
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

export function sortRows(
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

export function mergeQualityIssues(
  ...groups: CareerPlaybookQualityIssue[][]
): CareerPlaybookQualityIssue[] {
  return dedupeCareerPlaybookQualityIssues(groups.flat());
}

export async function mapRowToLibraryDetail(
  row: CareerPlaybookRow,
  user: UserContext,
  organizationSlug: string | null = null,
  linkedCourse: CareerPlaybookLinkedCourse | null = null
): Promise<CareerPlaybookLibraryDetailResponse> {
  const mapped = mapPlaybookRow(row);
  const qaData = normalizeStoredQAData(mapped.q_a_data);
  const generatedBlocks = normalizeGeneratedBlocks(mapped.generated_blocks);
  const blockRemediation = await remediateCareerPlaybookMermaidBlocks(generatedBlocks);
  const markdownRemediation = await remediateCareerPlaybookFinalMarkdown(mapped.final_markdown);
  const remediatedGeneratedBlocks: Record<string, CareerPlaybookBlockState> = {
    ...generatedBlocks,
  };
  for (const [blockId, block] of Object.entries(blockRemediation.generatedBlocks)) {
    if (block) {
      remediatedGeneratedBlocks[blockId] = block;
    }
  }

  return {
    ...toLibraryItemFromMappedRow(mapped, user, organizationSlug, linkedCourse),
    generatedBlocks: remediatedGeneratedBlocks,
    finalMarkdown: markdownRemediation.modified
      ? markdownRemediation.content
      : mapped.final_markdown,
    qualityWarnings: getUserVisibleCareerPlaybookWarnings(qaData.generation_warnings),
    qualityIssues: mergeQualityIssues(qaData.quality_issues, blockRemediation.qualityIssues),
  };
}

export async function mapRowToPublicShare(
  row: CareerPlaybookRow,
  organizationSlug: string | null
): Promise<CareerPlaybookPublicShareResponse> {
  const mapped = mapPlaybookRow(row);
  const visibility = getVisibility(mapped);
  const markdownRemediation = await remediateCareerPlaybookFinalMarkdown(mapped.final_markdown);
  return {
    id: mapped.id,
    status: mapped.status,
    language: mapped.language,
    positionTitle: mapped.position_title,
    department: mapped.department,
    specialization: mapped.specialization,
    level: mapped.level,
    isPublic: visibility === 'public',
    visibility,
    ownerId: mapped.user_id,
    viewerPermissions: { ...READONLY_PERMISSIONS },
    shareSlug: visibility === 'public' ? mapped.share_slug : null,
    organizationSlug,
    ...buildCareerPlaybookImageFields(mapped),
    linkedCourse: null,
    createdAt: mapped.created_at,
    updatedAt: mapped.updated_at,
    completedAt: mapped.completed_at,
    finalMarkdown: markdownRemediation.modified
      ? markdownRemediation.content
      : (mapped.final_markdown ?? ''),
    qualityWarnings: [],
  };
}

export async function queryCareerPlaybookListRows(
  user: UserContext,
  columns: string
): Promise<{ data: CareerPlaybookRow[] | null; error: unknown }> {
  const supabase = getCareerPlaybookSupabase();
  let query = supabase.from('career_playbooks').select(columns);

  if (user.role !== 'superadmin') {
    query = query.or(
      `user_id.eq.${user.id},and(visibility.eq.organization,organization_id.eq.${user.organizationId})`
    );
  }

  return query.order('created_at', { ascending: false });
}
