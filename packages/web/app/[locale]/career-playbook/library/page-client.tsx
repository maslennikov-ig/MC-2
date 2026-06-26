'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import {
  BookCopy,
  BookOpen,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  GitBranch,
  Globe,
  Link2,
  Loader2,
  Lock,
  Plus,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CatalogActionButton } from '@/components/catalog/catalog-action-button'
import { CatalogFilters } from '@/components/catalog/catalog-filters'
import { CatalogGrid } from '@/components/catalog/catalog-grid'
import { CatalogStatistics } from '@/components/catalog/catalog-statistics'
import {
  deleteCareerPlaybook,
  fetchCareerPlaybookLibraryPage,
  updateCareerPlaybookVisibility,
} from '@/components/career-playbook/library/client-adapter'
import {
  buildCareerPlaybookPublicPath,
  buildCareerPlaybookPublicUrl,
} from '@/components/career-playbook/library/public-url'
import { buildCareerPlaybookLinkedCoursePath } from '@/components/career-playbook/library/linked-course-url'
import { CareerPlaybookWorkspace } from '@/components/career-playbook/layout/document-workspace'
import Header from '@/components/layouts/header'
import { ImageSkeleton } from '@/components/ui/image-skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryFilters,
  CareerPlaybookLibraryItem,
  CareerPlaybookLibraryStatus,
  CareerPlaybookVisibility,
  CareerPlaybookViewerPermissions,
} from '@/components/career-playbook/library/types'
import { CreateCourseFromPlaybookDialog } from '@/components/career-playbook/viewer/CreateCourseFromPlaybookDialog'
import { copyToClipboard } from '@/lib/utils/clipboard'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookLibraryPageClientProps {
  locale: Locale
  initialData: CareerPlaybookLibraryData
  filters: CareerPlaybookLibraryFilters
}

const EMPTY_ITEMS: CareerPlaybookLibraryItem[] = []
const STATUS_OPTIONS: CareerPlaybookLibraryStatus[] = [
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

const visibilityConfig: Record<
  CareerPlaybookVisibility,
  {
    color: string
    icon: ComponentType<{ className?: string }>
  }
> = {
  private: {
    color:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: Lock,
  },
  organization: {
    color:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-100',
    icon: Building2,
  },
  public: {
    color:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100',
    icon: Globe,
  },
}

const visibilityOptions = Object.keys(visibilityConfig) as CareerPlaybookVisibility[]

function readViewerPermissions(value: unknown): CareerPlaybookViewerPermissions | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const canEdit = typeof record.canEdit === 'boolean' ? record.canEdit : null
  const canManageVisibility =
    typeof record.canManageVisibility === 'boolean' ? record.canManageVisibility : null
  const canCreateCourse =
    typeof record.canCreateCourse === 'boolean' ? record.canCreateCourse : null
  const canDelete = typeof record.canDelete === 'boolean' ? record.canDelete : null

  if (
    canEdit === null ||
    canManageVisibility === null ||
    canCreateCourse === null ||
    canDelete === null
  ) {
    return null
  }

  return {
    canEdit,
    canManageVisibility,
    canCreateCourse,
    canDelete,
  }
}

function readVisibilityResult(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const playbookId = typeof record.playbookId === 'string' ? record.playbookId : null
  const isPublic = typeof record.isPublic === 'boolean' ? record.isPublic : null
  const visibility: CareerPlaybookVisibility | null =
    record.visibility === 'private' ||
    record.visibility === 'organization' ||
    record.visibility === 'public'
      ? record.visibility
      : null
  const shareSlug = typeof record.shareSlug === 'string' ? record.shareSlug : null
  const organizationSlug =
    typeof record.organizationSlug === 'string' ? record.organizationSlug : null

  if (!playbookId || isPublic === null || !visibility) return null

  return {
    playbookId,
    isPublic,
    visibility,
    shareSlug,
    organizationSlug,
    viewerPermissions: readViewerPermissions(record.viewerPermissions),
  }
}

function buildFacetOptions(items: CareerPlaybookLibraryItem[], values: string[] | undefined) {
  if (values && values.length > 0) return values
  return Array.from(new Set(items.map((item) => item.department).filter(Boolean) as string[])).sort(
    (a, b) => a.localeCompare(b)
  )
}

function buildLevelOptions(items: CareerPlaybookLibraryItem[], values: string[] | undefined) {
  if (values && values.length > 0) return values
  return Array.from(new Set(items.map((item) => item.level).filter(Boolean) as string[])).sort(
    (a, b) => a.localeCompare(b)
  )
}

