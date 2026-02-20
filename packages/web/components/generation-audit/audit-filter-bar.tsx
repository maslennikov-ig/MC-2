'use client'

import { useCallback } from 'react'
import { Search, X, AlertTriangle, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

export interface AuditFilters {
  stage?: string
  phase?: string
  modelUsed?: string
  lessonId?: string
  hasError?: boolean
  hasRetry?: boolean
  search?: string
}

export interface AuditFilterOptions {
  stages: string[]
  phases: string[]
  models: string[]
  lessons: Array<{ id: string; title: string }>
}

interface AuditFilterBarProps {
  filters: AuditFilters
  onFilterChange: (filters: AuditFilters) => void
  filterOptions: AuditFilterOptions
}

export function AuditFilterBar({ filters, onFilterChange, filterOptions }: AuditFilterBarProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...filters,
        search: e.target.value || undefined,
      })
    },
    [filters, onFilterChange]
  )

  const handleStageChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        stage: value === 'all' ? undefined : value,
      })
    },
    [filters, onFilterChange]
  )

  const handlePhaseChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        phase: value === 'all' ? undefined : value,
      })
    },
    [filters, onFilterChange]
  )

  const handleModelChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        modelUsed: value === 'all' ? undefined : value,
      })
    },
    [filters, onFilterChange]
  )

  const handleLessonChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        lessonId: value === 'all' ? undefined : value,
      })
    },
    [filters, onFilterChange]
  )

  const handleErrorToggle = useCallback(
    (pressed: boolean) => {
      onFilterChange({
        ...filters,
        hasError: pressed || undefined,
      })
    },
    [filters, onFilterChange]
  )

  const handleRetryToggle = useCallback(
    (pressed: boolean) => {
      onFilterChange({
        ...filters,
        hasRetry: pressed || undefined,
      })
    },
    [filters, onFilterChange]
  )

  const handleClearFilters = useCallback(() => {
    onFilterChange({})
  }, [onFilterChange])

  const hasFilters =
    filters.stage ||
    filters.phase ||
    filters.modelUsed ||
    filters.lessonId ||
    filters.hasError ||
    filters.hasRetry ||
    filters.search

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-4 shadow-sm dark:border-slate-700">
      {/* Search input */}
      <div className="relative w-full sm:w-64">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search traces..."
          value={filters.search || ''}
          onChange={handleSearchChange}
          className="pl-9"
          aria-label="Search traces"
        />
      </div>

      {/* Stage filter */}
      <Select value={filters.stage || 'all'} onValueChange={handleStageChange}>
        <SelectTrigger className="w-[140px]" aria-label="Filter by stage">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stages</SelectItem>
          {filterOptions.stages.map((stage) => (
            <SelectItem key={stage} value={stage}>
              {stage}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Phase filter */}
      <Select value={filters.phase || 'all'} onValueChange={handlePhaseChange}>
        <SelectTrigger className="w-[140px]" aria-label="Filter by phase">
          <SelectValue placeholder="Phase" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Phases</SelectItem>
          {filterOptions.phases.map((phase) => (
            <SelectItem key={phase} value={phase}>
              {phase}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Model filter */}
      <Select value={filters.modelUsed || 'all'} onValueChange={handleModelChange}>
        <SelectTrigger className="w-[180px]" aria-label="Filter by model">
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Models</SelectItem>
          {filterOptions.models.map((model) => (
            <SelectItem key={model} value={model}>
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Lesson filter */}
      {filterOptions.lessons.length > 0 && (
        <Select value={filters.lessonId || 'all'} onValueChange={handleLessonChange}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by lesson">
            <SelectValue placeholder="Lesson" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lessons</SelectItem>
            {filterOptions.lessons.map((lesson) => (
              <SelectItem key={lesson.id} value={lesson.id}>
                {lesson.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Error toggle */}
      <Toggle
        variant="outline"
        pressed={filters.hasError || false}
        onPressedChange={handleErrorToggle}
        aria-label="Filter errors"
        className={cn(
          'gap-1.5',
          filters.hasError &&
            'border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500'
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="hidden sm:inline">Errors</span>
      </Toggle>

      {/* Retry toggle */}
      <Toggle
        variant="outline"
        pressed={filters.hasRetry || false}
        onPressedChange={handleRetryToggle}
        aria-label="Filter retries"
        className={cn(
          'gap-1.5',
          filters.hasRetry &&
            'border-yellow-500/50 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 hover:text-yellow-500'
        )}
      >
        <RefreshCw className="h-4 w-4" />
        <span className="hidden sm:inline">Retries</span>
      </Toggle>

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
