'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutGrid,
  Moon,
  PanelLeft,
  PenLine,
  Share2,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type ThemeMode = 'light' | 'dark'

interface ReaderVariant {
  slug: string
  title: string
  subtitle: string
  reference: string
  bestFor: string
  caution: string
  icon: LucideIcon
  frame: 'executive' | 'docs' | 'academy' | 'review' | 'print'
  accentClass: string
}

const variants: ReaderVariant[] = [
  {
    slug: 'executive-document',
    title: 'Документ руководителя',
    subtitle: 'Строгий рабочий документ: минимум интерфейсного шума, сильная типографика.',
    reference: 'Деловые документы и премиальные правовые страницы',
    bestFor: 'Когда должностная инструкция должна выглядеть как управленческий артефакт.',
    caution: 'Меньше учебных сигналов, поэтому для курса нужен отдельный прогресс-слой.',
    icon: BriefcaseBusiness,
    frame: 'executive',
    accentClass: 'bg-emerald-500',
  },
  {
    slug: 'docs-workspace',
    title: 'Рабочая документация',
    subtitle: 'Три колонки: оглавление, документ, контекстные действия и проверка.',
    reference: 'Редакторы документации и базы знаний',
    bestFor: 'Когда важны навигация по блокам, редактирование и быстрые действия.',
    caution: 'Нужно держать правую колонку компактной, иначе экран станет админкой.',
    icon: LayoutGrid,
    frame: 'docs',
    accentClass: 'bg-blue-500',
  },
  {
    slug: 'academy-reader',
    title: 'Академический ридер',
    subtitle: 'Единый язык с курсом: прогресс, следующий шаг и учебная навигация.',
    reference: 'Учебные ридеры и центры обучения',
    bestFor: 'Когда инструкция и курс должны ощущаться частями одной платформы.',
    caution: 'Для самой инструкции нельзя перегружать экран элементами прохождения уроков.',
    icon: GraduationCap,
    frame: 'academy',
    accentClass: 'bg-violet-500',
  },
  {
    slug: 'split-review',
    title: 'Проверка перед внедрением',
    subtitle: 'Документ рядом с чеклистом качества, публикацией и созданием курса.',
    reference: 'Корпоративные экраны проверки',
    bestFor: 'Когда HR или руководитель должен быстро понять, можно ли документ использовать.',
    caution: 'Это сильный режим для готового документа, но слабее как режим спокойного чтения.',
    icon: ClipboardCheck,
    frame: 'review',
    accentClass: 'bg-amber-500',
  },
  {
    slug: 'minimal-print',
    title: 'Печатный минимализм',
    subtitle: 'Почти PDF: белый лист, тихие действия, идеальный акцент на тексте.',
    reference: 'Читалки и редакторы документов',
    bestFor: 'Когда нужно ощущение дорогого, чистого и готового к экспорту документа.',
    caution: 'Мало продуктовой индивидуальности, если не усилить фирменные детали.',
    icon: FileText,
    frame: 'print',
    accentClass: 'bg-slate-900',
  },
]

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

function isVariantSlug(value: string | null): value is ReaderVariant['slug'] {
  return Boolean(value && variants.some((variant) => variant.slug === value))
}

function readInitialVariant() {
  if (typeof window === 'undefined') return variants[0].slug
  const slug = new URLSearchParams(window.location.search).get('variant')
  return isVariantSlug(slug) ? slug : variants[0].slug
}

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light'
}

function writeGalleryUrl(variantSlug: string, theme: ThemeMode) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  params.set('variant', variantSlug)
  params.set('theme', theme)
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

