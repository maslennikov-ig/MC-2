'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Search,
  X,
  Filter,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Clock,
  LayoutGrid,
  List,
} from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import { cn } from '@/lib/utils'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface CoursesFiltersProps {
  initialSearch?: string
  initialStatus?: string
  initialDifficulty?: string
  initialSort?: string
  totalCount?: number
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
}

const statusOptions = [
  { value: 'all', label: 'Все статусы', icon: '📋' },
  { value: 'draft', label: 'Черновик', icon: '✏️' },
  { value: 'generating', label: 'Генерируется', icon: '⚡' },
  { value: 'structure_ready', label: 'Структура готова', icon: '✅' },
  { value: 'completed', label: 'Завершен', icon: '🎯' },
  { value: 'failed', label: 'Ошибка', icon: '❌' },
]

const difficultyOptions = [
  { value: 'all', label: 'Любая сложность', color: 'bg-gray-500' },
  { value: 'beginner', label: 'Начальный', color: 'bg-green-500' },
  { value: 'intermediate', label: 'Средний', color: 'bg-yellow-500' },
  { value: 'advanced', label: 'Продвинутый', color: 'bg-orange-500' },
  { value: 'master', label: 'Мастер', color: 'bg-purple-500' },
  { value: 'expert', label: 'Эксперт', color: 'bg-red-500' },
  { value: 'mixed', label: 'Смешанный', color: 'bg-indigo-500' },
]

const sortOptions = [
  { value: 'newest', label: 'Новые', icon: <Sparkles className="h-4 w-4" /> },
  { value: 'popular', label: 'Популярные', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'updated', label: 'Обновленные', icon: <Clock className="h-4 w-4" /> },
]

export function CoursesFiltersImproved({
  initialSearch = '',
  initialStatus = 'all',
  initialDifficulty = 'all',
  initialSort = 'newest',
  totalCount = 0,
  viewMode = 'grid',
  onViewModeChange,
}: CoursesFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(initialSearch)
  const [statusOpen, setStatusOpen] = useState(false)
  const [difficultyOpen, setDifficultyOpen] = useState(false)

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      params.delete('page')

      startTransition(() => {
        router.push(`/courses?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateFilters({ search: value })
  }, 300)

  const handleSearchChange = (value: string) => {
    setSearch(value)
    debouncedSearch(value)
  }

  const clearSearch = () => {
    setSearch('')
    updateFilters({ search: '' })
  }

  const clearAllFilters = () => {
    setSearch('')
    updateFilters({
      search: '',
      status: 'all',
      difficulty: 'all',
      sort: 'newest',
    })
  }

  const removeFilter = (filterKey: string) => {
    updateFilters({ [filterKey]: 'all' })
  }

  return (
    <div className="mb-8 space-y-4">
      {/* Main filter bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Enhanced search with suggestions */}
          <div className="relative max-w-xl flex-1">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Поиск курсов по названию..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={cn(
                  'h-11 pr-10 pl-10',
                  'border-slate-700 bg-slate-800/50',
                  'text-white placeholder:text-gray-500',
                  'focus:border-purple-500 focus:ring-purple-500/20',
                  'transition-all duration-200'
                )}
                disabled={isPending}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 transform text-gray-400 hover:text-white"
                  onClick={clearSearch}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Status filter with icons */}
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-11 w-full justify-between sm:w-[200px]',
                  'border-slate-700 bg-slate-800/50 text-white',
                  'hover:border-purple-500/50 hover:bg-slate-800',
                  initialStatus !== 'all' && 'border-purple-500/50'
                )}
              >
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  {statusOptions.find((s) => s.value === initialStatus)?.label || 'Статус'}
                </span>
                {initialStatus !== 'all' && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1">
                    1
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] border-slate-700 bg-slate-900 p-0">
              <Command>
                <CommandList>
                  <CommandGroup>
                    {statusOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          updateFilters({ status: option.value })
                          setStatusOpen(false)
                        }}
                        className={cn(
                          'cursor-pointer',
                          initialStatus === option.value && 'bg-purple-500/20'
                        )}
                      >
                        <span className="mr-2">{option.icon}</span>
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Difficulty filter with colors */}
          <Popover open={difficultyOpen} onOpenChange={setDifficultyOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-11 w-full justify-between sm:w-[200px]',
                  'border-slate-700 bg-slate-800/50 text-white',
                  'hover:border-purple-500/50 hover:bg-slate-800',
                  initialDifficulty !== 'all' && 'border-purple-500/50'
                )}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  {difficultyOptions.find((d) => d.value === initialDifficulty)?.label ||
                    'Сложность'}
                </span>
                {initialDifficulty !== 'all' && (
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      difficultyOptions.find((d) => d.value === initialDifficulty)?.color
                    )}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] border-slate-700 bg-slate-900 p-0">
              <Command>
                <CommandList>
                  <CommandGroup>
                    {difficultyOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          updateFilters({ difficulty: option.value })
                          setDifficultyOpen(false)
                        }}
                        className={cn(
                          'cursor-pointer',
                          initialDifficulty === option.value && 'bg-purple-500/20'
                        )}
                      >
                        <div className={cn('mr-2 h-3 w-3 rounded-full', option.color)} />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Sort options */}
          <ToggleGroup
            type="single"
            value={initialSort}
            onValueChange={(value) => value && updateFilters({ sort: value })}
            className="rounded-lg border border-slate-700 bg-slate-800/50 p-1"
          >
            {sortOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className={cn(
                  'px-3 py-2 text-white data-[state=on]:bg-purple-600',
                  'hover:bg-slate-700 data-[state=on]:text-white'
                )}
              >
                {option.icon}
                <span className="ml-2 hidden sm:inline">{option.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* View mode toggle */}
          {onViewModeChange && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'h-9 w-9',
                  viewMode === 'grid'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'text-gray-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'h-9 w-9',
                  viewMode === 'list'
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'text-gray-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Active filters bar */}
      {(search || initialStatus !== 'all' || initialDifficulty !== 'all') && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-400">Активные фильтры:</span>

          {search && (
            <Badge
              variant="secondary"
              className="cursor-pointer border-purple-500/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
              onClick={() => clearSearch()}
            >
              Поиск: {search}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          )}

          {initialStatus !== 'all' && (
            <Badge
              variant="secondary"
              className="cursor-pointer border-purple-500/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
              onClick={() => removeFilter('status')}
            >
              {statusOptions.find((s) => s.value === initialStatus)?.label}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          )}

          {initialDifficulty !== 'all' && (
            <Badge
              variant="secondary"
              className="cursor-pointer border-purple-500/50 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
              onClick={() => removeFilter('difficulty')}
            >
              {difficultyOptions.find((d) => d.value === initialDifficulty)?.label}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-gray-400 hover:text-white"
          >
            Очистить все
          </Button>
        </div>
      )}

      {/* Results counter with loading state */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {isPending ? (
            <span className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              Загрузка...
            </span>
          ) : (
            <span>
              Найдено курсов: <span className="font-medium text-white">{totalCount}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
