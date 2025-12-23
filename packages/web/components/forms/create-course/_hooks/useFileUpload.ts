import { useState, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/client-logger";
import { readFileAsBase64 } from '@/components/forms/file-upload';
import type { UploadedFile, FileUploadStatus } from '@/components/forms/file-upload';

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const uploadSingleFile = useCallback(async (
    file: UploadedFile,
    courseId: string
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
            ? { ...f, status: 'success' as FileUploadStatus, progress: 100, fileId: data.fileId }
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
