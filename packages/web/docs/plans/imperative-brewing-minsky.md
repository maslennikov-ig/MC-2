# План: Улучшение прогресс-баров генерации

## Проблема

1. **Скачки прогресса** - сразу на 75%, потом долго висит
2. **Разные компоненты** - нет shared логики для прогресс-баров
3. **Нет сглаживания** - прогресс напрямую из API без interpolation

## Текущая архитектура

```
useEnrichmentGeneration (polling каждые 2 сек)
    ↓
status.progress (0-100 из бэка)
    ↓
EnrichmentGeneratingCard → <Progress value={progress} />
```

**Проблема:** Бэкенд отправляет дискретные значения (0 → 75 → 100), фронт показывает их напрямую.

---

## Решение: Shared хук `useSmoothProgress` + Unified компонент

### Архитектура

```
lib/hooks/useSmoothProgress.ts (новый shared хук)
    ↓
components/ui/smooth-progress.tsx (unified компонент с Framer Motion)
    ↓
EnrichmentGeneratingCard, GenerationProgressBar, etc. (используют)
```

---

## Файлы для изменения

### 1. `lib/hooks/useSmoothProgress.ts` (НОВЫЙ)

Хук для плавной интерполяции прогресса:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'

interface UseSmoothProgressOptions {
  /** Actual progress from API (0-100) */
  targetProgress: number
  /** Interpolation speed (higher = faster) */
  speed?: number
  /** Minimum increment per tick */
  minIncrement?: number
  /** Maximum value before completion (prevents 100% until done) */
  maxBeforeComplete?: number
  /** Is the operation complete? */
  isComplete?: boolean
}

interface UseSmoothProgressResult {
  /** Smoothed visual progress (0-100) */
  progress: number
  /** Is currently animating toward target */
  isAnimating: boolean
}

export function useSmoothProgress({
  targetProgress,
  speed = 0.1,
  minIncrement = 0.5,
  maxBeforeComplete = 95,
  isComplete = false,
}: UseSmoothProgressOptions): UseSmoothProgressResult {
  const [progress, setProgress] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const frameRef = useRef<number>()
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    // Immediate completion
    if (isComplete) {
      setProgress(100)
      setIsAnimating(false)
      return
    }

    // Cap target at maxBeforeComplete
    const cappedTarget = Math.min(targetProgress, maxBeforeComplete)

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaTime = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      setProgress((current) => {
        if (current >= cappedTarget) {
          setIsAnimating(false)
          return current
        }

        // Exponential easing toward target
        const diff = cappedTarget - current
        const increment = Math.max(diff * speed * (deltaTime / 16), minIncrement)
        const next = Math.min(current + increment, cappedTarget)

        return next
      })

      frameRef.current = requestAnimationFrame(animate)
    }

    setIsAnimating(true)
    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [targetProgress, speed, minIncrement, maxBeforeComplete, isComplete])

  return { progress, isAnimating }
}
```

**~60 строк**

---

### 2. `components/ui/smooth-progress.tsx` (НОВЫЙ)

Unified компонент с Framer Motion:

```typescript
'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SmoothProgressProps {
  /** Current progress value (0-100) */
  value: number
  /** Visual variant */
  variant?: 'default' | 'gradient' | 'striped'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom color class */
  colorClass?: string
  /** Show percentage text */
  showPercentage?: boolean
  /** Additional className */
  className?: string
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const variantClasses = {
  default: 'bg-primary',
  gradient: 'bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500',
  striped: 'bg-primary bg-stripes animate-stripes',
}

export function SmoothProgress({
  value,
  variant = 'default',
  size = 'md',
  colorClass,
  showPercentage = false,
  className,
}: SmoothProgressProps) {
  return (
    <div className={cn('w-full', className)}>
      {showPercentage && (
        <div className="mb-1 flex justify-end">
          <span className="text-xs text-muted-foreground">
            {Math.round(value)}%
          </span>
        </div>
      )}
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-secondary',
          sizeClasses[size]
        )}
      >
        <motion.div
          className={cn(
            'h-full rounded-full',
            colorClass || variantClasses[variant]
          )}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{
            type: 'spring',
            stiffness: 100,
            damping: 30,
            mass: 0.5,
          }}
        />
      </div>
    </div>
  )
}
```

**~65 строк**

---

### 3. `components/ui/staged-progress.tsx` (НОВЫЙ)

Компонент с этапами:

```typescript
'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SmoothProgress } from './smooth-progress'

