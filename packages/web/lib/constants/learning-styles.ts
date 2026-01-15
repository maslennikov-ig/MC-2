import {
  GraduationCap,
  MessageCircle,
  BookOpen,
  Wrench,
  Rocket,
  Gamepad2,
  Microscope,
  Briefcase,
  Target,
  Code2,
  MessageSquare,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { COURSE_STYLES, STYLE_PROMPTS, type CourseStyle } from '@megacampus/shared-types'

export interface LearningStyle {
  value: CourseStyle
  icon: LucideIcon
  title: string
  description: string
  example: string
  prompt: string
}

/**
 * UI metadata for learning styles
 * Icons and localized text (Russian) - browser-specific, cannot be in shared-types
 */
const STYLE_UI_METADATA: Record<
  CourseStyle,
  { icon: LucideIcon; title: string; description: string; example: string }
> = {
  professional: {
    icon: Briefcase,
    title: 'Профессиональный',
    description: 'Корпоративный тон с кейсами, метриками и бизнес-ценностью',
    example:
      'Эта методология увеличивает эффективность команды на 40%. Рассмотрим кейс компании X...',
  },
  practical: {
    icon: Wrench,
    title: 'Практический',
    description: 'Фокус на применении, пошаговые инструкции, чек-листы',
    example: 'Шаг 1: Откройте терминал и введите...',
  },
  problem_based: {
    icon: Target,
    title: 'Проблемно-ориентированный',
    description: 'Case study формат: ситуация → анализ → решение → выводы',
    example: 'Ситуация: конверсия упала на 30%. Анализируем причины и находим решение...',
  },
  analytical: {
    icon: TrendingUp,
    title: 'Аналитический',
    description: 'Данные, бенчмарки, сравнительные таблицы и логический анализ',
    example: 'Исследование показывает: компании с этим подходом на 73% эффективнее...',
  },
  conversational: {
    icon: MessageCircle,
    title: 'Разговорный',
    description: 'Дружелюбный тон, простые объяснения, примеры из жизни',
    example: 'Представьте, что вы готовите кофе...',
  },
  storytelling: {
    icon: BookOpen,
    title: 'Сторителлинг',
    description: 'Обучение через истории, кейсы и практические ситуации',
    example: 'История начинается с молодого стартапа...',
  },
  interactive: {
    icon: MessageSquare,
    title: 'Интерактивный',
    description: 'Постоянное взаимодействие с читателем через упражнения',
    example: 'Остановитесь и попробуйте это, прежде чем читать дальше...',
  },
  motivational: {
    icon: Rocket,
    title: 'Мотивационный',
    description: 'Вдохновляющий тон, акцент на достижениях и возможностях',
    example: 'Вы способны освоить это! Каждый эксперт когда-то был новичком...',
  },
  academic: {
    icon: GraduationCap,
    title: 'Академический',
    description: 'Строгий научный стиль с терминологией, ссылками и глубоким анализом',
    example: 'Рассмотрим фундаментальные принципы...',
  },
  technical: {
    icon: Code2,
    title: 'Технический',
    description: 'Точность и детали: код, алгоритмы, архитектура',
    example: 'Алгоритм имеет сложность O(n log n). Рассмотрим реализацию...',
  },
  research: {
    icon: Microscope,
    title: 'Исследовательский',
    description: 'Развитие критического мышления через вопросы и эксперименты',
    example: 'А что если...? Давайте исследуем эту гипотезу...',
  },
  gamified: {
    icon: Gamepad2,
    title: 'Игровой',
    description: 'Геймификация: квесты, уровни, достижения в обучении',
    example: 'Уровень 1: Базовые навыки. Задание: освоить три ключевых принципа...',
  },
}

/**
 * Learning styles with full metadata
 * Combines shared-types prompts with browser-specific UI metadata
 */
export const LEARNING_STYLES: LearningStyle[] = COURSE_STYLES.map((style) => ({
  value: style,
  icon: STYLE_UI_METADATA[style].icon,
  title: STYLE_UI_METADATA[style].title,
  description: STYLE_UI_METADATA[style].description,
  example: STYLE_UI_METADATA[style].example,
  prompt: STYLE_PROMPTS[style],
}))

// Helper function to get learning style by value
export function getLearningStyleByValue(value: string): LearningStyle | undefined {
  return LEARNING_STYLES.find((style) => style.value === value)
}

// Helper function to get learning style title by value
export function getLearningStyleTitle(value: string): string {
  const style = getLearningStyleByValue(value)
  return style?.title || value
}

// Helper function to reorder styles with preferred one first
export function reorderLearningStylesWithPreferred(
  preferredValue?: string | null
): LearningStyle[] {
  if (!preferredValue) return LEARNING_STYLES

  const preferredStyle = getLearningStyleByValue(preferredValue)
  if (!preferredStyle) return LEARNING_STYLES

  // Return array with preferred style first, then all others
  return [preferredStyle, ...LEARNING_STYLES.filter((style) => style.value !== preferredValue)]
}
