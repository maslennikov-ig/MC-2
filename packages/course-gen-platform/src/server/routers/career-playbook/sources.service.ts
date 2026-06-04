import { TRPCError } from '@trpc/server';
import {
  JobType,
  type CareerPlaybookBusinessContextSourceSummary,
  type CareerPlaybookProcessSourceJobData,
  type Tier,
} from '@megacampus/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { Context, UserContext } from '../../trpc';
import { addJob } from '@/orchestrator/queue';
import { logger } from '../../../shared/logger/index.js';
import { validateFile } from '../../../shared/validation/file-validator';
import { decrementQuota } from '../../../shared/validation/quota-enforcer';
import { runPhase2Storage, isStorageError } from '@/stages/stage1-document-upload/phases';
import type { Phase2StorageOutput } from '@/stages/stage1-document-upload/types';
import {
  getCareerPlaybookBusinessContextSupabase,
  type CareerPlaybookFileCatalogRow,
  type CareerPlaybookSourceRow,
} from '@/shared/career-playbook/source-db';

export interface UploadCareerPlaybookSourceInput {
  playbookId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  fileContent: string;
}

export interface UploadCareerPlaybookSourceResult {
  sourceId: string;
  fileId: string;
  storagePath: string;
  status: 'processing';
  message: string;
}

export type ListCareerPlaybookSourceResult = CareerPlaybookBusinessContextSourceSummary;

export interface RemoveCareerPlaybookSourceInput {
  playbookId: string;
  sourceId: string;
}

export interface RemoveCareerPlaybookSourceResult {
  sourceId: string;
  playbookId: string;
  fileCatalogId: string | null;
  status: 'removed';
  quotaReleasedBytes: number;
  fileDeleted: boolean;
}

function requireUser(ctx: Context): UserContext {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  return ctx.user;
}

