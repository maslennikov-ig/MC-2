'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { UploadedFile } from '@/components/forms/file-upload'

interface UploadProgressBarProps {
  uploadedFiles: UploadedFile[]
  isVisible: boolean
}

export function UploadProgressBar({ uploadedFiles, isVisible }: UploadProgressBarProps) {
  // Calculate progress
  const totalFiles = uploadedFiles.length
  const completedFiles = uploadedFiles.filter((f) => f.status === 'success').length
  const uploadingFile = uploadedFiles.find((f) => f.status === 'uploading')

  // Average progress across all files
  const overallProgress =
    totalFiles > 0
      ? uploadedFiles.reduce((sum, f) => {
          if (f.status === 'success') return sum + 100
          if (f.status === 'uploading') return sum + f.progress
          return sum // pending = 0
        }, 0) / totalFiles
      : 0

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                <span className="font-medium text-slate-900 dark:text-white">Загрузка файлов</span>
              </div>
              <span className="text-sm text-slate-600 dark:text-white/60">
                {completedFiles} из {totalFiles}
              </span>
            </div>

            {/* Progress bar */}
            <Progress
              value={overallProgress}
              className="h-2 bg-purple-200/50 dark:bg-purple-900/30"
            />

            {/* Current file name */}
            {uploadingFile && (
              <p className="mt-2 truncate text-xs text-slate-500 dark:text-white/40">
                {uploadingFile.file.name}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
