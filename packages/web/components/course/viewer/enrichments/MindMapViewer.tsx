'use client'

import React, { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { Network, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import type { MindMapEnrichmentContent, MindMapNode } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'
import { toMarkmapNode } from '@/lib/helpers/mindmap-transform'

const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  ),
})

interface MindMapViewerProps {
  content: MindMapEnrichmentContent
}

// Depth-based color palette (Tailwind-inspired, dark mode compatible)
const DEPTH_COLORS: Array<{ bg: string; border: string; text: string }> = [
  {
    bg: 'bg-sky-500',
    border: 'border-sky-600',
    text: 'text-white',
  },
  {
    bg: 'bg-sky-100 dark:bg-sky-900/50',
    border: 'border-sky-300 dark:border-sky-700',
    text: 'text-sky-900 dark:text-sky-100',
  },
  {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-700',
    text: 'text-emerald-900 dark:text-emerald-100',
  },
  {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-900 dark:text-amber-100',
  },
  {
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    border: 'border-rose-200 dark:border-rose-700',
    text: 'text-rose-900 dark:text-rose-100',
  },
]

function getDepthColor(depth: number) {
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)]
}

interface MindMapTreeNodeProps {
  node: MindMapNode
  depth: number
  maxDepth?: number
  expandLabel?: string
  collapseLabel?: string
}

/**
 * Recursive tree node renderer
 * Uses simple indented tree layout for lightweight display.
 */
function MindMapTreeNode({
  node,
  depth,
  maxDepth,
  expandLabel,
  collapseLabel,
}: MindMapTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const colors = getDepthColor(depth)
  const hasChildren = node.children && node.children.length > 0
  const isDepthCapped = maxDepth !== undefined && depth >= maxDepth

  return (
    <div
      className={cn(
        'relative',
        depth > 0 && 'ml-4 border-l border-gray-200 pl-3 dark:border-gray-700'
      )}
    >
      <div className="my-1 flex items-start gap-1.5">
        {/* Expand/collapse toggle */}
        {hasChildren && !isDepthCapped ? (
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={isExpanded ? (collapseLabel ?? 'Collapse') : (expandLabel ?? 'Expand')}
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 text-gray-400 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        ) : (
          <span className="mt-0.5 h-4 w-4 shrink-0" />
        )}

        {/* Node label */}
        <div
          className={cn(
            'rounded-md border px-2 py-1 text-sm font-medium',
            colors.bg,
            colors.border,
            colors.text,
            depth === 0 && 'text-base font-bold'
          )}
        >
          {node.label}
          {node.description && (
            <p className="mt-0.5 text-xs font-normal opacity-75">{node.description}</p>
          )}
        </div>

        {/* Children count badge when collapsed */}
        {hasChildren && !isExpanded && !isDepthCapped && (
          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">
            {node.children!.length}
          </Badge>
        )}
      </div>

      {/* Children (recursive) */}
      {isExpanded && !isDepthCapped && hasChildren && (
        <div>
          {node.children!.map((child, index) => (
            <MindMapTreeNode
              key={`${child.label}-${index}`}
              node={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * MindMapViewer
 *
 * Renders a NotebookLM mind map with:
 * - Compact preview (2 levels) in card context
 * - Full interactive markmap in Dialog (zoom, pan, fold/unfold)
 * - Dark mode support
 */
export function MindMapViewer({ content }: MindMapViewerProps) {
  const t = useTranslations('enrichments')
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const markmapData = useMemo(() => toMarkmapNode(content.root), [content.root])

  // Count first-level children for badge
  const topLevelChildrenCount = content.root.children?.length ?? 0

  return (
    <>
      {/* Compact preview: root + 2 levels */}
      <div className="overflow-hidden rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-800/30 dark:bg-sky-900/10">
        <MindMapTreeNode
          node={content.root}
          depth={0}
          maxDepth={2}
          expandLabel={t('viewer.mindMap.expand')}
          collapseLabel={t('viewer.mindMap.collapse')}
        />
        {topLevelChildrenCount > 0 && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('viewer.mindMap.previewHint', { count: topLevelChildrenCount })}
          </p>
        )}
      </div>

      {/* Footer: stats + view full button */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {content.total_nodes != null && (
            <Badge
              variant="outline"
              className="border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
            >
              <Network className="mr-1 h-3 w-3" />
              {t('viewer.mindMap.nodeCount', { count: content.total_nodes })}
            </Badge>
          )}
          {content.max_depth != null && (
            <Badge
              variant="outline"
              className="border-sky-200 text-sky-600 dark:border-sky-800 dark:text-sky-400"
            >
              {t('viewer.mindMap.depth', { depth: content.max_depth })}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30"
          onClick={() => setIsDialogOpen(true)}
        >
          {t('viewer.mindMap.viewFull')}
        </Button>
      </div>

      {/* Full-screen dialog with interactive markmap */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b pb-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-sky-500" />
                {t('viewer.mindMap.title')}
              </DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t('viewer.close')}</span>
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="min-h-[60vh] flex-1">
            {isDialogOpen && (
              <MarkmapRenderer data={markmapData} fitToViewLabel={t('viewer.mindMap.fitToView')} />
            )}
          </div>

          <p className="text-muted-foreground shrink-0 border-t pt-2 text-center text-xs">
            {t('viewer.mindMap.interactionHint')}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