function defaultStatistics(items: CareerPlaybookLibraryItem[]) {
  return {
    totalCount: items.length,
    completedCount: items.filter((item) => item.status === 'completed').length,
    inProgressCount: items.filter((item) =>
      [
        'answering_fixed',
        'awaiting_followups',
        'answering_followups',
        'ready_to_generate',
        'generating',
      ].includes(item.status)
    ).length,
    publicCount: items.filter((item) => item.isPublic).length,
  }
}

function CareerPlaybookCardImage({ item }: { item: CareerPlaybookLibraryItem }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const hasImage = item.imageStatus === 'completed' && Boolean(item.imageUrl)
  const alt = item.imageAltText ?? `Role Guide image: ${item.title}`

  return (
    <div
      className="relative mb-4 aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
      aria-busy={hasImage && !isLoaded && !hasError}
    >
      {hasImage ? (
        <>
          {!isLoaded && !hasError ? <ImageSkeleton gradient /> : null}
          {hasError ? (
            <ImageSkeleton
              icon={<FileText className="h-12 w-12 text-slate-400 dark:text-slate-700" />}
              className="animate-none bg-slate-100 dark:bg-slate-900"
            />
          ) : null}
          <Image
            src={item.imageUrl as string}
            alt={alt}
            fill
            unoptimized
            className={`object-cover transition-opacity duration-300 ${
              isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
            }`}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
          />
        </>
      ) : (
        <ImageSkeleton
          icon={<FileText className="h-12 w-12 text-slate-400 dark:text-slate-700" />}
          className="animate-none bg-slate-100 dark:bg-slate-900"
        />
      )}
    </div>
  )
}

