'use client'

import { useState } from 'react'
import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Share2,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type ThemeMode = 'light' | 'dark'
type PanelState = 'open' | 'closed'
type ReaderMode = 'standard' | 'reading'

const documentMeta = [
  ['Статус', 'Готово'],
  ['Функция', 'Продажи'],
  ['Уровень', 'Средний'],
  ['Источник', 'Внутренний найм'],
]

const tocGroups: Array<[string, string[]]> = [
  ['Основа', ['Шапка документа', 'Миссия и ключевые результаты', 'Что не входит в роль']],
  ['Работа', ['Зоны ответственности', 'Обязанности', 'Показатели эффективности']],
  ['Люди и навыки', ['Компетенции', 'Профиль кандидата', 'День в роли']],
]

const documentSections = [
  {
    title: 'Шапка документа',
    eyebrow: 'Основа',
    body: [
      ['Должность', 'Менеджер по продажам'],
      ['Отдел', 'Продажи'],
      ['Подчиняется', 'Руководителю отдела продаж'],
      ['Ключевые компетенции', 'Переговоры, работа с клиентами, знание продукта, коммуникация'],
    ],
  },
  {
    title: 'Миссия и ключевые результаты',
    eyebrow: 'Основа',
    body: [
      ['Миссия', 'Стабильно превращать входящий и исходящий спрос в качественные сделки.'],
      ['Результат 1', 'Вести прогноз продаж без сюрпризов для руководителя.'],
      ['Результат 2', 'Поддерживать прозрачную коммуникацию с клиентом на каждом этапе сделки.'],
    ],
  },
  {
    title: 'Зоны ответственности',
    eyebrow: 'Работа',
    body: [
      ['Воронка', 'Квалификация лидов, встречи, коммерческие предложения и следующие шаги.'],
      ['Клиенты', 'Понимание потребностей, фиксация договорённостей и контроль ожиданий.'],
      ['Команда', 'Передача обратной связи продукту, маркетингу и руководителю продаж.'],
    ],
  },
]

const inspectorActions: Array<[string, LucideIcon]> = [
  ['Редактировать блок', PenLine],
  ['Создать курс', GraduationCap],
  ['Опубликовать ссылку', Share2],
  ['Скачать PDF', Download],
]

const readinessChecks = [
  ['Структура полная', '27 разделов собраны'],
  ['Язык документа', 'Русский'],
  ['Следующий шаг', 'Создать курс для адаптации'],
]

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light'
}

function readInitialPanel(): PanelState {
  if (typeof window === 'undefined') return 'open'
  return new URLSearchParams(window.location.search).get('panel') === 'closed' ? 'closed' : 'open'
}

function readInitialToc(): PanelState {
  if (typeof window === 'undefined') return 'open'
  return new URLSearchParams(window.location.search).get('toc') === 'closed' ? 'closed' : 'open'
}

function readInitialMode(): ReaderMode {
  if (typeof window === 'undefined') return 'standard'
  return new URLSearchParams(window.location.search).get('mode') === 'reading'
    ? 'reading'
    : 'standard'
}

function writeReaderUrl(theme: ThemeMode, toc: PanelState, panel: PanelState, mode: ReaderMode) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  params.set('theme', theme)
  params.set('toc', toc)
  params.set('panel', panel)
  params.set('mode', mode)
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

