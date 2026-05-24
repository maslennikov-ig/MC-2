'use client'

import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquareText,
  PenLine,
  Search,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const lazyWebReferences = [
  {
    name: 'Gemini Gems',
    pattern: 'форма настройки ассистента + живое превью',
    applied: 'чёткое разделение “заполняю” и “что получится”',
  },
  {
    name: 'Tiptap Docs',
    pattern: 'трёхколоночный редактор с оглавлением',
    applied: 'левая навигация, рабочая область и контекст справа',
  },
  {
    name: 'Userpilot / Chameleon',
    pattern: 'рабочая панель onboarding с чеклистом',
    applied: 'видно весь путь, но фокус остаётся на текущем шаге',
  },
  {
    name: 'Hemingway Editor',
    pattern: 'редактор документа + подсказки качества',
    applied: 'инструкция выглядит как документ уже во время заполнения',
  },
  {
    name: 'Discord Developer Portal',
    pattern: 'плотный app-shell для создания сущности',
    applied: 'меньше “лендинга”, больше рабочего интерфейса',
  },
]

const steps = [
  { label: 'Роль', value: 'Менеджер по продажам', done: true },
  { label: 'Область', value: 'Корпоративные продажи', done: true },
  { label: 'Уровень', value: 'Младший специалист', done: true },
  { label: 'Подчинение', value: 'Руководителю отдела продаж', done: true },
  { label: 'Компания', value: '10-50 сотрудников', done: true },
  { label: 'Стадия', value: 'Растущий продукт', done: true },
  { label: 'Язык', value: 'Русский', done: true },
]

const documentSections = [
  'Цель должности',
  'Зоны ответственности',
  'Ежедневные задачи',
  'Показатели результата',
  'Квалификация',
  'Взаимодействие',
]

const answerCards = [
  ['Должность', 'Менеджер по продажам'],
  ['Продажи', 'Корпоративные клиенты, длинный цикл сделки'],
  ['Уровень', 'Младший специалист'],
  ['Подчинение', 'Руководителю отдела продаж'],
  ['Компания', '10-50 сотрудников'],
  ['Стадия', 'Растущий продукт'],
]

