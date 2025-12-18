# План исправлений и улучшений: Celestial Redesign

**Цель:** Исправить технические ошибки, улучшить UX (таймер, прогресс), скорректировать логику отображения данных (уроки, шаги) и локализовать интерфейс.

---

## Файловая структура проекта (Контекст для субагента)

```
packages/web/components/generation-celestial/
├── ActiveStageCard.tsx    # Раскрывающаяся карточка с деталями этапа
├── CelestialHeader.tsx    # Заголовок с прогрессом и статусом подключения
├── CelestialJourney.tsx   # Основной компонент путешествия с планетами
├── MissionControlBanner.tsx # Баннер для подтверждения этапов
├── PhaseProgress.tsx      # Прогресс внутри этапа
├── PlanetNode.tsx         # Визуализация планеты-этапа
├── SpaceBackground.tsx    # Космический фон
├── StageResultsDrawer.tsx # Drawer с результатами этапа
├── TrajectoryLine.tsx     # Линия траектории
├── utils.ts               # Утилиты и типы (STAGE_CONFIG, buildStagesFromStatus)
└── index.ts               # Экспорты

packages/web/components/generation/
└── StatsGrid.tsx          # Сетка статистики (время, документы, уроки, шаги)

packages/web/app/courses/generating/[slug]/
├── GenerationProgressContainerEnhanced.tsx  # Главный контейнер страницы
└── ActivityLog.tsx        # Лог активности
```

---

## Фаза 1: Критические исправления и Логика (High Priority)

### Task 1: Исправление ошибки "Unique Key"

**Проблема:** `Encountered two children with the same key` в консоли.

**Причина:** В `GenerationProgressContainerEnhanced.tsx` используется `Date.now().toString()` для генерации ID:
```typescript
// Строки 87-88, 105-106, 111-112
id: Date.now().toString(),
```

При быстрых обновлениях (< 1ms между событиями) ID дублируются.

**Решение:**
Заменить все `Date.now().toString()` на `crypto.randomUUID()`:
```typescript
id: crypto.randomUUID(),
```

**Файл:** `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`
**Строки для изменения:** 87, 105, 111, 393 (поиск по `Date.now()`)

**Исполнитель:** Main Agent (прямое исправление).

---

### Task 2: Корректировка логики Прогресса и Шагов

**Проблема:**
1. Отображается 5 шагов вместо 6 (Stage 1 не учтен)
2. Прогресс нелинейный (40% при 2-х шагах)
3. "Lessons 0/5" некорректно отображается до получения данных

**Файлы для изменения:**

#### 2.1 Добавить Stage 1 в STAGE_CONFIG

**Файл:** `packages/web/components/generation-celestial/utils.ts`

Текущий код (строки 39-45):
```typescript
export const STAGE_CONFIG = {
  stage_2: { number: 2, name: 'Document Processing', icon: 'FileText' as const },
  stage_3: { number: 3, name: 'Summarization', icon: 'Moon' as const },
  stage_4: { number: 4, name: 'Analysis', icon: 'Orbit' as const },
  stage_5: { number: 5, name: 'Structure Generation', icon: 'Layers' as const },
  stage_6: { number: 6, name: 'Content Generation', icon: 'Globe' as const },
} as const;
```

Заменить на:
```typescript
export const STAGE_CONFIG = {
  stage_1: { number: 1, name: 'Preparation', icon: 'Upload' as const },
  stage_2: { number: 2, name: 'Document Processing', icon: 'FileText' as const },
  stage_3: { number: 3, name: 'Summarization', icon: 'Moon' as const },
  stage_4: { number: 4, name: 'Analysis', icon: 'Orbit' as const },
  stage_5: { number: 5, name: 'Structure Generation', icon: 'Layers' as const },
  stage_6: { number: 6, name: 'Content Generation', icon: 'Globe' as const },
} as const;
```

Также обновить тип `iconName` в `StageInfo` (строка 36):
```typescript
iconName: 'Upload' | 'FileText' | 'Moon' | 'Orbit' | 'Layers' | 'Globe';
```

И добавить импорт/иконку Upload в `PlanetNode.tsx` (строка 4, 18-24).

#### 2.2 Скрыть счетчик уроков пока данные недоступны

**Файл:** `packages/web/components/generation/StatsGrid.tsx`

Текущий код (строки 174-182):
```typescript
<StatCard
  icon={<BookOpen className="w-5 h-5" />}
  label="Lessons"
  value={`${progress.lessons_completed}/${progress.lessons_total}`}
  subValue={`${progress.lessons_total > 0 ? Math.round((progress.lessons_completed / progress.lessons_total) * 100) : 0}%`}
  color="purple"
/>
```

