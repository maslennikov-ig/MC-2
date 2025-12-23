#!/usr/bin/env tsx
/**
 * Re-index Course with Sparse Vectors (Phase 4)
 *
 * This script re-indexes an existing course to add sparse vectors for hybrid search.
 *
 * Steps:
 * 1. Delete all existing vectors for the course from Qdrant
 * 2. Reset document statuses in database to 'pending'
 * 3. Enqueue document processing jobs for all documents
 *
 * Usage:
 *   pnpm tsx tools/db/reindex-course-with-sparse.ts <courseId>
 *
 * Example:
 *   pnpm tsx tools/db/reindex-course-with-sparse.ts 5c245b51-75d3-425a-b2bc-9a29016633ba
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

import { deleteVectorsForCourse } from '../../src/shared/qdrant/lifecycle';
import { getCollectionStats } from '../../src/shared/qdrant/upload';
import { qdrantClient } from '../../src/shared/qdrant/client';
import { COLLECTION_CONFIG } from '../../src/shared/qdrant/create-collection';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { addJob } from '../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { nanoid } from 'nanoid';

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function logSuccess(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logError(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logInfo(msg: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function logStep(step: number, total: number, desc: string) {
  console.log(`\n${colors.cyan}[${step}/${total}]${colors.reset} ${colors.bold}${desc}${colors.reset}`);
}

async function reindexCourse(courseId: string) {
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}Re-index Course with Sparse Vectors${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`Course ID: ${courseId}`);

  const supabase = getSupabaseAdmin();

  // Step 1: Verify course exists
  logStep(1, 5, 'Verifying course exists');

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, organization_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new Error(`Course not found: ${courseId}`);
  }

  logSuccess(`Course found: "${course.title}"`);
  logInfo(`  Organization: ${course.organization_id}`);

  // Step 2: Count current vectors
  logStep(2, 5, 'Counting current vectors in Qdrant');

  const countResult = await qdrantClient.count(COLLECTION_CONFIG.name, {
    filter: {
      must: [{ key: 'course_id', match: { value: courseId } }],
    },
    exact: true,
  });

  logInfo(`  Current vector count: ${countResult.count}`);

  // Step 3: Delete vectors from Qdrant
  logStep(3, 5, 'Deleting vectors from Qdrant');

  const deleteResult = await deleteVectorsForCourse(courseId);

  if (deleteResult.deleted) {
    logSuccess(`Deleted ~${deleteResult.approximateCount} vectors`);
  } else {
    logError('Failed to delete vectors');
    throw new Error('Failed to delete vectors from Qdrant');
  }

  // Step 4: Reset document statuses
  logStep(4, 5, 'Resetting document statuses');

  // Get all files for this course
  const { data: files, error: filesError } = await supabase
    .from('course_files')
    .select('id, name, vector_status')
    .eq('course_id', courseId);

  if (filesError) {
    throw new Error(`Failed to fetch files: ${filesError.message}`);
  }

  if (!files || files.length === 0) {
    logError('No files found for this course');
    throw new Error('No files to reindex');
  }

  logInfo(`  Found ${files.length} files`);

  // Reset vector_status to 'pending'
  const { error: updateError } = await supabase
    .from('course_files')
    .update({
      vector_status: 'pending',
      processed_chunks: null,
      failed_reason: null,
    })
    .eq('course_id', courseId);

  if (updateError) {
    throw new Error(`Failed to reset file statuses: ${updateError.message}`);
  }

  logSuccess(`Reset ${files.length} files to 'pending'`);

  // Step 5: Enqueue processing jobs
  logStep(5, 5, 'Enqueuing document processing jobs');

  let jobsEnqueued = 0;

  for (const file of files) {
    const jobData: DocumentProcessingJobData = {
      course_id: courseId,
      file_id: file.id,
      organization_id: course.organization_id,
      request_id: `reindex-${nanoid(8)}`,
    };

    try {
      await addJob(JobType.DOCUMENT_PROCESSING, jobData, {
        priority: 1, // High priority
      });
      jobsEnqueued++;
      logInfo(`  Enqueued: ${file.name}`);
    } catch (error) {
      logError(`  Failed to enqueue: ${file.name}`);
    }
  }

  logSuccess(`Enqueued ${jobsEnqueued}/${files.length} document processing jobs`);

  // Summary
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bold}${colors.green}Re-indexing initiated successfully!${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Wait for document processing jobs to complete`);
  console.log(`  2. Monitor with: pnpm tsx experiments/features/test-sparse-upload.ts ${courseId}`);
  console.log(`  3. Test hybrid search with: pnpm tsx experiments/features/test-hybrid-search.ts`);
}

// Verify sparse vectors exist for course
async function verifySparsity(courseId: string) {
  console.log(`\n${colors.bold}Verifying sparse vectors...${colors.reset}`);

  // Get a sample point to check if it has sparse vectors
  const searchResult = await qdrantClient.scroll(COLLECTION_CONFIG.name, {
    filter: {
      must: [{ key: 'course_id', match: { value: courseId } }],
    },
    limit: 1,
    with_vector: true,
  });

  if (searchResult.points.length > 0) {
    const point = searchResult.points[0];
    const vectors = point.vector as Record<string, unknown>;

    if (vectors && typeof vectors === 'object') {
      const hasDense = 'dense' in vectors;
      const hasSparse = 'sparse' in vectors;

      console.log(`\n${colors.bold}Vector Check:${colors.reset}`);
      console.log(`  Dense vectors: ${hasDense ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
      console.log(`  Sparse vectors: ${hasSparse ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);

      if (hasSparse && typeof vectors.sparse === 'object') {
        const sparse = vectors.sparse as { indices?: number[]; values?: number[] };
        console.log(`  Sparse terms: ${sparse.indices?.length || 0}`);
      }

      return hasSparse;
    }
  }

  return false;
}

// Main
async function main() {
  const courseId = process.argv[2];

  if (!courseId) {
    console.log('Usage: pnpm tsx tools/db/reindex-course-with-sparse.ts <courseId>');
    console.log('');
    console.log('Example:');
    console.log('  pnpm tsx tools/db/reindex-course-with-sparse.ts 5c245b51-75d3-425a-b2bc-9a29016633ba');
    process.exit(1);
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(courseId)) {
    console.error(`${colors.red}Invalid course ID format. Expected UUID.${colors.reset}`);
    process.exit(1);
  }

  try {
    // Check if --verify flag is passed
    if (process.argv[3] === '--verify') {
      await verifySparsity(courseId);
    } else {
      await reindexCourse(courseId);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
