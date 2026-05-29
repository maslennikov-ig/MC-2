'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpDown, Search, X } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useRouter } from '@/src/i18n/navigation'

export interface CatalogSelectOption {
  value: string
  label: string
}

export interface CatalogSelectFilter {
  key: string
  value: string
  label: string
  options: CatalogSelectOption[]
  widthClassName?: string
  icon?: LucideIcon
  ariaLabel?: string
}

export interface CatalogToggleFilter {
  key: string
  label: string
  active: boolean
  activeValue?: string
  icon?: LucideIcon
}

interface CatalogFiltersProps {
  basePath: string
  initialSearch?: string
  searchPlaceholder: string
  loadingLabel: string
  resultsLabel?: string
  totalCount?: number
  selectFilters?: CatalogSelectFilter[]
  sortFilter?: CatalogSelectFilter
  toggles?: CatalogToggleFilter[]
  className?: string
}

export function CatalogFilters({
  basePath,
  className,
  initialSearch = '',
  loadingLabel,
  resultsLabel,
  searchPlaceholder,
  selectFilters = [],
  sortFilter,
  toggles = [],
  totalCount,
}: CatalogFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(initialSearch)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setSearch(initialSearch)
  }, [initialSearch])

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      params.delete('page')
      params.delete('cursor')

      const query = params.toString()
      startTransition(() => {
        router.push(query ? `${basePath}?${query}` : basePath)
      })
    },
    [basePath, router, searchParams]
  )

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateFilters({ search: value })
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    debouncedSearch(value)
  }

  const clearSearch = () => {
    setSearch('')
    updateFilters({ search: '' })
  }

  const renderSelect = (filter: CatalogSelectFilter, fallbackWidth = 'sm:w-[180px]') => {
    const Icon = filter.icon

    if (!mounted) {
      return <Skeleton key={filter.key} className={cn('h-10 w-full rounded-lg', fallbackWidth)} />
    }

    return (
      <Select
        key={filter.key}
        value={filter.value}
        onValueChange={(value) => updateFilters({ [filter.key]: value })}
        disabled={isPending}
      >
        <SelectTrigger
          className={cn(
            'w-full border-gray-300 bg-white text-gray-900 transition-colors duration-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white',
            filter.widthClassName ?? fallbackWidth
          )}
          aria-label={filter.ariaLabel ?? filter.label}
        >
          {Icon ? (
            <Icon className="mr-2 h-4 w-4" aria-hidden />
          ) : filter === sortFilter ? (
            <ArrowUpDown className="mr-2 h-4 w-4" aria-hidden />
          ) : null}
          <SelectValue placeholder={filter.label} />
        </SelectTrigger>
        <SelectContent className="border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {filter.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className={cn('mb-6 space-y-3', className)}>
      <div className="flex flex-col items-center gap-4 lg:flex-row">
        <div className="relative max-w-md flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="border-gray-300 bg-white pr-10 pl-10 text-gray-900 transition-colors duration-200 placeholder:text-gray-500 focus:border-purple-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-purple-500"
            disabled={isPending}
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 text-gray-400 transition-colors duration-200 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">{searchPlaceholder}</span>
            </Button>
          ) : null}
        </div>

        {selectFilters.map((filter) => renderSelect(filter))}
        {sortFilter ? renderSelect(sortFilter, 'sm:w-[200px]') : null}

        {toggles.map((toggle) => {
          const Icon = toggle.icon
          const activeValue = toggle.activeValue ?? 'true'
          return (
            <Button
              key={toggle.key}
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-gray-300 bg-white text-gray-900 shadow-sm transition-colors duration-200 hover:border-gray-400 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:hover:border-slate-600 dark:hover:bg-slate-800"
              disabled={isPending}
              onClick={() => updateFilters({ [toggle.key]: toggle.active ? '' : activeValue })}
            >
              {Icon ? (
                <Icon
                  className={cn('mr-2 h-4 w-4', toggle.active && 'fill-red-500 text-red-500')}
                  aria-hidden
                />
              ) : null}
              {toggle.label}
            </Button>
          )
        })}

        {resultsLabel || totalCount !== undefined ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 transition-colors duration-200 dark:text-gray-400">
              {resultsLabel ?? totalCount}
            </span>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <div className="text-sm text-gray-600 transition-colors duration-200 dark:text-gray-400">
          {loadingLabel}
        </div>
      ) : null}
    </div>
  )
}
