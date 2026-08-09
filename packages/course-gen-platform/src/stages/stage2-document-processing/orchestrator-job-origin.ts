import { logger } from '../../shared/logger/index.js';
import { updateCourseProgressInDB } from './orchestrator-progress-helpers';

const QDRANT_REINDEX_JOB_PREFIX = 'qdrant-reindex-';

export function isQdrantReindexJob(jobId: string | undefined): boolean {
  return jobId?.startsWith(QDRANT_REINDEX_JOB_PREFIX) === true;
}

export async function updateCourseProgressForJob(
  jobId: string | undefined,
  courseId: string,
  message: string
): Promise<void> {
  if (isQdrantReindexJob(jobId)) {
    logger.debug({ jobId, courseId }, 'Skipping course progress update for Qdrant reindex job');
    return;
  }

  await updateCourseProgressInDB(courseId, message);
}
