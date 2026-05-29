'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Filter, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CatalogGridEmptyState {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
}

interface CatalogGridLoadMore {
  hasMore: boolean
  isLoading: boolean
  label: string
  loadingLabel: string
  onLoadMore: () => void
}

interface CatalogGridProps<TItem> {
  items: TItem[]
  getKey: (item: TItem, index: number) => string
  renderItem: (item: TItem, index: number) => ReactNode
  emptyState?: CatalogGridEmptyState
  loadMore?: CatalogGridLoadMore
  columnsClassName?: string
  className?: string
}

export function CatalogGrid<TItem>({
  className,
  columnsClassName,
  emptyState,
  getKey,
  items,
  loadMore,
  renderItem,
}: CatalogGridProps<TItem>) {
  if (items.length === 0 && emptyState) {
    const EmptyIcon = emptyState.icon ?? Filter
    return (
      <div className={className}>
        <div className="py-12 text-center">
          <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <EmptyIcon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
              {emptyState.title}
            </h2>
            {emptyState.description ? (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {emptyState.description}
              </p>
            ) : null}
            {emptyState.action ? <div className="mt-5">{emptyState.action}</div> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'mb-8 grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
          columnsClassName
        )}
      >
        {items.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>

      {loadMore?.hasMore ? (
        <div className="flex justify-center gap-2">
          <Button
            onClick={loadMore.onLoadMore}
            disabled={loadMore.isLoading}
            variant="outline"
            size="lg"
            className="border-gray-300 bg-white text-gray-900 transition-colors duration-200 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:hover:bg-slate-800"
          >
            {loadMore.isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {loadMore.loadingLabel}
              </>
            ) : (
              loadMore.label
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
