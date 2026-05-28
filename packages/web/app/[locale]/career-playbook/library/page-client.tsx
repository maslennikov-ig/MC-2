'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  BookCopy,
  BookOpen,
  BookOpenCheck,
  FileText,
  Link2,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  deleteCareerPlaybookMany,
  fetchCareerPlaybookLibraryPage,
  toggleCareerPlaybookShare,
} from '@/components/career-playbook/library/client-adapter'
import { CareerPlaybookWorkspace } from '@/components/career-playbook/layout/document-workspace'
import Header from '@/components/layouts/header'
import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryItem,
} from '@/components/career-playbook/library/types'
import { CreateCourseFromPlaybookDialog } from '@/components/career-playbook/viewer/CreateCourseFromPlaybookDialog'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookLibraryPageClientProps {
  locale: Locale
  initialData: CareerPlaybookLibraryData
}

const EMPTY_ITEMS: CareerPlaybookLibraryItem[] = []
const STATUS_OPTIONS: CareerPlaybookLibraryItem['status'][] = [
  'draft',
  'answering_fixed',
  'awaiting_followups',
  'answering_followups',
  'ready_to_generate',
  'generating',
  'completed',
  'failed',
]

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

function readShareToggleResult(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const playbookId = typeof record.playbookId === 'string' ? record.playbookId : null
  const isPublic = typeof record.isPublic === 'boolean' ? record.isPublic : null
  const shareSlug = typeof record.shareSlug === 'string' ? record.shareSlug : null

  if (!playbookId || isPublic === null) return null

  return {
    playbookId,
    isPublic,
    shareSlug,
  }
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
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set())
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

  const handleShareToggle = async (item: CareerPlaybookLibraryItem) => {
    if (sharingIds.has(item.id)) return
    const nextIsPublic = !item.isPublic

    setSharingIds((prev) => new Set(prev).add(item.id))
    setLoadMoreError(null)

    try {
      const result = readShareToggleResult(
        await toggleCareerPlaybookShare(item.id, nextIsPublic, locale)
      )

      if (!result) {
        setLoadMoreError(t('errorDescription'))
        return
      }

      setItems((prev) =>
        prev.map((current) =>
          current.id === result.playbookId
            ? {
                ...current,
                isPublic: result.isPublic,
                shareSlug: result.shareSlug,
              }
            : current
        )
      )
    } catch {
      setLoadMoreError(t('errorDescription'))
    } finally {
      setSharingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
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
    <>
      <Header sticky surface="glass" />
      <main className="career-playbook-zone" data-testid="career-playbook-library-shell">
        <section className="career-playbook-topbar">
          <div className="mx-auto flex w-full max-w-[1760px] flex-col justify-between gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
                <FileText className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
                {t('productLabel')}
              </span>
              <h1 className="text-[30px] leading-10 font-semibold">{t('title')}</h1>
              <p className="max-w-3xl text-[16px] leading-7 text-slate-600 dark:text-slate-300">
                {t('subtitle')}
              </p>
            </div>
            <Button asChild className="rounded-md">
              <Link href={`/${locale}/career-playbook/new`}>
                <Plus className="h-4 w-4" aria-hidden />
                {t('createNew')}
              </Link>
            </Button>
          </div>
        </section>

        <CareerPlaybookWorkspace className="space-y-5">
          {initialData.error || loadMoreError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/50 dark:bg-rose-950/30">
              <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-100">
                {t('errorTitle')}
              </h2>
              <p className="mt-2 text-sm text-rose-700 dark:text-rose-200">
                {t('errorDescription')}
              </p>
            </div>
          ) : null}

          <div className="career-playbook-panel grid gap-3 p-4 md:grid-cols-[minmax(16rem,1fr)_180px_180px_180px]">
            <div className="relative self-end">
              <span className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 items-center text-slate-400">
                <Search className="h-4 w-4" aria-hidden />
              </span>
              <Input
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="h-11 bg-[#fffdf8] pl-9 dark:bg-slate-950"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
              {t('filters.all')}
              <select
                className="h-11 rounded-md border border-[#d8c5aa] bg-[#fffdf8] px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label={t('filters.all')}
              >
                <option value="all">{t('filters.all')}</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {t(`statusLabels.${status}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
              {t('filters.department')}
              <select
                className="h-11 rounded-md border border-[#d8c5aa] bg-[#fffdf8] px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
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
                className="h-11 rounded-md border border-[#d8c5aa] bg-[#fffdf8] px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
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
            <div className="career-playbook-panel flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">
                {t('selectedCount', { count: selectedIds.size })}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-md"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {isDeleting ? t('deleting') : t('bulkDelete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('deleteDialog.description', { count: selectedIds.size })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {t('deleteDialog.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                      onClick={() => {
                        void handleBulkDelete()
                      }}
                    >
                      {t('deleteDialog.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}

          {filteredItems.length === 0 ? (
            <div className="career-playbook-document p-10 text-center">
              <BookCopy className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold">{t('emptyTitle')}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {t('emptyDescription')}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((item) => {
                const isChecked = selectedIds.has(item.id)
                const isShareable = item.status === 'completed'
                const shareHref =
                  item.isPublic && item.shareSlug
                    ? `/${locale}/share/career-playbook/${item.shareSlug}`
                    : null
                return (
                  <article key={item.id} className="career-playbook-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleToggleSelection(item.id, Boolean(checked))
                        }
                        aria-label={item.title}
                      />
                      <Badge className={getStatusTone(item.status)}>
                        {t(`statusLabels.${item.status}`)}
                      </Badge>
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
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        disabled={!isShareable || sharingIds.has(item.id)}
                        onClick={() => {
                          void handleShareToggle(item)
                        }}
                      >
                        <Share2 className="h-4 w-4" aria-hidden />
                        {item.isPublic ? t('card.makePrivate') : t('card.makePublic')}
                      </Button>
                      {shareHref ? (
                        <Button asChild variant="ghost" size="sm" className="rounded-md">
                          <Link href={shareHref}>
                            <Link2 className="h-4 w-4" aria-hidden />
                            {t('card.publicLink')}
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="ghost" size="sm" className="rounded-md">
                        <Link
                          href={`/${locale}/career-playbook/${item.id}`}
                          aria-label={`${t('card.open')} ${item.title}`}
                        >
                          <BookOpen className="h-4 w-4" aria-hidden />
                          {t('card.open')}
                        </Link>
                      </Button>
                      {item.status === 'completed' ? (
                        <CreateCourseFromPlaybookDialog
                          playbookId={item.id}
                          trigger={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-md"
                            >
                              <BookOpenCheck className="h-4 w-4" aria-hidden />
                              {t('card.createCourse')}
                            </Button>
                          }
                        />
                      ) : null}
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
        </CareerPlaybookWorkspace>
      </main>
    </>
  )
}
