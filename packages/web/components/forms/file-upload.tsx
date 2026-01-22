'use client'

import React, { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  X,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FolderUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import {
  FILE_SIZE_LIMITS_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  MIME_TYPES_BY_TIER,
  TIER_ORDER,
  TIER_DISPLAY_NAMES,
  type TierKey,
} from '@megacampus/shared-types'

// Default fallback values for backwards compatibility
const DEFAULT_TIER: TierKey = 'standard'

export type FileUploadStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface UploadedFile {
  id: string
  file: File
  status: FileUploadStatus
  progress: number
  error?: string
  fileId?: string // Server-assigned fileId after successful upload
}

interface FileUploadProps {
  courseId: string | null
  uploadedFiles: UploadedFile[]
  onFilesChange: (files: UploadedFile[]) => void
  onUploadFile: (file: UploadedFile) => Promise<string | null> // Returns fileId on success
  disabled?: boolean
  maxFiles?: number
  /** Organization tier for file limits (defaults to 'standard') */
  tier?: TierKey
}

/**
 * Get suggested tier for a file size (for upgrade messaging)
 * @param fileSize - File size in bytes
 * @param currentTier - Current organization tier
 * @returns Suggested tier or null if file too large even for premium
 */
function getSuggestedTierForSize(fileSize: number, currentTier: TierKey): TierKey | null {
  const currentIndex = TIER_ORDER.indexOf(currentTier)

  // Find first tier that supports this file size (that's higher than current)
  for (let i = currentIndex + 1; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i]
    if (fileSize <= FILE_SIZE_LIMITS_BY_TIER[tier]) {
      return tier
    }
  }
  return null // File too large even for premium
}

/**
 * Get minimum tier required for a file extension
 * @param extension - File extension (lowercase, without dot)
 * @returns Minimum tier that supports this extension or null if not supported
 */
function getMinTierForExtension(extension: string): TierKey | null {
  for (const tier of TIER_ORDER) {
    if ((FILE_EXTENSIONS_BY_TIER[tier] as readonly string[]).includes(extension)) {
      return tier
    }
  }
  return null // Extension not supported on any tier
}

/**
 * Check if extension is supported on any tier
 */
function isExtensionSupportedAnywhere(extension: string): boolean {
  const allExtensions = Object.values(FILE_EXTENSIONS_BY_TIER).flat() as string[]
  return allExtensions.includes(extension)
}

/**
 * FileUpload component - Tier-aware file upload with dynamic limits
 * Supports tier-based file size, count, and type restrictions
 */
