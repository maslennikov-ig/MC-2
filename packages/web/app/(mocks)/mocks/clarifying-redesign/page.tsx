'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Check, X, Minus, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import ThemeToggle from '@/components/common/theme-toggle'

import { MockVariant1Minimal } from '@/components/mocks/clarifying/MockVariant1Minimal'
import { MockVariant2Accordion } from '@/components/mocks/clarifying/MockVariant2Accordion'
import { MockVariant3Wizard } from '@/components/mocks/clarifying/MockVariant3Wizard'
import { MockVariant4Field } from '@/components/mocks/clarifying/MockVariant4Field'
import { MockVariant5Floating } from '@/components/mocks/clarifying/MockVariant5Floating'
import {
  mockQuestions,
  variantDescriptions,
  type VariantKey,
} from '@/components/mocks/clarifying/mockData'

const variants: { key: VariantKey; label: string }[] = [
  { key: 'minimal', label: 'Минимализм' },
  { key: 'accordion', label: 'Аккордеон' },
  { key: 'wizard', label: 'Wizard' },
  { key: 'field', label: 'Field' },
  { key: 'floating', label: 'Группы' },
]

const comparisonData = [
  {
    feature: 'Компактность',
    minimal: 'good',
    accordion: 'excellent',
    wizard: 'poor',
    field: 'medium',
    floating: 'medium',
  },
  {
    feature: 'Видимость всех вопросов',
    minimal: 'excellent',
    accordion: 'good',
    wizard: 'poor',
    field: 'excellent',
    floating: 'excellent',
  },
  {
    feature: 'Фокус на текущем',
    minimal: 'medium',
    accordion: 'good',
    wizard: 'excellent',
    field: 'medium',
    floating: 'good',
  },
  {
    feature: 'Визуальная иерархия',
    minimal: 'good',
    accordion: 'medium',
    wizard: 'poor',
    field: 'good',
    floating: 'excellent',
  },
  {
    feature: 'Минимум кликов',
    minimal: 'excellent',
    accordion: 'medium',
    wizard: 'poor',
    field: 'excellent',
    floating: 'medium',
  },
  {
    feature: 'Mobile-friendly',
    minimal: 'excellent',
    accordion: 'excellent',
    wizard: 'excellent',
    field: 'good',
    floating: 'good',
  },
  {
    feature: 'Геймификация',
    minimal: 'poor',
    accordion: 'medium',
    wizard: 'excellent',
    field: 'poor',
    floating: 'excellent',
  },
  {
    feature: 'Профессиональный вид',
    minimal: 'excellent',
    accordion: 'good',
    wizard: 'good',
    field: 'excellent',
    floating: 'good',
  },
]

type Rating = 'excellent' | 'good' | 'medium' | 'poor'

