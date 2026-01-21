'use client'

import Image from 'next/image'
import { useTheme } from 'next-themes'
import { Moon, Sun, BookOpen, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const DEMO_IMAGE =
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=800&fit=crop'

type OverlayVariant = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

const OVERLAY_CONFIGS: Record<
  OverlayVariant,
  { classes: string; name: string; description: string }
> = {
  A: {
    classes: 'inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20',
    name: 'Сильный градиент',
    description: 'Затемнение по всей карточке (90% → 20%)',
  },
  B: {
    classes: 'inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent',
    name: 'Градиент 1/2',
    description: 'Чистое вверху, затемнение только внизу',
  },
  C: {
    classes: 'inset-0 bg-transparent',
    name: 'Без overlay',
    description: 'Полностью чистое изображение',
  },
  D: {
    classes:
      'inset-0 bg-gradient-to-t from-white/90 via-white/50 to-white/20 dark:from-black/90 dark:via-black/60 dark:to-black/30',
    name: 'Адаптивный полный',
    description: 'Белый (light) / чёрный (dark) градиент',
  },
  E: {
    classes:
      'inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-white/95 via-white/70 to-transparent dark:from-black/95 dark:via-black/60 dark:to-transparent',
    name: 'Адаптивный 2/3',
    description: 'Адаптивный градиент только снизу',
  },
  F: {
    classes: 'inset-0 bg-white/50 backdrop-blur-md dark:bg-black/60',
    name: 'Текущий (glassmorphism)',
    description: 'Как сейчас в каталоге',
  },
}

function DemoCard({ variant }: { variant: OverlayVariant }) {
  const config = OVERLAY_CONFIGS[variant]

  return (
    <div className="flex flex-col gap-2">
      <Card
        className={cn(
          'group relative overflow-hidden',
          'border-slate-700/50 bg-slate-900',
          'cursor-pointer rounded-xl',
          'min-h-[420px] sm:min-h-[440px] lg:min-h-[460px]',
          'w-full max-w-[320px]',
          'flex flex-col'
        )}
      >
        {/* Cover image */}
        <div className="absolute inset-0 z-0">
          <Image src={DEMO_IMAGE} alt="Demo cover" fill className="object-cover" unoptimized />
        </div>

        {/* Overlay */}
        <div className={cn('absolute z-[1]', config.classes)} />

        {/* Content - matching real card structure */}
        <CardHeader className="relative z-[2] flex-shrink-0 px-6 pt-6 pb-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="border border-gray-300 bg-white/70 px-2 py-0.5 text-xs text-gray-900 backdrop-blur-sm dark:border-white/40 dark:bg-black/50 dark:text-white">
              Вариант {variant}
            </Badge>
          </div>
          <h3 className="line-clamp-2 text-lg font-semibold text-gray-900 group-hover:text-purple-700 dark:text-white dark:[text-shadow:_0_1px_3px_rgb(0_0_0_/_60%)] dark:group-hover:text-purple-200">
            {config.name}
          </h3>
        </CardHeader>

        <CardContent className="relative z-[2] flex flex-1 flex-col justify-between overflow-hidden px-6 py-0">
          <div className="space-y-4">
            <p className="line-clamp-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              {config.description}
            </p>

            {/* Stats grid */}
            <div className="mt-auto pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-300/50 bg-white/40 px-3 py-2.5 backdrop-blur-sm dark:border-white/20 dark:bg-white/10">
                  <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-300">Модули</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">5</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-gray-300/50 bg-white/40 px-3 py-2.5 backdrop-blur-sm dark:border-white/20 dark:bg-white/10">
                  <Clock className="h-4 w-4 text-green-600 dark:text-green-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-300">Время</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">3ч</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <div className="relative z-[2] flex-shrink-0 px-6 pt-4 pb-3">
          <Button
            size="sm"
            className="h-10 w-full !rounded-full bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-medium text-white"
          >
            Открыть курс
          </Button>
        </div>

        <CardFooter className="relative z-[2] flex-shrink-0 border-t border-gray-300/50 px-6 py-3 dark:border-white/20">
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">Демо-карточка</p>
        </CardFooter>
      </Card>

      {/* Label */}
      <div className="text-center">
        <p className="text-foreground text-xs font-medium">{config.name}</p>
        <p className="text-muted-foreground text-[10px]">{config.description}</p>
      </div>
    </div>
  )
}

export default function CardOverlaysDemoPage() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const variants: OverlayVariant[] = ['A', 'B', 'C', 'D', 'E', 'F']

  return (
    <div className="bg-background min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">Сравнение Overlay Вариантов</h1>
            <p className="text-muted-foreground mt-1">
              Выберите лучший вариант для карточек курсов. Текущий вариант: F (glassmorphism)
            </p>
          </div>

          <Button variant="outline" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        {/* Cards Grid - 3 columns */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {variants.map((variant) => (
            <DemoCard key={variant} variant={variant} />
          ))}
        </div>

        {/* Legend */}
        <div className="bg-muted/50 mt-12 rounded-lg p-4">
          <h2 className="mb-3 font-semibold">Описание вариантов:</h2>
          <div className="text-muted-foreground grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-foreground mb-2 font-medium">
                Фиксированные (одинаковые в обеих темах):
              </p>
              <ul className="ml-4 space-y-1">
                <li>
                  <strong>A:</strong> Сильный градиент по всей карточке
                </li>
                <li>
                  <strong>B:</strong> Градиент только в нижней 1/2
                </li>
                <li>
                  <strong>C:</strong> Без overlay вообще
                </li>
              </ul>
            </div>
            <div>
              <p className="text-foreground mb-2 font-medium">Адаптивные (меняются с темой):</p>
              <ul className="ml-4 space-y-1">
                <li>
                  <strong>D:</strong> Белый/чёрный градиент по всей карточке
                </li>
                <li>
                  <strong>E:</strong> Белый/чёрный градиент только в 2/3 снизу
                </li>
                <li>
                  <strong>F:</strong> Текущий glassmorphism (белый/чёрный + blur)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
