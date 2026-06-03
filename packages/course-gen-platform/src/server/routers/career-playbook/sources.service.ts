import { TRPCError } from '@trpc/server';
import type { Tier } from '@megacampus/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { validateFile } from '../../../shared/validation/file-validator';
import { decrementQuota } from '../../../shared/validation/quota-enforcer';
import { runPhase2Storage, isStorageError } from '@/stages/stage1-document-upload/phases';
import type { Phase2StorageOutput } from '@/stages/stage1-document-upload/types';

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
  status: 'uploaded';
  message: string;
}

interface CareerPlaybookSourceRow {
  id: string;
  playbook_id: string;
  organization_id: string;
  user_id: string;
  status: string;
  file_catalog_id: string | null;
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
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, user_id, organization_id, status')
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

  return data as {
    id: string;
    user_id: string;
    organization_id: string;
    status: string;
  };
}

async function getOrganizationTier(organizationId: string): Promise<Tier> {
  const supabase = getSupabaseAdmin() as any;
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
  const supabase = getSupabaseAdmin() as any;
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
  const supabase = getSupabaseAdmin() as any;

  try {
    const { error } = await supabase.from('file_catalog').delete().eq('id', storage.fileId);
    if (error) throw error;
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

    const supabase = getSupabaseAdmin() as any;
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

    const source = data as CareerPlaybookSourceRow;

    logger.info(
      {
        playbookId: input.playbookId,
        sourceId: source.id,
        fileId: storage.fileId,
        organizationId: playbook.organization_id,
      },
      'Career Playbook business context source uploaded'
    );

    return {
      sourceId: source.id,
      fileId: storage.fileId,
      storagePath: storage.storagePath,
      status: 'uploaded',
      message: `File "${input.filename}" uploaded as Career Playbook business context`,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw mapStorageError(error);
  }
}