export default function CareerPlaybookReaderVariantsPage() {
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme)
  const [toc, setToc] = useState<PanelState>(readInitialToc)
  const [panel, setPanel] = useState<PanelState>(readInitialPanel)
  const [mode, setMode] = useState<ReaderMode>(readInitialMode)
  const dark = theme === 'dark'
  const reading = mode === 'reading'
  const tocOpen = toc === 'open'
  const panelOpen = panel === 'open'

  const selectTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme)
    writeReaderUrl(nextTheme, toc, panel, mode)
  }

  const selectToc = (nextToc: PanelState) => {
    setToc(nextToc)
    writeReaderUrl(theme, nextToc, panel, mode)
  }

  const selectPanel = (nextPanel: PanelState) => {
    setPanel(nextPanel)
    writeReaderUrl(theme, toc, nextPanel, mode)
  }

  const selectMode = (nextMode: ReaderMode) => {
    setMode(nextMode)
    writeReaderUrl(theme, toc, panel, nextMode)
  }

  if (reading) {
    return (
      <main
        data-testid="reader-variant-gallery"
        data-theme={theme}
        data-toc={toc}
        data-panel={panel}
        data-mode={mode}
        className={cn(
          'min-h-screen transition-colors',
          dark ? 'bg-[#070b12] text-slate-100' : 'bg-[#f3f0ea] text-slate-950'
        )}
      >
        <ReadingTopbar dark={dark} onExit={() => selectMode('standard')} />
        <section className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
          <DocumentPaper dark={dark} spacious />
        </section>
      </main>
    )
  }

  return (
    <main
      data-testid="reader-variant-gallery"
      data-theme={theme}
      data-toc={toc}
      data-panel={panel}
      data-mode={mode}
      className={cn(
        'min-h-screen transition-colors',
        dark ? 'bg-[#070b12] text-slate-100' : 'bg-[#f3f0ea] text-slate-950'
      )}
    >
      <section
        className={cn(
          'border-b',
          dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-[#fbfaf7]'
        )}
      >
        <div className="mx-auto grid max-w-[1720px] gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8">
          <div className="min-w-0">
            <div
              className={cn(
                'mb-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
                dark
                  ? 'border-white/10 bg-white/5 text-slate-300'
                  : 'border-stone-300 bg-white text-stone-700'
              )}
            >
              <BriefcaseBusiness className="h-4 w-4" aria-hidden />
              Выбранное направление
            </div>
            <h1 className="text-4xl leading-tight font-semibold md:text-5xl">
              Единый ридер: Документ руководителя
            </h1>
            <p
              className={cn(
                'mt-4 max-w-3xl text-base leading-7',
                dark ? 'text-slate-300' : 'text-slate-600'
              )}
            >
              Основной экран должностной инструкции выглядит как управленческий документ: сильная
              типографика, спокойное содержание слева и правый инспектор, который можно скрыть.
              Печатный минимализм теперь включается одной кнопкой режима чтения.
            </p>
          </div>

          <ControlPanel
            dark={dark}
            theme={theme}
            toc={toc}
            panel={panel}
            onThemeChange={selectTheme}
          />
        </div>
      </section>

      <section
        className={cn(
          'mx-auto grid max-w-[1720px] gap-5 px-5 py-6 lg:px-8',
          tocOpen && panelOpen
            ? 'xl:grid-cols-[18rem_minmax(0,1fr)_22rem]'
            : tocOpen
              ? 'xl:grid-cols-[18rem_minmax(0,1fr)]'
              : panelOpen
                ? 'xl:grid-cols-[minmax(0,1fr)_22rem]'
                : 'xl:grid-cols-[minmax(0,1fr)]'
        )}
      >
        {tocOpen ? <TocRail dark={dark} /> : null}

        <section
          className={cn(
            'min-w-0 overflow-hidden rounded-md border',
            dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-[#fbfaf7]'
          )}
        >
          <PreviewTopbar
            dark={dark}
            tocOpen={tocOpen}
            panelOpen={panelOpen}
            onTocChange={selectToc}
            onPanelChange={selectPanel}
            onReadingMode={() => selectMode('reading')}
          />
          <div className={cn('min-w-0 p-5 md:p-8', dark ? 'bg-[#101624]' : 'bg-[#ece7dd]')}>
            <DocumentPaper dark={dark} executive />
          </div>
        </section>

        {panelOpen ? <InspectorRail dark={dark} /> : null}
      </section>
    </main>
  )
}

function ControlPanel({
  dark,
  theme,
  toc,
  panel,
  onThemeChange,
}: {
  dark: boolean
  theme: ThemeMode
  toc: PanelState
  panel: PanelState
  onThemeChange: (theme: ThemeMode) => void
}) {
  return (
    <div
      className={cn(
        'grid min-w-[18rem] gap-3 rounded-md border p-3',
        dark ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white'
      )}
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={theme === 'light'}
          onClick={() => onThemeChange('light')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
            theme === 'light'
              ? 'border-slate-900 bg-slate-900 text-white'
              : dark
                ? 'border-white/10 text-slate-300 hover:bg-white/8'
                : 'border-stone-300 text-slate-700 hover:bg-stone-100'
          )}
        >
          <Sun className="h-4 w-4" aria-hidden />
          Светлая тема
        </button>
        <button
          type="button"
          aria-pressed={theme === 'dark'}
          onClick={() => onThemeChange('dark')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
            theme === 'dark'
              ? 'border-white bg-white text-slate-950'
              : dark
                ? 'border-white/10 text-slate-300 hover:bg-white/8'
                : 'border-stone-300 text-slate-700 hover:bg-stone-100'
          )}
        >
          <Moon className="h-4 w-4" aria-hidden />
          Темная тема
        </button>
      </div>
      <p
        role="status"
        className={cn(
          'rounded-md px-3 py-2 text-sm',
          dark ? 'bg-white/6 text-slate-300' : 'bg-stone-100 text-stone-700'
        )}
      >
        Режим: стандартный · {toc === 'open' ? 'Левая панель открыта' : 'Левая панель скрыта'} ·{' '}
        {panel === 'open' ? 'Правая панель открыта' : 'Правая панель скрыта'}
      </p>
    </div>
  )
}