interface Stage {
  id: string
  label: string
  icon?: React.ReactNode
}

interface StagedProgressProps {
  stages: Stage[]
  currentStageIndex: number
  stageProgress: number // 0-100 within current stage
  isComplete?: boolean
  className?: string
}

export function StagedProgress({
  stages,
  currentStageIndex,
  stageProgress,
  isComplete = false,
  className,
}: StagedProgressProps) {
  // Calculate total progress
  const stageWeight = 100 / stages.length
  const completedStagesProgress = currentStageIndex * stageWeight
  const currentStageContribution = (stageProgress / 100) * stageWeight
  const totalProgress = isComplete
    ? 100
    : completedStagesProgress + currentStageContribution

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <SmoothProgress value={totalProgress} variant="gradient" showPercentage />

      {/* Stage indicators */}
      <div className="flex justify-between">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStageIndex || isComplete
          const isActive = idx === currentStageIndex && !isComplete

          return (
            <div
              key={stage.id}
              className={cn(
                'flex flex-col items-center gap-1',
                isDone && 'text-green-600 dark:text-green-400',
                isActive && 'text-blue-600 dark:text-blue-400',
                !isDone && !isActive && 'text-gray-400 dark:text-gray-500'
              )}
            >
              <motion.div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2',
                  isDone && 'border-green-500 bg-green-500 text-white',
                  isActive && 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
                  !isDone && !isActive && 'border-gray-300 dark:border-gray-600'
                )}
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="text-xs font-medium">{idx + 1}</span>
                )}
              </motion.div>
              <span className="text-xs font-medium">{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**~75 строк**

---

### 4. Обновить `EnrichmentGeneratingCard.tsx`

```diff
+ import { useSmoothProgress } from '@/lib/hooks/useSmoothProgress'
+ import { StagedProgress } from '@/components/ui/staged-progress'

+ const GENERATION_STAGES = [
+   { id: 'prepare', label: 'Подготовка' },
+   { id: 'generate', label: 'Генерация' },
+   { id: 'save', label: 'Сохранение' },
+ ]

  export function EnrichmentGeneratingCard({
    type,
    progress,
    currentStep,
    onCancel,
  }: EnrichmentGeneratingCardProps) {
+   // Map backend step to stage index
+   const stageIndex =
+     currentStep === 'queued' ? 0 :
+     currentStep === 'generating' ? 1 :
+     currentStep === 'finalizing' ? 2 : 1
+
+   // Smooth interpolation within stage
+   const { progress: smoothProgress } = useSmoothProgress({
+     targetProgress: progress,
+     isComplete: progress >= 100,
+   })

    return (
      <Card>
        ...
-       <Progress value={progress} className="w-full" />
+       <StagedProgress
+         stages={GENERATION_STAGES}
+         currentStageIndex={stageIndex}
+         stageProgress={smoothProgress}
+         isComplete={progress >= 100}
+       />
        ...
      </Card>
    )
  }
```

**~25 строк изменений**

---

## Альтернативы (библиотеки)

| Библиотека                | Плюсы           | Минусы             |
| ------------------------- | --------------- | ------------------ |
| **NProgress**             | Готовое решение | Только top-bar     |
| **react-top-loading-bar** | Гибкий API      | Лишняя зависимость |
| **Framer Motion**         | Уже в проекте!  | Нужен wrapper      |

**Рекомендация:** Использовать Framer Motion (уже есть в проекте) + custom хук.

---

## Стратегия полной унификации

### Уровни компонентов:

| Уровень                   | Компоненты                                                    | Действие                                              |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| **L1: Базовые**           | Progress, NodeProgressBar                                     | Заменить на SmoothProgress                            |
| **L2: С этапами**         | EnrichmentGeneratingCard                                      | Использовать StagedProgress                           |
| **L3: Специфичные**       | LessonProgressCard                                            | Использовать SmoothProgress внутри                    |
| **L4: Очень специфичные** | BatchProgress, GenerationProgress (S7), GenerationProgressBar | Оставить, но использовать SmoothProgress где возможно |

### Компоненты для миграции:

| Компонент                  | Сложность | План миграции                      |
| -------------------------- | --------- | ---------------------------------- |
| `EnrichmentGeneratingCard` | ⭐        | → StagedProgress                   |
| `NodeProgressBar`          | ⭐        | → SmoothProgress с variant         |
| `LessonProgressCard`       | ⭐⭐      | → SmoothProgress внутри            |
| `BatchProgress`            | ⭐⭐      | Оставить (4 workers специфика)     |
| `GenerationProgress (S7)`  | ⭐⭐⭐    | Оставить терминал-стиль            |
| `GenerationProgressBar`    | ⭐⭐⭐    | Частично - SmoothProgress для бара |

### Shared компоненты:

1. **`useSmoothProgress`** — хук для плавной интерполяции
2. **`SmoothProgress`** — базовый компонент с Framer Motion
3. **`StagedProgress`** — компонент с этапами

---

## Верификация

1. Открыть курс, перейти на урок
2. Нажать "Сгенерировать обложку/карточку"
3. **Ожидаемый результат:** Прогресс плавно растёт, без скачков
4. Проверить что при 0 → 75 из API видно плавное движение
5. Проверить что до завершения не показывает 100%
6. Проверить type-check: `pnpm tsc --noEmit` в packages/web
7. Проверить build: `pnpm build`

---

---

## Детальный план миграции

### 5. Миграция `NodeProgressBar.tsx`

```diff
- import { cn } from '@/lib/utils'
+ import { SmoothProgress } from '@/components/ui/smooth-progress'

- const variantStyles = { ... }  // удалить
- const sizeStyles = { ... }     // удалить

  export function NodeProgressBar({ progress, variant, size }) {
+   const colorMap = {
+     default: undefined,
+     active: undefined,
+     success: 'bg-emerald-500',
+     error: 'bg-red-500',
+   }
+
    return (
-     <div className={cn(variantStyles[variant].bg, ...)}>
-       <div style={{ width: `${progress}%` }} ... />
-     </div>
+     <SmoothProgress
+       value={progress}
+       size={size === 'xs' ? 'sm' : size}
+       colorClass={colorMap[variant]}
+     />
    )
  }
```

**~15 строк изменений**

---

### 6. Миграция `LessonProgressCard.tsx`

```diff
+ import { SmoothProgress } from '@/components/ui/smooth-progress'

  // В компоненте:
- <Progress value={progressPercentage} className="h-2" />
+ <SmoothProgress
+   value={progressPercentage}
+   variant="gradient"
+   size="md"
+ />

  // Для времени:
- <Progress value={timeProgress} className="h-1 bg-green-200" />
+ <SmoothProgress
+   value={timeProgress}
+   size="sm"
+   colorClass="bg-emerald-500"
+ />
```

**~10 строк изменений**

---

### 7. Частичная миграция `GenerationProgressBar.tsx`

```diff
+ import { SmoothProgress } from '@/components/ui/smooth-progress'

  // Внутри компонента заменить прогресс-бар:
- <div className="h-1.5 bg-gray-200 ...">
-   <motion.div style={{ width: `${overallProgress}%` }} ... />
- </div>
+ <SmoothProgress
+   value={overallProgress}
+   variant="gradient"
+   size="sm"
+ />
```

**~5 строк изменений** (остальная логика остаётся)

---

## Итого

| Файл                                | Изменение                  | Строки |
| ----------------------------------- | -------------------------- | ------ |
| `lib/hooks/useSmoothProgress.ts`    | НОВЫЙ хук интерполяции     | ~60    |
| `components/ui/smooth-progress.tsx` | НОВЫЙ базовый компонент    | ~65    |
| `components/ui/staged-progress.tsx` | НОВЫЙ компонент с этапами  | ~75    |
| `EnrichmentGeneratingCard.tsx`      | Применение staged-progress | ~25    |
| `NodeProgressBar.tsx`               | Миграция на SmoothProgress | ~15    |
| `LessonProgressCard.tsx`            | Миграция на SmoothProgress | ~10    |
| `GenerationProgressBar.tsx`         | Частичная миграция         | ~5     |
| `lib/hooks/index.ts`                | Экспорт                    | 1      |

**Итого:** ~256 строк новых/изменённых, 8 файлов

### Что НЕ мигрируем (слишком специфичные):

- `BatchProgress.tsx` — 4 worker-слота, своя логика
- `GenerationProgress.tsx` (S7) — терминал-стиль логи

### Выбранные опции:

- **Стиль:** Gradient (плавный градиент blue → purple)
- **Этапы:** Да (Подготовка → Генерация → Сохранение)
- **Унификация:** Полная (все основные компоненты)
