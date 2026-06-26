import { TRPCError } from '@trpc/server';
import { JobType, cardEnrichmentContentSchema } from '@megacampus/shared-types';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookGenerateImageJobData,
  CareerPlaybookImageStatus,
  CareerPlaybookLinkedCourse,
  CareerPlaybookNumericFact,
  CareerPlaybookPlaybookStatus,
  CareerPlaybookQualityIssue,
  CareerPlaybookVisibility,
  CareerPlaybookViewerPermissions,
  Language,
} from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger';
import { renderCareerPlaybookPdf } from '../../../services/career-playbook-pdf';
import {
  mapPlaybookRow,
  normalizeGeneratedBlocks,
  normalizeStoredQAData,
  toJson,
  type CareerPlaybookLinkedCourseRow,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
} from './service-mappers';
import { buildSlug } from './course-bridge-helpers';
import {
  annotateCareerPlaybookBlockNumericFacts,
  findCareerPlaybookNumericFactOccurrences,
} from '@/stages/stage-career-playbook/numeric-facts';
import { addJob, removeTerminalJobById } from '@/orchestrator/queue';
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

export interface CareerPlaybookPdfExportResponse {
  pdfBase64: string;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

export interface CareerPlaybookNumericFactUpdateInput {
  playbookId: string;
  blockId: CareerPlaybookBlockId;
  factId: string;
  replacementText: string;
  scope: 'occurrence' | 'block';
}

const FINAL_BLOCK_ORDER: CareerPlaybookBlockId[] = [
  'header',
  ...Array.from({ length: 26 }, (_, index) => `block_${index + 1}`),
];

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

const OWNER_PERMISSIONS: CareerPlaybookViewerPermissions = {
  canEdit: true,
  canManageVisibility: true,
  canCreateCourse: true,
  canDelete: true,
};

const READONLY_PERMISSIONS: CareerPlaybookViewerPermissions = {
  canEdit: false,
  canManageVisibility: false,
  canCreateCourse: false,
  canDelete: false,
};

function isOwner(row: CareerPlaybookRow, user: UserContext): boolean {
  return user.role === 'superadmin' || row.user_id === user.id;
}

function isOrganizationMember(row: CareerPlaybookRow, user: UserContext): boolean {
  return Boolean(row.organization_id && row.organization_id === user.organizationId);
}

function getVisibility(row: CareerPlaybookRow): CareerPlaybookVisibility {
  return row.visibility ?? (row.is_public ? 'public' : 'private');
}

function canReadPlaybook(row: CareerPlaybookRow, user: UserContext): boolean {
  const visibility = getVisibility(row);
  if (isOwner(row, user)) return true;
  if (visibility === 'organization' && isOrganizationMember(row, user)) return true;
  return visibility === 'public';
}

function canListPlaybook(row: CareerPlaybookRow, user: UserContext): boolean {
  const visibility = getVisibility(row);
  if (isOwner(row, user)) return true;
  return visibility === 'organization' && isOrganizationMember(row, user);
}

function assertReadable(row: CareerPlaybookRow, user: UserContext): void {
  if (canReadPlaybook(row, user)) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

function assertManageable(row: CareerPlaybookRow, user: UserContext): void {
  if (isOwner(row, user)) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

function getViewerPermissions(
  row: CareerPlaybookRow,
  user: UserContext
): CareerPlaybookViewerPermissions {
  return isOwner(row, user) ? { ...OWNER_PERMISSIONS } : { ...READONLY_PERMISSIONS };
}

function buildShareSlugBase(positionTitle: string | null | undefined): string {
  const slug = buildSlug(positionTitle?.trim() || 'role-guide');
  return slug === 'course' ? 'role-guide' : slug;
}

function shareSlugSuffixFromId(playbookId: string): string {
  return (
    playbookId
      .replace(/[^a-f0-9]/gi, '')
      .slice(0, 6)
      .toLowerCase() || 'role'
  );
}

function isLegacyShareSlug(shareSlug: string | null): boolean {
  return Boolean(shareSlug?.match(/^cp-[a-f0-9]{24,32}$/i));
}

async function shareSlugBelongsToAnotherPlaybook(
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

async function buildUniqueShareSlug(row: CareerPlaybookRow): Promise<string> {
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

async function loadOrganizationSlug(
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

async function loadOrganizationSlugMap(
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

function buildCareerPlaybookImageFields(
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

const LIBRARY_PLAYBOOK_COLUMNS = [
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

const LINKED_COURSE_COLUMNS = [
  'id',
  'organization_id',
  'title',
  'slug',
  'status',
  'generation_status',
  'settings',
  'created_at',
].join(',');

function assertShareable(row: CareerPlaybookRow): void {
  if (row.status === 'completed' && row.final_markdown?.trim()) return;

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Career Playbook must be completed before sharing',
  });
}

async function loadReadablePlaybook(playbookId: string, user: UserContext) {
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

async function loadManageablePlaybook(playbookId: string, user: UserContext) {
  const row = await loadReadablePlaybook(playbookId, user);
  assertManageable(row, user);
  return row;
}

function toLibraryItemFromMappedRow(
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

function mapRowToLibraryItem(
  row: CareerPlaybookRow,
  user: UserContext,
  organizationSlug: string | null = null,
  linkedCourse: CareerPlaybookLinkedCourse | null = null
): CareerPlaybookLibraryItem {
  const mapped = mapPlaybookRow(row);
  return toLibraryItemFromMappedRow(mapped, user, organizationSlug, linkedCourse);
}

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function linkedPlaybookIdFromCourse(row: CareerPlaybookLinkedCourseRow): string | null {
  const settings = recordFromJson(row.settings);
  return settings.source === 'career_playbook' && typeof settings.playbookId === 'string'
    ? settings.playbookId
    : null;
}

function toLinkedCourse(
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

async function loadLinkedCourseMap(
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
    publicCount: rows.filter(row => getVisibility(row) === 'public').length,
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

function mergeQualityIssues(
  ...groups: CareerPlaybookQualityIssue[][]
): CareerPlaybookQualityIssue[] {
  const merged: CareerPlaybookQualityIssue[] = [];
  const seen = new Set<string>();

  for (const issue of groups.flat()) {
    if (seen.has(issue.id)) continue;
    merged.push(issue);
    seen.add(issue.id);
  }

  return merged;
}

async function mapRowToLibraryDetail(
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
    qualityWarnings: qaData.generation_warnings,
    qualityIssues: mergeQualityIssues(qaData.quality_issues, blockRemediation.qualityIssues),
  };
}

async function mapRowToPublicShare(
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

function replaceNumberOccurrence(input: {
  content: string;
  rawText: string;
  replacementText: string;
  occurrenceIndex: number;
  scope: 'occurrence' | 'block';
}): string {
  const occurrences = findCareerPlaybookNumericFactOccurrences(input.content, input.rawText);

  if (occurrences.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Numeric fact text not found' });
  }

  if (input.scope === 'block') {
    return occurrences.reduceRight(
      (next, occurrence) =>
        `${next.slice(0, occurrence.start)}${input.replacementText}${next.slice(occurrence.end)}`,
      input.content
    );
  }

  const occurrence = occurrences[input.occurrenceIndex];
  if (occurrence) {
    return `${input.content.slice(0, occurrence.start)}${input.replacementText}${input.content.slice(
      occurrence.end
    )}`;
  }

  throw new TRPCError({ code: 'NOT_FOUND', message: 'Numeric fact occurrence not found' });
}

function hasCompleteGeneratedBlocks(blocks: Record<string, CareerPlaybookBlockState>): boolean {
  return FINAL_BLOCK_ORDER.every(blockId => blocks[blockId]?.content.trim());
}

function assembleStoredBlocksMarkdown(blocks: Record<string, CareerPlaybookBlockState>): string {
  return FINAL_BLOCK_ORDER.map(blockId => blocks[blockId]?.content.trim())
    .filter(Boolean)
    .join('\n\n');
}

function buildPatchedFinalMarkdown(input: {
  row: CareerPlaybookRow;
  blocks: Record<string, CareerPlaybookBlockState>;
  fact: CareerPlaybookNumericFact;
  replacementText: string;
  oldBlockContent: string;
  newBlockContent: string;
  scope: 'occurrence' | 'block';
}): string | null {
  if (hasCompleteGeneratedBlocks(input.blocks)) {
    return assembleStoredBlocksMarkdown(input.blocks);
  }

  if (!input.row.final_markdown) return input.blocks[input.fact.block_id]?.content ?? null;

  const oldBlockContent = input.oldBlockContent.trim();
  if (oldBlockContent && input.row.final_markdown.includes(oldBlockContent)) {
    return input.row.final_markdown.replace(oldBlockContent, input.newBlockContent.trim());
  }

  try {
    return replaceNumberOccurrence({
      content: input.row.final_markdown,
      rawText: input.fact.raw_text,
      replacementText: input.replacementText,
      occurrenceIndex: input.fact.occurrence_index,
      scope: input.scope,
    });
  } catch {
    return input.row.final_markdown;
  }
}

function markReplacementAsUserVerified(input: {
  facts: CareerPlaybookNumericFact[];
  replacementText: string;
  updatedAt: string;
}): CareerPlaybookNumericFact[] {
  let matched = false;
  return input.facts.map(fact => {
    if (!matched && fact.raw_text === input.replacementText) {
      matched = true;
      return {
        ...fact,
        status: 'verified',
        source: 'user_input',
        confidence: 1,
        explanation: 'Исправлено пользователем.',
        updated_at: input.updatedAt,
      };
    }
    return fact;
  });
}

function buildNumericEvidenceText(row: CareerPlaybookRow, replacementText: string): string {
  return JSON.stringify({
    replacementText,
    userInput: replacementText,
    qaData: row.q_a_data,
    roleProfileSpec: row.role_profile_spec,
    webResearch: row.web_research,
  });
}

export async function updateCareerPlaybookNumericFact(
  ctx: Context,
  input: CareerPlaybookNumericFactUpdateInput
): Promise<CareerPlaybookBlockState & { blockId: CareerPlaybookBlockId }> {
  const user = requireUser(ctx);
  const row = await loadManageablePlaybook(input.playbookId, user);
  const generatedBlocks = normalizeGeneratedBlocks(row.generated_blocks);
  const block = generatedBlocks[input.blockId];
  if (!block) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Career Playbook block not found' });
  }

  const fact = block.numeric_facts?.find(candidate => candidate.id === input.factId);
  if (!fact) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Numeric fact not found' });
  }

  const updatedAt = new Date().toISOString();
  const content = replaceNumberOccurrence({
    content: block.content,
    rawText: fact.raw_text,
    replacementText: input.replacementText,
    occurrenceIndex: fact.occurrence_index,
    scope: input.scope,
  });
  const annotatedBlock = annotateCareerPlaybookBlockNumericFacts({
    blockId: input.blockId,
    block: {
      ...block,
      content,
      status: 'generated',
      generated_at: updatedAt,
    },
    evidenceText: buildNumericEvidenceText(row, input.replacementText),
    language: row.language,
  });
  annotatedBlock.numeric_facts = markReplacementAsUserVerified({
    facts: annotatedBlock.numeric_facts ?? [],
    replacementText: input.replacementText,
    updatedAt,
  });

  const nextBlocks = {
    ...generatedBlocks,
    [input.blockId]: annotatedBlock,
  };
  const finalMarkdown = buildPatchedFinalMarkdown({
    row,
    blocks: nextBlocks,
    fact,
    replacementText: input.replacementText,
    oldBlockContent: block.content,
    newBlockContent: content,
    scope: input.scope,
  });

  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      generated_blocks: toJson(nextBlocks),
      final_markdown: finalMarkdown,
    })
    .eq('id', input.playbookId)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to update Career Playbook numeric fact');

  const updatedBlocks = normalizeGeneratedBlocks(data.generated_blocks);
  return {
    ...(updatedBlocks[input.blockId] ?? annotatedBlock),
    blockId: input.blockId,
  };
}

export async function listCareerPlaybooks(
  ctx: Context,
  input: CareerPlaybookLibraryListInput
): Promise<CareerPlaybookLibraryListResponse> {
  const user = requireUser(ctx);
  const supabase = getCareerPlaybookSupabase();
  let query = supabase.from('career_playbooks').select(LIBRARY_PLAYBOOK_COLUMNS);

  if (user.role !== 'superadmin') {
    query = query.or(
      `user_id.eq.${user.id},and(visibility.eq.organization,organization_id.eq.${user.organizationId})`
    );
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throwOnDbError(error, 'Failed to list Career Playbooks');

  const lowerSearch = input.search?.trim().toLowerCase();
  const readableRows = (data ?? []).map(mapPlaybookRow).filter(row => canListPlaybook(row, user));

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

export async function getPublicCareerPlaybookBySlug(input: {
  shareSlug: string;
}): Promise<CareerPlaybookPublicShareResponse> {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select(PUBLIC_PLAYBOOK_COLUMNS)
    .eq('share_slug', input.shareSlug)
    .eq('visibility', 'public')
    .eq('status', 'completed')
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
  }

  const mapped = mapPlaybookRow(data);
  if (
    getVisibility(mapped) !== 'public' ||
    mapped.status !== 'completed' ||
    !mapped.final_markdown?.trim()
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
    });
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
