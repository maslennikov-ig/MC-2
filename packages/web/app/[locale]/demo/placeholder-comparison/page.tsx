'use client'

import Image from 'next/image'
import { useTheme } from 'next-themes'
import { Moon, Sun, Check, ImageIcon, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Placeholder изображение из проекта
const PLACEHOLDER_IMAGE = '/placeholders/Cover.webp'

// Реальное изображение для демонстрации "сгенерированного" контента
const GENERATED_IMAGE =
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=400&fit=crop'

type ContentType = 'placeholder' | 'generated'

type VariantType =
  | 'current'
  | 'badge'
  | 'opacity'
  | 'border'
  | 'grayscale'
  | 'blur'
  | 'overlay'
  | 'grayscale-opacity'
  | 'sepia'
  | 'tint'

interface ComparisonCardProps {
  type: ContentType
  variant: VariantType
}

function ComparisonCard({ type, variant }: ComparisonCardProps) {
  const isPlaceholder = type === 'placeholder'
  const imageSrc = isPlaceholder ? PLACEHOLDER_IMAGE : GENERATED_IMAGE

  // Стили контейнера для разных вариантов
  const getContainerClasses = () => {
    switch (variant) {
      case 'border':
        return isPlaceholder
          ? 'border-2 border-dashed border-slate-300 dark:border-slate-600'
          : 'border-2 border-solid border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
      default:
        return 'border border-slate-200 dark:border-slate-700'
    }
  }

  // CSS фильтры для изображения
  const getImageClasses = () => {
    if (!isPlaceholder) return ''

    switch (variant) {
      case 'opacity':
        return 'opacity-60'
      case 'grayscale':
        return 'grayscale'
      case 'blur':
        return 'blur-[2px]'
      case 'grayscale-opacity':
        return 'grayscale opacity-50'
      case 'sepia':
        return 'sepia opacity-70'
      default:
        return ''
    }
  }

  // Overlay слой поверх изображения
  const getOverlay = () => {
    if (!isPlaceholder) return null

    switch (variant) {
      case 'opacity':
        // Диагональный паттерн
        return (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]" />
        )
      case 'overlay':
        // Затенение - полупрозрачный слой
        return <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/50" />
      case 'tint':
        // Цветной оттенок (синий для "ожидания")
        return (
          <div className="absolute inset-0 bg-blue-500/30 mix-blend-multiply dark:bg-blue-600/40 dark:mix-blend-screen" />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-lg',
          getContainerClasses()
        )}
      >
        {/* Изображение */}
        <Image
          src={imageSrc}
          alt={isPlaceholder ? 'Placeholder' : 'Generated'}
          fill
          className={cn('object-cover transition-all duration-300', getImageClasses())}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 400px"
          unoptimized={!isPlaceholder}
        />

        {/* Overlay эффекты */}
        {getOverlay()}

        {/* Badge для варианта badge */}
        {variant === 'badge' && (
          <Badge
            className={cn(
              'absolute top-3 right-3 border backdrop-blur-sm',
              isPlaceholder
                ? 'border-slate-400/50 bg-slate-500/80 text-white'
                : 'border-green-400/50 bg-green-500/80 text-white'
            )}
          >
            {isPlaceholder ? (
              <>
                <ImageIcon className="mr-1 h-3 w-3" />
                Превью
              </>
            ) : (
              <>
                <Check className="mr-1 h-3 w-3" />
                Готово
              </>
            )}
          </Badge>
        )}

        {/* Стандартный badge для текущего вида */}
        {variant === 'current' && (
          <div className="absolute top-3 left-3">
            <Badge
              className={cn(
                'border backdrop-blur-sm',
                'bg-white/90 dark:bg-slate-900/90',
                'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300'
              )}
            >
              <Clock className="mr-1 h-3 w-3" />
              ~45 сек
            </Badge>
          </div>
        )}
      </div>

      {/* Подпись */}
      <p className="text-muted-foreground text-center text-xs">
        {isPlaceholder ? 'Placeholder' : 'Сгенерировано'}
      </p>
    </div>
  )
}

interface VariantSectionProps {
  title: string
  description: string
  variant: VariantType
  recommendation?: string
  cssCode?: string
}

