'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  FileSearch,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  CareerPlaybookBusinessContext,
  CareerPlaybookBusinessContextDigest,
  CareerPlaybookBusinessContextSourceSummary,
  TierKey,
} from '@megacampus/shared-types'

import {
  FileUpload,
  type UploadedFile,
  type FileUploadStatus,
} from '@/components/forms/file-upload'
import { CareerPlaybookDocumentShell } from '@/components/career-playbook/layout/document-workspace'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type DigestCategoryKey =
  | 'product'
  | 'customers'
  | 'sales_channels'
  | 'processes'
  | 'metrics'
  | 'org_structure'
  | 'constraints'

export interface BusinessContextCategoryCopy {
  key: DigestCategoryKey
  title: string
  helper: string
  placeholder: string
  hints: string[]
}

export interface BusinessContextStepCopy {
  navigationLabel?: string
  documentLabel?: string
  title?: string
  description?: string
  empty?: string
  panelTitle?: string
  panelDescription?: string
  filesTitle?: string
  filesDescription?: string
  uploadMissingSession?: string
  uploadMaxFilesTemplate?: string
  uploadPending?: string
  uploadedSources?: string
  sourceCountTemplate?: string
  sourceStatusUploaded?: string
  sourceStatusProcessing?: string
  sourceStatusReady?: string
  sourceStatusFailed?: string
  sourceStatusRemoved?: string
  sourceTextFallback?: string
  removeSourceTemplate?: string
  missingTitle?: string
  missingEmpty?: string
  back?: string
  continue?: string
  universal?: string
  universalDescription?: string
  uploading?: string
  categories?: BusinessContextCategoryCopy[]
}

interface BusinessContextStepProps {
  playbookId: string | null
  context: CareerPlaybookBusinessContext
  sources?: CareerPlaybookBusinessContextSourceSummary[]
  onContextChange: (context: CareerPlaybookBusinessContext) => void
  onRemoveSource?: (sourceId: string) => Promise<unknown> | void
  onSourceUploaded?: (source: CareerPlaybookBusinessContextSourceSummary) => void
  onBack: () => void
  onContinue: () => Promise<void> | void
  onUniversal: () => Promise<void> | void
  isSaving?: boolean
  tier?: TierKey
  copy?: BusinessContextStepCopy
}

const defaultCategories: BusinessContextCategoryCopy[] = [
  {
    key: 'product',
    title: 'Продукт',
    helper: 'Что продаёте или поставляете, в чём ценность предложения.',
    placeholder: 'Например: B2B SaaS для автоматизации обучения, внедрение за 4-6 недель...',
    hints: ['коммерческое предложение', 'описание продукта', 'презентация продукта'],
  },
  {
    key: 'customers',
    title: 'Клиенты',
    helper: 'Кто покупает, кто использует, какие сегменты и боли важны.',
    placeholder: 'Например: HRD и руководители учебных центров в компаниях 500+ сотрудников...',
    hints: ['ICP', 'портрет клиента', 'исследования клиентов'],
  },
  {
    key: 'sales_channels',
    title: 'Продажи и каналы',
    helper: 'Как находите клиентов, как устроена воронка и цикл сделки.',
    placeholder: 'Например: outbound, партнёры, тендеры; цикл сделки 2-4 месяца...',
    hints: ['регламенты продаж', 'воронка', 'скрипты', 'каналы'],
  },
  {
    key: 'processes',
    title: 'Процессы',
    helper: 'Регламенты, повторяющиеся процессы, handoff между ролями.',
    placeholder: 'Например: лид передаётся SDR -> AE -> implementation manager...',
    hints: ['SOP', 'регламенты отдела', 'процессные карты'],
  },
  {
    key: 'metrics',
    title: 'Метрики',
    helper: 'Какими KPI оценивают роль, отдел и бизнес-результат.',
    placeholder: 'Например: выручка, win rate, NPS, SLA внедрения, churn...',
    hints: ['KPI отдела', 'дашборды', 'OKR', 'план продаж'],
  },
  {
    key: 'org_structure',
    title: 'Оргструктура',
    helper: 'Команды, подчинение, смежники, зоны ответственности.',
    placeholder: 'Например: роль в коммерческом отделе, работает с маркетингом и внедрением...',
    hints: ['оргструктура', 'штатное расписание', 'похожие инструкции'],
  },
  {
    key: 'constraints',
    title: 'Ограничения',
    helper: 'Юридические, отраслевые, географические и операционные ограничения.',
    placeholder: 'Например: enterprise security review, 152-ФЗ/GDPR, работа только через ЭДО...',
    hints: ['политики', 'комплаенс', 'договорные ограничения'],
  },
]