function PanelIconButton({
  dark,
  label,
  Icon,
  onClick,
}: {
  dark: boolean
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition',
        dark
          ? 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          : 'border-stone-300 bg-white text-slate-700 hover:bg-stone-100'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

function ReadingTopbar({ dark, onExit }: { dark: boolean; onExit: () => void }) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 border-b px-4 py-3 backdrop-blur-xl',
        dark
          ? 'border-white/10 bg-[#070b12]/90 text-slate-100'
          : 'border-stone-300 bg-[#f3f0ea]/90 text-slate-950'
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md',
              dark ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
            )}
          >
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold">Должностная инструкция</div>
            <div className={cn('text-xs', dark ? 'text-slate-400' : 'text-stone-500')}>
              Чистое чтение без боковых панелей
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold',
            dark
              ? 'border-white/10 bg-white text-slate-950 hover:bg-slate-200'
              : 'border-slate-900 bg-slate-950 text-white hover:bg-slate-800'
          )}
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
          Выйти из режима чтения
        </button>
      </div>
    </div>
  )
}

function PreviewTopbar({
  dark,
  tocOpen,
  panelOpen,
  onTocChange,
  onPanelChange,
  onReadingMode,
}: {
  dark: boolean
  tocOpen: boolean
  panelOpen: boolean
  onTocChange: (panel: PanelState) => void
  onPanelChange: (panel: PanelState) => void
  onReadingMode: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3',
        dark ? 'border-white/10 bg-[#070b12]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PanelIconButton
          dark={dark}
          label={tocOpen ? 'Скрыть левую панель' : 'Показать левую панель'}
          Icon={tocOpen ? PanelLeftClose : PanelLeftOpen}
          onClick={() => onTocChange(tocOpen ? 'closed' : 'open')}
        />
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md',
            dark ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
          )}
        >
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Должностная инструкция</div>
          <div className={cn('text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>
            Продажи · Готово · Средний уровень
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReadingMode}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
            dark
              ? 'border-white/10 text-slate-200 hover:bg-white/8'
              : 'border-stone-300 text-slate-700 hover:bg-stone-100'
          )}
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          Режим чтения
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
            dark ? 'border-white/10 text-slate-200' : 'border-stone-300 text-slate-700'
          )}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Поделиться
        </button>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
            dark ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
          )}
        >
          PDF
        </button>
        <PanelIconButton
          dark={dark}
          label={panelOpen ? 'Скрыть правый блок' : 'Показать правый блок'}
          Icon={panelOpen ? PanelRightClose : PanelRightOpen}
          onClick={() => onPanelChange(panelOpen ? 'closed' : 'open')}
        />
      </div>
    </div>
  )
}

