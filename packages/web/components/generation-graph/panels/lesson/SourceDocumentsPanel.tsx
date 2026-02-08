'use client'

import React, { memo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FileText, ChevronDown, Layers, BookOpen, FileQuestion } from 'lucide-react'
import type { SourceDocument } from '@megacampus/shared-types'

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to validate if an unknown value is a valid SourceDocument.
 * Used to filter invalid/malformed documents from API responses.
 *
 * @param doc - Unknown value to validate
 * @returns True if the value is a valid SourceDocument
 */
export function isValidSourceDocument(doc: unknown): doc is SourceDocument {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    'document_id' in doc &&
    typeof (doc as Record<string, unknown>).document_id === 'string' &&
    'document_name' in doc &&
    typeof (doc as Record<string, unknown>).document_name === 'string' &&
    'document_priority' in doc &&
    ['CORE', 'IMPORTANT', 'SUPPLEMENTARY'].includes(
      (doc as Record<string, unknown>).document_priority as string
    ) &&
    'chunk_count' in doc &&
    typeof (doc as Record<string, unknown>).chunk_count === 'number'
  )
}

// =============================================================================
// TYPES
// =============================================================================

interface SourceDocumentsPanelProps {
  /** Source documents used in lesson generation */
  sourceDocuments: SourceDocument[]
  /** Locale for translations */
  locale?: 'ru' | 'en'
  /** Additional CSS classes */
  className?: string
}

// =============================================================================
// PRIORITY STYLING
// =============================================================================

const PRIORITY_STYLES: Record<
  SourceDocument['document_priority'],
  {
    badge: string
    icon: typeof Layers
    label: { ru: string; en: string }
    description: { ru: string; en: string }
  }
> = {
  CORE: {
    badge:
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    icon: Layers,
    label: { ru: 'Ключевой', en: 'Core' },
    description: { ru: 'Основной источник для урока', en: 'Primary source for the lesson' },
  },
  IMPORTANT: {
    badge:
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    icon: BookOpen,
    label: { ru: 'Важный', en: 'Important' },
    description: { ru: 'Дополняющий источник', en: 'Supporting source' },
  },
  SUPPLEMENTARY: {
    badge:
      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-600',
    icon: FileQuestion,
    label: { ru: 'Дополнительный', en: 'Supplementary' },
    description: { ru: 'Вспомогательный материал', en: 'Auxiliary material' },
  },
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface SourceDocumentItemProps {
  document: SourceDocument
  locale: 'ru' | 'en'
  isExpanded?: boolean
  onToggle?: () => void
}

const SourceDocumentItem = memo(function SourceDocumentItem({
  document,
  locale,
}: SourceDocumentItemProps) {
  // Defensive: use fallback if priority is somehow invalid
  const priorityStyle = PRIORITY_STYLES[document.document_priority] ?? PRIORITY_STYLES.SUPPLEMENTARY
  const PriorityIcon = priorityStyle.icon
  // Defensive: ensure chunk_count is a valid number
  const chunkCount = document.chunk_count ?? 0

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700">
      {/* Document Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <div className="rounded-md border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Document Name */}
        <p
          className="truncate text-sm font-medium text-slate-900 dark:text-slate-100"
          title={document.document_name}
        >
          {document.document_name}
        </p>

        {/* Priority Badge + Chunk Count */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', priorityStyle.badge)}>
            <PriorityIcon className="mr-1 h-3 w-3" />
            {priorityStyle.label[locale]}
          </Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {chunkCount}{' '}
            {locale === 'ru'
              ? chunkCount === 1
                ? 'фрагмент'
                : chunkCount < 5
                  ? 'фрагмента'
                  : 'фрагментов'
              : chunkCount === 1
                ? 'chunk'
                : 'chunks'}
          </span>
        </div>
      </div>
    </div>
  )
})

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * SourceDocumentsPanel - Displays source documents used in lesson generation
 *
 * Shows which documents (and how many chunks from each) contributed to
 * the lesson content via RAG retrieval.
 *
 * Features:
 * - Collapsible panel with document count header
 * - Priority badges (CORE/IMPORTANT/SUPPLEMENTARY)
 * - Chunk count per document
 * - Sorted by priority then chunk count
 */
export const SourceDocumentsPanel = memo(function SourceDocumentsPanel({
  sourceDocuments,
  locale = 'ru',
  className,
}: SourceDocumentsPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  // Labels
  const labels = {
    title: locale === 'ru' ? 'Источники материала' : 'Source Documents',
    subtitle:
      locale === 'ru'
        ? 'Документы, использованные для генерации урока'
        : 'Documents used for lesson generation',
    noDocuments:
      locale === 'ru' ? 'Информация об источниках недоступна' : 'Source information unavailable',
    documentsCount: (count: number) => {
      if (locale === 'ru') {
        if (count === 1) return '1 документ'
        if (count < 5) return `${count} документа`
        return `${count} документов`
      }
      return count === 1 ? '1 document' : `${count} documents`
    },
  }

  // Filter out invalid documents before processing
  // This protects against malformed data from the backend
  const validDocuments = React.useMemo(
    () => sourceDocuments.filter(isValidSourceDocument),
    [sourceDocuments]
  )

  // Sort documents: CORE first, then IMPORTANT, then SUPPLEMENTARY
  // Within each priority, sort by chunk_count descending
  const sortedDocuments = React.useMemo(() => {
    const priorityOrder: Record<SourceDocument['document_priority'], number> = {
      CORE: 0,
      IMPORTANT: 1,
      SUPPLEMENTARY: 2,
    }

    return [...validDocuments].sort((a, b) => {
      const priorityDiff = priorityOrder[a.document_priority] - priorityOrder[b.document_priority]
      if (priorityDiff !== 0) return priorityDiff
      return b.chunk_count - a.chunk_count // Higher chunk count first
    })
  }, [validDocuments])

  // Calculate total chunks (use validated documents)
  const totalChunks = React.useMemo(
    () => validDocuments.reduce((sum, doc) => sum + (doc.chunk_count ?? 0), 0),
    [validDocuments]
  )

  // Empty state - show if no valid documents (either none provided or all invalid)
  if (validDocuments.length === 0) {
    return (
      <div className={cn('py-8 text-center', className)}>
        <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">{labels.noDocuments}</p>
      </div>
    )
  }

  return (
    <Card className={cn('border-slate-200 dark:border-slate-800', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                  <Layers className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">{labels.title}</CardTitle>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {labels.documentsCount(validDocuments.length)} &bull; {totalChunks}{' '}
                    {locale === 'ru' ? 'фрагментов' : 'chunks'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'h-5 w-5 text-slate-400 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2 pr-2">
                {sortedDocuments.map((doc) => (
                  <SourceDocumentItem key={doc.document_id} document={doc} locale={locale} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
})

export default SourceDocumentsPanel