const defaultCopy: Required<BusinessContextStepCopy> = {
  navigationLabel: 'Контекст',
  documentLabel: 'Контекст бизнеса',
  title: 'Контекст бизнеса',
  description:
    'Добавьте то, что делает должностную инструкцию конкретной: продукт, клиентов, каналы, процессы, метрики и ограничения.',
  empty: 'Можно заполнить вручную или приложить файлы',
  panelTitle: 'Источники',
  panelDescription:
    'Подойдут коммерческие предложения, описания продукта, регламенты продаж, KPI отдела, оргструктура и инструкции похожих ролей.',
  filesTitle: 'Файлы',
  filesDescription: 'Файлы сохраняются как источники этого Role Guide, не как материалы курса.',
  uploadMissingSession: 'Career Playbook session is required before upload',
  uploadMaxFilesTemplate: 'Максимум {maxFiles} источников',
  uploadPending: 'Загрузить выбранные файлы',
  uploadedSources: 'Загруженные источники',
  sourceCountTemplate: '{count} источников',
  sourceStatusUploaded: 'Загружен',
  sourceStatusProcessing: 'Обрабатывается',
  sourceStatusReady: 'Готов',
  sourceStatusFailed: 'Ошибка',
  sourceStatusRemoved: 'Удалён',
  sourceTextFallback: 'Текстовый источник',
  removeSourceTemplate: 'Удалить {name}',
  missingTitle: 'Пробелы',
  missingEmpty: 'Ключевые категории заполнены',
  back: 'Назад',
  continue: 'Продолжить к уточнениям',
  universal: 'Сгенерировать универсальную инструкцию',
  universalDescription:
    'Без контекста компании система создаст benchmark-документ и отметит, что нужно адаптировать перед внедрением.',
  uploading: 'Загрузка файлов...',
  categories: defaultCategories,
}

function ensureDigest(context: CareerPlaybookBusinessContext): CareerPlaybookBusinessContextDigest {
  return {
    product: context.digest?.product ?? [],
    customers: context.digest?.customers ?? [],
    sales_channels: context.digest?.sales_channels ?? [],
    processes: context.digest?.processes ?? [],
    metrics: context.digest?.metrics ?? [],
    org_structure: context.digest?.org_structure ?? [],
    constraints: context.digest?.constraints ?? [],
    source_ids: context.digest?.source_ids ?? context.source_ids,
    missing_signals: context.digest?.missing_signals ?? [],
    user_edited: context.digest?.user_edited ?? false,
    generated_at: context.digest?.generated_at,
    updated_at: context.digest?.updated_at,
  }
}