function RatingCell({ rating }: { rating: Rating }) {
  const config: Record<Rating, { icon: typeof Check; color: string; bg: string }> = {
    excellent: {
      icon: Check,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    good: { icon: Check, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    medium: { icon: Minus, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    poor: { icon: X, color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30' },
  }

  const { icon: Icon, color, bg } = config[rating]

  return (
    <div className={`h-8 w-8 rounded-full ${bg} mx-auto flex items-center justify-center`}>
      <Icon className={`h-4 w-4 ${color}`} />
    </div>
  )
}

export default function ClarifyingRedesignPage() {
  const [selectedVariant, setSelectedVariant] = useState<VariantKey | null>(null)
  const [activeTab, setActiveTab] = useState<VariantKey>('minimal')

  const handleSelect = (variant: VariantKey) => {
    setSelectedVariant(variant)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Link>
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Редизайн уточняющих вопросов
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Сравнение 5 вариантов UI для Stage 4 Clarifying Questions
          </p>

          {selectedVariant && (
            <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/30">
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Выбран вариант:{' '}
                <span className="font-semibold">{variantDescriptions[selectedVariant].title}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Problem description */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-amber-800 dark:text-amber-200">
              Проблемы текущего UI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
              <li className="flex items-start gap-2">
                <span className="text-amber-500">1.</span>
                <span>
                  <strong>Цветовой хаос:</strong> красный, фиолетовый, зелёный, янтарный - всё
                  одновременно
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">2.</span>
                <span>
                  <strong>Визуальная перегрузка:</strong> иконки + бейджи + текст + цветные бордеры
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">3.</span>
                <span>
                  <strong>Нет визуальной иерархии:</strong> всё кажется одинаково важным
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">4.</span>
                <span>
                  <strong>Непрофессиональный вид:</strong> выглядит как черновик
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Tabs with variants */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VariantKey)}>
          <TabsList className="mb-6 w-full flex-nowrap justify-start overflow-x-auto">
            {variants.map((v) => (
              <TabsTrigger key={v.key} value={v.key} className="min-w-[100px] flex-shrink-0">
                {v.label}
                {selectedVariant === v.key && <Check className="ml-1 h-4 w-4 text-emerald-500" />}
              </TabsTrigger>
            ))}
          </TabsList>

          {variants.map((v) => {
            const info = variantDescriptions[v.key]
            return (
              <TabsContent key={v.key} value={v.key} className="space-y-6">
                {/* Variant info */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{info.title}</CardTitle>
                        <CardDescription className="mt-1">{info.description}</CardDescription>
                      </div>
                      <Button
                        onClick={() => handleSelect(v.key)}
                        variant={selectedVariant === v.key ? 'default' : 'outline'}
                        size="sm"
                      >
                        {selectedVariant === v.key ? 'Выбрано' : 'Выбрать'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                          Преимущества
                        </h4>
                        <ul className="space-y-1">
                          {info.pros.map((pro, idx) => (
                            <li
                              key={idx}
                              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                            >
                              <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                          Недостатки
                        </h4>
                        <ul className="space-y-1">
                          {info.cons.map((con, idx) => (
                            <li
                              key={idx}
                              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                            >
                              <X className="h-4 w-4 flex-shrink-0 text-red-400" />
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Interactive mock */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Интерактивный мок</CardTitle>
                    <CardDescription>Попробуйте взаимодействовать с вопросами</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      {v.key === 'minimal' && <MockVariant1Minimal questions={mockQuestions} />}
                      {v.key === 'accordion' && <MockVariant2Accordion questions={mockQuestions} />}
                      {v.key === 'wizard' && <MockVariant3Wizard questions={mockQuestions} />}
                      {v.key === 'field' && <MockVariant4Field questions={mockQuestions} />}
                      {v.key === 'floating' && <MockVariant5Floating questions={mockQuestions} />}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )
          })}
        </Tabs>

        {/* Comparison table */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Сравнительная таблица</CardTitle>
            <CardDescription>Оценка каждого варианта по ключевым критериям</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Критерий</TableHead>
                    {variants.map((v) => (
                      <TableHead key={v.key} className="min-w-[80px] text-center">
                        {v.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="text-sm font-medium">{row.feature}</TableCell>
                      {variants.map((v) => (
                        <TableCell key={v.key} className="text-center">
                          <RatingCell rating={row[v.key] as Rating} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                  <Check className="h-3 w-3 text-emerald-600" />
                </div>
                Отлично
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
                  <Check className="h-3 w-3 text-blue-600" />
                </div>
                Хорошо
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
                  <Minus className="h-3 w-3 text-amber-600" />
                </div>
                Средне
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-900/30">
                  <X className="h-3 w-3 text-slate-400" />
                </div>
                Слабо
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recommendation */}
        <Card className="mt-6 border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="text-lg text-purple-800 dark:text-purple-200">
              Рекомендация
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-purple-700 dark:text-purple-300">
              На основе анализа рекомендуется <strong>Вариант 1 (Минималистичный монохром)</strong>{' '}
              или <strong>Вариант 4 (Field pattern)</strong> как оптимальный баланс между:
            </p>
            <ul className="space-y-1 text-sm text-purple-700 dark:text-purple-300">
              <li>- Профессиональным внешним видом</li>
              <li>- Минимальным количеством кликов для ответа</li>
              <li>- Хорошей видимостью всех вопросов</li>
              <li>- Отличной адаптивностью на мобильных устройствах</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
