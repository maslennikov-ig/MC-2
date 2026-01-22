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

interface ComparisonCardProps {
  type: ContentType
  variant: 'current' | 'badge' | 'opacity' | 'border'
}

function ComparisonCard({ type, variant }: ComparisonCardProps) {
  const isPlaceholder = type === 'placeholder'
  const imageSrc = isPlaceholder ? PLACEHOLDER_IMAGE : GENERATED_IMAGE

  // Стили для разных вариантов
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

  const getImageClasses = () => {
    switch (variant) {
      case 'opacity':
        return isPlaceholder ? 'opacity-60' : 'opacity-100'
      default:
        return ''
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
          className={cn('object-cover', getImageClasses())}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 400px"
          unoptimized={!isPlaceholder}
        />

        {/* Pattern overlay для варианта opacity (только для placeholder) */}
        {variant === 'opacity' && isPlaceholder && (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]" />
        )}

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

        {/* Стандартный badge для других вариантов (текущий вид) */}
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
  variant: 'current' | 'badge' | 'opacity' | 'border'
  recommendation?: string
}

function VariantSection({ title, description, variant, recommendation }: VariantSectionProps) {
  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
        <h2 className="text-foreground text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
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
          <VariantSection
            title="Текущий вид (без индикации)"
            description="Placeholder и сгенерированный контент выглядят одинаково. Пользователю сложно понять статус."
            variant="current"
          />

          <VariantSection
            title="Вариант 1: Badge / Метка"
            description="Явный badge в углу изображения указывает статус: 'Превью' или 'Готово'"
            variant="badge"
            recommendation="Рекомендуется: Чёткая индикация без изменения самого изображения"
          />

          <VariantSection
            title="Вариант 2: Opacity + Pattern"
            description="Placeholder показан с пониженной прозрачностью (60%) и диагональным паттерном"
            variant="opacity"
          />

          <VariantSection
            title="Вариант 3: Border / Рамка"
            description="Placeholder с пунктирной рамкой (dashed), сгенерированный — с сплошной цветной рамкой и свечением"
            variant="border"
          />
        </div>

        {/* Сводка */}
        <div className="bg-muted/50 mt-12 rounded-lg p-6">
          <h2 className="text-foreground mb-4 text-lg font-semibold">Сравнение подходов</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-foreground mb-2 font-medium">Преимущества Badge:</h3>
              <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
                <li>Не изменяет само изображение</li>
                <li>Чёткий текстовый индикатор</li>
                <li>Легко локализовать</li>
                <li>Работает на любых изображениях</li>
              </ul>
            </div>
            <div>
              <h3 className="text-foreground mb-2 font-medium">Преимущества Opacity/Border:</h3>
              <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
                <li>Визуальное отличие на уровне дизайна</li>
                <li>Не требует локализации</li>
                <li>Более "системный" подход</li>
                <li>Меньше визуального шума</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-md border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>Рекомендация:</strong> Вариант 1 (Badge) — наиболее понятный для пользователя.
              Можно комбинировать с вариантом 3 (Border) для усиления эффекта.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