export default function CareerPlaybookLibraryPageClient({
  filters,
  initialData,
  locale,
}: CareerPlaybookLibraryPageClientProps) {
  const t = useTranslations('career-playbook.library')
  const tc = useTranslations('common')
  const [items, setItems] = useState<CareerPlaybookLibraryItem[]>(initialData.items ?? EMPTY_ITEMS)
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [visibilityUpdatingIds, setVisibilityUpdatingIds] = useState<Set<string>>(new Set())
  const [publicLinkMessages, setPublicLinkMessages] = useState<Record<string, 'success' | 'error'>>(
    {}
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  useEffect(() => {
    setItems(initialData.items ?? EMPTY_ITEMS)
    setNextCursor(initialData.nextCursor)
    setDeletingIds(new Set())
    setVisibilityUpdatingIds(new Set())
    setPublicLinkMessages({})
  }, [initialData])

  const statistics = initialData.statistics ?? defaultStatistics(items)
  const totalCount = initialData.totalCount ?? items.length

  const statusOptions = initialData.facets?.statuses?.length
    ? initialData.facets.statuses
    : STATUS_OPTIONS
  const departmentOptions = useMemo(
    () => buildFacetOptions(items, initialData.facets?.departments),
    [initialData.facets?.departments, items]
  )
  const levelOptions = useMemo(
    () => buildLevelOptions(items, initialData.facets?.levels),
    [initialData.facets?.levels, items]
  )

  const handleDeleteItem = async (item: CareerPlaybookLibraryItem) => {
    if (deletingIds.has(item.id)) return

    setDeletingIds((prev) => new Set(prev).add(item.id))
    setLoadMoreError(null)

    try {
      const { deletedId } = await deleteCareerPlaybook(item.id, locale)
      setItems((prev) => prev.filter((current) => current.id !== deletedId))
    } catch {
      setLoadMoreError(t('errorDescription'))
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleVisibilityChange = async (
    item: CareerPlaybookLibraryItem,
    visibility: CareerPlaybookVisibility
  ) => {
    const currentVisibility = item.visibility ?? (item.isPublic ? 'public' : 'private')
    if (visibilityUpdatingIds.has(item.id) || visibility === currentVisibility) return

    setVisibilityUpdatingIds((prev) => new Set(prev).add(item.id))
    setLoadMoreError(null)

    try {
      const result = readVisibilityResult(
        await updateCareerPlaybookVisibility(item.id, visibility, locale)
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
                visibility: result.visibility,
                shareSlug: result.shareSlug,
                organizationSlug: result.organizationSlug ?? current.organizationSlug ?? null,
                viewerPermissions: result.viewerPermissions ?? current.viewerPermissions,
              }
            : current
        )
      )
    } catch {
      setLoadMoreError(t('errorDescription'))
    } finally {
      setVisibilityUpdatingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const handleCopyPublicLink = async (item: CareerPlaybookLibraryItem) => {
    const url = buildCareerPlaybookPublicUrl(locale, item.organizationSlug, item.shareSlug)
    if (!url) {
      setPublicLinkMessages((prev) => ({ ...prev, [item.id]: 'error' }))
      return
    }

    const copied = await copyToClipboard(url)
    setPublicLinkMessages((prev) => ({ ...prev, [item.id]: copied ? 'success' : 'error' }))
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
        search: filters.search,
        status: filters.status,
        department: filters.department,
        level: filters.level,
        sort: filters.sort,
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

  const renderLibraryCard = (item: CareerPlaybookLibraryItem) => {
    const isDeleting = deletingIds.has(item.id)
    const isUpdatingVisibility = visibilityUpdatingIds.has(item.id)
    const isShareable = item.status === 'completed'
    const visibility = item.visibility ?? (item.isPublic ? 'public' : 'private')
    const permissions = item.viewerPermissions ?? {
      canEdit: true,
      canManageVisibility: true,
      canCreateCourse: true,
      canDelete: true,
    }
    const linkedCourseHref = buildCareerPlaybookLinkedCoursePath(locale, item.linkedCourse)
    const canEdit = permissions.canEdit
    const canManageVisibility = permissions.canManageVisibility
    const canCreateCourse =
      permissions.canCreateCourse && item.status === 'completed' && !linkedCourseHref
    const canDelete = permissions.canDelete
    const currentVisibility = visibilityConfig[visibility]
    const VisibilityIcon = currentVisibility.icon
    const shareHref =
      canManageVisibility && visibility === 'public'
        ? buildCareerPlaybookPublicPath(locale, item.organizationSlug, item.shareSlug)
        : null
    const publicLinkMessage = publicLinkMessages[item.id]
    const builderHref = `/${locale}/career-playbook/new?resume=${encodeURIComponent(item.id)}`

    return (
      <article className="career-playbook-panel flex h-full flex-col p-4">
        <CareerPlaybookCardImage item={item} />
        <div className="flex items-start justify-between gap-3">
          {canManageVisibility ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1.5 rounded-md border px-2.5 text-xs ${currentVisibility.color}`}
                  disabled={isUpdatingVisibility}
                  aria-label={`${tc('visibility.label')}: ${tc(`visibility.${visibility}`)}`}
                >
                  {isUpdatingVisibility ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <VisibilityIcon className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {tc(`visibility.${visibility}`)}
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {visibilityOptions.map((option) => {
                  const config = visibilityConfig[option]
                  const OptionIcon = config.icon
                  const disabled = option === 'public' && !isShareable
                  return (
                    <DropdownMenuItem
                      key={option}
                      disabled={disabled}
                      className="cursor-pointer gap-2"
                      onClick={() => void handleVisibilityChange(item, option)}
                    >
                      <OptionIcon className="h-4 w-4" aria-hidden />
                      {tc(`visibility.${option}`)}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`rounded-md border ${currentVisibility.color}`}>
                <VisibilityIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
                {tc(`visibility.${visibility}`)}
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {t('card.readonlyBadge')}
              </Badge>
            </div>
          )}
          <Badge className={getStatusTone(item.status)}>{t(`statusLabels.${item.status}`)}</Badge>
        </div>
        <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {formatDate(item.createdAt, locale)}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs">
          {item.level ? <Badge variant="outline">{item.level}</Badge> : null}
          {item.department ? <Badge variant="outline">{item.department}</Badge> : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-1">
            {shareHref ? (
              <>
                <CatalogActionButton
                  label={t('card.publicLink')}
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  <Link href={shareHref}>
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{t('card.publicLink')}</span>
                  </Link>
                </CatalogActionButton>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      aria-label={t('card.copyPublicLink')}
                      onClick={() => void handleCopyPublicLink(item)}
                    >
                      <Share2 className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{t('card.copyPublicLink')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('card.copyPublicLink')}</p>
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
            {canEdit ? (
              <CatalogActionButton
                label={t('card.openBuilder')}
                className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
              >
                <Link href={builderHref}>
                  <GitBranch className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">{t('card.openBuilder')}</span>
                </Link>
              </CatalogActionButton>
            ) : null}
            {canDelete ? (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                        disabled={isDeleting}
                        aria-label={t('card.delete')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="sr-only">{t('card.delete')}</span>
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('card.delete')}</p>
                  </TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('deleteDialog.description', { title: item.title })}
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
                        void handleDeleteItem(item)
                      }}
                    >
                      {t('deleteDialog.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {linkedCourseHref ? (
              <Button asChild variant="outline" size="sm" className="rounded-md">
                <Link href={linkedCourseHref}>
                  <BookOpenCheck className="h-4 w-4" aria-hidden />
                  {t('card.openCourse')}
                </Link>
              </Button>
            ) : null}
            {canCreateCourse ? (
              <CreateCourseFromPlaybookDialog
                playbookId={item.id}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="rounded-md">
                    <BookOpenCheck className="h-4 w-4" aria-hidden />
                    {t('card.createCourse')}
                  </Button>
                }
              />
            ) : null}
            <Button asChild variant="default" size="sm" className="rounded-md">
              <Link
                href={`/${locale}/career-playbook/${item.id}`}
                aria-label={`${t('card.open')} ${item.title}`}
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                {t('card.open')}
              </Link>
            </Button>
          </div>
        </div>
        {publicLinkMessage ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" role="status">
            {t(
              publicLinkMessage === 'success' ? 'card.publicLinkCopied' : 'card.publicLinkCopyError'
            )}
          </p>
        ) : null}
      </article>
    )
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
              <Link href={`/${locale}/career-playbook/new?fresh=1`}>
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

          <CatalogStatistics
            title={t('statistics.title')}
            items={[
              {
                id: 'total',
                label: t('statistics.total'),
                value: statistics.totalCount,
                icon: BookCopy,
                tone: 'purple',
              },
              {
                id: 'completed',
                label: t('statistics.completed'),
                value: statistics.completedCount,
                icon: CheckCircle2,
                tone: 'green',
              },
              {
                id: 'progress',
                label: t('statistics.inProgress'),
                value: statistics.inProgressCount,
                icon: Clock3,
                tone: 'amber',
              },
              {
                id: 'public',
                label: t('statistics.public'),
                value: statistics.publicCount,
                icon: Share2,
                tone: 'blue',
              },
            ]}
          />

          <div className="career-playbook-panel p-4">
            <CatalogFilters
              basePath="/career-playbook/library"
              initialSearch={filters.search ?? ''}
              loadingLabel={t('loadingMore')}
              resultsLabel={t('resultsCount', { count: items.length, total: totalCount })}
              searchPlaceholder={t('searchPlaceholder')}
              totalCount={totalCount}
              selectFilters={[
                {
                  key: 'status',
                  value: filters.status ?? 'all',
                  label: t('filters.all'),
                  options: [
                    { value: 'all', label: t('filters.all') },
                    ...statusOptions.map((status) => ({
                      value: status,
                      label: t(`statusLabels.${status}`),
                    })),
                  ],
                },
                {
                  key: 'department',
                  value: filters.department ?? 'all',
                  label: t('filters.department'),
                  options: [
                    { value: 'all', label: t('filters.departmentAll') },
                    ...departmentOptions.map((department) => ({
                      value: department,
                      label: department,
                    })),
                  ],
                },
                {
                  key: 'level',
                  value: filters.level ?? 'all',
                  label: t('filters.level'),
                  options: [
                    { value: 'all', label: t('filters.levelAll') },
                    ...levelOptions.map((level) => ({
                      value: level,
                      label: level,
                    })),
                  ],
                },
              ]}
              sortFilter={{
                key: 'sort',
                value: filters.sort,
                label: t('sort'),
                options: [
                  { value: 'created_desc', label: t('sortOptions.created_desc') },
                  { value: 'created_asc', label: t('sortOptions.created_asc') },
                  { value: 'title_asc', label: t('sortOptions.title_asc') },
                  { value: 'title_desc', label: t('sortOptions.title_desc') },
                ],
              }}
            />
          </div>

          <TooltipProvider delayDuration={120}>
            <CatalogGrid
              items={items}
              getKey={(item) => item.id}
              renderItem={renderLibraryCard}
              columnsClassName="gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3"
              emptyState={{
                title: t('emptyTitle'),
                description: t('emptyDescription'),
                icon: BookCopy,
              }}
              loadMore={{
                hasMore: Boolean(nextCursor),
                isLoading: isLoadingMore,
                label: t('loadMore'),
                loadingLabel: t('loadingMore'),
                onLoadMore: () => {
                  void handleLoadMore()
                },
              }}
            />
          </TooltipProvider>
        </CareerPlaybookWorkspace>
      </main>
    </>
  )
}