function linesFromText(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function textFromLines(values: string[]): string {
  return values.join('\n')
}

function buildMissingSignals(
  digest: CareerPlaybookBusinessContextDigest,
  categories: BusinessContextCategoryCopy[]
): string[] {
  return categories
    .filter((category) => digest[category.key].length === 0)
    .map((category) => category.title)
}

function hasDigestSignal(digest: CareerPlaybookBusinessContextDigest): boolean {
  return (
    digest.product.length > 0 ||
    digest.customers.length > 0 ||
    digest.sales_channels.length > 0 ||
    digest.processes.length > 0 ||
    digest.metrics.length > 0 ||
    digest.org_structure.length > 0 ||
    digest.constraints.length > 0 ||
    digest.source_ids.length > 0
  )
}

function sourceStatusLabel(
  status: CareerPlaybookBusinessContextSourceSummary['status'],
  labels: Required<BusinessContextStepCopy>
) {
  const statusLabels: Record<CareerPlaybookBusinessContextSourceSummary['status'], string> = {
    uploaded: labels.sourceStatusUploaded,
    processing: labels.sourceStatusProcessing,
    ready: labels.sourceStatusReady,
    failed: labels.sourceStatusFailed,
    removed: labels.sourceStatusRemoved,
  }

  return statusLabels[status]
}

export function BusinessContextStep({
  playbookId,
  context,
  sources = [],
  onContextChange,
  onRemoveSource,
  onSourceUploaded,
  onBack,
  onContinue,
  onUniversal,
  isSaving = false,
  tier = 'standard',
  copy,
}: BusinessContextStepProps) {
  const labels: Required<BusinessContextStepCopy> = {
    ...defaultCopy,
    ...copy,
    categories: copy?.categories ?? defaultCopy.categories,
  }
  const categories = labels.categories
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null)
  const contextRef = useRef(context)
  const digest = ensureDigest(context)
  const activeSources = sources.filter((source) => source.status !== 'removed')
  const hasProcessingSources = activeSources.some((source) =>
    ['uploaded', 'processing'].includes(source.status)
  )
  const missingSignals = useMemo(
    () => buildMissingSignals(digest, categories),
    [categories, digest]
  )
  const pendingFiles = uploadedFiles.filter((file) => file.status === 'pending')
  const hasContext = hasDigestSignal(digest) || pendingFiles.length > 0 || activeSources.length > 0

  useEffect(() => {
    contextRef.current = context
  }, [context])

  const updateDigest = (key: DigestCategoryKey, value: string) => {
    const currentContext = contextRef.current
    const currentDigest = ensureDigest(currentContext)
    const nextDigest: CareerPlaybookBusinessContextDigest = {
      ...currentDigest,
      [key]: linesFromText(value),
      source_ids: currentContext.source_ids,
      user_edited: true,
      updated_at: new Date().toISOString(),
    }
    nextDigest.missing_signals = buildMissingSignals(nextDigest, categories)

    const nextContext: CareerPlaybookBusinessContext = {
      mode: 'company_specific',
      status: hasDigestSignal(nextDigest) ? 'ready' : 'collecting',
      digest: nextDigest,
      source_ids: nextDigest.source_ids,
      updated_at: new Date().toISOString(),
    }

    contextRef.current = nextContext
    onContextChange(nextContext)
  }

  const appendSourceId = (sourceId: string) => {
    const currentContext = contextRef.current
    const nextSourceIds = Array.from(new Set([...currentContext.source_ids, sourceId]))
    const nextDigest: CareerPlaybookBusinessContextDigest = {
      ...ensureDigest(currentContext),
      source_ids: nextSourceIds,
      user_edited: true,
      updated_at: new Date().toISOString(),
    }
    nextDigest.missing_signals = buildMissingSignals(nextDigest, categories)

    const nextContext: CareerPlaybookBusinessContext = {
      mode: 'company_specific',
      status: 'collecting',
      digest: nextDigest,
      source_ids: nextSourceIds,
      updated_at: new Date().toISOString(),
    }

    contextRef.current = nextContext
    onContextChange(nextContext)
  }

  const uploadFile = async (file: UploadedFile): Promise<string | null> => {
    if (!playbookId) return null

    const formData = new FormData()
    formData.set('playbookId', playbookId)
    formData.set('file', file.file)

    const response = await fetch('/api/career-playbook/upload', {
      method: 'POST',
      body: formData,
    })

    const body = await response.json()
    if (!response.ok) {
      throw new Error(body.error || 'Career Playbook source upload failed')
    }

    appendSourceId(body.sourceId)
    onSourceUploaded?.({
      id: body.sourceId,
      playbookId,
      sourceType: 'file',
      status: body.status === 'ready' ? 'ready' : 'processing',
      filename: file.file.name,
      fileCatalogId: body.fileId ?? null,
      errorMessage: null,
      createdAt: '',
      updatedAt: '',
    })
    return body.sourceId
  }

  const handleRemoveSource = async (sourceId: string) => {
    if (!onRemoveSource) return

    setRemovingSourceId(sourceId)
    try {
      await onRemoveSource(sourceId)
    } finally {
      setRemovingSourceId((current) => (current === sourceId ? null : current))
    }
  }

  const updateFileStatus = (
    fileId: string,
    status: FileUploadStatus,
    patch: Partial<UploadedFile> = {}
  ) => {
    setUploadedFiles((files) =>
      files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              status,
              progress: status === 'success' ? 100 : file.progress,
              ...patch,
            }
          : file
      )
    )
  }

  const uploadPendingFiles = async () => {
    if (pendingFiles.length === 0) return true

    setIsUploadingFiles(true)
    let ok = true

    for (const file of pendingFiles) {
      updateFileStatus(file.id, 'uploading', { progress: 15, error: undefined })
      try {
        const sourceId = await uploadFile(file)
        if (!sourceId) throw new Error('Career Playbook session is required before upload')
        updateFileStatus(file.id, 'success', { fileId: sourceId })
      } catch (error) {
        ok = false
        updateFileStatus(file.id, 'error', {
          error: error instanceof Error ? error.message : 'Upload failed',
        })
      }
    }

    setIsUploadingFiles(false)
    return ok
  }

  const handleContinue = async () => {
    const hadPendingFiles = pendingFiles.length > 0
    const uploaded = await uploadPendingFiles()
    if (!uploaded) return
    if (hadPendingFiles || hasProcessingSources) return
    await onContinue()
  }

  return (
    <CareerPlaybookDocumentShell
      navigation={
        <aside className="career-playbook-panel p-3">
          <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {labels.navigationLabel}
          </p>
          <ol className="grid gap-2">
            {categories.map((category) => {
              const filled = digest[category.key].length > 0

              return (
                <li key={category.key}>
                  <a
                    href={`#business-context-${category.key}`}
                    className="career-playbook-rail-item grid min-h-[52px] grid-cols-[auto_1fr] items-start gap-2 px-3 py-2.5 text-left text-[15px] text-slate-700 transition-colors hover:border-purple-200 hover:bg-purple-50/60 dark:text-slate-300 dark:hover:border-purple-500/40 dark:hover:bg-purple-950/20"
                  >
                    {filled ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
                    )}
                    <span className="line-clamp-2 leading-5">{category.title}</span>
                  </a>
                </li>
              )
            })}
          </ol>
        </aside>
      }
      document={
        <article className="career-playbook-document min-h-[34rem] px-5 py-6 md:px-8 md:py-8">
          <header className="career-playbook-document-rule space-y-5 border-b pb-5">
            <span className="career-playbook-pill inline-flex items-center gap-2 px-3 py-1.5 text-[13px] leading-5 font-medium text-slate-600 dark:text-slate-300">
              <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
              {labels.documentLabel}
            </span>
            <div className="max-w-3xl space-y-2">
              <h2 className="text-[28px] leading-9 font-semibold tracking-normal text-slate-950 md:text-[34px] md:leading-[2.65rem] dark:text-slate-50">
                {labels.title}
              </h2>
              <p className="text-[15px] leading-7 text-slate-600 dark:text-slate-300">
                {labels.description}
              </p>
            </div>
          </header>

          <div className="mt-6 grid gap-4">
            {categories.map((category) => (
              <section
                key={category.key}
                id={`business-context-${category.key}`}
                className="career-playbook-muted-card p-4"
              >
                <div className="flex flex-col gap-2">
                  <h3 className="text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    {category.title}
                  </h3>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {category.helper}
                  </p>
                  <Textarea
                    value={textFromLines(digest[category.key])}
                    onChange={(event) => updateDigest(category.key, event.target.value)}
                    placeholder={category.placeholder}
                    className="min-h-24 resize-y bg-white/80 text-[15px] leading-6 dark:bg-slate-950/40"
                    aria-label={category.title}
                  />
                  <div className="flex flex-wrap gap-2">
                    {category.hints.map((hint) => (
                      <span
                        key={hint}
                        className="career-playbook-pill px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </article>
      }
      panel={
        <aside className="career-playbook-panel space-y-4 p-4">
          <div className="career-playbook-soft-card space-y-2 p-3">
            <div className="flex items-center gap-2 text-[13px] leading-5 font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              <FileSearch className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden />
              {labels.panelTitle}
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {labels.panelDescription}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {labels.filesTitle}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {labels.filesDescription}
              </p>
            </div>
            <FileUpload
              courseId={playbookId}
              uploadedFiles={uploadedFiles}
              onFilesChange={setUploadedFiles}
              onUploadFile={uploadFile}
              disabled={!playbookId || isUploadingFiles || isSaving}
              maxFiles={5}
              tier={tier}
              copy={{
                missingOwner: labels.uploadMissingSession,
                idleTitle: labels.filesTitle,
                maxFilesTemplate: labels.uploadMaxFilesTemplate,
              }}
            />
            {pendingFiles.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void uploadPendingFiles()}
                disabled={isUploadingFiles || !playbookId}
                className="w-full"
              >
                {isUploadingFiles ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileSearch className="mr-2 h-4 w-4" aria-hidden />
                )}
                {isUploadingFiles ? labels.uploading : labels.uploadPending}
              </Button>
            ) : null}
          </div>

          <div className="career-playbook-soft-card space-y-2 p-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {labels.uploadedSources}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {labels.sourceCountTemplate.replace('{count}', String(context.source_ids.length))}
            </p>
            {activeSources.length > 0 ? (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeSources.map((source) => {
                  const title =
                    source.filename ||
                    (source.sourceType === 'text' ? labels.sourceTextFallback : source.id)
                  const isRemoving = removingSourceId === source.id
                  const removeLabel = labels.removeSourceTemplate.replace('{name}', title)

                  return (
                    <li
                      key={source.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {sourceStatusLabel(source.status, labels)}
                        </p>
                        {source.errorMessage ? (
                          <p className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-300">
                            {source.errorMessage}
                          </p>
                        ) : null}
                      </div>
                      {onRemoveSource ? (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                          aria-label={removeLabel}
                          title={removeLabel}
                          disabled={isRemoving}
                          onClick={() => void handleRemoveSource(source.id)}
                        >
                          {isRemoving ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          <div className="career-playbook-soft-card space-y-2 p-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {labels.missingTitle}
            </p>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {missingSignals.length > 0 ? missingSignals.join(', ') : labels.missingEmpty}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-6">{labels.universalDescription}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <Button
              type="button"
              onClick={() => void handleContinue()}
              disabled={!hasContext || hasProcessingSources || isSaving || isUploadingFiles}
            >
              {isSaving || isUploadingFiles ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" aria-hidden />
              )}
              {labels.continue}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onUniversal()}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              {labels.universal}
            </Button>
            <Button type="button" variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {labels.back}
            </Button>
          </div>
        </aside>
      }
    />
  )
}
