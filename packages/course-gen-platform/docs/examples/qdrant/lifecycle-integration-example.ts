/**
 * Lifecycle Integration Example
 *
 * Demonstrates how to integrate the vector lifecycle management module
 * into existing file upload and delete handlers.
 *
 * This example shows the complete flow:
 * 1. File upload with automatic deduplication
 * 2. Queue processing for new files (not deduplicated)
 * 3. File deletion with reference counting
 *
 * @module shared/qdrant/lifecycle-integration-example
 */

import {
  handleFileUpload,
  handleFileDelete,
  type FileUploadMetadata,
} from './lifecycle';
import { Queue } from 'bullmq';

/**
 * Example: File upload endpoint handler
 *
 * This would typically be called from an API route handler
 * (e.g., Express, tRPC, Next.js API route)
 */
export async function uploadFileEndpoint(
  fileBuffer: Buffer,
  metadata: {
    filename: string;
    organization_id: string;
    course_id: string;
    mime_type: string;
    user_id?: string;
  }
) {
  console.log(`\n📤 File upload request: ${metadata.filename}`);
  console.log(`   Organization: ${metadata.organization_id}`);
  console.log(`   Course: ${metadata.course_id}`);

  try {
    // Call lifecycle manager (handles deduplication automatically)
    const result = await handleFileUpload(fileBuffer, metadata);

    if (result.deduplicated) {
      // ✓ Content reused! No processing needed
      console.log('✓ File deduplicated - content reused from existing upload');
      console.log(`  - Original file: ${result.original_file_id}`);
      console.log(`  - Vectors duplicated: ${result.vectors_duplicated}`);
      console.log(`  - Status: ${result.vector_status} (already indexed!)`);

      // Return immediately - file is ready to use
      return {
        success: true,
        file_id: result.file_id,
        deduplicated: true,
        status: 'indexed',
        message: 'File content reused from existing upload. Ready to use immediately!',
      };
    } else {
      // ✗ New file - needs processing
      console.log('⏳ New file uploaded - queuing for processing');
      console.log(`  - File ID: ${result.file_id}`);
      console.log(`  - Status: ${result.vector_status} (pending processing)`);

      // Queue for processing (Docling → chunk → embed → upload)
      await queueDocumentProcessing(result.file_id, metadata);

      return {
        success: true,
        file_id: result.file_id,
        deduplicated: false,
        status: 'pending',
        message: 'File uploaded successfully. Processing will begin shortly.',
      };
    }
  } catch (error) {
    console.error('❌ File upload failed:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Example: Queue document for processing
 *
 * This queues a new file for:
 * 1. Docling conversion (PDF → DoclingDocument JSON)
 * 2. Markdown conversion (DoclingDocument → Markdown)
 * 3. Hierarchical chunking (Markdown → chunks)
 * 4. Jina embedding generation (chunks → vectors)
 * 5. Qdrant upload (vectors → Qdrant)
 */
async function queueDocumentProcessing(
  fileId: string,
  metadata: FileUploadMetadata
): Promise<void> {
  // Create BullMQ queue (adjust connection as needed)
  const documentQueue = new Queue('document-processing', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });

  // Add job to queue
  await documentQueue.add('process-document', {
    file_id: fileId,
    organization_id: metadata.organization_id,
    course_id: metadata.course_id,
    user_id: metadata.user_id,
    filename: metadata.filename,
    mime_type: metadata.mime_type,
  });

  console.log(`✓ Queued document processing job for file ${fileId}`);
}

/**
 * Example: File delete endpoint handler
 *
 * This would typically be called from an API route handler
 */
export async function deleteFileEndpoint(
  fileId: string,
  _userId?: string
) {
  console.log(`\n🗑️  File delete request: ${fileId}`);

  try {
    // Call lifecycle manager (handles reference counting automatically)
    const result = await handleFileDelete(fileId);

    console.log('✓ File deleted successfully');
    console.log(`  - Physical file deleted: ${result.physical_file_deleted}`);
    console.log(`  - Remaining references: ${result.remaining_references}`);
    console.log(`  - Vectors deleted: ${result.vectors_deleted}`);
    console.log(`  - Storage freed: ${result.storage_freed_bytes} bytes`);

    return {
      success: true,
      physical_file_deleted: result.physical_file_deleted,
      remaining_references: result.remaining_references,
      message: result.physical_file_deleted
        ? 'File and all vectors deleted permanently (no references remain)'
        : `File reference deleted. ${result.remaining_references} reference(s) still active.`,
    };
  } catch (error) {
    console.error('❌ File delete failed:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Example: tRPC router integration
 *
 * Shows how to integrate lifecycle management into tRPC procedures
 */
export const fileRouter = {
  /**
   * Upload file mutation
   *
   * @example
   * ```typescript
   * const result = await trpc.file.upload.mutate({
   *   fileBuffer: buffer,
   *   filename: 'document.pdf',
   *   courseId: 'uuid',
   *   mimeType: 'application/pdf',
   * });
   * ```
   */
  upload: {
    input: {
      fileBuffer: 'Buffer', // In practice, would be base64 string or multipart upload
      filename: 'string',
      courseId: 'string',
      mimeType: 'string',
    },
    async handler(ctx: any, input: any) {
      // Extract user context
      const organizationId = ctx.user.organization_id;
      const userId = ctx.user.id;

      // Call upload endpoint
      return await uploadFileEndpoint(input.fileBuffer, {
        filename: input.filename,
        organization_id: organizationId,
        course_id: input.courseId,
        mime_type: input.mimeType,
        user_id: userId,
      });
    },
  },

  /**
   * Delete file mutation
   *
   * @example
   * ```typescript
   * const result = await trpc.file.delete.mutate({
   *   fileId: 'uuid',
   * });
   * ```
   */
  delete: {
    input: {
      fileId: 'string',
    },
    async handler(ctx: any, input: any) {
      const userId = ctx.user.id;

      return await deleteFileEndpoint(input.fileId, userId);
    },
  },
};

/**
 * Example: Express.js route integration
 *
 * Shows how to integrate lifecycle management into Express routes
 */
export function expressFileRoutes(app: any) {
  // Upload file
  app.post('/api/files/upload', async (req: any, res: any) => {
    try {
      const { file, course_id, organization_id } = req.body;

      const result = await uploadFileEndpoint(Buffer.from(file.data, 'base64'), {
        filename: file.name,
        organization_id: organization_id,
        course_id: course_id,
        mime_type: file.mimetype,
        user_id: req.user?.id,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Delete file
  app.delete('/api/files/:fileId', async (req: any, res: any) => {
    try {
      const result = await deleteFileEndpoint(req.params.fileId, req.user?.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

/**
 * Example: Document processing worker handler
 *
 * This worker processes documents that were NOT deduplicated
 */
export async function documentProcessingWorker(job: any) {
  const { file_id, organization_id: _organization_id, course_id: _course_id } = job.data;

  console.log(`\n⚙️  Processing document: ${file_id}`);

  try {
    // 1. Load file from storage
    console.log('1/5 Loading file from storage...');
    // const fileBuffer = await loadFileFromStorage(file_id);

    // 2. Convert with Docling
    console.log('2/5 Converting with Docling...');
    // const doclingDoc = await convertWithDocling(fileBuffer);

    // 3. Convert to Markdown
    console.log('3/5 Converting to Markdown...');
    // const markdown = await convertToMarkdown(doclingDoc);

    // 4. Chunk hierarchically
    console.log('4/5 Chunking hierarchically...');
    // const chunks = await chunkMarkdown(markdown);

    // 5. Generate embeddings and upload
    console.log('5/5 Generating embeddings and uploading to Qdrant...');
    // const embeddings = await generateEmbeddings(chunks);
    // await uploadChunksToQdrant(embeddings);

    console.log('✓ Document processing complete');

    return { success: true };
  } catch (error) {
    console.error('❌ Document processing failed:', error);
    throw error; // BullMQ will retry
  }
}

/**
 * Usage Summary
 *
 * Integration steps:
 *
 * 1. **Install dependencies**:
 *    ```bash
 *    pnpm install bullmq ioredis
 *    ```
 *
 * 2. **Run migrations**:
 *    ```bash
 *    # Apply deduplication migration
 *    supabase db reset
 *    # or
 *    psql $DATABASE_URL < supabase/migrations/20251015_add_content_deduplication.sql
 *    ```
 *
 * 3. **Update upload endpoint**:
 *    Replace existing file upload logic with `handleFileUpload()`
 *
 * 4. **Update delete endpoint**:
 *    Replace existing file delete logic with `handleFileDelete()`
 *
 * 5. **Configure environment**:
 *    ```bash
 *    SUPABASE_URL=https://your-project.supabase.co
 *    SUPABASE_SERVICE_KEY=your-service-key
 *    UPLOADS_DIR=/path/to/uploads
 *    REDIS_HOST=localhost
 *    REDIS_PORT=6379
 *    ```
 *
 * 6. **Test deduplication**:
 *    ```bash
 *    tsx src/shared/qdrant/__tests__/lifecycle.test.ts
 *    ```
 *
 * Expected Benefits:
 * - ❌ **Before**: 2 uploads = 2× Docling + 2× Jina + 2× Qdrant storage
 * - ✅ **After**: 2 uploads = 1× Docling + 1× Jina + 1.1× Qdrant storage
 *
 * Cost savings example (1000 chunk file):
 * - Docling: ~10-30 seconds saved
 * - Jina: ~$0.02 saved per duplicate upload
 * - Qdrant: Minimal cost (only duplicate points, not embeddings)
 */
