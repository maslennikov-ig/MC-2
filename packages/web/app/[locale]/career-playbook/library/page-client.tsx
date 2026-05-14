'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookCopy, Plus, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  deleteCareerPlaybookMany,
  fetchCareerPlaybookLibraryPage,
} from '@/components/career-playbook/library/client-adapter'
import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryItem,
} from '@/components/career-playbook/library/types'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookLibraryPageClientProps {
  locale: Locale
  initialData: CareerPlaybookLibraryData
}

const EMPTY_ITEMS: CareerPlaybookLibraryItem[] = []

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function getStatusTone(status: CareerPlaybookLibraryItem['status']) {
  if (status === 'completed')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
  if (status === 'generating')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
  if (status === 'failed') return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
  return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export default function CareerPlaybookLibraryPageClient({
  locale,
  initialData,
}: CareerPlaybookLibraryPageClientProps) {
  const t = useTranslations('career-playbook.library')
  const [items, setItems] = useState<CareerPlaybookLibraryItem[]>(initialData.items ?? EMPTY_ITEMS)
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  const departmentOptions = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.department).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b, locale)
      ),
    [items, locale]
  )

  const levelOptions = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.level).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b, locale)
      ),
    [items, locale]
  )

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const searchLower = search.trim().toLowerCase()
        const matchesSearch =
          searchLower.length === 0 ||
          item.title.toLowerCase().includes(searchLower) ||
          (item.department ?? '').toLowerCase().includes(searchLower)
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter
        const matchesDepartment = departmentFilter === 'all' || item.department === departmentFilter
        const matchesLevel = levelFilter === 'all' || item.level === levelFilter
        return matchesSearch && matchesStatus && matchesDepartment && matchesLevel
      }),
    [departmentFilter, items, levelFilter, search, statusFilter]
  )

  const handleToggleSelection = (playbookId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(playbookId)
      } else {
        next.delete(playbookId)
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || isDeleting) return
    setIsDeleting(true)
    try {
      const { deletedIds } = await deleteCareerPlaybookMany(Array.from(selectedIds), locale)
      const deletedSet = new Set(deletedIds)
      setItems((prev) => prev.filter((item) => !deletedSet.has(item.id)))
      setSelectedIds(new Set())
    } finally {
      setIsDeleting(false)
    }
  }

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    setLoadMoreError(null)

    try {
      const page = await fetchCareerPlaybookLibraryPage({
        locale,
        cursor: nextCursor,
        limit: 50,
        search: search.trim().length > 0 ? search.trim() : undefined,
      })

      if (page.error) {
        setLoadMoreError(page.error)
        return
      }

      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const newItems = page.items.filter((item) => !existingIds.has(item.id))
        return [...prev, ...newItems]
      })
      setNextCursor(page.nextCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-8 md:px-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('subtitle')}</p>
          </div>
          <Button asChild className="rounded-md">
            <Link href={`/${locale}/career-playbook/new`}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('createNew')}
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        {initialData.error || loadMoreError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/50 dark:bg-rose-950/30">
            <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-100">
              {t('errorTitle')}
            </h2>
            <p className="mt-2 text-sm text-rose-700 dark:text-rose-200">{t('errorDescription')}</p>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('searchPlaceholder')}
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            {t('filters.all')}
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label={t('filters.all')}
            >
              <option value="all">{t('filters.all')}</option>
              <option value="completed">{t('filters.completed')}</option>
              <option value="generating">{t('filters.generating')}</option>
              <option value="failed">{t('filters.failed')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            {t('filters.department')}
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label={t('filters.department')}
            >
              <option value="all">{t('filters.departmentAll')}</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            {t('filters.level')}
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              aria-label={t('filters.level')}
            >
              <option value="all">{t('filters.levelAll')}</option>
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-sm font-medium">
              {t('selectedCount', { count: selectedIds.size })}
            </span>
            <Button
              type="button"
              variant="destructive"
              className="rounded-md"
              onClick={() => {
                void handleBulkDelete()
              }}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {isDeleting ? t('deleting') : t('bulkDelete')}
            </Button>
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <BookCopy className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">{t('emptyTitle')}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const isChecked = selectedIds.has(item.id)
              return (
                <article
                  key={item.id}
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        handleToggleSelection(item.id, Boolean(checked))
                      }
                      aria-label={item.title}
                    />
                    <Badge className={getStatusTone(item.status)}>{item.status}</Badge>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {formatDate(item.createdAt, locale)}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <Badge variant="secondary">
                      {item.isPublic ? t('card.publicBadge') : t('card.privateBadge')}
                    </Badge>
                    {item.level ? <Badge variant="outline">{item.level}</Badge> : null}
                    {item.department ? <Badge variant="outline">{item.department}</Badge> : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={() => {
                void handleLoadMore()
              }}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? t('loadingMore') : t('loadMore')}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
