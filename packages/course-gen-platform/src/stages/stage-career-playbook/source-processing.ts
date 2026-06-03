import type { Job } from 'bullmq';
import type {
  CareerPlaybookJobData,
  DocumentProcessingJobData,
  Language,
} from '@megacampus/shared-types';
import logger from '@/shared/logger';
import { getCareerPlaybookBusinessContextSupabase } from '@/shared/career-playbook/source-db';
import { executeDoclingConversion } from '@/stages/stage2-document-processing/phases/phase-1-docling-conversion';
import { storeProcessedDocument } from '@/stages/stage2-document-processing/orchestrator-helpers';
import { executePhase6Summarization } from '@/stages/stage2-document-processing/phases/phase-6-summarization';

type SourceStatus = 'processing' | 'ready' | 'failed';

export interface ProcessCareerPlaybookSourceInput {
  playbookId: string;
  sourceId: string;
  fileId: string;
  filePath: string;
  mimeType: string;
  organizationId: string;
  language: Language;
  job?: Job<CareerPlaybookJobData>;
}

export interface ProcessCareerPlaybookSourceResult {
  sourceId: string;
  fileId: string;
  status: 'ready';
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateSourceStatus(sourceId: string, status: SourceStatus): Promise<void> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { error } = await supabase
    .from('career_playbook_sources')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sourceId);

  if (error) {
    throw new Error(`Failed to update Career Playbook source status: ${errorMessageFrom(error)}`);
  }
}

async function markFileProcessingFailed(fileId: string): Promise<void> {
  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { error } = await supabase
    .from('file_catalog')
    .update({ vector_status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', fileId);

  if (error) {
    logger.error({ fileId, error }, 'Failed to mark Career Playbook source file failed');
  }
}

function buildStage2ProgressJob(
  job?: Job<CareerPlaybookJobData>
): Pick<Job<DocumentProcessingJobData>, 'updateProgress'> {
  return {
    updateProgress: async (progress: number | object) => {
      if (!job) return;
      await job.updateProgress(progress);
    },
  };
}

export async function processCareerPlaybookSource(
  input: ProcessCareerPlaybookSourceInput
): Promise<ProcessCareerPlaybookSourceResult> {
  const { playbookId, sourceId, fileId, filePath, organizationId, job } = input;

  try {
    await updateSourceStatus(sourceId, 'processing');
    await job?.updateProgress(5);

    const processingResult = await executeDoclingConversion(
      filePath,
      'business',
      buildStage2ProgressJob(job) as Job<DocumentProcessingJobData>
    );

    // `storeProcessedDocument` only needs the third argument as a markdown cache namespace here.
    // It is deliberately the playbook id, not a fake course row.
    await storeProcessedDocument(fileId, processingResult, playbookId);

    await executePhase6Summarization(playbookId, fileId, organizationId, {
      onProgress: progress => {
        void job?.updateProgress(Math.min(99, 80 + Math.round(progress / 5)));
      },
    });

    await updateSourceStatus(sourceId, 'ready');
    await job?.updateProgress(100);

    logger.info(
      { playbookId, sourceId, fileId, mimeType: input.mimeType, language: input.language },
      'Career Playbook source processed'
    );

    return { sourceId, fileId, status: 'ready' };
  } catch (error) {
    await updateSourceStatus(sourceId, 'failed');
    await markFileProcessingFailed(fileId);
    logger.error(
      { playbookId, sourceId, fileId, error: errorMessageFrom(error) },
      'Career Playbook source processing failed'
    );
    throw error;
  }
}