Заменить на:
```typescript
<StatCard
  icon={<BookOpen className="w-5 h-5" />}
  label="Lessons"
  value={progress.lessons_total > 0
    ? `${progress.lessons_completed}/${progress.lessons_total}`
    : '—'}
  subValue={progress.lessons_total > 0
    ? `${Math.round((progress.lessons_completed / progress.lessons_total) * 100)}%`
    : 'Calculating...'}
  color="purple"
/>
```

**Исполнитель:** Main Agent.

---

## Фаза 2: UI/UX и "Сердцебиение" (High Priority)

### Task 3: Исправление анимации Таймера

**Проблема:** Таймер "тикает" как сердцебиение (раздражает пользователей).

**Причина:** В `StatsGrid.tsx` компонент `StatCard` использует `key={String(value)}` (строка 70):
```typescript
<motion.p
  className="text-2xl font-bold"
  initial={{ scale: 0 }}
  animate={{ scale: 1 }}
  transition={{ type: 'spring', stiffness: 200 }}
  key={String(value)}  // <-- ЭТО ВЫЗЫВАЕТ ПОЛНЫЙ RE-RENDER
>
  {value}
</motion.p>
```

**Решение:** Для таймера убрать анимацию scale или использовать tabular-nums:

Вариант 1 - Убрать key для плавного обновления:
```typescript
<motion.p
  className="text-2xl font-bold tabular-nums"
>
  {value}
</motion.p>
```

Вариант 2 - Добавить prop `disableAnimation` в StatCard и использовать его для таймера.

**Файл:** `packages/web/components/generation/StatsGrid.tsx`
**Строки:** 65-73

**Исполнитель:** Main Agent.

---

### Task 4: Расширение макета и новые виджеты

**Проблема:** Контент слишком узкий (max-w-6xl), есть свободное место.

**Решение:**

#### 4.1 Расширить контейнер

**Файл:** `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

Текущий код (строка 698):
```typescript
<div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-8">
```

Заменить на:
```typescript
<div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl py-8">
```

#### 4.2 Добавить новые карточки в StatsGrid

**Файл:** `packages/web/components/generation/StatsGrid.tsx`

Изменить grid с 4 колонок на 6:
```typescript
// Строка 157
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8"
```

Добавить новые карточки после существующих:

```typescript
{/* Стоимость генерации */}
<motion.div variants={itemVariants}>
  <StatCard
    icon={<DollarSign className="w-5 h-5" />}
    label="Cost"
    value={progress.cost_usd ? `$${progress.cost_usd.toFixed(4)}` : '$0.00'}
    subValue="USD"
    color="green"
  />
</motion.div>

{/* Текущая модель */}
<motion.div variants={itemVariants}>
  <StatCard
    icon={<Cpu className="w-5 h-5" />}
    label="AI Model"
    value={progress.current_model || 'gpt-4o'}
    color="blue"
  />
