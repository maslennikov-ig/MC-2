/**
 * Script to retry summarization for documents that failed Phase 6
 *
 * Usage: tsx tools/db/retry-summarization.ts <courseId> <fileId1> [fileId2] ...
 *
 * Example:
 *   tsx tools/db/retry-summarization.ts aa41261f-7006-4649-9cdf-dbf8aed69448 35a7579d-8782-47e9-86aa-03ebe0bbfcf3 3672f25e-2e5b-4839-a0bb-9c8d7e74959b
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

import { executePhase6Summarization } from '../../src/stages/stage2-document-processing/phases/phase-6-summarization';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import logger from '../../src/shared/logger';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx tools/db/retry-summarization.ts <courseId> <fileId1> [fileId2] ...');
    console.error('');
    console.error('Example:');
    console.error('  tsx tools/db/retry-summarization.ts aa41261f-... 35a7579d-... 3672f25e-...');
    process.exit(1);
  }

  const [courseId, ...fileIds] = args;

  // Get organization ID from course
  const supabase = getSupabaseAdmin();
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('organization_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    console.error(`Failed to find course: ${courseError?.message || 'Not found'}`);
    process.exit(1);
  }

  const organizationId = course.organization_id;
  console.log(`Course: ${courseId}`);
  console.log(`Organization: ${organizationId}`);
  console.log(`Files to process: ${fileIds.length}`);
  console.log('---');

  for (const fileId of fileIds) {
    console.log(`\nProcessing file: ${fileId}`);

    try {
      const result = await executePhase6Summarization(
        courseId,
        fileId,
        organizationId,
        {
          onProgress: (progress, message) => {
            console.log(`  [${progress}%] ${message}`);
          }
        }
      );

      console.log(`  SUCCESS:`);
      console.log(`    Method: ${result.processingMethod}`);
      console.log(`    Summary tokens: ${result.summaryTokens}`);
      console.log(`    Original tokens: ${result.originalTokens}`);
      console.log(`    Quality score: ${result.metadata.qualityScore}`);
      console.log(`    Processing time: ${result.metadata.processingTimeMs}ms`);

    } catch (error) {
      console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
      logger.error({ fileId, error }, 'Summarization failed');
    }
  }

  console.log('\n---');
  console.log('Done!');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