function mapStorageError(error: unknown): TRPCError {
  if (isStorageError(error)) {
    return new TRPCError({
      code: error.code,
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Career Playbook source upload failed: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`,
    cause: error,
  });
}

async function loadWritablePlaybook(playbookId: string, user: UserContext) {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, user_id, organization_id, status, language')
    .eq('id', playbookId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
      cause: error,
    });
  }

  if (user.role !== 'superadmin' && data.user_id !== user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
  }

  return data;
}

function mapSource(row: CareerPlaybookSourceRow): ListCareerPlaybookSourceResult {
  return {
    id: row.id,
    playbookId: row.playbook_id,
    sourceType: row.source_type === 'text' ? 'text' : 'file',
    filename: row.filename,
    status: row.status as CareerPlaybookBusinessContextSourceSummary['status'],
    fileCatalogId: row.file_catalog_id,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

async function loadSourceForPlaybook(
  sourceId: string,
  playbookId: string,
  organizationId: string
): Promise<CareerPlaybookSourceRow> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data, error } = await supabase
    .from('career_playbook_sources')
    .select(
      'id, playbook_id, organization_id, user_id, status, filename, file_catalog_id, created_at, updated_at'
    )
    .eq('id', sourceId)
    .eq('playbook_id', playbookId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook source not found',
      cause: error,
    });
  }

  return data;
}

async function loadFileCatalogForCleanup(
  fileCatalogId: string
): Promise<CareerPlaybookFileCatalogRow> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data, error } = await supabase
    .from('file_catalog')
    .select(
      'id, organization_id, course_id, storage_path, file_size, original_file_id, reference_count'
    )
    .eq('id', fileCatalogId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to load Career Playbook source file metadata',
      cause: error,
    });
  }

  return data;
}

async function deleteSourceRow(sourceId: string): Promise<void> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { error } = await supabase.from('career_playbook_sources').delete().eq('id', sourceId);

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to remove Career Playbook source record',
      cause: error,
    });
  }
}

async function deleteFileCatalogRow(fileCatalogId: string): Promise<void> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { error } = await supabase.from('file_catalog').delete().eq('id', fileCatalogId);

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to remove Career Playbook source file metadata',
      cause: error,
    });
  }
}

async function releaseSourceQuota(file: CareerPlaybookFileCatalogRow): Promise<number> {
  if (!file.organization_id || !file.file_size || file.file_size <= 0) return 0;

  try {
    await decrementQuota(file.organization_id, file.file_size);
    return file.file_size;
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        organizationId: file.organization_id,
        quotaAmount: file.file_size,
        fileCatalogId: file.id,
      },
      'Failed to release quota for removed Career Playbook source file'
    );
    return 0;
  }
}

function canDeleteFileCatalogRow(file: CareerPlaybookFileCatalogRow): boolean {
  if (file.original_file_id) return true;
  return (file.reference_count ?? 1) <= 1;
}

function canDeletePhysicalFile(file: CareerPlaybookFileCatalogRow): boolean {
  return !file.original_file_id && (file.reference_count ?? 1) <= 1;
}

function getSourceProcessingJobId(playbookId: string, sourceId: string): string {
  return `career-playbook-source-${playbookId}-${sourceId}`;
}

function resolveProcessingFilePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.join(process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd(), storagePath);
}

async function safeUnlinkCareerPlaybookStoragePath(
  file: CareerPlaybookFileCatalogRow
): Promise<boolean> {
  if (!file.storage_path) return false;

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const absolutePath = path.resolve(process.cwd(), file.storage_path);
  if (absolutePath === uploadsRoot || !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    logger.warn(
      { fileCatalogId: file.id, storagePath: file.storage_path },
      'Skipped unsafe Career Playbook source file removal path'
    );
    return false;
  }

  try {
    await fs.unlink(absolutePath);
    return true;
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        fileCatalogId: file.id,
        storagePath: file.storage_path,
      },
      'Failed to delete removed Career Playbook source file'
    );
    return false;
  }
}

export async function listCareerPlaybookBusinessContextSourceSummaries(
  playbookId: string
): Promise<ListCareerPlaybookSourceResult[]> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data, error } = await supabase
    .from('career_playbook_sources')
    .select(
      'id, playbook_id, source_type, status, filename, file_catalog_id, error_message, created_at, updated_at'
    )
    .eq('playbook_id', playbookId)
    .neq('status', 'removed')
    .order('created_at', { ascending: true });

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to list Career Playbook sources',
      cause: error,
    });
  }

  return (data ?? []).map(mapSource);
}

export async function listCareerPlaybookBusinessContextSources(
  ctx: Context,
  playbookId: string
): Promise<ListCareerPlaybookSourceResult[]> {
  const user = requireUser(ctx);
  await loadWritablePlaybook(playbookId, user);

  return listCareerPlaybookBusinessContextSourceSummaries(playbookId);
}

async function getOrganizationTier(organizationId: string): Promise<Tier> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data, error } = await supabase
    .from('organizations')
    .select('id, tier')
    .eq('id', organizationId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve organization information',
      cause: error,
    });
  }

  return (data.tier as Tier) || 'free';
}

async function countExistingSources(playbookId: string): Promise<number> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { count, error } = await supabase
    .from('career_playbook_sources')
    .select('*', { count: 'exact', head: true })
    .eq('playbook_id', playbookId)
    .neq('status', 'removed');

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to check existing Career Playbook source count',
      cause: error,
    });
  }

  return count || 0;
}

async function cleanupStoredSourceFile(
  storage: Phase2StorageOutput,
  organizationId: string
): Promise<void> {
  const supabase = getCareerPlaybookBusinessContextSupabase();

  try {
    const { error } = await supabase.from('file_catalog').delete().eq('id', storage.fileId);
    if (error) throw new Error(error.message);
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        fileId: storage.fileId,
      },
      'Failed to delete orphaned Career Playbook file_catalog row'
    );
  }

  if (!storage.deduplicated) {
    const absolutePath = path.normalize(path.join(process.cwd(), storage.storagePath));
    const uploadsRoot = path.join(process.cwd(), 'uploads');

    if (absolutePath === uploadsRoot || absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
      try {
        await fs.unlink(absolutePath);
      } catch (error) {
        logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            storagePath: storage.storagePath,
          },
          'Failed to delete orphaned Career Playbook source file'
        );
      }
    }
  }

  try {
    await decrementQuota(organizationId, storage.actualSize);
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        organizationId,
        quotaAmount: storage.actualSize,
      },
      'Failed to release quota for orphaned Career Playbook source file'
    );
  }
}

export async function uploadCareerPlaybookBusinessContextSource(
  ctx: Context,
  input: UploadCareerPlaybookSourceInput
): Promise<UploadCareerPlaybookSourceResult> {
  const user = requireUser(ctx);
  const playbook = await loadWritablePlaybook(input.playbookId, user);

  if (playbook.organization_id !== user.organizationId && user.role !== 'superadmin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
  }

  const tier = await getOrganizationTier(playbook.organization_id);
  const currentSourceCount = await countExistingSources(input.playbookId);
  const validation = validateFile(
    {
      filename: input.filename,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    },
    tier,
    currentSourceCount,
    user.role
  );

  if (!validation.valid) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: validation.userMessage || validation.error || 'File validation failed',
    });
  }

  try {
    const storage = await runPhase2Storage({
      ownerType: 'career_playbook',
      ownerId: input.playbookId,
      organizationId: playbook.organization_id,
      userId: user.id,
      filename: input.filename,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      fileContent: input.fileContent,
    });

    const supabase = getCareerPlaybookBusinessContextSupabase();
    const { data, error } = await supabase
      .from('career_playbook_sources')
      .insert({
        playbook_id: input.playbookId,
        organization_id: playbook.organization_id,
        user_id: user.id,
        source_type: 'file',
        status: 'uploaded',
        filename: input.filename,
        file_catalog_id: storage.fileId,
      })
      .select('id, playbook_id, organization_id, user_id, status, file_catalog_id')
      .single();

    if (error || !data) {
      await cleanupStoredSourceFile(storage, playbook.organization_id);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create Career Playbook source record',
        cause: error,
      });
    }
    const jobData: CareerPlaybookProcessSourceJobData = {
      jobType: JobType.CAREER_PLAYBOOK,
      operation: 'PROCESS_SOURCE',
      playbookId: input.playbookId,
      sourceId: data.id,
      fileId: storage.fileId,
      filePath: resolveProcessingFilePath(storage.storagePath),
      mimeType: input.mimeType,
      userId: user.id,
      organizationId: playbook.organization_id,
      language: playbook.language,
      locale: playbook.language === 'en' ? 'en' : 'ru',
      createdAt: new Date().toISOString(),
    };

    await addJob(JobType.CAREER_PLAYBOOK, jobData, {
      jobId: getSourceProcessingJobId(input.playbookId, data.id),
    });

    logger.info(
      {
        playbookId: input.playbookId,
        sourceId: data.id,
        fileId: storage.fileId,
        organizationId: playbook.organization_id,
      },
      'Career Playbook business context source uploaded'
    );

    return {
      sourceId: data.id,
      fileId: storage.fileId,
      storagePath: storage.storagePath,
      status: 'processing',
      message: `File "${input.filename}" uploaded and queued for Career Playbook business context processing`,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw mapStorageError(error);
  }
}

export async function removeCareerPlaybookBusinessContextSource(
  ctx: Context,
  input: RemoveCareerPlaybookSourceInput
): Promise<RemoveCareerPlaybookSourceResult> {
  const user = requireUser(ctx);
  const playbook = await loadWritablePlaybook(input.playbookId, user);
  const source = await loadSourceForPlaybook(
    input.sourceId,
    input.playbookId,
    playbook.organization_id
  );

  if (!source.file_catalog_id) {
    await deleteSourceRow(source.id);
    return {
      sourceId: source.id,
      playbookId: source.playbook_id,
      fileCatalogId: null,
      status: 'removed',
      quotaReleasedBytes: 0,
      fileDeleted: false,
    };
  }

  const file = await loadFileCatalogForCleanup(source.file_catalog_id);

  if (file.organization_id !== playbook.organization_id || file.course_id !== null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Career Playbook source file access denied',
    });
  }

  let fileDeleted = false;

  if (canDeleteFileCatalogRow(file)) {
    await deleteFileCatalogRow(file.id);

    if (canDeletePhysicalFile(file)) {
      fileDeleted = await safeUnlinkCareerPlaybookStoragePath(file);
    }
  } else {
    logger.warn(
      {
        sourceId: source.id,
        fileCatalogId: file.id,
        referenceCount: file.reference_count,
      },
      'Removed Career Playbook source record but kept shared original file_catalog row'
    );
    await deleteSourceRow(source.id);
  }

  const quotaReleasedBytes = await releaseSourceQuota(file);

  logger.info(
    {
      playbookId: input.playbookId,
      sourceId: source.id,
      fileCatalogId: file.id,
      quotaReleasedBytes,
      fileDeleted,
    },
    'Career Playbook business context source removed'
  );

  return {
    sourceId: source.id,
    playbookId: source.playbook_id,
    fileCatalogId: source.file_catalog_id,
    status: 'removed',
    quotaReleasedBytes,
    fileDeleted,
  };
}