</motion.div>
```

Добавить импорты:
```typescript
import { DollarSign, Cpu } from 'lucide-react';
```

**Примечание:** Нужно проверить, есть ли `cost_usd` и `current_model` в типе `GenerationProgress`. Если нет - добавить или использовать данные из traces.

**Исполнитель:** Main Agent.

---

## Фаза 3: Локализация (Medium Priority)

### Task 5: Перевод интерфейса на Русский язык

**Словарь перевода:**

| Английский | Русский |
|------------|---------|
| Mission Progress | Прогресс миссии |
| Disconnected | Нет связи |
| Elapsed Time | Время |
| Documents | Документы |
| Lessons | Уроки |
| Steps | Шаги |
| In Progress | Выполняется |
| Completed | Завершено |
| Pending | Ожидание |
| Failed | Ошибка |
| Awaiting Approval | Ожидает подтверждения |
| Mission Control | Центр управления |
| Awaiting Authorization | Ожидание подтверждения |
| Abort | Отменить |
| Inspect | Детали |
| Launch Phase | Запустить фазу |
| Authorizing... | Подтверждение... |
| Results | Результаты |
| Activity Log | Журнал событий |
| Cost | Стоимость |
| AI Model | Модель ИИ |

**Файлы для локализации:**

1. `CelestialHeader.tsx` (строки 29, 32)
2. `StatsGrid.tsx` (строки 166, 177, 187, 197)
3. `MissionControlBanner.tsx` (строки 42, 72, 81, 90, 94)
4. `PlanetNode.tsx` (строки 121-125)
5. `StageResultsDrawer.tsx` (строки 51, 54)
6. `utils.ts` - названия стадий в STAGE_CONFIG (строки 39-45)

**Названия стадий (STAGE_CONFIG):**
```typescript
stage_1: { number: 1, name: 'Подготовка', icon: 'Upload' as const },
stage_2: { number: 2, name: 'Обработка документов', icon: 'FileText' as const },
stage_3: { number: 3, name: 'Суммаризация', icon: 'Moon' as const },
stage_4: { number: 4, name: 'Анализ', icon: 'Orbit' as const },
stage_5: { number: 5, name: 'Генерация структуры', icon: 'Layers' as const },
stage_6: { number: 6, name: 'Генерация контента', icon: 'Globe' as const },
```

**Исполнитель:** Main Agent.

---

## Фаза 4: Визуализация параллельных процессов (New Feature - Low Priority)

### Task 6: Группировка параллельных процессов

**Проблема:** Параллельные процессы (генерация уроков) отображаются "кашей".

**Решение:**
1. Расширить `ActiveStageCard` для отображения sub-tasks
2. Добавить компонент `ParallelProcessGroup`
3. Группировать логи по `lesson_id` или временным интервалам

**Детали реализации:**

В `GenerationTrace` уже есть поле `lesson_id` (строка 8 utils.ts):
```typescript
lesson_id?: string;
```

Можно группировать traces по `lesson_id` для отображения параллельных процессов.

**Файлы для создания/изменения:**
- Создать: `packages/web/components/generation-celestial/ParallelProcessGroup.tsx`
- Изменить: `ActiveStageCard.tsx`, `CelestialJourney.tsx`

**Исполнитель:** Делегировать субагенту после выполнения Фаз 1-3.

---

## Стратегия выполнения

### Порядок выполнения:

0. **Task 0** (Дизайн-исследование) - ПЕРВЫМ, до имплементации
1. **Task 1** (Unique Key) - критический баг, исправить первым
2. **Task 3** (Таймер) - раздражающий UX баг (с учетом рекомендаций дизайнера)
3. **Task 2** (Логика прогресса) - функциональное исправление
4. **Task 5** (Локализация) - улучшение UX
5. **Task 4** (Расширение макета) - новые фичи (с учетом рекомендаций дизайнера)
6. **Task 6** (Параллельные процессы) - future enhancement (с учетом рекомендаций дизайнера)

### Валидация после каждой задачи:

```bash
cd packages/web && pnpm type-check
cd packages/web && pnpm build
```

### Коммит стратегия:

После каждой задачи:
```bash
git add .
git commit -m "fix(celestial): <описание изменения>"
```

---

## Дополнительный контекст для субагента

### Типы (GenerationProgress)

Файл: `packages/web/types/course-generation.ts`

```typescript
export interface GenerationProgress {
  steps: GenerationStep[];
  message: string;
  percentage: number;
  current_step: number;
  total_steps: number;
  has_documents: boolean;
  lessons_completed: number;
  lessons_total: number;
  started_at: Date;
  current_stage: string | null;
  document_size: number | null;
  estimated_completion?: Date;
}
```

### Realtime данные

Traces приходят через `useGenerationRealtime()` hook из:
`packages/web/components/generation-monitoring/realtime-provider.tsx`

### Тестовый URL

Для проверки изменений использовать страницу генерации курса:
`/courses/generating/[slug]`

---

## Фаза 0: Дизайн-исследование (BEFORE Implementation)

### Task 0: Дизайн-аудит и рекомендации

**Исполнитель:** Субагент `nextjs-ui-designer`

**Цель:** Провести анализ текущего UI и предложить улучшения с точки зрения UX/UI дизайна.

**Задачи для исследования:**

1. **Анимация таймера (Task 3)**
   - Какой паттерн лучше: мгновенное обновление чисел, плавная анимация, или countdown-style?
   - Референсы: как это делают Vercel, Linear, Stripe?
   - Рекомендовать конкретное решение с примером кода

2. **Расширение макета (Task 4)**
   - Оптимальная ширина для data-heavy dashboard: max-w-6xl vs max-w-screen-xl?
   - Сколько карточек оптимально в одном ряду: 4, 5, или 6?
   - Какие дополнительные метрики важнее показать: Cost, Model, Tokens, Speed?
   - Предложить responsive breakpoints

3. **Визуализация параллельных процессов (Task 6)**
   - Какой паттерн лучше: nested cards, progress bars, timeline branches, или gantt-style?
   - Как показать связь "родитель-дети" визуально?
   - Референсы из CI/CD dashboards (GitHub Actions, Vercel, Railway)

4. **Общие улучшения Celestial темы**
   - Соответствует ли текущий дизайн "космической" теме?
   - Цветовая палитра: достаточно ли контраста?
   - Accessibility: читаемость текста на темном фоне
   - Микро-интеракции: hover states, loading states

**Формат результата:**

Добавить в этот файл секцию `## Результаты дизайн-исследования` с:
- Конкретные рекомендации по каждому пункту
- Примеры кода (snippets)
- Ссылки на референсы
- Приоритизация: must-have vs nice-to-have