export function FileUpload({
  courseId,
  uploadedFiles,
  onFilesChange,
  onUploadFile,
  disabled = false,
  maxFiles: maxFilesProp,
  tier = DEFAULT_TIER,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Compute tier-based limits
  const effectiveTier = tier || DEFAULT_TIER
  const maxFileSize = FILE_SIZE_LIMITS_BY_TIER[effectiveTier]
  const maxFileSizeMB = Math.round(maxFileSize / (1024 * 1024))
  const maxFiles = maxFilesProp ?? FILE_COUNT_LIMITS_BY_TIER[effectiveTier]
  const allowedMimeTypes = MIME_TYPES_BY_TIER[effectiveTier]
  const allowedExtensions = FILE_EXTENSIONS_BY_TIER[effectiveTier]

  // Format file size for display
  const formatSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }, [])

  // Validate file before adding
  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Check file size with tier-aware messaging
      if (file.size > maxFileSize) {
        const suggestedTier = getSuggestedTierForSize(file.size, effectiveTier)
        const upgradeHint = suggestedTier
          ? ` Перейдите на тариф ${TIER_DISPLAY_NAMES[suggestedTier]} для загрузки файлов до ${Math.round(FILE_SIZE_LIMITS_BY_TIER[suggestedTier] / (1024 * 1024))} МБ.`
          : ' Файл слишком большой даже для максимального тарифа.'

        return {
          valid: false,
          error: `Файл "${file.name}" (${formatSize(file.size)}) превышает лимит вашего тарифа (${maxFileSizeMB} МБ).${upgradeHint}`,
        }
      }

      // Check file type by extension
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!extension || !(allowedExtensions as readonly string[]).includes(extension)) {
        // Check if this extension is supported on a higher tier
        const minTierForExt = extension ? getMinTierForExtension(extension) : null
        const isSupported = extension ? isExtensionSupportedAnywhere(extension) : false

        let errorMessage: string
        if (!extension) {
          errorMessage = `Файл "${file.name}" не имеет расширения.`
        } else if (!isSupported) {
          // Extension not supported on any tier
          errorMessage = `Тип файла .${extension.toUpperCase()} не поддерживается. Разрешены: ${FILE_EXTENSIONS_BY_TIER.premium.map((e) => e.toUpperCase()).join(', ')}`
        } else if (minTierForExt) {
          // Extension supported on a higher tier
          errorMessage = `Тип файла .${extension.toUpperCase()} не поддерживается на тарифе ${TIER_DISPLAY_NAMES[effectiveTier]}. Перейдите на тариф ${TIER_DISPLAY_NAMES[minTierForExt]} для загрузки файлов этого типа.`
        } else {
          errorMessage = `Тип файла "${file.name}" не поддерживается на тарифе ${TIER_DISPLAY_NAMES[effectiveTier]}. Разрешены: ${allowedExtensions.join(', ').toUpperCase()}`
        }

        return {
          valid: false,
          error: errorMessage,
        }
      }

      // Check MIME type (with fallback for some browsers)
      if (
        file.type &&
        !(allowedMimeTypes as readonly string[]).includes(file.type) &&
        file.type !== ''
      ) {
        // Some browsers report generic MIME types, allow if extension is valid
        const genericTypes = ['application/octet-stream', '']
        if (!genericTypes.includes(file.type)) {
          return {
            valid: false,
            error: `Тип файла "${file.name}" не поддерживается`,
          }
        }
      }

      // Check max files with tier-aware messaging
      if (uploadedFiles.length >= maxFiles) {
        // Find minimum tier that supports more files than current
        const currentIndex = TIER_ORDER.indexOf(effectiveTier)
        let suggestedTier: TierKey | null = null

        for (let i = currentIndex + 1; i < TIER_ORDER.length; i++) {
          const tier = TIER_ORDER[i]
          if (FILE_COUNT_LIMITS_BY_TIER[tier] > maxFiles) {
            suggestedTier = tier
            break
          }
        }

        const upgradeHint = suggestedTier
          ? ` Перейдите на тариф ${TIER_DISPLAY_NAMES[suggestedTier]} для загрузки до ${FILE_COUNT_LIMITS_BY_TIER[suggestedTier]} файлов.`
          : ''

        return {
          valid: false,
          error: `Достигнут лимит файлов для тарифа ${TIER_DISPLAY_NAMES[effectiveTier]} (${maxFiles}).${upgradeHint}`,
        }
      }

      // Check for duplicate files
      const isDuplicate = uploadedFiles.some(
        (f) => f.file.name === file.name && f.file.size === file.size
      )
      if (isDuplicate) {
        return {
          valid: false,
          error: `Файл "${file.name}" уже добавлен`,
        }
      }

      return { valid: true }
    },
    [
      uploadedFiles,
      maxFiles,
      maxFileSize,
      maxFileSizeMB,
      effectiveTier,
      allowedExtensions,
      allowedMimeTypes,
      formatSize,
    ]
  )

  // Handle file selection
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const newFiles: UploadedFile[] = []

      for (const file of fileArray) {
        const validation = validateFile(file)
        if (!validation.valid) {
          toast.error(validation.error)
          continue
        }

        newFiles.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          status: 'pending',
          progress: 0,
        })
      }

      if (newFiles.length > 0) {
        onFilesChange([...uploadedFiles, ...newFiles])
      }
    },
    [validateFile, uploadedFiles, onFilesChange]
  )

  // Drag and drop handlers
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) {
        setIsDragging(true)
      }
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const { files } = e.dataTransfer
      if (files && files.length > 0) {
        handleFiles(files)
      }
    },
    [disabled, handleFiles]
  )

  // Click to select files
  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target
      if (files && files.length > 0) {
        handleFiles(files)
      }
      // Reset input value to allow selecting the same file again
      e.target.value = ''
    },
    [handleFiles]
  )

  // Remove file from list
  const removeFile = useCallback(
    (fileId: string) => {
      onFilesChange(uploadedFiles.filter((f) => f.id !== fileId))
    },
    [uploadedFiles, onFilesChange]
  )

  // Retry failed upload
  const retryUpload = useCallback(
    async (file: UploadedFile) => {
      if (!courseId) {
        toast.error('Сначала создайте курс')
        return
      }

      // Update status to uploading
      onFilesChange(
        uploadedFiles.map((f) =>
          f.id === file.id
            ? { ...f, status: 'uploading' as FileUploadStatus, progress: 0, error: undefined }
            : f
        )
      )

      const fileId = await onUploadFile(file)
      if (fileId) {
        onFilesChange(
          uploadedFiles.map((f) =>
            f.id === file.id
              ? { ...f, status: 'success' as FileUploadStatus, progress: 100, fileId }
              : f
          )
        )
      }
    },
    [courseId, uploadedFiles, onFilesChange, onUploadFile]
  )

  // Get file icon based on extension
  const getFileIcon = (_filename: string) => {
    return <FileText className="h-5 w-5 text-purple-500 dark:text-purple-400" />
  }

  return (
    <div className="space-y-4">
      {/* Drag and drop zone - IMPROVED READABILITY */}
      <div
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 transition-all ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10 dark:border-purple-400 dark:bg-purple-500/10'
            : disabled
              ? 'cursor-not-allowed border-slate-300 bg-slate-100 opacity-50 dark:border-white/10 dark:bg-black/60'
              : 'border-slate-300 bg-slate-50 hover:border-purple-400 hover:bg-slate-100 dark:border-white/20 dark:bg-black/60 dark:hover:border-purple-400/50 dark:hover:bg-black/70'
        } `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedExtensions.map((ext) => `.${ext}`).join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {/* Icon container - IMPROVED VISIBILITY */}
          <div
            className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
              isDragging
                ? 'bg-purple-100 dark:bg-purple-500/30'
                : 'bg-purple-100 dark:bg-purple-500/20'
            } `}
          >
            {isDragging ? (
              <FolderUp className="h-7 w-7 text-purple-500 dark:text-purple-400" />
            ) : (
              <Upload className="h-7 w-7 text-purple-500 dark:text-purple-400" />
            )}
          </div>

          {/* Main text - IMPROVED CONTRAST */}
          <p
            className="mb-1 font-medium text-slate-700 dark:text-white"
            style={{ textShadow: '0 0 0 transparent, 0 1px 3px rgba(0,0,0,0.5)' }}
          >
            {isDragging ? 'Отпустите файлы здесь' : 'Перетащите файлы или нажмите для выбора'}
          </p>

          {/* Secondary text - IMPROVED READABILITY */}
          <p
            className="text-sm text-slate-500 dark:text-white/70"
            style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.4)' }}
          >
            {allowedExtensions.map((ext) => ext.toUpperCase()).join(', ')} (до {maxFileSizeMB} МБ)
          </p>

          {/* Tertiary text - IMPROVED CONTRAST */}
          <p
            className="mt-2 text-xs text-slate-400 dark:text-white/60"
            style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.4)' }}
          >
            Максимум {maxFiles} файлов
          </p>
        </div>
      </div>

      {/* Uploaded files list */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {uploadedFiles.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  file.status === 'error'
                    ? 'border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
                    : file.status === 'success'
                      ? 'border-green-300 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'
                      : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/60'
                } `}
              >
                {/* File icon */}
                {getFileIcon(file.file.name)}

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-slate-800 dark:text-white"
                    style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.3)' }}
                  >
                    {file.file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-white/70">
                      {formatSize(file.file.size)}
                    </span>
                    {file.status === 'uploading' && (
                      <span className="text-purple-600 dark:text-purple-400">
                        Загрузка... {file.progress}%
                      </span>
                    )}
                    {file.status === 'success' && (
                      <span className="text-green-600 dark:text-green-400">Загружен</span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-red-600 dark:text-red-400">
                        {file.error || 'Ошибка загрузки'}
                      </span>
                    )}
                    {file.status === 'pending' && (
                      <span className="text-slate-400 dark:text-white/50">Ожидает загрузки</span>
                    )}
                  </div>

                  {/* Progress bar for uploading state */}
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="mt-2 h-1" />
                  )}
                </div>

                {/* Status icon / actions */}
                <div className="flex items-center gap-2">
                  {file.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 animate-spin text-purple-500 dark:text-purple-400" />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                  {file.status === 'error' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        retryUpload(file)
                      }}
                      className="rounded-lg p-1 transition-colors hover:bg-slate-200 dark:hover:bg-white/10"
                      title="Повторить загрузку"
                    >
                      <RefreshCw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </button>
                  )}
                  {file.status === 'pending' && (
                    <AlertCircle className="h-5 w-5 text-slate-400 dark:text-white/40" />
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(file.id)
                    }}
                    className="rounded-lg p-1 transition-colors hover:bg-slate-200 dark:hover:bg-white/10"
                    title="Удалить файл"
                  >
                    <X className="h-5 w-5 text-slate-500 hover:text-red-600 dark:text-white/60 dark:hover:text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Files count info */}
      {uploadedFiles.length > 0 && (
        <p className="text-right text-xs text-slate-400 dark:text-white/50">
          {uploadedFiles.length} из {maxFiles} файлов
        </p>
      )}
    </div>
  )
}

/**
 * Utility function to read file as base64
 */
export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default FileUpload
