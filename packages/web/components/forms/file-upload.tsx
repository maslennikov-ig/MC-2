"use client"

import React, { useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload,
  X,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FolderUp
} from "lucide-react"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"

// File type restrictions (from shared-types zod-schemas.ts)
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf', 'pptx', 'html']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/html',
]
const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const MAX_FILES_PER_COURSE = 10

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
}

/**
 * FileUpload component - Improved readability for light/dark themes
 * Supports PDF, DOCX, DOC, TXT, MD, RTF, PPTX, HTML files
 * Max 50MB per file, 10 files per course
 */
export function FileUpload({
  courseId,
  uploadedFiles,
  onFilesChange,
  onUploadFile,
  disabled = false,
  maxFiles = MAX_FILES_PER_COURSE,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate file before adding
  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Файл "${file.name}" превышает максимальный размер ${MAX_FILE_SIZE_MB} МБ`
      }
    }

    // Check file type by extension
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        error: `Тип файла "${file.name}" не поддерживается. Разрешены: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
      }
    }

    // Check MIME type (with fallback for some browsers)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type) && file.type !== '') {
      // Some browsers report generic MIME types, allow if extension is valid
      const genericTypes = ['application/octet-stream', '']
      if (!genericTypes.includes(file.type)) {
        return {
          valid: false,
          error: `Тип файла "${file.name}" не поддерживается`
        }
      }
    }

    // Check max files
    if (uploadedFiles.length >= maxFiles) {
      return {
        valid: false,
        error: `Достигнут лимит файлов (${maxFiles})`
      }
    }

    // Check for duplicate files
    const isDuplicate = uploadedFiles.some(
      f => f.file.name === file.name && f.file.size === file.size
    )
    if (isDuplicate) {
      return {
        valid: false,
        error: `Файл "${file.name}" уже добавлен`
      }
    }

    return { valid: true }
  }, [uploadedFiles, maxFiles])

  // Handle file selection
  const handleFiles = useCallback((files: FileList | File[]) => {
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
  }, [validateFile, uploadedFiles, onFilesChange])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const { files } = e.dataTransfer
    if (files && files.length > 0) {
      handleFiles(files)
    }
  }, [disabled, handleFiles])

  // Click to select files
  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target
    if (files && files.length > 0) {
      handleFiles(files)
    }
    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }, [handleFiles])

  // Remove file from list
  const removeFile = useCallback((fileId: string) => {
    onFilesChange(uploadedFiles.filter(f => f.id !== fileId))
  }, [uploadedFiles, onFilesChange])

  // Retry failed upload
  const retryUpload = useCallback(async (file: UploadedFile) => {
    if (!courseId) {
      toast.error("Сначала создайте курс")
      return
    }

    // Update status to uploading
    onFilesChange(
      uploadedFiles.map(f =>
        f.id === file.id ? { ...f, status: 'uploading' as FileUploadStatus, progress: 0, error: undefined } : f
      )
    )

    const fileId = await onUploadFile(file)
    if (fileId) {
      onFilesChange(
        uploadedFiles.map(f =>
          f.id === file.id ? { ...f, status: 'success' as FileUploadStatus, progress: 100, fileId } : f
        )
      )
    }
  }, [courseId, uploadedFiles, onFilesChange, onUploadFile])

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  // Get file icon based on extension
  const getFileIcon = (_filename: string) => {
    return <FileText className="w-5 h-5 text-purple-500 dark:text-purple-400" />
  }

  return (
    <div className="space-y-4">
      {/* Drag and drop zone - IMPROVED READABILITY */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer
          ${isDragging
            ? 'border-purple-500 bg-purple-500/10 dark:border-purple-400 dark:bg-purple-500/10'
            : disabled
              ? 'border-slate-300 bg-slate-100 dark:border-white/10 dark:bg-black/60 cursor-not-allowed opacity-50'
              : 'border-slate-300 bg-slate-50 hover:border-purple-400 hover:bg-slate-100 dark:border-white/20 dark:bg-black/60 dark:hover:border-purple-400/50 dark:hover:bg-black/70'
          }
        `}
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
          accept={ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {/* Icon container - IMPROVED VISIBILITY */}
          <div className={`
            w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors
            ${isDragging
              ? 'bg-purple-100 dark:bg-purple-500/30'
              : 'bg-purple-100 dark:bg-purple-500/20'
            }
          `}>
            {isDragging ? (
              <FolderUp className="w-7 h-7 text-purple-500 dark:text-purple-400" />
            ) : (
              <Upload className="w-7 h-7 text-purple-500 dark:text-purple-400" />
            )}
          </div>

          {/* Main text - IMPROVED CONTRAST */}
          <p className="text-slate-700 dark:text-white font-medium mb-1"
             style={{ textShadow: '0 0 0 transparent, 0 1px 3px rgba(0,0,0,0.5)' }}>
            {isDragging ? 'Отпустите файлы здесь' : 'Перетащите файлы или нажмите для выбора'}
          </p>

          {/* Secondary text - IMPROVED READABILITY */}
          <p className="text-slate-500 dark:text-white/70 text-sm"
             style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.4)' }}>
            PDF, DOCX, TXT, MD, PPTX, HTML (до {MAX_FILE_SIZE_MB} МБ)
          </p>

          {/* Tertiary text - IMPROVED CONTRAST */}
          <p className="text-slate-400 dark:text-white/60 text-xs mt-2"
             style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.4)' }}>
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
                className={`
                  flex items-center gap-3 p-3 rounded-lg border
                  ${file.status === 'error'
                    ? 'bg-red-50 border-red-300 dark:bg-red-500/10 dark:border-red-500/30'
                    : file.status === 'success'
                      ? 'bg-green-50 border-green-300 dark:bg-green-500/10 dark:border-green-500/30'
                      : 'bg-slate-50 border-slate-200 dark:bg-black/60 dark:border-white/10'
                  }
                `}
              >
                {/* File icon */}
                {getFileIcon(file.file.name)}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 dark:text-white text-sm font-medium truncate"
                     style={{ textShadow: '0 0 0 transparent, 0 1px 2px rgba(0,0,0,0.3)' }}>
                    {file.file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-white/70">{formatFileSize(file.file.size)}</span>
                    {file.status === 'uploading' && (
                      <span className="text-purple-600 dark:text-purple-400">Загрузка... {file.progress}%</span>
                    )}
                    {file.status === 'success' && (
                      <span className="text-green-600 dark:text-green-400">Загружен</span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-red-600 dark:text-red-400">{file.error || 'Ошибка загрузки'}</span>
                    )}
                    {file.status === 'pending' && (
                      <span className="text-slate-400 dark:text-white/50">Ожидает загрузки</span>
                    )}
                  </div>

                  {/* Progress bar for uploading state */}
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="h-1 mt-2" />
                  )}
                </div>

                {/* Status icon / actions */}
                <div className="flex items-center gap-2">
                  {file.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 text-purple-500 dark:text-purple-400 animate-spin" />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  )}
                  {file.status === 'error' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        retryUpload(file)
                      }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                      title="Повторить загрузку"
                    >
                      <RefreshCw className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </button>
                  )}
                  {file.status === 'pending' && (
                    <AlertCircle className="w-5 h-5 text-slate-400 dark:text-white/40" />
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(file.id)
                    }}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                    title="Удалить файл"
                  >
                    <X className="w-5 h-5 text-slate-500 hover:text-red-600 dark:text-white/60 dark:hover:text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Files count info */}
      {uploadedFiles.length > 0 && (
        <p className="text-slate-400 dark:text-white/50 text-xs text-right">
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
