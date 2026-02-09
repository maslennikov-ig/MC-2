'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Copy,
  Check,
  FolderOpen,
  FileText,
  Cloud,
  ArrowRight,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { ru as ruLocale } from 'date-fns/locale'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Stage1OutputTabProps, StoragePath } from './types'
import { formatFileSize } from '@megacampus/shared-utils'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract filename from storage path
 */
function extractFilename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface CopyButtonProps {
  text: string
  id: string
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  ariaLabelCopied: string
  ariaLabelCopy: string
}

/**
 * Copy to clipboard button with success state
 */
const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  id,
  copiedId,
  onCopy,
  ariaLabelCopied,
  ariaLabelCopy,
}) => {
  const isCopied = copiedId === id

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCopied ? ariaLabelCopied : ariaLabelCopy}
      className={cn(
        'h-6 w-6 transition-all duration-200',
        isCopied && 'text-green-600 dark:text-green-400'
      )}
      onClick={() => onCopy(text, id)}
    >
      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

interface MonoValueProps {
  label: string
  value: string
  id: string
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  ariaLabelCopied: string
  ariaLabelCopy: string
}

/**
 * Monospace value with copy button and truncation
 */
const MonoValue: React.FC<MonoValueProps> = ({
  label,
  value,
  id,
  copiedId,
  onCopy,
  ariaLabelCopied,
  ariaLabelCopy,
}) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    <div className="flex items-center gap-1.5">
      <span
        className="max-w-[180px] truncate font-mono text-xs text-slate-700 dark:text-slate-300"
        title={value}
      >
        {value}
      </span>
      <CopyButton
        text={value}
        id={id}
        copiedId={copiedId}
        onCopy={onCopy}
        ariaLabelCopied={ariaLabelCopied}
        ariaLabelCopy={ariaLabelCopy}
      />
    </div>
  </div>
)

interface FileTreeItemProps {
  storagePath: StoragePath
  isLast: boolean
}

/**
 * Single file item in the tree
 */
const FileTreeItem: React.FC<FileTreeItemProps> = ({ storagePath, isLast }) => {
  const filename = extractFilename(storagePath.path)
  const fileSize = storagePath.size ? formatFileSize(storagePath.size) : null

  return (
    <div className="flex items-center gap-2 py-1 pl-8 text-sm text-slate-600 dark:text-slate-400">
      <span className="text-slate-300 select-none dark:text-slate-600">
        {isLast ? '└──' : '├──'}
      </span>
      <FileText className="h-4 w-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
      <span className="flex-1 truncate" title={filename}>
        {filename}
      </span>
      {fileSize && (
        <span className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
          ({fileSize})
        </span>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage1OutputTab = memo<Stage1OutputTabProps>(function Stage1OutputTab({
  outputData,
  courseId: _courseId, // Available for future use (e.g., linking to course page)
  locale = 'ru',
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const t = useTranslations('generation.stage1')

  // Type guard and data extraction
  const data = outputData

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  // Copy handler with race condition fix
  const handleCopy = useCallback(
    (text: string, id: string) => {
      void (async () => {
        try {
          // Clear any existing timeout to prevent race condition
          if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current)
          }

          await navigator.clipboard.writeText(text)
          setCopiedId(id)
          toast.success(t('copied'))

          copyTimeoutRef.current = setTimeout(() => {
            setCopiedId(null)
            copyTimeoutRef.current = null
          }, 2000)
        } catch {
          toast.error(t('copyFailed'))
        }
      })()
    },
    [t]
  )

  // Format timestamp
  const formattedDate = useMemo(() => {
    if (!data?.createdAt) return null
    try {
      return format(
        new Date(data.createdAt),
        'dd MMM yyyy, HH:mm',
        locale === 'ru' ? { locale: ruLocale } : undefined
      )
    } catch {
      // User-friendly fallback using translations
      return t('dateUnknown')
    }
  }, [data?.createdAt, locale, t])

  // Build file tree structure
  const fileTree = useMemo(() => {
    if (!data?.storagePaths?.length) return null

    // Extract course ID from first path for display
    const firstPath = data.storagePaths[0]?.path || ''
    const courseMatch = firstPath.match(/course_([^/]+)/)
    const courseFolder = courseMatch
      ? `course_${courseMatch[1]}`
      : `course_${data.courseId?.slice(0, 8)}`

    return {
      rootFolder: 'cloud-storage/',
      courseFolder,
      sourceFolder: 'source/',
      files: data.storagePaths,
    }
  }, [data?.storagePaths, data?.courseId])

  // Determine next step
  const hasFiles = data?.storagePaths && data.storagePaths.length > 0

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Cloud className="h-6 w-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="max-w-[240px] text-sm text-slate-500 dark:text-slate-400">
          {t('outputEmptyState')}
        </p>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 p-1">
      {/* Section A: Course Passport Card */}
      <Card className="overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-indigo-600">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            {t('coursePassport')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          <div className="space-y-0">
            <MonoValue
              label={t('courseId')}
              value={data.courseId}
              id="courseId"
              copiedId={copiedId}
              onCopy={handleCopy}
              ariaLabelCopied={t('copied')}
              ariaLabelCopy={t('copyToClipboard')}
            />
            <MonoValue
              label={t('owner')}
              value={data.ownerId}
              id="ownerId"
              copiedId={copiedId}
              onCopy={handleCopy}
              ariaLabelCopied={t('copied')}
              ariaLabelCopy={t('copyToClipboard')}
            />
            <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('createdAt')}
              </span>
              <span className="text-xs text-slate-700 dark:text-slate-300">{formattedDate}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('status')}
              </span>
              {data.status === 'ready' ? (
                <Badge
                  className={cn(
                    'text-xs font-medium',
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    'border-green-200 dark:border-green-800'
                  )}
                >
                  <Check className="mr-1 h-3 w-3" />
                  {t('readyForStage2')}
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs font-medium">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {t('initializationError')}
                </Badge>
              )}
            </div>
            {data.status === 'error' && data.errorMessage && (
              <div className="mt-2 rounded border border-red-100 bg-red-50 p-2 dark:border-red-900/30 dark:bg-red-900/20">
                <p className="text-xs text-red-600 dark:text-red-400">{data.errorMessage}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section B: Asset Map (Tree View) */}
      <Card className="overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-amber-500 to-orange-600">
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            {t('assetMap')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          {fileTree ? (
            <div className="font-mono text-sm">
              {/* Root: cloud-storage/ */}
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Cloud className="h-4 w-4 text-slate-400" />
                <span>{fileTree.rootFolder}</span>
              </div>

              {/* Course folder */}
              <div className="flex items-center gap-2 pl-4 text-slate-600 dark:text-slate-400">
                <span className="text-slate-300 select-none dark:text-slate-600">└──</span>
                <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>{fileTree.courseFolder}/</span>
              </div>

              {/* Source folder */}
              <div className="flex items-center gap-2 pl-8 text-slate-600 dark:text-slate-400">
                <span className="text-slate-300 select-none dark:text-slate-600">└──</span>
                <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>{fileTree.sourceFolder}</span>
              </div>

              {/* Files */}
              <div className="pl-4">
                {fileTree.files.map((storagePath, index) => (
                  <FileTreeItem
                    key={storagePath.fileId}
                    storagePath={storagePath}
                    isLast={index === fileTree.files.length - 1}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <FolderOpen className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('noAssets')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C: Next Step Indicator */}
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('nextStep')}
                </span>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {hasFiles ? t('documentClassification') : t('deepAnalysis')}
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 animate-pulse text-slate-400 dark:text-slate-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

export default Stage1OutputTab