const variants: Array<{
  id: string
  title: string
  subtitle: string
  reference: string
  bestFor: string
  caution: string
  icon: LucideIcon
  tone: string
}> = [
  {
    id: 'workbench',
    title: 'Вариант 1. Рабочая панель',
    subtitle: 'Широкий конструктор: вопросы слева, форма по центру, качество контекста справа.',
    reference: 'Gemini Gems + Userpilot onboarding',
    bestFor: 'Самый близкий к текущему продукту, но заметно взрослее и шире.',
    caution: 'Нужно аккуратно адаптировать мобильную версию.',
    icon: LayoutDashboard,
    tone: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  {
    id: 'document',
    title: 'Вариант 2. Документ на первом плане',
    subtitle: 'Пользователь сразу видит будущую должностную инструкцию, а не только вопросы.',
    reference: 'Tiptap Docs + Hemingway Editor',
    bestFor: 'Когда важно ощущение “я собираю настоящий документ”.',
    caution: 'Сложнее реализовать, если секции документа будут активно редактироваться.',
    icon: FileText,
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  {
    id: 'command',
    title: 'Вариант 3. Командный центр',
    subtitle: 'Один сильный ввод роли, умные подсказки и быстрые карточки для уточнений.',
    reference: 'Doe input + Chameleon setup cards',
    bestFor: 'Если хотим быстрый старт без перегруженного “чат-бота”.',
    caution: 'Нужны хорошие подсказки, иначе интерфейс будет казаться пустым.',
    icon: MessageSquareText,
    tone: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    id: 'review',
    title: 'Вариант 4. Доска проверки',
    subtitle: 'После заполнения главный экран становится обзором ответов и готовности к генерации.',
    reference: 'Asana review flow + Userpilot checklist',
    bestFor: 'Решает твою претензию: не заставляет снова ходить по вопросам, когда всё заполнено.',
    caution: 'До заполнения нужен отдельный компактный режим вопроса.',
    icon: ClipboardCheck,
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  {
    id: 'brief',
    title: 'Вариант 5. Профессиональный бриф',
    subtitle: 'Спокойная форма без лишних панелей: крупнее шрифт, меньше шума, больше воздуха.',
    reference: 'Enterprise forms: Asana / Grammarly sales forms',
    bestFor: 'Самый быстрый путь к чистой реализации без сложной логики.',
    caution: 'Меньше “вау”, чем у вариантов с документом или командным центром.',
    icon: ClipboardList,
    tone: 'bg-slate-100 text-slate-800 ring-slate-300',
  },
]

export default function CareerPlaybookConstructorVariantsPage() {
  return (
    <main className="min-h-screen bg-[#f6f3ee] text-slate-950">
      <TopIntro />
      <VariantSection variant={variants[0]}>
        <WorkbenchVariant />
      </VariantSection>
      <VariantSection variant={variants[1]}>
        <DocumentVariant />
      </VariantSection>
      <VariantSection variant={variants[2]}>
        <CommandCenterVariant />
      </VariantSection>
      <VariantSection variant={variants[3]}>
        <ReviewBoardVariant />
      </VariantSection>
      <VariantSection variant={variants[4]}>
        <BriefVariant />
      </VariantSection>
    </main>
  )
}

function TopIntro() {
  return (
    <header className="border-b border-stone-300/70 bg-[#f9f6f1]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-10">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1 text-sm font-medium text-stone-700">
              <Library className="h-4 w-4 text-violet-600" />
              LazyWeb-подборка для конструктора
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
              5 направлений интерфейса для конструктора должностной инструкции
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
              Это не финальная реализация, а локальные моки для выбора. Я взял рабочие паттерны из
              реальных продуктов и адаптировал их под наш сценарий: заполнить роль, проверить
              контекст и запустить генерацию.
            </p>
          </div>
          <nav className="grid min-w-[280px] gap-2 rounded-2xl border border-stone-300 bg-white p-3 shadow-sm">
            {variants.map((variant, index) => (
              <a
                key={variant.id}
                href={`#${variant.id}`}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <span>
                  {index + 1}. {variant.title.replace(/^Вариант \d+\. /, '')}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </a>
            ))}
          </nav>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {lazyWebReferences.map((reference) => (
            <div
              key={reference.name}
              className="rounded-2xl border border-stone-300 bg-white p-4 shadow-sm"
            >
              <div className="text-sm font-semibold text-slate-950">{reference.name}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{reference.pattern}</div>
              <div className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-700">
                {reference.applied}
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
}

function VariantSection({
  variant,
  children,
}: {
  variant: (typeof variants)[number]
  children: React.ReactNode
}) {
  const Icon = variant.icon

  return (
    <section id={variant.id} className="mx-auto max-w-[1680px] scroll-mt-4 px-6 py-8 lg:px-10">
      <div className="space-y-4">
        <aside className="rounded-[28px] border border-stone-300 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1.2fr)_1fr_1fr_1fr] lg:items-start">
            <div>
              <div className={cn('mb-4 inline-flex rounded-2xl p-3 ring-1', variant.tone)}>
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                {variant.title}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">{variant.subtitle}</p>
            </div>
            <MetaBlock title="Референсы" value={variant.reference} />
            <MetaBlock title="Почему стоит рассмотреть" value={variant.bestFor} />
            <MetaBlock title="Риск" value={variant.caution} />
          </div>
        </aside>
        <div className="overflow-hidden rounded-[28px] border border-stone-300 bg-white shadow-sm">
          {children}
        </div>
      </div>
    </section>
  )
}

function MetaBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{value}</div>
    </div>
  )
}

function MockHeader({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-slate-200 bg-white px-6',
        compact ? 'py-3' : 'py-4'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white">
          <BriefcaseBusiness className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold text-slate-950">{title}</div>
          <div className="text-sm text-slate-500">Черновик сохранён локально</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          Библиотека
        </button>
        <button className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Создать инструкцию
        </button>
      </div>
    </div>
  )
}

function StepRail({ activeIndex = 1 }: { activeIndex?: number }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div
          key={step.label}
          className={cn(
            'rounded-2xl border px-3 py-3',
            index === activeIndex
              ? 'border-violet-300 bg-violet-50'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">{step.label}</span>
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-300" />
            )}
          </div>
          <div className="mt-1 text-sm leading-5 text-slate-500">{step.value}</div>
        </div>
      ))}
    </div>
  )
}

function WorkbenchVariant() {
  return (
    <div className="bg-slate-100">
      <MockHeader title="Конструктор должностной инструкции" />
      <div className="grid min-h-[720px] gap-5 p-5 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Вопросы
            </div>
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
              7 из 7
            </div>
          </div>
          <StepRail activeIndex={1} />
        </aside>

        <section className="rounded-3xl border border-slate-200 bg-white p-7">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
                <Search className="h-4 w-4" />
                Автоподбор роли включён
              </div>
              <h3 className="text-3xl font-semibold tracking-tight text-slate-950">
                Уточните область работы
              </h3>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                Мы уже знаем, что это менеджер по продажам. Поэтому следующий вопрос показывает
                близкие варианты, а не общий список отделов.
              </p>
            </div>
            <div className="min-w-32 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
              <div className="text-2xl font-semibold text-slate-950">86%</div>
              <div className="text-sm text-slate-500">контекст готов</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {['Корпоративные продажи', 'Розничные продажи', 'Развитие партнёров'].map(
              (option, index) => (
                <button
                  key={option}
                  className={cn(
                    'min-h-28 rounded-2xl border p-4 text-left transition',
                    index === 0
                      ? 'border-violet-400 bg-violet-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="text-base font-semibold text-slate-950">{option}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    {index === 0
                      ? 'Лучше всего подходит к введённой роли'
                      : 'Можно выбрать, если роль устроена иначе'}
                  </div>
                </button>
              )
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700">Свой вариант</label>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-500">
              Например: продажи через партнёрскую сеть
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between">
            <button className="rounded-xl border border-slate-200 px-5 py-3 text-base font-semibold text-slate-600">
              Назад
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-base font-semibold text-white">
              Продолжить
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
            <Gauge className="h-5 w-5 text-violet-600" />
            Проверка контекста
          </div>
          <div className="space-y-3">
            {[
              ['Роль нормализована', 'Менеджер по продажам'],
              ['Не хватает', 'Каналы продаж и метрики'],
              ['Можно генерировать', 'после выбора области'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-500">{label}</div>
                <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-violet-50 p-4 text-sm leading-6 text-violet-800">
            Система предлагает следующий вопрос на основе уже введённой роли, а не гонит
            пользователя по одинаковому сценарию.
          </div>
        </aside>
      </div>
    </div>
  )
}

function DocumentVariant() {
  return (
    <div className="bg-[#f3f0e8]">
      <MockHeader title="Должностная инструкция" compact />
      <div className="grid min-h-[760px] gap-5 p-5 lg:grid-cols-[260px_minmax(0,1fr)_330px]">
        <aside className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-4">
          <div className="mb-4 text-sm font-semibold tracking-wide text-stone-500 uppercase">
            Структура
          </div>
          <div className="space-y-2">
            {documentSections.map((section, index) => (
              <div
                key={section}
                className={cn(
                  'rounded-2xl px-3 py-3 text-sm font-medium',
                  index === 1 ? 'bg-slate-950 text-white' : 'text-stone-700 hover:bg-stone-100'
                )}
              >
                {section}
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-stone-300 bg-[#fffdf8] px-10 py-9 shadow-sm">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 flex items-center justify-between border-b border-stone-200 pb-5">
              <div>
                <div className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
                  Черновик документа
                </div>
                <h3 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                  Менеджер по продажам
                </h3>
              </div>
              <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                6 блоков готовы
              </div>
            </div>

            <article className="space-y-7 text-lg leading-8 text-slate-800">
              <section>
                <h4 className="mb-3 text-2xl font-semibold text-slate-950">Цель должности</h4>
                <p>
                  Отвечает за поиск, квалификацию и сопровождение клиентов в сегменте корпоративных
                  продаж. Помогает команде стабильно выполнять план по выручке и качеству воронки.
                </p>
              </section>
              <section>
                <h4 className="mb-3 text-2xl font-semibold text-slate-950">Зоны ответственности</h4>
                <ul className="space-y-3">
                  <li>Ведение первичных переговоров и фиксация потребностей клиента.</li>
                  <li>Подготовка коммерческих предложений вместе с руководителем отдела.</li>
                  <li className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
                    Нужно уточнить: какие показатели считаются ключевыми для этой роли?
                  </li>
                </ul>
              </section>
            </article>
          </div>
        </section>

        <aside className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-5">
          <div className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
            <PenLine className="h-5 w-5 text-emerald-600" />
            Уточнение
          </div>
          <div className="rounded-2xl border border-stone-200 p-4">
            <div className="text-sm font-semibold text-stone-500">Текущий вопрос</div>
            <div className="mt-2 text-xl leading-7 font-semibold text-slate-950">
              Какие показатели результата важны?
            </div>
            <div className="mt-4 space-y-2">
              {[
                'Выполнение плана продаж',
                'Количество квалифицированных сделок',
                'Скорость ответа клиенту',
              ].map((metric) => (
                <button
                  key={metric}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-stone-50"
                >
                  {metric}
                </button>
              ))}
            </div>
          </div>
          <button className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-base font-semibold text-white">
            Обновить документ
          </button>
        </aside>
      </div>
    </div>
  )
}

function CommandCenterVariant() {
  return (
    <div className="bg-[#0f1020] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-700">
            <PenLine className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Конструктор инструкции</div>
            <div className="text-sm text-white/55">Сначала роль, затем только нужные уточнения</div>
          </div>
        </div>
        <button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">
          Создать инструкцию
        </button>
      </div>

      <div className="min-h-[760px] p-6">
        <section className="mx-auto max-w-5xl pt-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-white/70">
            <MessageSquareText className="h-4 w-4" />
            Можно писать обычным языком
          </div>
          <h3 className="max-w-3xl text-5xl font-semibold tracking-tight">
            Опишите роль одной фразой, остальное уточним по делу
          </h3>
          <div className="mt-7 rounded-[28px] border border-white/15 bg-white p-3 shadow-2xl">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-5 py-5 text-slate-900">
              <Search className="h-6 w-6 text-slate-400" />
              <span className="text-xl font-medium">Менеджер по продажам для B2B SaaS</span>
              <button className="ml-auto rounded-xl bg-violet-600 px-5 py-3 text-base font-semibold text-white">
                Найти профиль
              </button>
            </div>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              ['Похоже на', 'Менеджер корпоративных продаж', '92%'],
              ['Следующий вопрос', 'Какой цикл сделки?', 'важно'],
              ['Готовность', 'Можно собрать черновик', '6/7'],
            ].map(([label, value, badge]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-white/55">{label}</span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/70">
                    {badge}
                  </span>
                </div>
                <div className="text-xl leading-7 font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="mb-4 text-sm font-semibold tracking-wide text-white/45 uppercase">
                Рекомендуемые уточнения
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  'Сегмент клиентов',
                  'Средний чек',
                  'Показатели результата',
                  'Инструменты продаж',
                ].map((item) => (
                  <button
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-left text-base font-semibold text-white hover:bg-white/10"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-violet-300/30 bg-violet-400/10 p-5">
              <div className="text-sm font-semibold tracking-wide text-violet-200 uppercase">
                Почему это лучше текущего
              </div>
              <p className="mt-3 text-base leading-7 text-white/80">
                Интерфейс не заставляет проходить все вопросы линейно. Он строит уточнения вокруг
                роли и показывает пользователю, почему вопрос появился.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ReviewBoardVariant() {
  return (
    <div className="bg-slate-50">
      <MockHeader title="Проверка перед генерацией" />
      <div className="grid min-h-[730px] gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
                Все базовые вопросы заполнены
              </div>
              <h3 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Проверьте контекст, затем запускайте генерацию
              </h3>
            </div>
            <div className="rounded-full bg-emerald-50 px-4 py-2 text-base font-semibold text-emerald-700">
              Готово к генерации
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {answerCards.map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500">{label}</span>
                  <button className="text-sm font-semibold text-violet-700">Изменить</button>
                </div>
                <div className="text-xl leading-7 font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-1 h-5 w-5 text-amber-700" />
              <div>
                <div className="text-lg font-semibold text-amber-950">Полезное уточнение</div>
                <p className="mt-1 text-base leading-7 text-amber-900">
                  Можно добавить показатели результата, но это не блокирует генерацию. Если не
                  заполнить, система предложит типовые метрики для отдела продаж.
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="mb-5 text-lg font-semibold text-slate-950">Итоговая готовность</div>
          <div className="space-y-3">
            {[
              ['Базовый контекст', '100%'],
              ['Ролевые подсказки', '80%'],
              ['Риск неоднозначности', 'низкий'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
              >
                <span className="text-base text-slate-600">{label}</span>
                <span className="text-base font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </div>
          <button className="mt-6 w-full rounded-2xl bg-violet-600 px-5 py-4 text-lg font-semibold text-white">
            Сгенерировать инструкцию
          </button>
          <button className="mt-3 w-full rounded-2xl border border-slate-200 px-5 py-4 text-base font-semibold text-slate-700">
            Добавить уточнение вручную
          </button>
        </aside>
      </div>
    </div>
  )
}

function BriefVariant() {
  return (
    <div className="bg-white">
      <div className="border-b border-slate-200 px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Конструктор
            </div>
            <div className="text-2xl font-semibold text-slate-950">Должностная инструкция</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              Сохранить черновик
            </button>
            <button className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
              Продолжить
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid min-h-[720px] max-w-6xl gap-8 px-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2 text-base font-semibold text-violet-700">
              <ListChecks className="h-5 w-5" />
              Шаг 2 из 4
            </div>
            <h3 className="text-4xl font-semibold tracking-tight text-slate-950">
              Расскажите, где работает эта роль
            </h3>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-600">
              Мы используем это, чтобы не подставлять лишние обязанности и метрики. Свой вариант
              можно ввести в каждом поле.
            </p>
          </div>

          <div className="space-y-6">
            <FieldPreview
              label="Название роли"
              value="Менеджер по продажам"
              hint="Выбрано из похожих ролей, можно изменить вручную"
            />
            <div>
              <label className="text-base font-semibold text-slate-950">
                Функциональная область
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  'Корпоративные продажи',
                  'Розничные продажи',
                  'Партнёрские продажи',
                  'Другое',
                ].map((item, index) => (
                  <button
                    key={item}
                    className={cn(
                      'rounded-2xl border px-5 py-4 text-left text-base font-semibold',
                      index === 0
                        ? 'border-violet-400 bg-violet-50 text-violet-950'
                        : 'border-slate-200 bg-white text-slate-800'
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <FieldPreview
              label="Свой вариант"
              value="Например: продажи через партнёров"
              hint="Появляется при выборе “Другое”, а не отдельной кнопкой"
              muted
            />
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Library className="h-5 w-5 text-violet-600" />
            Сводка
          </div>
          <StepRail activeIndex={1} />
        </aside>
      </div>
    </div>
  )
}

function FieldPreview({
  label,
  value,
  hint,
  muted,
}: {
  label: string
  value: string
  hint: string
  muted?: boolean
}) {
  return (
    <div>
      <label className="text-base font-semibold text-slate-950">{label}</label>
      <div
        className={cn(
          'mt-3 rounded-2xl border px-5 py-4 text-lg',
          muted
            ? 'border-dashed border-slate-300 text-slate-400'
            : 'border-slate-200 text-slate-950'
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{hint}</div>
    </div>
  )
}
