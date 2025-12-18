/**
 * Usage examples for storage quota enforcement
 *
 * This file demonstrates how to integrate quota enforcement into file upload
 * and deletion workflows.
 *
 * @module shared/validation/quota-enforcer.example
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable no-useless-catch */
/* eslint-disable max-lines-per-function */

import {
  checkQuota,
  incrementQuota,
  decrementQuota,
  getQuotaInfo,
  formatBytes,
} from './quota-enforcer';
import { QuotaExceededError } from '@/server/errors/typed-errors';

// ============================================================================
// EXAMPLE 1: File Upload with Quota Check
// ============================================================================

/**
 * Example: Upload a file with quota enforcement
 */
async function uploadFileExample(
  organizationId: string,
  file: File
): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  try {
    // Step 1: Check if upload is allowed
    const quotaCheck = await checkQuota(organizationId, file.size);

    if (!quotaCheck.allowed) {
      return {
        success: false,
        error: `Upload would exceed storage quota. You are using ${quotaCheck.currentUsageFormatted} of ${quotaCheck.totalQuotaFormatted}. Only ${quotaCheck.availableSpaceFormatted} available, but file is ${formatBytes(file.size)}.`,
      };
    }

    // Step 2: Perform the actual file upload (to S3, Supabase Storage, etc.)
    const fileUrl = await performFileUpload(file); // Your upload logic here

    // Step 3: Update quota ONLY after successful upload
    await incrementQuota(organizationId, file.size);

    return { success: true, fileUrl };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      // Race condition: quota was exceeded between check and increment
      // This can happen with concurrent uploads
      return {
        success: false,
        error: `Storage quota exceeded during upload: ${error.message}`,
      };
    }

    // Handle other errors (network, file system, etc.)
    console.error('Upload failed:', error);
    return {
      success: false,
      error: 'Upload failed due to an unexpected error',
    };
  }
}

// ============================================================================
// EXAMPLE 2: File Deletion with Quota Update
// ============================================================================

/**
 * Example: Delete a file and update quota
 */
async function deleteFileExample(
  organizationId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get file information from database
    const file = await getFileFromDatabase(fileId); // Your DB query here

    if (!file) {
      return { success: false, error: 'File not found' };
    }

    // Verify file belongs to organization
    if (file.organizationId !== organizationId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Step 2: Delete the actual file from storage
    await deleteFileFromStorage(file.storagePath); // Your deletion logic here

    // Step 3: Delete file record from database
    await deleteFileFromDatabase(fileId); // Your DB deletion here

    // Step 4: Update quota AFTER successful deletion
    await decrementQuota(organizationId, file.size);

    return { success: true };
  } catch (error) {
    console.error('Delete failed:', error);
    return {
      success: false,
      error: 'Delete failed due to an unexpected error',
    };
  }
}

// ============================================================================
// EXAMPLE 3: Display Quota Information to User
// ============================================================================

/**
 * Example: Get and display quota information
 */