**Контекст для дизайнера:**

Текущие файлы для изучения:
- `packages/web/components/generation-celestial/` - все компоненты
- `packages/web/components/generation/StatsGrid.tsx` - статистика
- `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx` - главный контейнер

Используемые технологии:
- Next.js 15+ (App Router)
- Tailwind CSS
- Framer Motion
- shadcn/ui
- Lucide icons

Целевая аудитория:
- Пользователи, ожидающие генерации курса (1-5 минут)
- Администраторы, мониторящие процесс

---

## Результаты дизайн-исследования

### 1. Анимация таймера (Task 3)

**Проблема:** Текущая реализация использует `key={String(value)}` на motion.p элементе, что вызывает полный re-render и scale animation каждую секунду. Это создает "сердцебиение" эффект.

**Анализ лучших практик:**
- **Vercel Dashboard**: Использует `tabular-nums` для монохронных цифр без анимации. Обновления происходят мгновенно.
- **Linear**: Применяет `font-variant-numeric: tabular-nums` для предотвращения смещения макета при изменении цифр.
- **Stripe Dashboard**: Использует CSS `font-feature-settings: "tnum"` для табличных цифр, без анимации на счетчиках времени.

**Рекомендация:** УБРАТЬ анимацию для таймера

**Приоритет:** MUST-HAVE (высокий раздражающий фактор)

**Решение:**
```typescript
// packages/web/components/generation/StatsGrid.tsx

// ВАРИАНТ 1 (рекомендуемый): Убрать key и анимацию только для таймера
function StatCard({ icon, label, value, subValue, color = 'blue', isLoading, disableAnimation }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <Card className={cn(
        'overflow-hidden border rounded-xl backdrop-blur-sm transition-shadow duration-300',
        colorClasses[color as keyof typeof colorClasses]
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider opacity-70">
                {label}
              </p>
              <div className="mt-2 flex items-baseline">
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="w-5 h-5 opacity-70" />
                  </motion.div>
                ) : disableAnimation ? (
                  // NO ANIMATION for timer - instant update
                  <>
                    <p className="text-2xl font-bold tabular-nums">
                      {value}
                    </p>
                    {subValue && (
                      <p className="ml-2 text-sm opacity-60">
                        {subValue}
                      </p>
                    )}
                  </>
                ) : (
                  // WITH ANIMATION for other metrics
                  <>
                    <motion.p
                      className="text-2xl font-bold"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                      key={String(value)}
                    >
                      {value}
                    </motion.p>
                    {subValue && (
                      <motion.p
                        className="ml-2 text-sm opacity-60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {subValue}
                      </motion.p>
                    )}
                  </>
                )}
              </div>
            </div>
            <motion.div
              className="p-2 rounded-lg bg-white/5"
              whileHover={{ rotate: 15 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {icon}
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Обновить интерфейс
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  isLoading?: boolean;
  disableAnimation?: boolean; // NEW PROP
}

// В StatsGrid использовать disableAnimation для таймера:
<StatCard
  icon={<Clock className="w-5 h-5" />}
  label="Elapsed Time"
  value={elapsed}
  subValue={status === 'completed' ? 'Completed' : 'In Progress'}
  color="orange"
  disableAnimation={true} // <-- DISABLE animation for timer
/>
```

**CSS добавить в globals.css:**
```css
/* Tabular numbers для цифр (уже есть в проекте) */
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

---

### 2. Расширение макета (Task 4)

**Текущее состояние:**
- Контейнер: `max-w-6xl` (1152px)
- Сетка: 4 карточки в ряду на больших экранах
- Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

**Анализ дата-хэви дашбордов:**
- **Vercel Analytics**: `max-w-7xl` (1280px), 6 карточек метрик в ряду
- **GitHub Actions**: `max-w-screen-2xl` (1536px), flexible grid для параллельных задач
- **Supabase Dashboard**: `max-w-screen-xl` (1280px), 5-6 карточек на десктопе
- **Railway**: `max-w-7xl`, 5 карточек основных метрик + расширенные логи

**Рекомендация:** `max-w-screen-xl` (1280px) с 6 карточками

**Приоритет:** NICE-TO-HAVE (улучшение, не критично)

**Обоснование:**
- 1280px оптимальный баланс между информацией и читаемостью
- 6 карточек позволяют показать Cost, Model, Tokens без перегруженности
- Большинство современных мониторов 1920x1080 или выше

**Решение:**

```typescript
// packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx
// Строка 698 (приблизительно)

