'use client'

import Image from 'next/image'
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Hash,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import type {
  CareerPlaybookNumericFact,
  CareerPlaybookQualityIssue,
  CareerPlaybookViewerSnapshot,
  CareerPlaybookVisibility,
} from '@megacampus/shared-types'

import { MarkdownRendererFull } from '@/components/markdown/MarkdownRendererFull'
import { PanelIconButton } from '@/components/common/panel-icon-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ImageSkeleton } from '@/components/ui/image-skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type {
  CareerPlaybookBlockId,
  CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'
import { ActionsBar, type ActionsBarCopy } from './ActionsBar'

type PanelState = 'open' | 'closed'
type ReaderMode = 'standard' | 'reading'
type NumericFactScope = 'occurrence' | 'block'

interface NumericFactSelection {
  blockId: CareerPlaybookBlockId
  fact: CareerPlaybookNumericFact
}

export interface PlaybookViewerCopy {
  productLabel?: string
  contents?: string
  contentsAriaLabel?: string
  waitingBlock?: string
  statusLabel?: (status: CareerPlaybookViewerSnapshot['status']) => string
  blockTitle?: (blockId: CareerPlaybookBlockId, fallback: string) => string
  blockGroupLabel?: (groupKey: CareerPlaybookViewerBlock['groupKey'], fallback: string) => string
  blockStatusLabel?: (status: CareerPlaybookViewerBlock['state']['status']) => string
  editBlock?: (title: string) => string
  regenerateBlock?: (title: string) => string
  collapseBlock?: (title: string) => string
  expandBlock?: (title: string) => string
  hideContents?: string
  showContents?: string
  hideInspector?: string
  showInspector?: string
  readingMode?: string
  exitReadingMode?: string
  readingHint?: string
  inspectorLabel?: string
  inspectorTitle?: string
  inspectorStatusTitle?: string
  inspectorReadinessTitle?: string
  inspectorWarningsTitle?: string
  inspectorWarningsDescription?: string
  imageStatusTitle?: string
  imageStatusLabel?: (status: NonNullable<CareerPlaybookViewerSnapshot['imageStatus']>) => string
  imageRegenerate?: string
  imageUnavailable?: string
  qualityIssueOpenBlock?: string
  qualityIssueEditBlock?: string
  qualityIssueRegenerateBlock?: string
  qualityIssueSuggestionLabel?: string
  qualityIssueLegacyTitle?: string
  qualityIssueSeverityLabel?: (severity: CareerPlaybookQualityIssue['severity']) => string
  qualityIssuesOpenDetails?: string
  visibilityLabel?: string
  visibilityValueLabel?: (visibility: CareerPlaybookVisibility) => string
  inspectorReadyBlocks?: (ready: number, total: number) => string
  inspectorLanguage?: (language: string) => string
  inspectorNextStep?: string
  inspectorPrepare?: string
  numericFactsTitle?: string
  numericFactTotal?: (count: number) => string
  numericFactVerified?: (count: number) => string
  numericFactBenchmark?: (count: number) => string
  numericFactNeedsReview?: (count: number) => string
  numericFactSuggested?: (count: number) => string
  numericFactStructural?: (count: number) => string
  numericFactConflict?: (count: number) => string
  numericEditTitle?: string
  numericEditDescription?: (value: string) => string
  numericReplacementLabel?: string
  numericScopeLabel?: string
  numericScopeOccurrence?: string
  numericScopeBlock?: string
  numericSave?: string
  numericCancel?: string
  actions?: ActionsBarCopy
}

interface PlaybookViewerProps {
  snapshot: CareerPlaybookViewerSnapshot
  blocks: CareerPlaybookViewerBlock[]
  actionMessage?: string | null
  copy?: PlaybookViewerCopy
  readerMode?: ReaderMode
  onReaderModeChange?: (mode: ReaderMode) => void
  onEditBlock: (blockId: CareerPlaybookBlockId) => void
  onRegenerateBlock: (blockId: CareerPlaybookBlockId) => void
  onPdf: () => void
  onShare: () => void
  onCreateCourse: () => void
  createCourseAction?: (trigger: ReactNode) => ReactNode
  openCourseHref?: string | null
  onDelete: () => void
  onRegenerateImage?: () => void
  isUpdatingVisibility?: boolean
  isRegeneratingImage?: boolean
  isUpdatingNumericFact?: boolean
  onVisibilityChange?: (visibility: CareerPlaybookVisibility) => void
  onUpdateNumericFact?: (input: {
    blockId: CareerPlaybookBlockId
    factId: string
    replacementText: string
    scope: NumericFactScope
  }) => Promise<boolean | void> | boolean | void
}

const defaultCopy: Required<Omit<PlaybookViewerCopy, 'actions'>> = {
  productLabel: 'Должностная инструкция',
  contents: 'Содержание',
  contentsAriaLabel: 'Содержание должностной инструкции',
  waitingBlock: 'Этот блок ожидает генерации.',
  statusLabel: (status) => DEFAULT_STATUS_LABELS[status] ?? status.replaceAll('_', ' '),
  blockTitle: (blockId, fallback) => DEFAULT_BLOCK_TITLES[blockId] ?? fallback,
  blockGroupLabel: (groupKey, fallback) => DEFAULT_GROUP_LABELS[groupKey] ?? fallback,
  blockStatusLabel: (status) => DEFAULT_BLOCK_STATUS_LABELS[status] ?? status,
  editBlock: (title) => `Редактировать ${title}`,
  regenerateBlock: (title) => `Сгенерировать заново ${title}`,
  collapseBlock: (title) => `Свернуть ${title}`,
  expandBlock: (title) => `Развернуть ${title}`,
  hideContents: 'Скрыть левую панель',
  showContents: 'Показать левую панель',
  hideInspector: 'Скрыть правый блок',
  showInspector: 'Показать правый блок',
  readingMode: 'Режим чтения',
  exitReadingMode: 'Выйти из режима чтения',
  readingHint: 'Чистое чтение без боковых панелей',
  inspectorLabel: 'Инспектор документа',
  inspectorTitle: 'Инспектор документа',
  inspectorStatusTitle: 'Состояние',
  inspectorReadinessTitle: 'Готовность',
  inspectorWarningsTitle: 'Предупреждения качества',
  inspectorWarningsDescription:
    'Часть автоматической проверки завершилась в резервном режиме. Проверьте эти пункты перед внедрением.',
  imageStatusTitle: 'Изображение',
  imageStatusLabel: (status) => DEFAULT_IMAGE_STATUS_LABELS[status] ?? status,
  imageRegenerate: 'Перегенерировать',
  imageUnavailable: 'Изображение ещё не создано',
  qualityIssueOpenBlock: 'Открыть блок',
  qualityIssueEditBlock: 'Редактировать',
  qualityIssueRegenerateBlock: 'Перегенерировать',
  qualityIssueSuggestionLabel: 'Что исправить',
  qualityIssueLegacyTitle: 'Системное предупреждение',
  qualityIssueSeverityLabel: (severity) =>
    severity === 'critical' ? 'Критично' : severity === 'warning' ? 'Предупреждение' : 'Инфо',
  qualityIssuesOpenDetails: 'Открыть предупреждения',
  visibilityLabel: 'Видимость',
  visibilityValueLabel: (visibility) => DEFAULT_VISIBILITY_LABELS[visibility],
  inspectorReadyBlocks: (ready, total) => `Готово блоков: ${ready} из ${total}`,
  inspectorLanguage: (language) => `Язык документа: ${language}`,
  inspectorNextStep: 'Следующий шаг: создать курс для адаптации',
  inspectorPrepare: 'Подготовить к внедрению',
  numericFactsTitle: 'Цифры',
  numericFactTotal: (count) => formatRussianNumericFactCount(count),
  numericFactVerified: (count) => `Подтверждено: ${count}`,
  numericFactBenchmark: (count) => `Benchmark: ${count}`,
  numericFactNeedsReview: (count) => `Требует проверки: ${count}`,
  numericFactSuggested: (count) => `Рекомендации: ${count}`,
  numericFactStructural: (count) => `Структурные: ${count}`,
  numericFactConflict: (count) => `Конфликты: ${count}`,
  numericEditTitle: 'Проверить цифру',
  numericEditDescription: (value) =>
    `Сейчас в тексте используется ${value}. Укажите корректное значение.`,
  numericReplacementLabel: 'Новое значение',
  numericScopeLabel: 'Область применения',
  numericScopeOccurrence: 'Только здесь',
  numericScopeBlock: 'Весь блок',
  numericSave: 'Сохранить цифру',
  numericCancel: 'Отмена',
}

const defaultActionsCopy: Required<ActionsBarCopy> = {
  actionsLabel: 'Действия с должностной инструкцией',
  pdf: 'PDF',
  share: 'Поделиться',
  createCourse: 'Создать курс из инструкции',
  openCourse: 'Перейти в курс',
  delete: 'Удалить',
}

const DEFAULT_STATUS_LABELS: Partial<Record<CareerPlaybookViewerSnapshot['status'], string>> = {
  draft: 'Черновик',
  answering_fixed: 'Ответы на основные вопросы',
  awaiting_followups: 'Ожидает уточнений',
  answering_followups: 'Ответы на уточнения',
  ready_to_generate: 'Готово к генерации',
  generating: 'Генерируется',
  completed: 'Готово',
  failed: 'Ошибка',
}

const DEFAULT_BLOCK_STATUS_LABELS: Partial<
  Record<CareerPlaybookViewerBlock['state']['status'], string>
> = {
  pending: 'Ожидает',
  generating: 'Генерируется',
  generated: 'Готово',
  failed: 'Ошибка',
  regenerating: 'Генерируется заново',
}

const DEFAULT_GROUP_LABELS: Partial<Record<CareerPlaybookViewerBlock['groupKey'], string>> = {
  group_1_foundation: 'Основа',
  group_2_operations: 'Работа',
  group_3_people: 'Люди и навыки',
  group_4_growth: 'Рост',
  group_5_system: 'Система',
  group_6_wrap: 'Итог',
}

const DEFAULT_BLOCK_TITLES: Partial<Record<CareerPlaybookBlockId, string>> = {
  header: 'Шапка документа',
  block_1: 'Миссия и ключевые результаты',
  block_2: 'Что не входит в роль',
  block_3: 'Зоны ответственности',
  block_4: 'Обязанности',
  block_5: 'Матрица полномочий',
  block_6: 'Показатели эффективности',
  block_7: 'Компетенции',
  block_8: 'Инструменты и технологии',
  block_9: 'Работа человека и цифровых инструментов',
  block_10: 'Зависимости',
  block_11: 'Карьерный путь',
  block_12: 'Профиль кандидата',
  block_13: 'День в роли',
  block_14: 'Адаптация',
  block_15: 'Мотивация',
  block_16: 'Основной процесс',
  block_17: 'Красные флаги',
  block_18: 'Частые вопросы',
  block_19: 'Контекст отрасли',
  block_20: 'Бизнес-модель',
  block_21: 'Сценарии сбоев',
  block_22: 'Памятка роли',
  block_23: 'План преемственности',
  block_24: 'Карта роли',
  block_25: 'Заключение',
  block_26: 'Чеклист внедрения',
}

const DEFAULT_VISIBILITY_LABELS: Record<CareerPlaybookVisibility, string> = {
  private: 'Приватный',
  organization: 'Для организации',
  public: 'Публичный',
}

const DEFAULT_IMAGE_STATUS_LABELS: Record<
  NonNullable<CareerPlaybookViewerSnapshot['imageStatus']>,
  string
> = {
  pending: 'В очереди',
  draft_generating: 'Готовится черновик',
  draft_ready: 'Черновик готов',
  generating: 'Генерируется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
}

const VISIBILITY_CONFIG: Record<
  CareerPlaybookVisibility,
  {
    color: string
    icon: typeof Lock
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

const VISIBILITY_OPTIONS = Object.keys(VISIBILITY_CONFIG) as CareerPlaybookVisibility[]

const NUMERIC_FACT_STATUSES: CareerPlaybookNumericFact['status'][] = [
  'verified',
  'benchmark',
  'suggested',
  'structural',
  'needs_review',
  'conflict',
]

interface NumericFactSummary {
  total: number
  counts: Record<CareerPlaybookNumericFact['status'], number>
}

export function PlaybookViewer({
  snapshot,
  blocks,
  actionMessage,
  copy,
  readerMode,
  onReaderModeChange,
  onEditBlock,
  onRegenerateBlock,
  onPdf,
  onShare,
  onCreateCourse,
  createCourseAction,
  openCourseHref,
  onDelete,
  onRegenerateImage,
  isUpdatingVisibility = false,
  isRegeneratingImage = false,
  isUpdatingNumericFact = false,
  onVisibilityChange,
  onUpdateNumericFact,
}: PlaybookViewerProps) {
  const labels = {
    ...defaultCopy,
    ...copy,
    actions: { ...defaultActionsCopy, ...copy?.actions },
  }
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<CareerPlaybookBlockId>>(new Set())
  const [toc, setToc] = useState<PanelState>(() => readInitialPanelState('toc'))
  const [panel, setPanel] = useState<PanelState>(() => readInitialPanelState('panel'))
  const [internalMode, setInternalMode] = useState<ReaderMode>(readInitialReaderMode)
  const [activeBlockId, setActiveBlockId] = useState<CareerPlaybookBlockId | null>(() =>
    readInitialActiveBlockId(blocks)
  )
  const [numericFactSelection, setNumericFactSelection] = useState<NumericFactSelection | null>(
    null
  )
  const [numericReplacement, setNumericReplacement] = useState('')
  const [numericScope, setNumericScope] = useState<NumericFactScope>('occurrence')
  const mode = readerMode ?? internalMode
  const viewerPermissions = snapshot.viewerPermissions ?? {
    canEdit: true,
    canManageVisibility: true,
    canCreateCourse: true,
    canDelete: true,
  }
  const inspectorAvailable =
    viewerPermissions.canEdit ||
    viewerPermissions.canManageVisibility ||
    viewerPermissions.canCreateCourse ||
    viewerPermissions.canDelete
  const tocOpen = mode === 'standard' && toc === 'open'
  const panelOpen = mode === 'standard' && inspectorAvailable && panel === 'open'
  const groupedBlocks = useMemo(() => groupBlocks(blocks), [blocks])
  const blockIds = useMemo(() => blocks.map((block) => block.blockId), [blocks])
  const readyBlocks = useMemo(
    () => blocks.filter((block) => block.state.content.trim().length > 0).length,
    [blocks]
  )
  const numericSummary = useMemo(() => summarizeNumericFacts(blocks), [blocks])
  const canEditNumericFacts = viewerPermissions.canEdit && Boolean(onUpdateNumericFact)
  const visibleBlocksRef = useRef(new Map<CareerPlaybookBlockId, { ratio: number; top: number }>())

  useEffect(() => {
    if (blockIds.length === 0) {
      setActiveBlockId(null)
      return
    }

    setActiveBlockId((current) =>
      current && blockIds.includes(current) ? current : (blockIds[0] ?? null)
    )
  }, [blockIds])

  useEffect(() => {
    visibleBlocksRef.current.clear()
    if (mode !== 'standard') return
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const blockIdSet = new Set<CareerPlaybookBlockId>(blockIds)
    const elements = blockIds
      .map((blockId) => document.getElementById(blockId))
      .filter((element): element is HTMLElement => Boolean(element))

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const blockId = entry.target.id
          if (!blockIdSet.has(blockId)) continue

          if (entry.isIntersecting) {
            visibleBlocksRef.current.set(blockId, {
              ratio: entry.intersectionRatio,
              top: entry.boundingClientRect?.top ?? 0,
            })
          } else {
            visibleBlocksRef.current.delete(blockId)
          }
        }

        const [nextActiveBlockId] =
          Array.from(visibleBlocksRef.current.entries()).sort(([, a], [, b]) => {
            if (b.ratio !== a.ratio) return b.ratio - a.ratio
            return Math.abs(a.top) - Math.abs(b.top)
          })[0] ?? []

        if (nextActiveBlockId) setActiveBlockId(nextActiveBlockId)
      },
      {
        rootMargin: '-18% 0px -55% 0px',
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [blockIds, mode])

  const openNumericFactEditor = (
    blockId: CareerPlaybookBlockId,
    fact: CareerPlaybookNumericFact
  ) => {
    if (!canEditNumericFacts) return
    setNumericFactSelection({ blockId, fact })
    setNumericReplacement(fact.raw_text)
    setNumericScope('occurrence')
  }

  const closeNumericFactEditor = () => {
    if (isUpdatingNumericFact) return
    setNumericFactSelection(null)
  }

  const saveNumericFact = async () => {
    if (!numericFactSelection || !onUpdateNumericFact) return
    const replacementText = numericReplacement.trim()
    if (!replacementText) return

    const result = await onUpdateNumericFact({
      blockId: numericFactSelection.blockId,
      factId: numericFactSelection.fact.id,
      replacementText,
      scope: numericScope,
    })
    if (result === false) return
    setNumericFactSelection(null)
  }

  const updateToc = (next: PanelState) => {
    setToc(next)
    writeReaderUrl(next, panel, mode)
  }

  const updatePanel = (next: PanelState) => {
    setPanel(next)
    writeReaderUrl(toc, next, mode)
  }

  const updateMode = (next: ReaderMode) => {
    setInternalMode(next)
    onReaderModeChange?.(next)
    writeReaderUrl(toc, panel, next)
  }

  return (
    <main
      className="career-playbook-zone"
      data-testid="career-playbook-viewer-shell"
      data-mode={mode}
      data-toc={toc}
      data-panel={panel}
    >
      {mode === 'reading' ? (
        <>
          <ReadingTopbar
            label={labels.productLabel}
            hint={labels.readingHint}
            exitLabel={labels.exitReadingMode}
            onExit={() => updateMode('standard')}
          />
          <section className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <DocumentPaper
              snapshot={snapshot}
              blocks={blocks}
              labels={labels}
              collapsedBlocks={collapsedBlocks}
              onToggleBlock={setCollapsedBlocks}
              onEditBlock={onEditBlock}
              onRegenerateBlock={onRegenerateBlock}
              interactive={false}
              titleHeading="h1"
              spacious
            />
          </section>
        </>
      ) : (
        <>
          <section className="career-playbook-topbar">
            <div className="mx-auto grid max-w-[1760px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md">
                    <FileText className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {labels.productLabel}
                  </Badge>
                  <Badge variant="outline" className="rounded-md capitalize">
                    {labels.statusLabel(snapshot.status)}
                  </Badge>
                </div>
                <h1 className="text-[32px] leading-10 font-semibold tracking-normal md:text-[42px] md:leading-[3.2rem]">
                  {snapshot.title}
                </h1>
              </div>
            </div>
          </section>

          <section
            className={cn(
              'mx-auto grid max-w-[1760px] gap-5 px-4 py-6 md:px-6',
              tocOpen && panelOpen
                ? 'xl:grid-cols-[18rem_minmax(0,1fr)_25rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_28rem]'
                : tocOpen
                  ? 'xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)]'
                  : panelOpen
                    ? 'xl:grid-cols-[minmax(0,1fr)_25rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]'
                    : 'xl:grid-cols-[minmax(0,1fr)]'
            )}
          >
            {tocOpen ? (
              <ContentsRail
                groupedBlocks={groupedBlocks}
                labels={labels}
                activeBlockId={activeBlockId}
                onActiveBlockChange={setActiveBlockId}
              />
            ) : null}

            <section className="min-w-0 overflow-hidden rounded-md border border-[#d6c2a6] bg-[#fbfaf7] shadow-xl shadow-stone-300/30 dark:border-slate-700 dark:bg-slate-950">
              <ReaderTopbar
                title={labels.productLabel}
                subtitle={buildSubtitle(snapshot, labels)}
                tocOpen={tocOpen}
                panelOpen={panelOpen}
                labels={labels}
                onTocChange={updateToc}
                onPanelChange={updatePanel}
                onReadingMode={() => updateMode('reading')}
                inspectorAvailable={inspectorAvailable}
              />
              <div className="min-w-0 bg-[#ece7dd] p-4 md:p-7 dark:bg-slate-900">
                <DocumentPaper
                  snapshot={snapshot}
                  blocks={blocks}
                  labels={labels}
                  collapsedBlocks={collapsedBlocks}
                  onToggleBlock={setCollapsedBlocks}
                  onEditBlock={onEditBlock}
                  onRegenerateBlock={onRegenerateBlock}
                  interactive={viewerPermissions.canEdit}
                  onNumericFactClick={canEditNumericFacts ? openNumericFactEditor : undefined}
                  titleHeading="p"
                />
              </div>
            </section>

            {panelOpen ? (
              <InspectorRail
                snapshot={snapshot}
                labels={labels}
                actionMessage={actionMessage}
                readyBlocks={readyBlocks}
                totalBlocks={blocks.length}
                numericSummary={numericSummary}
                blocks={blocks}
                contentLanguage={snapshot.contentLanguage}
                canManageVisibility={viewerPermissions.canManageVisibility}
                canCreateCourse={viewerPermissions.canCreateCourse}
                isUpdatingVisibility={isUpdatingVisibility}
                onVisibilityChange={onVisibilityChange}
                onPdf={onPdf}
                onShare={onShare}
                onEditBlock={onEditBlock}
                onRegenerateBlock={onRegenerateBlock}
                onCreateCourse={onCreateCourse}
                createCourseAction={createCourseAction}
                openCourseHref={openCourseHref}
                onDelete={onDelete}
                canRegenerateImage={viewerPermissions.canManageVisibility}
                isRegeneratingImage={isRegeneratingImage}
                onRegenerateImage={onRegenerateImage}
              />
            ) : null}
          </section>
        </>
      )}
      {canEditNumericFacts ? (
        <NumericFactEditorSheet
          selection={numericFactSelection}
          replacement={numericReplacement}
          scope={numericScope}
          labels={labels}
          isUpdating={isUpdatingNumericFact}
          onReplacementChange={setNumericReplacement}
          onScopeChange={setNumericScope}
          onClose={closeNumericFactEditor}
          onSave={saveNumericFact}
        />
      ) : null}
    </main>
  )
}

function ReaderTopbar({
  title,
  subtitle,
  tocOpen,
  panelOpen,
  labels,
  onTocChange,
  onPanelChange,
  onReadingMode,
  inspectorAvailable,
}: {
  title: string
  subtitle: string
  tocOpen: boolean
  panelOpen: boolean
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  onTocChange: (panel: PanelState) => void
  onPanelChange: (panel: PanelState) => void
  onReadingMode: () => void
  inspectorAvailable: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d6c2a6] bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex min-w-0 items-center gap-3">
        <PanelIconButton
          label={tocOpen ? labels.hideContents : labels.showContents}
          Icon={tocOpen ? PanelLeftClose : PanelLeftOpen}
          onClick={() => onTocChange(tocOpen ? 'closed' : 'open')}
          expanded={tocOpen}
          className="hidden xl:inline-flex"
        />
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onReadingMode}>
          <Maximize2 className="h-4 w-4" aria-hidden />
          {labels.readingMode}
        </Button>
        {inspectorAvailable ? (
          <PanelIconButton
            label={panelOpen ? labels.hideInspector : labels.showInspector}
            Icon={panelOpen ? PanelRightClose : PanelRightOpen}
            onClick={() => onPanelChange(panelOpen ? 'closed' : 'open')}
            expanded={panelOpen}
          />
        ) : null}
      </div>
    </div>
  )
}

