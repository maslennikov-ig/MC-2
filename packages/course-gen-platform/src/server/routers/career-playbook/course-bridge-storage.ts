import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { decrementQuota, incrementQuota } from '../../../shared/validation/quota-enforcer';

export interface UploadDocumentInput {
  courseId: string;
  organizationId: string;
  userId: string;
  filename: string;
  markdown: string;
  sourceUrls?: string[];
}

interface BridgeFileForCleanup {
  storage_path: string | null;
  file_size: number | null;
  organization_id: string | null;
}

async function releaseBridgeQuota(
  organizationId: string,
  fileSize: number,
  logContext: Record<string, unknown>
): Promise<void> {
  if (fileSize <= 0) return;

  try {
    await decrementQuota(organizationId, fileSize);
  } catch (error) {
    logger.warn(
      {
        ...logContext,
        organizationId,
        fileSize,
        error,
      },
      'Failed to release Career Playbook bridge storage quota'
    );
  }
}

async function safeUnlinkStoragePath(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  const cwd = path.resolve(process.cwd());
  const absolutePath = path.resolve(cwd, storagePath);
  if (!absolutePath.startsWith(`${cwd}${path.sep}`)) return;

  try {
    await unlink(absolutePath);
  } catch (error) {
    logger.warn({ storagePath, error }, 'Failed to remove synthetic Career Playbook source file');
  }
}

export async function deleteCareerPlaybookBridgeCourse(courseId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: files } = await supabase
    .from('file_catalog')
    .select('storage_path, file_size, organization_id')
    .eq('course_id', courseId);
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) {
    logger.warn({ courseId, error }, 'Failed to rollback Career Playbook bridge course');
    return;
  }

  for (const file of (files ?? []) as BridgeFileForCleanup[]) {
    await safeUnlinkStoragePath(file.storage_path);
    if (file.organization_id && typeof file.file_size === 'number') {
      await releaseBridgeQuota(file.organization_id, file.file_size, { courseId });
    }
  }
}

export async function uploadSyntheticCourseBridgeDocument(
  input: UploadDocumentInput
): Promise<{ fileId: string }> {
  const supabase = getSupabaseAdmin();
  const fileId = randomUUID();
  const fileSize = Buffer.byteLength(input.markdown, 'utf8');
  const hash = createHash('sha256').update(input.markdown).digest('hex');
  const safeFilename = path.basename(input.filename);
  const uploadDir = path.join(process.cwd(), 'uploads', input.organizationId, input.courseId);
  const storagePath = path.join(uploadDir, `${fileId}-${safeFilename}`);
  const relativeStoragePath = path.relative(process.cwd(), storagePath);
  let quotaReserved = false;

  try {
    await incrementQuota(input.organizationId, fileSize);
    quotaReserved = true;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(storagePath, input.markdown, 'utf8');

    const { error } = await supabase.from('file_catalog').insert({
      id: fileId,
      organization_id: input.organizationId,
      course_id: input.courseId,
      filename: safeFilename,
      file_type: 'md',
      file_size: fileSize,
      storage_path: relativeStoragePath,
      hash,
      mime_type: 'text/markdown',
      vector_status: 'pending',
      markdown_content: input.markdown,
      processed_content: input.markdown,
      processing_method: 'full_text',
      summary_metadata: {
        source: 'career_playbook_bridge',
        source_urls: input.sourceUrls ?? [],
        user_id: input.userId,
      },
    });

    if (!error) return { fileId };

    await safeUnlinkStoragePath(relativeStoragePath);
    await releaseBridgeQuota(input.organizationId, fileSize, {
      courseId: input.courseId,
      fileId,
    });
    quotaReserved = false;

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to persist Career Playbook source document',
      cause: error,
    });
  } catch (error) {
    if (quotaReserved) {
      await releaseBridgeQuota(input.organizationId, fileSize, {
        courseId: input.courseId,
        fileId,
      });
    }
    if (error instanceof TRPCError) throw error;

    throw error;
  }
}