function VariantSection({
  title,
  description,
  variant,
  recommendation,
  cssCode,
}: VariantSectionProps) {
  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
        <h2 className="text-foreground text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
        {cssCode && (
          <code className="mt-1 block font-mono text-xs text-slate-500 dark:text-slate-400">
            {cssCode}
          </code>
        )}
        {recommendation && (
          <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">{recommendation}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ComparisonCard type="placeholder" variant={variant} />
        <ComparisonCard type="generated" variant={variant} />
      </div>
    </div>
  )
}

export default function PlaceholderComparisonPage() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="bg-background min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">
              Сравнение вариантов индикации: Placeholder vs Сгенерировано
            </h1>
            <p className="text-muted-foreground mt-1">
              Выберите лучший способ визуально отличать placeholder от сгенерированного контента
            </p>
          </div>

          <Button variant="outline" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        {/* Варианты */}
        <div className="space-y-12">
          {/* Секция: Базовые варианты */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="text-foreground mb-1 font-semibold">Базовые варианты</h3>
            <p className="text-muted-foreground text-sm">Оригинальные подходы без CSS-фильтров</p>
          </div>

          <VariantSection
            title="Текущий вид (без индикации)"
            description="Placeholder и сгенерированный контент выглядят одинаково"
            variant="current"
          />

          <VariantSection
            title="Вариант 1: Badge / Метка"
            description="Явный badge в углу: 'Превью' или 'Готово'"
            variant="badge"
          />

          <VariantSection
            title="Вариант 2: Border / Рамка"
            description="Пунктирная рамка для placeholder, сплошная с glow для готового"
            variant="border"
            cssCode="border: 2px dashed | border: 2px solid + box-shadow"
          />

          {/* Секция: Эффекты затенения */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <h3 className="text-foreground mb-1 font-semibold">Эффекты затенения и блёклости</h3>
            <p className="text-muted-foreground text-sm">
              CSS-фильтры для визуального отличия placeholder
            </p>
          </div>

          <VariantSection
            title="Вариант 3: Opacity + Pattern"
            description="Пониженная прозрачность (60%) с диагональным паттерном"
            variant="opacity"
            cssCode="opacity: 0.6 + diagonal stripe overlay"
          />

          <VariantSection
            title="Вариант 4: Grayscale (Ч/Б)"
            description="Полное обесцвечивание — placeholder выглядит как 'черновик'"
            variant="grayscale"
            cssCode="filter: grayscale(100%)"
            recommendation="Чёткое визуальное отличие, работает в обеих темах"
          />

          <VariantSection
            title="Вариант 5: Blur (Размытие)"
            description="Лёгкое размытие создаёт эффект 'ещё не готово'"
            variant="blur"
            cssCode="filter: blur(2px)"
          />

          <VariantSection
            title="Вариант 6: Overlay (Затенение)"
            description="Полупрозрачный тёмный слой поверх изображения"
            variant="overlay"
            cssCode="overlay: bg-slate-900/40 (light) | bg-slate-950/50 (dark)"
            recommendation="Универсальный, хорошо работает с любым контентом"
          />

          <VariantSection
            title="Вариант 7: Grayscale + Opacity"
            description="Комбинация: обесцвечивание + пониженная прозрачность"
            variant="grayscale-opacity"
            cssCode="filter: grayscale(100%); opacity: 0.5"
          />

          <VariantSection
            title="Вариант 8: Sepia (Сепия)"
            description="Винтажный эффект — placeholder выглядит как 'старое фото'"
            variant="sepia"
            cssCode="filter: sepia(100%); opacity: 0.7"
          />

          <VariantSection
            title="Вариант 9: Color Tint (Цветной оттенок)"
            description="Синий оттенок — ассоциация с 'ожиданием/в процессе'"
            variant="tint"
            cssCode="overlay: bg-blue-500/30 + mix-blend-mode"
          />
        </div>

        {/* Сводка */}
        <div className="bg-muted/50 mt-12 rounded-lg p-6">
          <h2 className="text-foreground mb-4 text-lg font-semibold">Сравнение подходов</h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <h3 className="text-foreground mb-2 font-medium text-green-600 dark:text-green-400">
                ✓ Рекомендуемые
              </h3>
              <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
                <li>
                  <strong>Grayscale</strong> — чёткое отличие
                </li>
                <li>
                  <strong>Overlay</strong> — универсальный
                </li>
                <li>
                  <strong>Badge</strong> — явный индикатор
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-foreground mb-2 font-medium text-amber-600 dark:text-amber-400">
                ~ Нейтральные
              </h3>
              <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
                <li>
                  <strong>Opacity</strong> — subtle эффект
                </li>
                <li>
                  <strong>Border</strong> — структурный
                </li>
                <li>
                  <strong>Tint</strong> — цветовая кодировка
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-foreground mb-2 font-medium text-red-600 dark:text-red-400">
                ✗ Менее подходящие
              </h3>
              <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
                <li>
                  <strong>Blur</strong> — трудно рассмотреть
                </li>
                <li>
                  <strong>Sepia</strong> — неочевидная семантика
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>Рекомендация:</strong> Вариант 4 (Grayscale) или Вариант 6 (Overlay) + Badge
              для максимальной ясности. Оба варианта работают одинаково хорошо в светлой и тёмной
              темах.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
