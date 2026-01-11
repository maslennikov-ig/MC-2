import { useState, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/client-logger";
import { readFileAsBase64 } from '@/components/forms/file-upload';
import type { UploadedFile, FileUploadStatus } from '@/components/forms/file-upload';

/** Maximum retry attempts for rate-limited uploads */
const MAX_RETRIES = 3;

/** Helper to wait for specified milliseconds */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const uploadSingleFile = useCallback(async (
    file: UploadedFile,
    courseId: string,
    retryCount = 0
  ): Promise<string | null> => {
    try {
      const fileContent = await readFileAsBase64(file.file);

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'uploading' as FileUploadStatus, progress: 30 }
            : f
        )
      );

      const response = await fetch('/api/coursegen/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId,
          filename: file.file.name,
          fileSize: file.file.size,
          mimeType: file.file.type || 'application/octet-stream',
          fileContent,
        }),
      });

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, progress: 80 }
            : f
        )
      );

      const data = await response.json();

      if (!response.ok) {
        // Handle rate limiting with automatic retry and queue behavior
        if (response.status === 429 && retryCount < MAX_RETRIES) {
          // Get retry delay from response header or error message, default to 5 seconds
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterFromMessage = data.error?.match(/try again in (\d+) seconds/)?.[1];
          const retryAfterSec = parseInt(retryAfterHeader || retryAfterFromMessage || '5', 10);

          logger.info('Rate limited, waiting before retry', {
            filename: file.file.name,
            retryAfterSec,
            retryCount: retryCount + 1,
          });

          // Update status to show waiting state
          setUploadedFiles(prev =>
            prev.map(f =>
              f.id === file.id
                ? { ...f, status: 'uploading' as FileUploadStatus, progress: 10, error: `Ожидание ${retryAfterSec}с...` }
                : f
            )
          );

          // Wait and retry
          await delay(retryAfterSec * 1000);
          return uploadSingleFile(file, courseId, retryCount + 1);
        }

        if (data.code === 'QUOTA_EXCEEDED' || (data.message && data.message.includes('quota exceeded'))) {
          toast.warning("Превышен лимит хранилища", {
            description: "Не удалось загрузить файл. Место на диске закончилось.",
            duration: 5000
          });
          throw new Error("Превышен лимит хранилища");
        }
        throw new Error(data.error || 'Upload failed');
      }

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'success' as FileUploadStatus, progress: 100, fileId: data.fileId, error: undefined }
            : f
        )
      );

      logger.info('File uploaded successfully', {
        filename: file.file.name,
        fileId: data.fileId,
        courseId,
      });

      return data.fileId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'error' as FileUploadStatus, progress: 0, error: errorMessage }
            : f
        )
      );

      logger.error('File upload failed', {
        filename: file.file.name,
        courseId,
        error: errorMessage,
      });

      return null;
    }
  }, []);

  const uploadAllFiles = useCallback(async (courseId: string): Promise<string[]> => {
    const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      return uploadedFiles
        .filter(f => f.status === 'success' && f.fileId)
        .map(f => f.fileId!);
    }

    setIsUploadingFiles(true);
    const fileIds: string[] = [];

    for (const file of pendingFiles) {
      const fileId = await uploadSingleFile(file, courseId);
      if (fileId) {
        fileIds.push(fileId);
      }
    }

    setIsUploadingFiles(false);

    const previousFileIds = uploadedFiles
      .filter(f => f.status === 'success' && f.fileId)
      .map(f => f.fileId!);

    return [...previousFileIds, ...fileIds];
  }, [uploadedFiles, uploadSingleFile]);

  return {
    uploadedFiles,
    setUploadedFiles,
    isUploadingFiles,
    uploadSingleFile,
    uploadAllFiles
  };
}
