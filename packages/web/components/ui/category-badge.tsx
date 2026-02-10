import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CategoryBadgeProps {
  category: string | null
  size?: 'sm' | 'default'
}

// Russian translations for categories
const categoryLabels: Record<string, string> = {
  // New categories (8)
  company_context: 'Контекст компании',
  audience: 'Аудитория',
  expected_outcomes: 'Ожидаемые результаты',
  content_structure: 'Структура контента',
  focus_priorities: 'Приоритеты',
  business_goals: 'Бизнес-цели',
  practical_application: 'Применение',
  constraints: 'Ограничения',
  // Old categories (5)
  content: 'Контент',
  outcome: 'Результаты',
  format: 'Формат',
  tool: 'Инструменты',
  depth: 'Глубина',
}

// Color map for all categories (new + old)
const categoryColors: Record<string, string> = {
  // New categories
  company_context: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  audience: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300',
  expected_outcomes: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  content_structure: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  focus_priorities: 'border-pink-500/20 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  business_goals: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  practical_application: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  constraints: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
  // Old categories
  content: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  outcome: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  format: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  tool: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  depth: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300',
}

/**
 * CategoryBadge component for displaying question categories
 * Used in both ClarifyingPanel (wizard) and AdminClarifyingTab
 * Rollback-safe: Only renders when category is truthy
 */
export function CategoryBadge({ category, size = 'default' }: CategoryBadgeProps) {
  if (!category) {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        aria-label="Категория вопроса неизвестна"
      >
        unknown
      </Badge>
    )
  }

  const colorClass =
    categoryColors[category] || 'border-slate-200 bg-slate-50 text-slate-700 dark:text-slate-300'

  const label = categoryLabels[category] || category.replace(/_/g, ' ')

  return (
    <Badge
      variant="outline"
      className={cn(colorClass, size === 'sm' ? 'px-1.5 py-0 text-[10px]' : 'text-xs')}
      aria-label={`Категория: ${label}`}
    >
      {label}
    </Badge>
  )
}