function TocRail({ dark }: { dark: boolean }) {
  return (
    <nav
      aria-label="Содержание документа"
      className={cn(
        'hidden rounded-md border p-4 xl:sticky xl:top-5 xl:block xl:self-start',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="mb-4 text-sm font-semibold">Содержание</div>
      <div className="grid gap-4">
        {tocGroups.map(([group, items]) => (
          <div key={group}>
            <div
              className={cn('mb-2 text-xs font-medium', dark ? 'text-slate-500' : 'text-stone-500')}
            >
              {group}
            </div>
            <div className="grid gap-1">
              {items.map((item, index) => (
                <a
                  key={item}
                  href="#reader-document"
                  className={cn(
                    'block rounded-md px-2 py-1.5 text-sm transition',
                    index === 0
                      ? dark
                        ? 'bg-white/10 text-white'
                        : 'bg-stone-100 text-slate-950'
                      : dark
                        ? 'text-slate-400 hover:bg-white/6 hover:text-white'
                        : 'text-slate-600 hover:bg-stone-100 hover:text-slate-950'
                  )}
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

function InspectorRail({ dark }: { dark: boolean }) {
  return (
    <aside
      role="complementary"
      aria-label="Инспектор документа"
      className={cn(
        'rounded-md border p-4 xl:sticky xl:top-5 xl:self-start',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Инспектор документа
      </div>
      <div className="grid gap-2">
        {inspectorActions.map(([label, Icon]) => (
          <button
            key={label}
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
              dark
                ? 'border-white/10 text-slate-200 hover:bg-white/7'
                : 'border-stone-300 text-slate-700 hover:bg-stone-100'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'mt-5 rounded-md border p-3 text-sm',
          dark
            ? 'border-white/10 bg-white/5 text-slate-300'
            : 'border-stone-300 bg-stone-50 text-stone-700'
        )}
      >
        <div className="font-semibold">Состояние</div>
        <div className="mt-2 grid gap-2">
          {documentMeta.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {readinessChecks.map(([title, body]) => (
          <div
            key={title}
            className={cn(
              'rounded-md border p-3',
              dark ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-stone-50'
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
              {title}
            </div>
            <div className={cn('mt-1 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
              {body}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={cn(
          'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold',
          dark ? 'bg-white text-slate-950' : 'bg-slate-950 text-white'
        )}
      >
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        Подготовить к внедрению
      </button>
    </aside>
  )
}

function DocumentPaper({
  dark,
  executive = false,
  spacious = false,
}: {
  dark: boolean
  executive?: boolean
  spacious?: boolean
}) {
  return (
    <div
      id="reader-document"
      className={cn(
        'mx-auto max-w-4xl rounded-md border',
        spacious ? 'px-7 py-8 md:px-12 md:py-12' : 'px-5 py-6 md:px-8 md:py-8',
        dark
          ? 'border-white/10 bg-[#111827] text-slate-100 shadow-2xl shadow-black/30'
          : 'border-stone-300 bg-white text-slate-950 shadow-xl shadow-stone-300/50'
      )}
    >
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-current/10 pb-5">
        <div>
          <div
            className={cn(
              'mb-3 inline-flex rounded-md px-2.5 py-1 text-xs font-semibold',
              dark ? 'bg-white/8 text-slate-300' : 'bg-stone-100 text-stone-600'
            )}
          >
            Должностная инструкция
          </div>
          <h2
            className={cn(
              'font-semibold',
              executive || spacious ? 'text-4xl leading-tight' : 'text-3xl leading-tight'
            )}
          >
            Менеджер по продажам
          </h2>
          <p
            className={cn(
              'mt-3 max-w-2xl text-base leading-7',
              dark ? 'text-slate-300' : 'text-slate-600'
            )}
          >
            Рабочий документ для найма, адаптации и управления ролью в отделе продаж.
          </p>
        </div>
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            dark
              ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          )}
        >
          Готово к использованию
        </div>
      </div>

      <div className="grid gap-6">
        {documentSections.map((section) => (
          <section key={section.title} className="scroll-mt-20">
            <div className="mb-3 flex items-center gap-2">
              <span
                className={cn('h-2 w-2 rounded-full', dark ? 'bg-emerald-300' : 'bg-emerald-600')}
              />
              <span
                className={cn(
                  'text-xs font-semibold uppercase',
                  dark ? 'text-slate-500' : 'text-stone-500'
                )}
              >
                {section.eyebrow}
              </span>
            </div>
            <h3 className="text-xl leading-7 font-semibold">{section.title}</h3>
            <dl className="mt-4 grid gap-3">
              {section.body.map(([label, value]) => (
                <div
                  key={label}
                  className={cn(
                    'grid gap-1 border-b pb-3 md:grid-cols-[12rem_minmax(0,1fr)]',
                    dark ? 'border-white/10' : 'border-stone-200'
                  )}
                >
                  <dt
                    className={cn(
                      'text-sm font-semibold',
                      dark ? 'text-slate-400' : 'text-stone-500'
                    )}
                  >
                    {label}
                  </dt>
                  <dd className="min-w-0 text-base leading-7">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