function ReadingTopbar({
  label,
  hint,
  exitLabel,
  onExit,
}: {
  label: string
  hint: string
  exitLabel: string
  onExit: () => void
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-[#d6c2a6] bg-[#f3f0ea]/90 px-4 py-3 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold">{label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
          </div>
        </div>
        <Button type="button" size="sm" onClick={onExit}>
          <Minimize2 className="h-4 w-4" aria-hidden />
          {exitLabel}
        </Button>
      </div>
    </div>
  )
}

function ContentsRail({
  groupedBlocks,
  labels,
  activeBlockId,
  onActiveBlockChange,
}: {
  groupedBlocks: ReturnType<typeof groupBlocks>
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  activeBlockId: CareerPlaybookBlockId | null
  onActiveBlockChange: (blockId: CareerPlaybookBlockId) => void
}) {
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    if (typeof activeLinkRef.current?.scrollIntoView !== 'function') return
    activeLinkRef.current.scrollIntoView({ block: 'nearest' })
  }, [activeBlockId])

  return (
    <nav
      aria-label={labels.contentsAriaLabel}
      className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
    >
      <div className="career-playbook-panel p-3">
        <p className="px-2 pb-2 text-xs font-semibold tracking-normal text-slate-500 uppercase dark:text-slate-400">
          {labels.contents}
        </p>
        <div className="grid gap-3">
          {groupedBlocks.map((group) => (
            <div key={group.groupKey} className="grid gap-1">
              <p className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {labels.blockGroupLabel(group.groupKey, group.groupLabel)}
              </p>
              {group.blocks.map((block) => {
                const isActive = block.blockId === activeBlockId

                return (
                  <a
                    key={block.blockId}
                    ref={isActive ? activeLinkRef : undefined}
                    href={`#${block.blockId}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onActiveBlockChange(block.blockId)}
                    className={cn(
                      'block min-w-0 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-[#f6efe4] font-medium text-slate-950 ring-1 ring-[#dcc7a6] dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-700'
                        : 'text-slate-700 hover:bg-[#f6efe4] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50'
                    )}
                  >
                    <span className="block truncate">
                      {labels.blockTitle(block.blockId, block.title)}
                    </span>
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </nav>
  )
}

function InspectorRail({
  snapshot,
  labels,
  actionMessage,
  readyBlocks,
  totalBlocks,
  numericSummary,
  blocks,
  contentLanguage,
  canManageVisibility,
  canCreateCourse,
  isUpdatingVisibility,
  onVisibilityChange,
  onPdf,
  onShare,
  onEditBlock,
  onRegenerateBlock,
  onCreateCourse,
  createCourseAction,
  openCourseHref,
  onDelete,
  canRegenerateImage,
  isRegeneratingImage,
  onRegenerateImage,
}: {
  snapshot: CareerPlaybookViewerSnapshot
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  actionMessage?: string | null
  readyBlocks: number
  totalBlocks: number
  numericSummary: NumericFactSummary
  blocks: CareerPlaybookViewerBlock[]
  contentLanguage: string
  canManageVisibility: boolean
  canCreateCourse: boolean
  isUpdatingVisibility: boolean
  onVisibilityChange?: (visibility: CareerPlaybookVisibility) => void
  onPdf: () => void
  onShare: () => void
  onEditBlock: (blockId: CareerPlaybookBlockId) => void
  onRegenerateBlock: (blockId: CareerPlaybookBlockId) => void
  onCreateCourse: () => void
  createCourseAction?: (trigger: ReactNode) => ReactNode
  openCourseHref?: string | null
  onDelete: () => void
  canRegenerateImage: boolean
  isRegeneratingImage: boolean
  onRegenerateImage?: () => void
}) {
  return (
    <aside
      role="complementary"
      aria-label={labels.inspectorLabel}
      className="career-playbook-panel xl:sticky xl:top-20 xl:self-start"
    >
      <div className="border-b border-[#d6c2a6] p-4 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
          {labels.inspectorTitle}
        </div>
      </div>
      <div className="grid gap-4 p-4">
        <ActionsBar
          actionMessage={actionMessage}
          copy={labels.actions}
          onPdf={onPdf}
          onShare={onShare}
          onCreateCourse={onCreateCourse}
          createCourseAction={createCourseAction}
          canCreateCourse={canCreateCourse}
          openCourseHref={openCourseHref}
          onDelete={onDelete}
        />

        <NumericFactsSummary summary={numericSummary} labels={labels} />

        <QualityWarningsSummary
          issues={snapshot.qualityIssues}
          warnings={snapshot.qualityWarnings}
          blocks={blocks}
          labels={labels}
          onEditBlock={onEditBlock}
          onRegenerateBlock={onRegenerateBlock}
        />

        <ImageStatusSection
          snapshot={snapshot}
          labels={labels}
          canRegenerateImage={canRegenerateImage}
          isRegeneratingImage={isRegeneratingImage}
          onRegenerateImage={onRegenerateImage}
        />

        {canManageVisibility && onVisibilityChange ? (
          <VisibilitySection
            labels={labels}
            snapshot={snapshot}
            isUpdatingVisibility={isUpdatingVisibility}
            onVisibilityChange={onVisibilityChange}
          />
        ) : null}

        <section className="career-playbook-muted-card p-3">
          <h2 className="text-sm font-semibold">{labels.inspectorReadinessTitle}</h2>
          <div className="mt-3 grid gap-2">
            {[
              labels.inspectorReadyBlocks(readyBlocks, totalBlocks),
              labels.inspectorLanguage(contentLanguage.toUpperCase()),
              labels.inspectorNextStep,
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}

function QualityWarningsSummary({
  issues,
  warnings,
  blocks,
  labels,
  onEditBlock,
  onRegenerateBlock,
}: {
  issues?: CareerPlaybookQualityIssue[]
  warnings?: string[]
  blocks: CareerPlaybookViewerBlock[]
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  onEditBlock: (blockId: CareerPlaybookBlockId) => void
  onRegenerateBlock: (blockId: CareerPlaybookBlockId) => void
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const blockTitleById = new Map(
    blocks.map((block) => [block.blockId, labels.blockTitle(block.blockId, block.title)])
  )
  const structuredIssues = issues?.filter((issue) => issue.message.trim().length > 0) ?? []
  const legacyIssues: CareerPlaybookQualityIssue[] =
    warnings
      ?.filter((warning) => warning.trim().length > 0)
      .map((warning, index) => ({
        id: `legacy-warning:${index}`,
        source: 'system',
        severity: 'warning',
        title: labels.qualityIssueLegacyTitle,
        message: warning.trim(),
        action: 'review',
      })) ?? []
  const visibleIssues = [...structuredIssues, ...legacyIssues]
  if (visibleIssues.length === 0) return null

  const groupedIssues = groupQualityIssues(visibleIssues)
  const severityOrder: CareerPlaybookQualityIssue['severity'][] = ['critical', 'warning', 'info']
  const severityCounts = severityOrder
    .map((severity) => ({
      severity,
      count: visibleIssues.filter((issue) => issue.severity === severity).length,
    }))
    .filter((entry) => entry.count > 0)

  const openBlock = (blockId: CareerPlaybookBlockId) => {
    setIsDetailsOpen(false)
    const element = document.getElementById(blockId)
    element?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    if (window.location.hash !== `#${blockId}`) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${blockId}`
      )
    }
  }

  const editBlock = (blockId: CareerPlaybookBlockId) => {
    setIsDetailsOpen(false)
    onEditBlock(blockId)
  }

  const regenerateBlock = (blockId: CareerPlaybookBlockId) => {
    setIsDetailsOpen(false)
    onRegenerateBlock(blockId)
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-200" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{labels.inspectorWarningsTitle}</h2>
          <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-100/80">
            {labels.inspectorWarningsDescription}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {severityCounts.map(({ severity, count }) => (
          <Badge
            key={severity}
            variant="outline"
            className="rounded-md border-amber-300 px-1.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-100"
          >
            {labels.qualityIssueSeverityLabel(severity)}: {count}
          </Badge>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-7 rounded-md px-2 text-[11px]"
        onClick={() => setIsDetailsOpen(true)}
      >
        {labels.qualityIssuesOpenDetails}
      </Button>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-amber-200 p-4 text-left dark:border-amber-300/20">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
              {labels.inspectorWarningsTitle}
            </DialogTitle>
            <DialogDescription>{labels.inspectorWarningsDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 overflow-y-auto p-4">
            {groupedIssues.map((group) => (
              <details
                key={group.key}
                open
                className="rounded-md border border-amber-200 bg-amber-50/70 p-2 text-xs leading-5 dark:border-amber-300/15 dark:bg-amber-300/5"
              >
                <summary className="cursor-pointer list-none font-semibold text-amber-950 dark:text-amber-50">
                  <span>
                    {group.blockId
                      ? (blockTitleById.get(group.blockId) ?? group.blockId)
                      : labels.qualityIssueLegacyTitle}
                  </span>
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-300/15 dark:text-amber-100">
                    {group.issues.length}
                  </span>
                </summary>
                <div className="mt-2 grid gap-2">
                  {group.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-md border border-amber-200/70 bg-white/80 p-2 dark:border-amber-300/15 dark:bg-slate-950/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-md border-amber-300 px-1.5 py-0 text-[10px] text-amber-800 dark:text-amber-100"
                        >
                          {labels.qualityIssueSeverityLabel(issue.severity)}
                        </Badge>
                        <span className="font-semibold">{issue.title}</span>
                      </div>
                      <p className="mt-1 text-amber-900 dark:text-amber-50/90">{issue.message}</p>
                      {issue.suggestion ? (
                        <p className="mt-1 text-amber-800 dark:text-amber-100/80">
                          <span className="font-semibold">
                            {labels.qualityIssueSuggestionLabel}:{' '}
                          </span>
                          {issue.suggestion}
                        </p>
                      ) : null}
                      {issue.blockId ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-md px-2 text-[11px]"
                            onClick={() => openBlock(issue.blockId!)}
                          >
                            {labels.qualityIssueOpenBlock}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-md px-2 text-[11px]"
                            onClick={() => editBlock(issue.blockId!)}
                          >
                            {labels.qualityIssueEditBlock}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-md px-2 text-[11px]"
                            onClick={() => regenerateBlock(issue.blockId!)}
                          >
                            {labels.qualityIssueRegenerateBlock}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ImageStatusSection({
  snapshot,
  labels,
  canRegenerateImage,
  isRegeneratingImage,
  onRegenerateImage,
}: {
  snapshot: CareerPlaybookViewerSnapshot
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  canRegenerateImage: boolean
  isRegeneratingImage: boolean
  onRegenerateImage?: () => void
}) {
  const status = snapshot.imageStatus
  const statusLabel = status ? labels.imageStatusLabel(status) : labels.imageUnavailable
  const canRegenerate = canRegenerateImage && Boolean(onRegenerateImage)

  return (
    <section className="career-playbook-muted-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{labels.imageStatusTitle}</h2>
          <Badge variant="outline" className="mt-2 rounded-md">
            {statusLabel}
          </Badge>
          {snapshot.imageErrorMessage ? (
            <p className="mt-2 text-xs leading-5 text-rose-700 dark:text-rose-200">
              {snapshot.imageErrorMessage}
            </p>
          ) : null}
        </div>
        {canRegenerate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 rounded-md"
            disabled={isRegeneratingImage}
            onClick={onRegenerateImage}
          >
            {isRegeneratingImage ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {labels.imageRegenerate}
          </Button>
        ) : null}
      </div>

      {snapshot.imageUrl ? (
        <PlaybookCardImage
          key={snapshot.imageUrl}
          src={snapshot.imageUrl}
          alt={snapshot.imageAltText ?? `Role Guide image: ${snapshot.title}`}
        />
      ) : null}
    </section>
  )
}

function groupQualityIssues(issues: CareerPlaybookQualityIssue[]): Array<{
  key: string
  blockId?: CareerPlaybookBlockId
  issues: CareerPlaybookQualityIssue[]
}> {
  const groups = new Map<
    string,
    { key: string; blockId?: CareerPlaybookBlockId; issues: CareerPlaybookQualityIssue[] }
  >()

  for (const issue of issues) {
    const key = issue.blockId ?? 'system'
    const existing = groups.get(key)
    if (existing) {
      existing.issues.push(issue)
      continue
    }
    groups.set(key, {
      key,
      ...(issue.blockId ? { blockId: issue.blockId } : {}),
      issues: [issue],
    })
  }

  return Array.from(groups.values())
}

function NumericFactsSummary({
  summary,
  labels,
}: {
  summary: NumericFactSummary
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
}) {
  if (summary.total === 0) return null

  const items = [
    {
      key: 'verified',
      label: labels.numericFactVerified(summary.counts.verified),
      count: summary.counts.verified,
      className:
        'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100',
    },
    {
      key: 'benchmark',
      label: labels.numericFactBenchmark(summary.counts.benchmark),
      count: summary.counts.benchmark,
      className:
        'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100',
    },
    {
      key: 'needs_review',
      label: labels.numericFactNeedsReview(summary.counts.needs_review),
      count: summary.counts.needs_review,
      className:
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100',
    },
    {
      key: 'conflict',
      label: labels.numericFactConflict(summary.counts.conflict),
      count: summary.counts.conflict,
      className:
        'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100',
    },
  ]

  return (
    <section
      className="career-playbook-muted-card p-3"
      data-testid="career-playbook-numeric-summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Hash className="h-4 w-4 text-slate-500" aria-hidden />
            {labels.numericFactsTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {labels.numericFactTotal(summary.total)}
          </p>
        </div>
        {summary.counts.needs_review + summary.counts.conflict > 0 ? (
          <AlertTriangle
            className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-200"
            aria-hidden
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-200"
            aria-hidden
          />
        )}
      </div>
      <div className="mt-3 grid gap-2">
        {items
          .filter((item) => item.count > 0)
          .map((item) => (
            <Badge
              key={item.key}
              variant="outline"
              className={cn(
                'justify-start rounded-md border px-2 py-1 font-medium',
                item.className
              )}
            >
              {item.label}
            </Badge>
          ))}
      </div>
    </section>
  )
}

function NumericFactEditorSheet({
  selection,
  replacement,
  scope,
  labels,
  isUpdating,
  onReplacementChange,
  onScopeChange,
  onClose,
  onSave,
}: {
  selection: NumericFactSelection | null
  replacement: string
  scope: NumericFactScope
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  isUpdating: boolean
  onReplacementChange: (value: string) => void
  onScopeChange: (scope: NumericFactScope) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const fact = selection?.fact ?? null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSave()
  }

  return (
    <Sheet
      open={Boolean(selection)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-md border-[#e5d5bf] bg-[#fffaf4] dark:border-slate-700 dark:bg-slate-950"
      >
        <form className="flex h-full flex-col gap-5" onSubmit={handleSubmit}>
          <SheetHeader className="pr-8">
            <SheetTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-200" aria-hidden />
              {labels.numericEditTitle}
            </SheetTitle>
            <SheetDescription>
              {fact ? labels.numericEditDescription(fact.raw_text) : ''}
            </SheetDescription>
          </SheetHeader>

          {fact ? (
            <div className="grid gap-4">
              <Badge
                variant="outline"
                className={cn(
                  'w-fit rounded-md border px-2 py-1',
                  getNumericFactSoftClassName(fact.status)
                )}
              >
                {fact.explanation}
              </Badge>

              <div className="grid gap-2">
                <Label htmlFor="career-playbook-numeric-replacement">
                  {labels.numericReplacementLabel}
                </Label>
                <Input
                  id="career-playbook-numeric-replacement"
                  value={replacement}
                  onChange={(event) => onReplacementChange(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid gap-2">
                <Label>{labels.numericScopeLabel}</Label>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="group"
                  aria-label={labels.numericScopeLabel}
                >
                  {(['occurrence', 'block'] as NumericFactScope[]).map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={scope === option ? 'default' : 'outline'}
                      className={cn(
                        'rounded-md',
                        scope === option &&
                          'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950'
                      )}
                      aria-pressed={scope === option}
                      onClick={() => onScopeChange(option)}
                    >
                      {option === 'occurrence'
                        ? labels.numericScopeOccurrence
                        : labels.numericScopeBlock}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <SheetFooter className="mt-auto gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={isUpdating}>
              {labels.numericCancel}
            </Button>
            <Button type="submit" disabled={!replacement.trim() || isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {labels.numericSave}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function VisibilitySection({
  labels,
  snapshot,
  isUpdatingVisibility,
  onVisibilityChange,
}: {
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  snapshot: CareerPlaybookViewerSnapshot
  isUpdatingVisibility: boolean
  onVisibilityChange: (visibility: CareerPlaybookVisibility) => void
}) {
  const visibility = getSnapshotVisibility(snapshot)
  const currentVisibility = VISIBILITY_CONFIG[visibility]
  const VisibilityIcon = currentVisibility.icon

  return (
    <section className="career-playbook-muted-card p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{labels.visibilityLabel}</h2>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`h-8 gap-1.5 rounded-md border px-2.5 text-xs ${currentVisibility.color}`}
              disabled={isUpdatingVisibility}
              aria-label={`${labels.visibilityLabel}: ${labels.visibilityValueLabel(visibility)}`}
            >
              {isUpdatingVisibility ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <VisibilityIcon className="h-3.5 w-3.5" aria-hidden />
              )}
              {labels.visibilityValueLabel(visibility)}
              <ChevronDown className="h-3 w-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
            {VISIBILITY_OPTIONS.map((option) => {
              const optionConfig = VISIBILITY_CONFIG[option]
              const OptionIcon = optionConfig.icon
              const disabled = option === 'public' && snapshot.status !== 'completed'

              return (
                <DropdownMenuItem
                  key={option}
                  disabled={disabled}
                  className={cn('cursor-pointer gap-2', option === visibility && 'bg-accent')}
                  onClick={() => onVisibilityChange(option)}
                >
                  <OptionIcon className="h-4 w-4" aria-hidden />
                  {labels.visibilityValueLabel(option)}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}

function DocumentPaper({
  snapshot,
  blocks,
  labels,
  collapsedBlocks,
  onToggleBlock,
  onEditBlock,
  onRegenerateBlock,
  onNumericFactClick,
  interactive = true,
  titleHeading = 'p',
  spacious = false,
}: {
  snapshot: CareerPlaybookViewerSnapshot
  blocks: CareerPlaybookViewerBlock[]
  labels: Required<Omit<PlaybookViewerCopy, 'actions'>> & { actions: Required<ActionsBarCopy> }
  collapsedBlocks: Set<CareerPlaybookBlockId>
  onToggleBlock: (
    updater: (current: Set<CareerPlaybookBlockId>) => Set<CareerPlaybookBlockId>
  ) => void
  onEditBlock: (blockId: CareerPlaybookBlockId) => void
  onRegenerateBlock: (blockId: CareerPlaybookBlockId) => void
  onNumericFactClick?: (blockId: CareerPlaybookBlockId, fact: CareerPlaybookNumericFact) => void
  interactive?: boolean
  titleHeading?: 'h1' | 'p'
  spacious?: boolean
}) {
  const TitleTag = titleHeading
  return (
    <div
      id="reader-document"
      className={cn(
        'career-playbook-document mx-auto max-w-4xl',
        spacious ? 'px-6 py-8 md:px-12 md:py-12' : 'px-5 py-6 md:px-8 md:py-8'
      )}
    >
      <header className="career-playbook-document-rule mb-7 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          <div className="career-playbook-pill mb-3 inline-flex px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {labels.productLabel}
          </div>
          <TitleTag className="text-3xl leading-tight font-semibold md:text-4xl">
            {snapshot.title}
          </TitleTag>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
            {buildSubtitle(snapshot, labels)}
          </p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
          {labels.statusLabel(snapshot.status)}
        </div>
      </header>

      <div className="grid gap-8">
        {blocks.map((block) => {
          const isCollapsed = interactive && collapsedBlocks.has(block.blockId)
          const title = labels.blockTitle(block.blockId, block.title)
          const groupLabel = labels.blockGroupLabel(block.groupKey, block.groupLabel)
          const statusLabel = labels.blockStatusLabel(block.state.status)
          const content = getDisplayContent(block, title)
          const hasContent = content.trim().length > 0
          const BlockHeadingTag = titleHeading === 'h1' ? 'h2' : 'h3'

          return (
            <article
              key={block.blockId}
              id={block.blockId}
              aria-label={title}
              className="scroll-mt-24"
            >
              <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-2">
                  {interactive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={
                        isCollapsed ? labels.expandBlock(title) : labels.collapseBlock(title)
                      }
                      onClick={() =>
                        onToggleBlock((current) => {
                          const next = new Set(current)
                          if (next.has(block.blockId)) next.delete(block.blockId)
                          else next.add(block.blockId)
                          return next
                        })
                      }
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-300" />
                      <span className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
                        {groupLabel}
                      </span>
                    </div>
                    <BlockHeadingTag className="text-xl leading-7 font-semibold">
                      {title}
                    </BlockHeadingTag>
                    {interactive ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{statusLabel}</p>
                    ) : null}
                  </div>
                </div>

                {interactive ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEditBlock(block.blockId)}
                      aria-label={labels.editBlock(title)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRegenerateBlock(block.blockId)}
                      aria-label={labels.regenerateBlock(title)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </header>

              {!isCollapsed ? (
                <div
                  className={cn(
                    'career-playbook-document-rule overflow-x-auto border-b pb-6',
                    !hasContent && 'text-slate-500'
                  )}
                >
                  {hasContent ? (
                    <MarkdownRendererFull
                      content={content}
                      preset="preview"
                      features={{ mermaid: true }}
                      language={snapshot.contentLanguage}
                      numericFacts={
                        interactive && onNumericFactClick ? block.state.numeric_facts : undefined
                      }
                      onNumericFactClick={
                        onNumericFactClick
                          ? (fact) => onNumericFactClick(block.blockId, fact)
                          : undefined
                      }
                    />
                  ) : (
                    <p className="text-sm leading-6">{labels.waitingBlock}</p>
                  )}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function PlaybookCardImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  return (
    <div
      className="relative mt-3 aspect-square w-full overflow-hidden rounded-md border border-[#d6c2a6] bg-[#f3f0ea] dark:border-slate-700 dark:bg-slate-900"
      aria-busy={!isLoaded && !hasError}
    >
      {!isLoaded && !hasError ? <ImageSkeleton gradient /> : null}
      {hasError ? (
        <ImageSkeleton
          icon={<FileText className="h-14 w-14 text-slate-400 dark:text-slate-700" />}
          className="animate-none bg-[#f3f0ea] dark:bg-slate-900"
        />
      ) : null}
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        className={cn(
          'object-cover transition-opacity duration-300',
          isLoaded && !hasError ? 'opacity-100' : 'opacity-0'
        )}
        sizes="(max-width: 768px) 100vw, 360px"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  )
}

function groupBlocks(blocks: CareerPlaybookViewerBlock[]) {
  const groups = new Map<
    CareerPlaybookViewerBlock['groupKey'],
    {
      groupKey: CareerPlaybookViewerBlock['groupKey']
      groupLabel: string
      blocks: CareerPlaybookViewerBlock[]
    }
  >()

  for (const block of blocks) {
    const existing = groups.get(block.groupKey)
    if (existing) {
      existing.blocks.push(block)
      continue
    }

    groups.set(block.groupKey, {
      groupKey: block.groupKey,
      groupLabel: block.groupLabel,
      blocks: [block],
    })
  }

  return Array.from(groups.values())
}

function summarizeNumericFacts(blocks: CareerPlaybookViewerBlock[]): NumericFactSummary {
  const counts = Object.fromEntries(NUMERIC_FACT_STATUSES.map((status) => [status, 0])) as Record<
    CareerPlaybookNumericFact['status'],
    number
  >

  let total = 0
  for (const block of blocks) {
    for (const fact of block.state.numeric_facts ?? []) {
      counts[fact.status] += 1
      total += 1
    }
  }

  return { total, counts }
}

function readInitialPanelState(key: 'toc' | 'panel'): PanelState {
  if (typeof window === 'undefined') return 'open'
  return new URLSearchParams(window.location.search).get(key) === 'closed' ? 'closed' : 'open'
}

function readInitialReaderMode(): ReaderMode {
  if (typeof window === 'undefined') return 'standard'
  return new URLSearchParams(window.location.search).get('mode') === 'reading'
    ? 'reading'
    : 'standard'
}

function readInitialActiveBlockId(
  blocks: CareerPlaybookViewerBlock[]
): CareerPlaybookBlockId | null {
  const firstBlockId = blocks[0]?.blockId
  if (!firstBlockId) return null
  if (typeof window === 'undefined') return firstBlockId

  const hashBlockId = window.location.hash.replace(/^#/, '')
  return blocks.some((block) => block.blockId === hashBlockId) ? hashBlockId : firstBlockId
}

function getSnapshotVisibility(snapshot: CareerPlaybookViewerSnapshot): CareerPlaybookVisibility {
  return snapshot.visibility ?? (snapshot.isPublic ? 'public' : 'private')
}

function writeReaderUrl(toc: PanelState, panel: PanelState, mode: ReaderMode) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.set('toc', toc)
  params.set('panel', panel)
  params.set('mode', mode)
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}?${params.toString()}${window.location.hash}`
  )
}

function buildSubtitle(
  snapshot: CareerPlaybookViewerSnapshot,
  labels: Pick<Required<Omit<PlaybookViewerCopy, 'actions'>>, 'statusLabel'>
) {
  return labels.statusLabel(snapshot.status)
}

function getDisplayContent(block: CareerPlaybookViewerBlock, title: string) {
  const content = block.state.content.trimStart()
  const match = /^(#{1,2})\s+(.+?)\s*(?:\n+|$)/.exec(content)
  if (!match) return block.state.content

  const heading = normalizeHeading(match[2] ?? '')
  const shouldStrip = block.blockId === 'header' || heading === normalizeHeading(title)
  return shouldStrip ? content.slice(match[0].length).trimStart() : block.state.content
}

function normalizeHeading(value: string) {
  return value.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function formatRussianNumericFactCount(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} числовое значение`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} числовых значения`
  }
  return `${count} числовых значений`
}

function getNumericFactSoftClassName(status: CareerPlaybookNumericFact['status']) {
  switch (status) {
    case 'verified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100'
    case 'benchmark':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100'
    case 'suggested':
      return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-100'
    case 'structural':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
    case 'conflict':
      return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100'
    case 'needs_review':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100'
  }
}