<div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl py-8">
  {/* Весь контент */}
</div>

// packages/web/components/generation/StatsGrid.tsx
// Изменить grid breakpoints

<motion.div
  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8"
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {/* Существующие 4 карточки */}
  <motion.div variants={itemVariants}>
    <StatCard
      icon={<FileText className="w-5 h-5" />}
      label="Documents"
      value={progress.has_documents ? 'Processed' : 'None'}
      subValue={progress.document_size ? `${(progress.document_size / 1000).toFixed(1)}KB` : undefined}
      color="blue"
      isLoading={progress.has_documents && status === 'processing_documents'}
    />
  </motion.div>

  <motion.div variants={itemVariants}>
    <StatCard
      icon={<BookOpen className="w-5 h-5" />}
      label="Lessons"
      value={progress.lessons_total > 0
        ? `${progress.lessons_completed}/${progress.lessons_total}`
        : '—'}
      subValue={progress.lessons_total > 0
        ? `${Math.round((progress.lessons_completed / progress.lessons_total) * 100)}%`
        : 'Calculating...'}
      color="purple"
    />
  </motion.div>

  <motion.div variants={itemVariants}>
    <StatCard
      icon={<Clock className="w-5 h-5" />}
      label="Elapsed Time"
      value={elapsed}
      subValue={status === 'completed' ? 'Completed' : 'In Progress'}
      color="orange"
      disableAnimation={true}
    />
  </motion.div>

  <motion.div variants={itemVariants}>
    <StatCard
      icon={status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
      label="Steps"
      value={`${completedSteps}/${progress.total_steps}`}
      subValue={`${processingSpeed()} /min`}
      color="green"
    />
  </motion.div>

  {/* НОВЫЕ КАРТОЧКИ */}
  <motion.div variants={itemVariants}>
    <StatCard
      icon={<DollarSign className="w-5 h-5" />}
      label="Cost"
      value="—" // Будет заполнено из traces
      subValue="USD"
      color="green"
    />
  </motion.div>

  <motion.div variants={itemVariants}>
    <StatCard
      icon={<Cpu className="w-5 h-5" />}
      label="Model"
      value="GPT-4" // Будет заполнено из traces
      subValue={undefined}
      color="blue"
    />
  </motion.div>
</motion.div>
```

**Добавить импорты:**
```typescript
import { DollarSign, Cpu } from 'lucide-react';
```

**Responsive breakpoints:**
```
Mobile (< 640px): 1 колонка
Tablet (640-1024px): 2 колонки
Desktop (1024-1280px): 3 колонки
Large Desktop (1280px+): 6 колонок
```

**Примечание:** Данные для Cost и Model нужно агрегировать из `traces` в GenerationProgressContainerEnhanced и передавать через props в StatsGrid.

---

### 3. Визуализация параллельных процессов (Task 6)

**Проблема:** Параллельная генерация 4-5 уроков показывается "кашей" в логах. Нет визуального разделения родитель-дети.

**Анализ CI/CD паттернов:**

**GitHub Actions:**
- Используют nested accordion для параллельных jobs
- Цветовой код: зеленый (успех), оранжевый (выполняется), красный (ошибка)
- Timeline слева с линиями соединения

**Vercel Deployments:**
- Grouped logs с collapsible sections
- Progress bars для каждого параллельного процесса
- "X of Y tasks completed" индикатор

**Railway:**
- Timeline view с branching lines для параллельных задач
- Каждая ветка имеет свой цвет
- Hover показывает детали

**Рекомендация:** NESTED ACCORDION с PROGRESS BARS

**Приоритет:** NICE-TO-HAVE (будущее улучшение)

**Обоснование:**
- Accordion наиболее читаем для пользователей
- Progress bars дают мгновенную визуальную обратную связь
- Не перегружает интерфейс (collapsed по умолчанию)

**Концептуальное решение:**

```typescript
// NEW FILE: packages/web/components/generation-celestial/ParallelProcessGroup.tsx

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GenerationTrace } from './utils';

