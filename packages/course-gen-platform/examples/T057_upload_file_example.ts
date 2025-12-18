/**
 * Example: Using the generation.uploadFile endpoint
 *
 * This example demonstrates how to upload a file to the course generation platform
 * with proper error handling and tier-based validation.
 */

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/server/routers';
import fs from 'fs/promises';

// Create tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers: () => ({
        Authorization: `Bearer YOUR_JWT_TOKEN_HERE`,
      }),
    }),
  ],
});

/**
 * Example 1: Upload a PDF file
 */
async function uploadPdfFile() {
  try {
    // Read file from disk
    const fileBuffer = await fs.readFile('./documents/syllabus.pdf');
    const fileContent = fileBuffer.toString('base64');

    // Upload file
    const result = await trpc.generation.uploadFile.mutate({
      courseId: '123e4567-e89b-12d3-a456-426614174000',
      filename: 'syllabus.pdf',
      fileSize: fileBuffer.length,
      mimeType: 'application/pdf',
      fileContent: fileContent,
    });

    console.log('Upload successful!');
    console.log('File ID:', result.fileId);
    console.log('Storage Path:', result.storagePath);
    console.log('Message:', result.message);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Upload failed:', error.message);
    }
  }
}

/**
 * Example 2: Upload a text file
 */
async function uploadTextFile() {
  try {
    const textContent = 'This is course outline content';
    const fileBuffer = Buffer.from(textContent, 'utf-8');
    const fileContent = fileBuffer.toString('base64');

    const result = await trpc.generation.uploadFile.mutate({
      courseId: '123e4567-e89b-12d3-a456-426614174000',
      filename: 'outline.txt',
      fileSize: fileBuffer.length,
      mimeType: 'text/plain',
      fileContent: fileContent,
    });

    console.log('Text file uploaded:', result.fileId);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Upload failed:', error.message);
    }
  }
}

/**
 * Example 3: Handle tier-based validation errors
 */
async function handleTierValidationErrors() {
  try {
    // This will fail if organization is on Free tier
    const fileBuffer = Buffer.from('test content');
    const result = await trpc.generation.uploadFile.mutate({
      courseId: '123e4567-e89b-12d3-a456-426614174000',
      filename: 'test.pdf',
      fileSize: fileBuffer.length,
      mimeType: 'application/pdf',
      fileContent: fileBuffer.toString('base64'),
    });

    console.log('Upload succeeded:', result.fileId);
  } catch (error: any) {
    // Handle tier-based errors with upgrade suggestions
    if (error.message?.includes('Free tier')) {
      console.error('Upgrade required: Free tier does not support file uploads');
      console.error('Upgrade to Basic Plus to upload PDF, TXT, and MD files');
    } else if (error.message?.includes('limit reached')) {
      console.error('File count limit reached for your tier');
      console.error('Consider upgrading to upload more files');
    } else if (error.message?.includes('quota exceeded')) {
      console.error('Storage quota exceeded');
      console.error('Delete unused files or upgrade to a higher tier');
    } else {
      console.error('Upload failed:', error.message);
    }
  }
}

/**
 * Example 4: Upload with error handling and retry
 */
async function uploadWithRetry(
  courseId: string,
  filename: string,
  filePath: string,
  maxRetries = 3
) {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);

      // Determine MIME type based on extension
      const extension = filename.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        txt: 'text/plain',
        md: 'text/markdown',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        html: 'text/html',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      const mimeType = mimeTypes[extension || ''] || 'application/octet-stream';

      // Upload
      const result = await trpc.generation.uploadFile.mutate({
        courseId,
        filename,
        fileSize: stats.size,
        mimeType,
        fileContent: fileBuffer.toString('base64'),
      });

      console.log(`Upload succeeded on attempt ${attempts + 1}`);
      return result;
    } catch (error: any) {
      attempts++;

      // Don't retry on validation errors
      if (
        error.message?.includes('tier') ||
        error.message?.includes('quota') ||
        error.message?.includes('not found') ||
        error.message?.includes('permission')
      ) {
        console.error('Upload failed (non-retryable):', error.message);
        throw error;
      }

      // Retry on server errors
      if (attempts < maxRetries) {
        console.log(`Upload failed, retrying (${attempts}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
      } else {
        console.error('Upload failed after all retries:', error.message);
        throw error;
      }
    }
  }
}

/**
 * Example 5: Batch upload multiple files
 */
async function batchUploadFiles(
  courseId: string,
  files: Array<{ path: string; filename: string }>
) {
  const results = [];
  const errors = [];

  for (const file of files) {
    try {
      const result = await uploadWithRetry(courseId, file.filename, file.path);
      results.push(result);
      console.log(`✓ Uploaded: ${file.filename}`);
    } catch (error: any) {
      errors.push({ filename: file.filename, error: error.message });
      console.error(`✗ Failed: ${file.filename} - ${error.message}`);
    }
  }

  console.log(`\nBatch upload complete:`);
  console.log(`  Successful: ${results.length}`);
  console.log(`  Failed: ${errors.length}`);

  return { results, errors };
}

/**
 * Example 6: Upload with progress tracking (for large files)
 * Note: This is a simplified example. For real progress tracking,
 * you would need to implement chunked uploads.
 */
async function uploadWithProgress(courseId: string, filename: string, filePath: string) {
  console.log('Reading file...');
  const fileBuffer = await fs.readFile(filePath);
  const stats = await fs.stat(filePath);

  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log('Encoding to base64...');

  const fileContent = fileBuffer.toString('base64');

  console.log('Uploading...');
  const startTime = Date.now();

  const result = await trpc.generation.uploadFile.mutate({
    courseId,
    filename,
    fileSize: stats.size,
    mimeType: 'application/octet-stream',
    fileContent,
  });

  const duration = Date.now() - startTime;
  const speedMBps = stats.size / 1024 / 1024 / (duration / 1000);

  console.log(`Upload completed in ${(duration / 1000).toFixed(2)}s`);
  console.log(`Average speed: ${speedMBps.toFixed(2)} MB/s`);
  console.log(`File ID: ${result.fileId}`);

  return result;
}

// Run examples
async function main() {
  console.log('=== File Upload Examples ===\n');

  // Example 1
  console.log('Example 1: Upload PDF file');
  await uploadPdfFile();
  console.log();

  // Example 2
  console.log('Example 2: Upload text file');
  await uploadTextFile();
  console.log();

  // Example 3
  console.log('Example 3: Handle tier validation errors');
  await handleTierValidationErrors();
  console.log();

  // Example 4
  console.log('Example 4: Upload with retry');
  await uploadWithRetry(
    '123e4567-e89b-12d3-a456-426614174000',
    'document.pdf',
    './documents/document.pdf'
  );
  console.log();

  // Example 5
  console.log('Example 5: Batch upload');
  await batchUploadFiles('123e4567-e89b-12d3-a456-426614174000', [
    { path: './documents/syllabus.pdf', filename: 'syllabus.pdf' },
    { path: './documents/outline.txt', filename: 'outline.txt' },
    { path: './documents/notes.md', filename: 'notes.md' },
  ]);
  console.log();

  // Example 6
  console.log('Example 6: Upload with progress');
  await uploadWithProgress(
    '123e4567-e89b-12d3-a456-426614174000',
    'large-document.pdf',
    './documents/large-document.pdf'
  );
}

// Uncomment to run examples
// main().catch(console.error);