export default function CareerPlaybookReaderVariantsPage() {
  const [selectedSlug, setSelectedSlug] = useState(readInitialVariant)
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme)
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.slug === selectedSlug) ?? variants[0],
    [selectedSlug]
  )
  const dark = theme === 'dark'

  const selectVariant = (slug: string) => {
    setSelectedSlug(slug)
    writeGalleryUrl(slug, theme)
  }

  const selectTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme)
    writeGalleryUrl(selectedSlug, nextTheme)
  }

  return (
    <main
      data-testid="reader-variant-gallery"
      data-theme={theme}
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
              <BookOpen className="h-4 w-4" aria-hidden />
              Галерея вариантов
            </div>
            <h1 className="text-4xl leading-tight font-semibold md:text-5xl">
              5 вариантов единого ридера
            </h1>
            <p
              className={cn(
                'mt-4 max-w-3xl text-base leading-7',
                dark ? 'text-slate-300' : 'text-slate-600'
              )}
            >
              Один и тот же контент должностной инструкции показан в пяти интерфейсных подходах.
              После выбора направления его можно будет перенести в общий ридер для инструкций и
              курсов.
            </p>
          </div>

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
                onClick={() => selectTheme('light')}
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
                onClick={() => selectTheme('dark')}
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
              Выбран: {selectedVariant.title}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1720px] gap-6 px-5 py-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:px-8">
        <aside className="grid gap-3 lg:sticky lg:top-5 lg:self-start">
          {variants.map((variant) => {
            const Icon = variant.icon
            const selected = variant.slug === selectedSlug

            return (
              <article
                key={variant.slug}
                aria-label={variant.title}
                className={cn(
                  'rounded-md border p-4 transition',
                  selected
                    ? dark
                      ? 'border-white/30 bg-white/10'
                      : 'border-slate-900 bg-white shadow-sm'
                    : dark
                      ? 'border-white/10 bg-white/4 hover:bg-white/7'
                      : 'border-stone-300 bg-white/72 hover:bg-white'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white',
                        variant.accentClass
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base leading-6 font-semibold">{variant.title}</h2>
                      <p className={cn('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                        {variant.reference}
                      </p>
                    </div>
                  </div>
                  {selected ? (
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                        dark
                          ? 'bg-emerald-400/15 text-emerald-200'
                          : 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Выбрано
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    'mt-3 text-sm leading-6',
                    dark ? 'text-slate-300' : 'text-slate-600'
                  )}
                >
                  {variant.subtitle}
                </p>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectVariant(variant.slug)}
                  className={cn(
                    'mt-4 inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition',
                    selected
                      ? dark
                        ? 'border-white/20 bg-white text-slate-950'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : dark
                        ? 'border-white/10 text-slate-200 hover:bg-white/8'
                        : 'border-stone-300 text-slate-700 hover:bg-stone-100'
                  )}
                >
                  Выбрать {variant.title}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </article>
            )
          })}
        </aside>

        <div className="grid min-w-0 gap-5">
          <SelectedVariantBrief variant={selectedVariant} dark={dark} />
          <ReaderPreview variant={selectedVariant} dark={dark} />
        </div>
      </section>
    </main>
  )
}

function SelectedVariantBrief({ variant, dark }: { variant: ReaderVariant; dark: boolean }) {
  const Icon = variant.icon

  return (
    <section
      className={cn(
        'grid gap-5 rounded-md border p-5 xl:grid-cols-[minmax(0,1fr)_24rem]',
        dark ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white/82'
      )}
    >
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-md text-white',
              variant.accentClass
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className={cn('text-sm font-medium', dark ? 'text-slate-400' : 'text-slate-500')}>
              Выбранное направление
            </p>
            <h2 className="text-2xl leading-8 font-semibold">{variant.title}</h2>
          </div>
        </div>
        <p
          className={cn(
            'max-w-3xl text-base leading-7',
            dark ? 'text-slate-300' : 'text-slate-600'
          )}
        >
          {variant.bestFor}
        </p>
      </div>
      <div
        className={cn(
          'rounded-md border p-4 text-sm leading-6',
          dark
            ? 'border-white/10 bg-black/18 text-slate-300'
            : 'border-stone-300 bg-stone-50 text-stone-700'
        )}
      >
        <div className="font-semibold">Ограничение варианта</div>
        <p className="mt-2">{variant.caution}</p>
      </div>
    </section>
  )
}

function ReaderPreview({ variant, dark }: { variant: ReaderVariant; dark: boolean }) {
  const frameClass = cn(
    'overflow-hidden rounded-md border',
    dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-[#fbfaf7]'
  )

  if (variant.frame === 'print') {
    return (
      <section className={frameClass}>
        <PreviewTopbar dark={dark} quiet />
        <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
          <DocumentPaper dark={dark} spacious />
        </div>
      </section>
    )
  }

  if (variant.frame === 'academy') {
    return (
      <section className={frameClass}>
        <PreviewTopbar dark={dark} progress />
        <div className="grid min-h-[44rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
          <CourseRail dark={dark} />
          <div className={cn('min-w-0 p-5 md:p-7', dark ? 'bg-[#0f1726]' : 'bg-[#f6f3ee]')}>
            <DocumentPaper dark={dark} academy />
          </div>
        </div>
      </section>
    )
  }

  if (variant.frame === 'docs') {
    return (
      <section className={frameClass}>
        <PreviewTopbar dark={dark} />
        <div className="grid min-h-[44rem] xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
          <TocRail dark={dark} />
          <div className={cn('min-w-0 p-5 md:p-7', dark ? 'bg-[#0f1726]' : 'bg-[#f6f3ee]')}>
            <DocumentPaper dark={dark} />
          </div>
          <ActionRail dark={dark} />
        </div>
      </section>
    )
  }

  if (variant.frame === 'review') {
    return (
      <section className={frameClass}>
        <PreviewTopbar dark={dark} />
        <div className="grid min-h-[44rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className={cn('min-w-0 p-5 md:p-7', dark ? 'bg-[#0f1726]' : 'bg-[#f6f3ee]')}>
            <DocumentPaper dark={dark} />
          </div>
          <ReviewRail dark={dark} />
        </div>
      </section>
    )
  }

  return (
    <section className={frameClass}>
      <PreviewTopbar dark={dark} />
      <div className="grid min-h-[44rem] xl:grid-cols-[18rem_minmax(0,1fr)]">
        <TocRail dark={dark} executive />
        <div className={cn('min-w-0 p-5 md:p-8', dark ? 'bg-[#101624]' : 'bg-[#ece7dd]')}>
          <DocumentPaper dark={dark} executive />
        </div>
      </div>
    </section>
  )
}

function PreviewTopbar({
  dark,
  quiet = false,
  progress = false,
}: {
  dark: boolean
  quiet?: boolean
  progress?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3',
        dark ? 'border-white/10 bg-[#070b12]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
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
          {!quiet ? (
            <div className={cn('text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>
              Продажи · Готово · Средний уровень
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {progress ? (
          <span
            className={cn(
              'hidden rounded-md px-2.5 py-1 text-xs font-medium sm:inline-flex',
              dark ? 'bg-violet-400/14 text-violet-200' : 'bg-violet-50 text-violet-700'
            )}
          >
            27 разделов · 100%
          </span>
        ) : null}
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
      </div>
    </div>
  )
}

function TocRail({ dark, executive = false }: { dark: boolean; executive?: boolean }) {
  return (
    <nav
      aria-label="Содержание варианта"
      className={cn(
        'hidden border-r p-4 xl:block',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div
        className={cn(
          'mb-4 text-xs font-semibold uppercase',
          dark ? 'text-slate-500' : 'text-stone-500'
        )}
      >
        Содержание
      </div>
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
                    index === 0 && executive
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

function CourseRail({ dark }: { dark: boolean }) {
  return (
    <aside
      className={cn(
        'hidden border-r p-4 lg:block',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <PanelLeft className="h-4 w-4" aria-hidden />
        Навигация
      </div>
      <div
        className={cn(
          'mb-5 rounded-md border p-3',
          dark ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-stone-50'
        )}
      >
        <div className="text-sm font-medium">Связанный курс</div>
        <div className={cn('mt-1 text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>
          Ввод в должность менеджера по продажам
        </div>
        <div className={cn('mt-3 h-2 rounded-full', dark ? 'bg-white/10' : 'bg-stone-200')}>
          <div className="h-2 w-4/5 rounded-full bg-violet-500" />
        </div>
      </div>
      <div className="grid gap-2">
        {['Документ', 'Уроки курса', 'Материалы', 'Проверка'].map((item, index) => (
          <button
            key={item}
            type="button"
            className={cn(
              'rounded-md px-3 py-2 text-left text-sm',
              index === 0
                ? dark
                  ? 'bg-white text-slate-950'
                  : 'bg-slate-950 text-white'
                : dark
                  ? 'text-slate-400 hover:bg-white/6'
                  : 'text-slate-600 hover:bg-stone-100'
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </aside>
  )
}

function ActionRail({ dark }: { dark: boolean }) {
  return (
    <aside
      className={cn(
        'hidden border-l p-4 xl:block',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="mb-4 text-sm font-semibold">Действия</div>
      <div className="grid gap-2">
        {[
          ['Редактировать блок', PenLine],
          ['Создать курс', GraduationCap],
          ['Опубликовать ссылку', Share2],
        ].map(([label, Icon]) => {
          const TypedIcon = Icon as LucideIcon
          return (
            <button
              key={label as string}
              type="button"
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
                dark
                  ? 'border-white/10 text-slate-200 hover:bg-white/7'
                  : 'border-stone-300 text-slate-700 hover:bg-stone-100'
              )}
            >
              <TypedIcon className="h-4 w-4" aria-hidden />
              {label as string}
            </button>
          )
        })}
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
    </aside>
  )
}

function ReviewRail({ dark }: { dark: boolean }) {
  return (
    <aside
      className={cn(
        'border-t p-5 xl:border-t-0 xl:border-l',
        dark ? 'border-white/10 bg-[#0b111d]' : 'border-stone-300 bg-white'
      )}
    >
      <div className="mb-4 text-lg font-semibold">Готовность к внедрению</div>
      <div className="grid gap-3">
        {[
          ['Структура полная', '27 разделов собраны'],
          ['Язык документа', 'Русский'],
          ['Следующий шаг', 'Создать курс для адаптации'],
        ].map(([title, body]) => (
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
        Создать курс из инструкции
      </button>
    </aside>
  )
}

function DocumentPaper({
  dark,
  executive = false,
  academy = false,
  spacious = false,
}: {
  dark: boolean
  executive?: boolean
  academy?: boolean
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
        {academy ? (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              dark
                ? 'border-violet-300/20 bg-violet-300/10 text-violet-100'
                : 'border-violet-200 bg-violet-50 text-violet-700'
            )}
          >
            Готово к курсу
          </div>
        ) : null}
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