async function displayQuotaInfoExample(organizationId: string) {
  try {
    const info = await getQuotaInfo(organizationId);

    console.log('Storage Quota Information:');
    console.log(`  Tier: ${info.tier}`);
    console.log(`  Used: ${info.storageUsedFormatted} (${info.usagePercentage.toFixed(1)}%)`);
    console.log(`  Total: ${info.storageQuotaFormatted}`);
    console.log(`  Available: ${info.availableFormatted}`);

    // Display warning if usage is high
    if (info.usagePercentage > 90) {
      console.warn('Warning: Storage quota is nearly full!');
    } else if (info.usagePercentage > 75) {
      console.warn('Notice: Storage quota is over 75% full.');
    }

    return info;
  } catch (error) {
    console.error('Failed to fetch quota info:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Batch Upload with Quota Validation
// ============================================================================

/**
 * Example: Upload multiple files with quota validation
 */
async function batchUploadExample(organizationId: string, files: File[]) {
  const results: Array<{ file: File; success: boolean; error?: string }> = [];

  // Calculate total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  // Check if all files can be uploaded
  const quotaCheck = await checkQuota(organizationId, totalSize);

  if (!quotaCheck.allowed) {
    return {
      success: false,
      error: `Batch upload would exceed quota. Total size: ${formatBytes(totalSize)}, Available: ${quotaCheck.availableSpaceFormatted}`,
      results: [],
    };
  }

  // Upload files sequentially
  for (const file of files) {
    try {
      // Re-check quota for each file (in case of concurrent operations)
      const check = await checkQuota(organizationId, file.size);

      if (!check.allowed) {
        results.push({
          file,
          success: false,
          error: 'Quota exceeded',
        });
        continue;
      }

      // Upload file
      await performFileUpload(file);

      // Update quota
      await incrementQuota(organizationId, file.size);

      results.push({ file, success: true });
    } catch (error) {
      results.push({
        file,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return {
    success: successCount === files.length,
    successCount,
    totalCount: files.length,
    results,
  };
}

// ============================================================================
// EXAMPLE 5: Quota Enforcement in tRPC Procedure
// ============================================================================

/**
 * Example: tRPC procedure with quota enforcement
 */
import { z } from 'zod';
// import { authenticatedProcedure } from '@/server/trpc'; // Your tRPC setup

const uploadFileProcedure = {
  // authenticatedProcedure
  input: z.object({
    fileName: z.string(),
    fileSize: z.number().positive(),
    fileType: z.string(),
    base64Content: z.string(),
  }),
  mutation: async ({ ctx, input }: { ctx: any; input: any }) => {
    const organizationId = ctx.user.organizationId;

    // Check quota before upload
    const quotaCheck = await checkQuota(organizationId, input.fileSize);

    if (!quotaCheck.allowed) {
      throw new QuotaExceededError(
        `Upload would exceed storage quota. Using ${quotaCheck.currentUsageFormatted} of ${quotaCheck.totalQuotaFormatted}. ` +
          `Available: ${quotaCheck.availableSpaceFormatted}. File size: ${formatBytes(input.fileSize)}.`
      );
    }

    try {
      // Upload file to storage
      const fileUrl = await uploadToStorage({
        fileName: input.fileName,
        content: input.base64Content,
        organizationId,
      });

      // Save file record to database
      const fileRecord = await ctx.db.fileCatalog.create({
        data: {
          organizationId,
          filename: input.fileName,
          fileSize: input.fileSize,
          fileType: input.fileType,
          storagePath: fileUrl,
          mimeType: input.fileType,
        },
      });

      // Update quota
      await incrementQuota(organizationId, input.fileSize);

      return {
        success: true,
        file: fileRecord,
        quotaInfo: await getQuotaInfo(organizationId),
      };
    } catch (error) {
      // If upload or DB insert fails, don't update quota
      throw error;
    }
  },
};

// ============================================================================
// HELPER FUNCTIONS (Placeholders for actual implementation)
// ============================================================================

async function performFileUpload(file: File): Promise<string> {
  // Placeholder: Replace with actual upload logic
  // Could be S3, Supabase Storage, etc.
  return `https://storage.example.com/uploads/${file.name}`;
}

async function deleteFileFromStorage(storagePath: string): Promise<void> {
  // Placeholder: Replace with actual deletion logic
  console.log(`Deleting file from storage: ${storagePath}`);
}

async function getFileFromDatabase(_fileId: string): Promise<{
  id: string;
  organizationId: string;
  size: number;
  storagePath: string;
} | null> {
  // Placeholder: Replace with actual DB query
  return null;
}

async function deleteFileFromDatabase(fileId: string): Promise<void> {
  // Placeholder: Replace with actual DB deletion
  console.log(`Deleting file record from database: ${fileId}`);
}

async function uploadToStorage(params: {
  fileName: string;
  content: string;
  organizationId: string;
}): Promise<string> {
  // Placeholder: Replace with actual storage upload
  return `https://storage.example.com/${params.organizationId}/${params.fileName}`;
}

// ============================================================================
// EXPORT EXAMPLES
// ============================================================================

export {
  uploadFileExample,
  deleteFileExample,
  displayQuotaInfoExample,
  batchUploadExample,
  uploadFileProcedure,
};
