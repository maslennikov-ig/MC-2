import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Info } from 'lucide-react'
import { FileUpload, UploadedFile } from '@/components/forms/file-upload'
import {
  FILE_SIZE_LIMITS_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  type TierKey,
} from '@megacampus/shared-types'

interface UploadSectionProps {
  draftCourseId: string | null
  uploadedFiles: UploadedFile[]
  setUploadedFiles: (files: UploadedFile[]) => void
  uploadSingleFile: (file: UploadedFile, courseId: string) => Promise<string | null>
  isSubmitting: boolean
  isUploadingFiles: boolean
  /** Organization tier for file limits (null = loading) */
  tier?: TierKey | null
}

export function UploadSection({
  draftCourseId,
  uploadedFiles,
  setUploadedFiles,
  uploadSingleFile,
  isSubmitting,
  isUploadingFiles,
  tier,
}: UploadSectionProps) {
  // Use 'standard' as fallback when tier is loading (null)
  const effectiveTier: TierKey = tier || 'standard'
  const isTierLoading = tier === null

  // Compute tier-based limits for info display
  const maxFileSizeMB = useMemo(
    () => Math.round(FILE_SIZE_LIMITS_BY_TIER[effectiveTier] / (1024 * 1024)),
    [effectiveTier]
  )
  const allowedExtensions = useMemo(() => FILE_EXTENSIONS_BY_TIER[effectiveTier], [effectiveTier])
  const maxFiles = useMemo(() => FILE_COUNT_LIMITS_BY_TIER[effectiveTier], [effectiveTier])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-xl sm:p-6 md:p-8 xl:col-span-1 dark:border-white/10 dark:bg-black/70"
    >
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-white">
        <FolderOpen className="h-6 w-6 text-purple-500 dark:text-purple-400" />
        Загрузка учебных материалов (необязательно)
      </h2>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-4 backdrop-blur-md dark:border-purple-400/30 dark:bg-black/30">
        <Info className="mt-0.5 h-5 w-5 text-purple-500 dark:text-purple-400" />
        <div className="text-sm text-slate-700 dark:text-white/80">
          <p className="mb-1 font-medium">Загрузите материалы для анализа и генерации курса</p>
          <p>
            Поддерживаются: {allowedExtensions.map((ext) => ext.toUpperCase()).join(', ')}. До{' '}
            {maxFileSizeMB} МБ на файл, максимум {maxFiles} файлов.
          </p>
          <p className="mt-1 text-slate-500 dark:text-white/60">
            Файлы будут использованы как основа для создания курса. Система проанализирует
            содержание и создаст структурированные уроки.
          </p>
        </div>
      </div>

      <FileUpload
        courseId={draftCourseId}
        uploadedFiles={uploadedFiles}
        onFilesChange={setUploadedFiles}
        onUploadFile={async (file) => {
          if (!draftCourseId) return null
          return uploadSingleFile(file, draftCourseId)
        }}
        disabled={isSubmitting || isUploadingFiles || isTierLoading}
        tier={effectiveTier}
      />
      {isTierLoading && (
        <p className="mt-2 text-xs text-slate-500 dark:text-white/60">
          Загрузка информации о тарифе...
        </p>
      )}

      {uploadedFiles.filter((f) => f.status === 'success').length > 0 && (
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <p className="text-sm text-green-400">
            Загружено файлов: {uploadedFiles.filter((f) => f.status === 'success').length}. Они
            будут использованы для генерации курса.
          </p>
        </div>
      )}
    </motion.div>
  )
}
