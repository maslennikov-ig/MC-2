import { GenerationTrace } from '@/components/generation-celestial/utils';

/**
 * Check if a string looks like a UUID.
 */
export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Extracts document ID for deduplication (UUID-based).
 * Used to identify unique documents across multiple trace steps.
 */
export function extractDocumentId(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;

  // Priority: document_id fields for deduplication
  return inputData.document_id ||
         inputData.documentId ||
         inputData.fileId ||
         inputData.file_id ||
         null;
}

/**
 * Extracts human-readable document name from a stage 2 trace.
 * Returns the original filename for display, not the UUID.
 */
export function extractDocumentName(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;

  // Priority order: human-readable names first
  // 1. Original filename (what user uploaded)
  const originalName = inputData.originalFilename ||
                       inputData.original_filename ||
                       inputData.originalName ||
                       inputData.original_name;
  if (originalName && typeof originalName === 'string') {
    return originalName;
  }

  // 2. File name fields
  const fileName = inputData.file_name ||
                   inputData.filename ||
                   inputData.fileName ||
                   inputData.name;
  if (fileName && typeof fileName === 'string') {
    // Check base name without extension - UUID filenames like "abc123...def.pdf" are not valid
    const baseName = fileName.split('.')[0];
    if (!isUUID(baseName)) {
      return fileName;
    }
  }

  // 3. Extract from path (last segment)
  const path = inputData.filePath ||
               inputData.file_path ||
               inputData.path ||
               inputData.source_file;
  if (path && typeof path === 'string' && path.includes('/')) {
    const filename = path.split('/').pop();
    if (filename) {
      // Check base name without extension
      const baseName = filename.split('.')[0];
      if (!isUUID(baseName)) {
        return filename;
      }
    }
  }

  return null;
}
