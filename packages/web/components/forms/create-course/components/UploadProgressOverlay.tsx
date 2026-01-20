'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FileUp, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { UploadedFile } from '@/components/forms/file-upload'

interface UploadProgressOverlayProps {
  uploadedFiles: UploadedFile[]
  isVisible: boolean
}

export function UploadProgressOverlay({ uploadedFiles, isVisible }: UploadProgressOverlayProps) {
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

  // Prevent body scroll when overlay is visible
  useEffect(() => {
    if (!isVisible) return

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isVisible])

  // Don't render on server
  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="upload-progress-title"
            aria-describedby="upload-progress-description"
          >
            <div className="w-full max-w-md rounded-2xl border border-purple-200 bg-white p-6 shadow-2xl dark:border-purple-800/50 dark:bg-slate-900">
              {/* Icon */}
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <FileUp className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
              </div>

              {/* Title */}
              <h2
                id="upload-progress-title"
                className="mb-2 text-center text-xl font-semibold text-slate-900 dark:text-white"
              >
                Загрузка файлов
              </h2>

              {/* Counter */}
              <p className="mb-4 text-center text-sm text-slate-600 dark:text-white/70">
                {completedFiles} из {totalFiles} файлов загружено
              </p>

              {/* Progress bar */}
              <div className="mb-3">
                <Progress
                  value={overallProgress}
                  className="h-3 bg-purple-100 dark:bg-purple-900/30"
                />
              </div>

              {/* Percentage */}
              <p className="mb-4 text-center text-2xl font-bold text-purple-600 dark:text-purple-400">
                {Math.round(overallProgress)}%
              </p>

              {/* Current file */}
              {uploadingFile && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-2 dark:bg-slate-800">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                  <span className="max-w-[200px] truncate text-sm text-slate-600 dark:text-white/70">
                    {uploadingFile.file.name}
                  </span>
                </div>
              )}

              {/* Warning */}
              <p
                id="upload-progress-description"
                className="text-center text-xs text-slate-500 dark:text-white/50"
              >
                Пожалуйста, не закрывайте и не обновляйте страницу
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