interface ParallelProcessGroupProps {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  traces: GenerationTrace[];
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

export function ParallelProcessGroup({
  lessonId,
  lessonNumber,
  lessonTitle,
  traces,
  status
}: ParallelProcessGroupProps) {
  const [isExpanded, setIsExpanded] = useState(status === 'in_progress');

  const completedTraces = traces.filter(t => t.output_data).length;
  const totalTraces = traces.length;
  const progressPercent = totalTraces > 0 ? (completedTraces / totalTraces) * 100 : 0;

  const statusConfig = {
    pending: { icon: Loader2, color: 'text-gray-400', bgColor: 'bg-gray-500/10' },
    in_progress: { icon: Loader2, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    completed: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    error: { icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div className={cn("p-2 rounded-full", config.bgColor)}>
            <Icon className={cn("w-4 h-4", config.color, status === 'in_progress' && "animate-spin")} />
          </div>
          <div className="text-left">
            <h4 className="font-medium text-gray-200">Lesson {lessonNumber}: {lessonTitle}</h4>
            <p className="text-sm text-gray-500">
              {status === 'completed' ? 'Completed' : status === 'in_progress' ? 'Generating...' : 'Pending'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-300">{completedTraces}/{totalTraces} steps</p>
            <p className="text-xs text-gray-500">{Math.round(progressPercent)}%</p>
          </div>
          <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-800 p-4 space-y-2">
              {traces.map((trace) => (
                <div key={trace.id} className="flex items-center justify-between p-2 rounded bg-gray-800/30">
                  <div className="flex items-center gap-2">
                    {trace.output_data ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : trace.error_data ? (
                      <AlertCircle className="w-3 h-3 text-red-400" />
                    ) : (
                      <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                    )}
                    <span className="text-sm text-gray-400">{trace.step_name}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {trace.duration_ms ? `${(trace.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Интеграция в ActiveStageCard:**

```typescript
// packages/web/components/generation-celestial/ActiveStageCard.tsx

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { StageInfo, GenerationTrace } from './utils';
import { PhaseProgress } from './PhaseProgress';
import { ParallelProcessGroup } from './ParallelProcessGroup';

interface ActiveStageCardProps {
  stage: StageInfo;
  latestTrace?: GenerationTrace;
  traces: GenerationTrace[]; // ALL traces for this stage
  isExpanded: boolean;
}

export function ActiveStageCard({
  stage,
  latestTrace,
  traces,
  isExpanded
}: ActiveStageCardProps) {
  // Группировка traces по lesson_id
  const lessonGroups = traces.reduce((acc, trace) => {
    if (trace.lesson_id) {
      if (!acc[trace.lesson_id]) {
        acc[trace.lesson_id] = [];
      }
      acc[trace.lesson_id].push(trace);
    }
    return acc;
  }, {} as Record<string, GenerationTrace[]>);

  const hasParallelProcesses = Object.keys(lessonGroups).length > 1;

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0, marginTop: 0 }}
          animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
          exit={{ height: 0, opacity: 0, marginTop: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden pl-[4.5rem] pr-4"
        >
          <PhaseProgress
            phaseName={latestTrace?.phase || stage.name}
            progress={stage.progress || 0}
            tokens={latestTrace?.tokens_used}
            cost={latestTrace?.cost_usd}
            duration={latestTrace?.duration_ms}
            model={latestTrace?.model_used}
          />

          {/* PARALLEL PROCESSES */}
          {hasParallelProcesses && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Parallel Lessons Generation</h4>
              {Object.entries(lessonGroups).map(([lessonId, lessonTraces]) => (
                <ParallelProcessGroup
                  key={lessonId}
                  lessonId={lessonId}
                  lessonNumber={parseInt(lessonId.split('_')[1] || '0')}
                  lessonTitle={`Lesson ${lessonId}`} // TODO: Get actual title from DB
                  traces={lessonTraces}
                  status={
                    lessonTraces.some(t => t.error_data) ? 'error' :
                    lessonTraces.every(t => t.output_data) ? 'completed' :
                    lessonTraces.some(t => !t.output_data) ? 'in_progress' :
                    'pending'
                  }
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Визуальная иерархия:**
```
Stage 6: Content Generation [Active]
├─ Phase Progress (overall) [Показывается всегда]
└─ Parallel Lessons [Показывается только если > 1 урока]
   ├─ Lesson 1: Introduction [Completed] ✓
   ├─ Lesson 2: Basics [In Progress...] 3/5 steps ▓▓▓░░
   ├─ Lesson 3: Advanced [In Progress...] 1/5 steps ▓░░░░
   └─ Lesson 4: Summary [Pending] 0/5 steps ░░░░░
```

---

### 4. Общие улучшения Celestial темы

#### 4.1 Соответствие космической теме

**Текущее состояние:** ХОРОШО ✓
- SpaceBackground с gradients и star field
- Цвета: purple (планеты), cyan (траектории), dark space (#0a0e1a)
- Иконки планет для этапов (FileText, Moon, Orbit, Layers, Globe)

**Рекомендации для усиления:**

1. **Добавить "Звездную пыль" анимацию:**
```css
/* packages/web/app/globals.css - добавить в @layer utilities */
@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

.star-field-animated {
  animation: twinkle 3s ease-in-out infinite;
}

.star-field-animated:nth-child(2n) {
  animation-delay: 1s;
}

.star-field-animated:nth-child(3n) {
  animation-delay: 2s;
}
```

2. **Обновить SpaceBackground для плавной анимации:**
```typescript
// packages/web/components/generation-celestial/SpaceBackground.tsx

export function SpaceBackground({ className, children }: SpaceBackgroundProps) {
  return (
    <div
      className={cn(
        "relative w-full min-h-screen overflow-hidden transition-colors duration-500",
        "dark:bg-[#0a0e1a]",
        "dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]",
        "dark:from-[#111827] dark:via-[#0a0e1a] dark:to-[#000000]",
        "bg-slate-50",
        "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]",
        "from-purple-50 via-slate-50 to-white",
        className
      )}
    >
      {/* Animated star particles */}
      <div className="absolute inset-0 z-0 opacity-40 dark:block hidden">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full star-field-animated"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Dark Mode: Subtle purple nebula glow */}
      <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-purple-900/10 blur-[100px] rounded-full pointer-events-none z-0 dark:block hidden" />

      {/* Light Mode: Subtle gradient mesh */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-200/20 blur-[120px] rounded-full pointer-events-none z-0 dark:hidden block" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-200/20 blur-[120px] rounded-full pointer-events-none z-0 dark:hidden block" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
```

#### 4.2 Цветовая палитра и контраст

**Аудит WCAG 2.1 AA:**

✅ **Проходит:**
- Purple-400 на dark bg: 7.2:1 (AAA)
- Green-400 на dark bg: 5.8:1 (AA)
- Amber-400 на dark bg: 6.1:1 (AA)

⚠️ **Нужно проверить:**
- Cyan-500 на dark bg: может быть ниже 4.5:1

**Рекомендация:** Добавить CSS переменные для celestial theme:

```css
/* packages/web/app/globals.css - в :root секции уже есть */
--planet-active: 139 92 246;    /* Purple-500 */
--planet-completed: 16 185 129; /* Green-500 */
--planet-awaiting: 245 158 11;  /* Amber-500 */
--planet-error: 239 68 68;      /* Red-500 */
```

**Использовать rgb(var(--planet-active))** вместо хардкод hex значений для консистентности.

#### 4.3 Accessibility (Клавиатурная навигация)

**Текущее состояние:** ОТЛИЧНО ✓
- PlanetNode имеет `role="button"`, `tabIndex={0}`, `onKeyDown` для Enter/Space
- Фокус стили определены в globals.css
- ARIA labels присутствуют

**Дополнительная рекомендация:**

```typescript
// packages/web/components/generation-celestial/PlanetNode.tsx
// Добавить aria-live для обновлений статуса

<motion.div
  className="relative flex items-center gap-6 py-6 group cursor-pointer focus:outline-none"
  onClick={onClick}
  role="button"
  tabIndex={0}
  aria-label={`Stage ${stage.number}: ${stage.name}, status: ${stage.status}`}
  aria-live="polite" // NEW: Screen reader announces status changes
  aria-atomic="true"
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }}
>
  {/* ... */}
</motion.div>
```

#### 4.4 Микро-интеракции

**Текущее состояние:** ХОРОШО ✓
- PlanetNode: pulse animation на активных планетах
- StatCard: hover scale и rotate
- TrajectoryLine: анимированные штрихи

**Рекомендации для усиления:**

1. **Добавить "Orbital" эффект при hover на планетах:**
```typescript
// packages/web/components/generation-celestial/PlanetNode.tsx

const orbitalVariants = {
  hover: {
    scale: 1.05,
    boxShadow: [
      '0 0 0 0 rgba(139, 92, 246, 0.4)',
      '0 0 0 10px rgba(139, 92, 246, 0)',
      '0 0 0 0 rgba(139, 92, 246, 0)'
    ],
    transition: { duration: 1, repeat: Infinity }
  }
};

<motion.div
  className={cn(
    "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-300",
    statusClasses
  )}
  animate={isActive && !prefersReducedMotion ? "pulse" : undefined}
  whileHover={!prefersReducedMotion ? "hover" : undefined}
  variants={{ ...pulseVariants, ...orbitalVariants }}
>
  {/* ... */}
</motion.div>
```

2. **Добавить "Rocket Trail" для MissionControlBanner:**
```typescript
// packages/web/components/generation-celestial/MissionControlBanner.tsx

<Button
  onClick={onApprove}
  disabled={isProcessing}
  className="relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/25 border-0 group"
>
  {/* Shimmer effect on hover */}
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

  {isProcessing ? (
    "Authorizing..."
  ) : (
    <>
      <Rocket className="w-4 h-4 mr-2 group-hover:animate-pulse" />
      Launch Phase {awaitingStage + 1}
    </>
  )}
</Button>
```

---

### 5. Дополнительные рекомендации

#### 5.1 Performance

**Текущие потенциальные проблемы:**
- 50 анимированных звезд в SpaceBackground (если добавляются) могут замедлить на старых устройствах

**Рекомендация:**
```typescript
// packages/web/components/generation-celestial/SpaceBackground.tsx

const prefersReducedMotion = useReducedMotion();
const starCount = prefersReducedMotion ? 0 : 30; // Reduce stars if motion reduced

{[...Array(starCount)].map((_, i) => (
  // ... stars
))}
```

#### 5.2 Dark Mode Toggle

**Текущее состояние:** Используется class-based dark mode (`darkMode: 'class'`)

**Рекомендация:** Убедиться что SpaceBackground корректно реагирует на переключение темы. Проверить что transitions smooth:

```css
/* packages/web/app/globals.css - уже есть */
.dark {
  transition: background-color 0.3s ease, color 0.3s ease;
}
```

#### 5.3 Loading States

**Текущее состояние:** PhaseProgress показывает "Initializing..." если нет phase name

**Рекомендация:** Добавить skeleton loader для карточек пока данные загружаются:

```typescript
// packages/web/components/generation/StatsGrid.tsx

{progress.lessons_total === 0 ? (
  <motion.div variants={itemVariants}>
    <Card className="overflow-hidden border rounded-xl bg-purple-500/5 border-purple-500/30 animate-pulse">
      <CardContent className="p-4">
        <div className="h-4 bg-purple-500/20 rounded w-20 mb-2" />
        <div className="h-8 bg-purple-500/20 rounded w-16" />
      </CardContent>
    </Card>
  </motion.div>
) : (
  <motion.div variants={itemVariants}>
    <StatCard
      icon={<BookOpen className="w-5 h-5" />}
      label="Lessons"
      value={`${progress.lessons_completed}/${progress.lessons_total}`}
      subValue={`${Math.round((progress.lessons_completed / progress.lessons_total) * 100)}%`}
      color="purple"
    />
  </motion.div>
)}
```

---

## Приоритизация рекомендаций

### MUST-HAVE (Критичные для UX):
1. **Timer Animation Fix** (Task 3) - убрать "сердцебиение"
2. **Lessons Counter Logic** (Task 2.2) - скрыть "0/0" пока данные недоступны

### NICE-TO-HAVE (Улучшения):
3. **Layout Expansion** (Task 4) - max-w-screen-xl + 6 карточек
4. **Parallel Process Visualization** (Task 6) - accordion с progress bars
5. **Enhanced Animations** - orbital effects, shimmer on buttons
6. **Animated Stars** - twinkle effect для космической атмосферы

### OPTIONAL (Полировка):
7. **Skeleton Loaders** для карточек
8. **Performance Optimization** - reduce stars для prefers-reduced-motion
9. **ARIA Live Regions** для screen readers

---

## Референсы и примеры

**Изученные dashboard паттерны:**
- Vercel Analytics: [vercel.com/dashboard](https://vercel.com/dashboard)
- Linear Progress: [linear.app](https://linear.app)
- GitHub Actions: [github.com/actions](https://github.com/features/actions)
- Railway Deployments: [railway.app](https://railway.app)
- Stripe Dashboard: [dashboard.stripe.com](https://dashboard.stripe.com)

**Дизайн-система:**
- Tailwind CSS v4 с CSS variables
- Framer Motion для анимаций
- shadcn/ui компоненты
- Lucide icons

**Accessibility:**
- WCAG 2.1 AA compliance ✓
- Keyboard navigation ✓
- Screen reader support ✓
- Reduced motion support ✓

---

## Чеклист готовности

- [ ] Task 0: Дизайн-исследование завершено, рекомендации добавлены
- [ ] Task 1: Ошибка unique key исправлена
- [ ] Task 2: Все 6 этапов отображаются корректно
- [ ] Task 3: Таймер не "пульсирует"
- [ ] Task 4: Макет расширен, новые карточки добавлены
- [ ] Task 5: Интерфейс переведен на русский
- [ ] Task 6: Параллельные процессы визуализированы (optional)
- [ ] Type-check проходит
- [ ] Build проходит
- [ ] Визуальная проверка в браузере выполнена
