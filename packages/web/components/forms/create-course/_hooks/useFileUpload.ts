import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { logger } from '@/lib/client-logger'
import { readFileAsBase64 } from '@/components/forms/file-upload'
import type { UploadedFile, FileUploadStatus } from '@/components/forms/file-upload'

/** Maximum retry attempts for rate-limited uploads */
const MAX_RETRIES = 3

/** Maximum retry attempts for network errors */
const MAX_NETWORK_RETRIES = 3

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 2000

/** Helper to wait for specified milliseconds */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Check if error is a network/connection error */
const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message.includes('fetch')) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('failed to fetch') ||
      msg.includes('econnreset') ||
      msg.includes('socket')
    )
  }
  return false
}

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)

  const uploadSingleFile = useCallback(
    async (
      file: UploadedFile,
      courseId: string,
      retryCount = 0,
      networkRetryCount = 0
    ): Promise<string | null> => {
      const uploadStartTime = Date.now()

      logger.info('Starting file upload', {
        filename: file.file.name,
        fileSize: file.file.size,
        courseId,
        retryCount,
        networkRetryCount,
      })

      try {
        const fileContent = await readFileAsBase64(file.file)

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === file.id ? { ...f, status: 'uploading' as FileUploadStatus, progress: 30 } : f
          )
        )

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
        })

        setUploadedFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, progress: 80 } : f)))

        const data = await response.json()

        if (!response.ok) {
          // Handle rate limiting with automatic retry and queue behavior
          if (response.status === 429 && retryCount < MAX_RETRIES) {
            // Get retry delay from response header or error message, default to 5 seconds
            const retryAfterHeader = response.headers.get('Retry-After')
            const retryAfterFromMessage = data.error?.match(/try again in (\d+) seconds/)?.[1]
            const retryAfterSec = parseInt(retryAfterHeader || retryAfterFromMessage || '5', 10)

            logger.info('Rate limited, waiting before retry', {
              filename: file.file.name,
              retryAfterSec,
              retryCount: retryCount + 1,
            })

            // Update status to show waiting state
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === file.id
                  ? {
                      ...f,
                      status: 'uploading' as FileUploadStatus,
                      progress: 10,
                      error: `Ожидание ${retryAfterSec}с...`,
                    }
                  : f
              )
            )

            // Wait and retry
            await delay(retryAfterSec * 1000)
            return uploadSingleFile(file, courseId, retryCount + 1, networkRetryCount)
          }

          if (
            data.code === 'QUOTA_EXCEEDED' ||
            (data.message && data.message.includes('quota exceeded'))
          ) {
            toast.warning('Превышен лимит хранилища', {
              description: 'Не удалось загрузить файл. Место на диске закончилось.',
              duration: 5000,
            })
            throw new Error('Превышен лимит хранилища')
          }
          throw new Error(data.error || 'Upload failed')
        }

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: 'success' as FileUploadStatus,
                  progress: 100,
                  fileId: data.fileId,
                  error: undefined,
                }
              : f
          )
        )

        const uploadDuration = Date.now() - uploadStartTime
        logger.info('File uploaded successfully', {
          filename: file.file.name,
          fileId: data.fileId,
          courseId,
          durationMs: uploadDuration,
          retries: retryCount + networkRetryCount,
        })

        return data.fileId
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Retry network errors with exponential backoff
        if (isNetworkError(error) && networkRetryCount < MAX_NETWORK_RETRIES) {
          const retryDelay = BASE_RETRY_DELAY * Math.pow(2, networkRetryCount)

          logger.warn('Network error during upload, retrying', {
            filename: file.file.name,
            courseId,
            error: errorMessage,
            networkRetryCount: networkRetryCount + 1,
            retryDelayMs: retryDelay,
          })

          // Update status to show retry state
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    status: 'uploading' as FileUploadStatus,
                    progress: 5,
                    error: `Повторная попытка (${networkRetryCount + 1}/${MAX_NETWORK_RETRIES})...`,
                  }
                : f
            )
          )

          toast.info(`Ошибка сети для "${file.file.name}"`, {
            description: `Повторная попытка через ${retryDelay / 1000}с...`,
            duration: retryDelay,
          })

          await delay(retryDelay)
          return uploadSingleFile(file, courseId, retryCount, networkRetryCount + 1)
        }

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, status: 'error' as FileUploadStatus, progress: 0, error: errorMessage }
              : f
          )
        )

        // Show toast for failed uploads so user is aware
        toast.error(`Ошибка загрузки: ${file.file.name}`, {
          description: errorMessage,
          duration: 5000,
        })

        logger.error('File upload failed', {
          filename: file.file.name,
          courseId,
          error: errorMessage,
          totalRetries: retryCount + networkRetryCount,
        })

        return null
      }
    },
    []
  )

  const uploadAllFiles = useCallback(
    async (courseId: string): Promise<string[]> => {
      const pendingFiles = uploadedFiles.filter((f) => f.status === 'pending')
      if (pendingFiles.length === 0) {
        return uploadedFiles.filter((f) => f.status === 'success' && f.fileId).map((f) => f.fileId!)
      }

      logger.info('Starting batch upload', {
        pendingCount: pendingFiles.length,
        courseId,
      })

      setIsUploadingFiles(true)
      const fileIds: string[] = []
      let failedCount = 0

      for (const file of pendingFiles) {
        const fileId = await uploadSingleFile(file, courseId)
        if (fileId) {
          fileIds.push(fileId)
        } else {
          failedCount++
        }
      }

      setIsUploadingFiles(false)

      // Log reconciliation results
      const successCount = fileIds.length
      logger.info('Batch upload completed', {
        courseId,
        totalFiles: pendingFiles.length,
        successCount,
        failedCount,
      })

      // Warn if any files failed
      if (failedCount > 0) {
        toast.warning(`${failedCount} файл(ов) не удалось загрузить`, {
          description: 'Проверьте список файлов и повторите попытку для неудачных загрузок.',
          duration: 7000,
        })
      }

      const previousFileIds = uploadedFiles
        .filter((f) => f.status === 'success' && f.fileId)
        .map((f) => f.fileId!)

      return [...previousFileIds, ...fileIds]
    },
    [uploadedFiles, uploadSingleFile]
  )

  return {
    uploadedFiles,
    setUploadedFiles,
    isUploadingFiles,
    uploadSingleFile,
    uploadAllFiles,
  }
}
