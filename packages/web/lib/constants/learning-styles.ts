import {
  GraduationCap,
  MessageCircle,
  BookOpen,
  Wrench,
  Rocket,
  Palette,
  Gamepad2,
  Zap,
  Microscope,
  Heart,
  Briefcase,
  HelpCircle,
  Target,
  Users2,
  Code2,
  Timer,
  Star,
  MessageSquare,
  TrendingUp
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
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
const STYLE_UI_METADATA: Record<CourseStyle, { icon: LucideIcon; title: string; description: string; example: string }> = {
  academic: {
    icon: GraduationCap,
    title: "Академический",
    description: "Строгий научный стиль с терминологией, ссылками и глубоким анализом",
    example: "Рассмотрим фундаментальные принципы..."
  },
  conversational: {
    icon: MessageCircle,
    title: "Разговорный",
    description: "Дружелюбный тон, простые объяснения, примеры из жизни",
    example: "Представьте, что вы готовите кофе..."
  },
  storytelling: {
    icon: BookOpen,
    title: "Сторителлинг",
    description: "Обучение через истории, кейсы и практические ситуации",
    example: "История начинается с молодого стартапа..."
  },
  practical: {
    icon: Wrench,
    title: "Практический",
    description: "Фокус на применении, пошаговые инструкции, чек-листы",
    example: "Шаг 1: Откройте терминал и введите..."
  },
  motivational: {
    icon: Rocket,
    title: "Мотивационный",
    description: "Вдохновляющий тон, акцент на достижениях и возможностях",
    example: "Вы способны освоить это! Каждый эксперт когда-то был новичком..."
  },
  visual: {
    icon: Palette,
    title: "Визуальный",
    description: "Образное изложение с яркими описаниями и метафорами",
    example: "Представьте данные как поток реки, где каждая капля..."
  },
  gamified: {
    icon: Gamepad2,
    title: "Игровой",
    description: "Геймификация: квесты, уровни, достижения в обучении",
    example: "Уровень 1: Базовые навыки. Задание: освоить три ключевых принципа..."
  },
  minimalist: {
    icon: Zap,
    title: "Минималистичный",
    description: "Лаконично, только суть, без лишних слов",
    example: "Факт. Объяснение. Применение. Результат."
  },
  research: {
    icon: Microscope,
    title: "Исследовательский",
    description: "Развитие критического мышления через вопросы и эксперименты",
    example: "А что если...? Давайте исследуем эту гипотезу..."
  },
  engaging: {
    icon: Heart,
    title: "Вовлекающий",
    description: "Захватывающая подача с интригой и эмоциональной связью",
    example: "А вы знали, что 90% разработчиков делают эту ошибку?"
  },
  professional: {
    icon: Briefcase,
    title: "Профессиональный",
    description: "Бизнес-подход с акцентом на практическую ценность и ROI",
    example: "Эта методология увеличивает эффективность команды на 40%..."
  },
  socratic: {
    icon: HelpCircle,
    title: "Сократический",
    description: "Обучение через наводящие вопросы и самостоятельные открытия",
    example: "Что вы замечаете в этом паттерне? Почему это работает именно так?"
  },
  problem_based: {
    icon: Target,
    title: "Проблемно-ориентированный",
    description: "Обучение через решение реальных задач и кейсов",
    example: "Задача: сайт упал в продакшене. Давайте найдем решение..."
  },
  collaborative: {
    icon: Users2,
    title: "Коллаборативный",
    description: "Групповое обучение с упражнениями для команд",
    example: "Обсудите с коллегой: какой подход лучше и почему?"
  },
  technical: {
    icon: Code2,
    title: "Технический",
    description: "Точность и детали: код, алгоритмы, архитектура",
    example: "Алгоритм имеет сложность O(n log n). Рассмотрим реализацию..."
  },
  microlearning: {
    icon: Timer,
    title: "Микро-обучение",
    description: "Ультракороткие уроки на 2-3 минуты чтения",
    example: "1 концепция = 1 урок. Сегодня: только про замыкания."
  },
  inspirational: {
    icon: Star,
    title: "Вдохновляющий",
    description: "Раскрытие потенциала через мечты и амбиции",
    example: "Представьте себя через год, владеющим этими навыками..."
  },
  interactive: {
    icon: MessageSquare,
    title: "Интерактивный",
    description: "Постоянное взаимодействие с читателем через упражнения",
    example: "Остановитесь и попробуйте это, прежде чем читать дальше..."
  },
  analytical: {
    icon: TrendingUp,
    title: "Аналитический",
    description: "Данные, метрики и логический анализ",
    example: "Статистика показывает: 73% проектов терпят неудачу из-за..."
  }
}

/**
 * Learning styles with full metadata
 * Combines shared-types prompts with browser-specific UI metadata
 */
export const LEARNING_STYLES: LearningStyle[] = COURSE_STYLES.map(style => ({
  value: style,
  icon: STYLE_UI_METADATA[style].icon,
  title: STYLE_UI_METADATA[style].title,
  description: STYLE_UI_METADATA[style].description,
  example: STYLE_UI_METADATA[style].example,
  prompt: STYLE_PROMPTS[style]
}))

// Helper function to get learning style by value
export function getLearningStyleByValue(value: string): LearningStyle | undefined {
  return LEARNING_STYLES.find(style => style.value === value)
}

// Helper function to get learning style title by value
export function getLearningStyleTitle(value: string): string {
  const style = getLearningStyleByValue(value)
  return style?.title || value
}

// Helper function to reorder styles with preferred one first
export function reorderLearningStylesWithPreferred(preferredValue?: string | null): LearningStyle[] {
  if (!preferredValue) return LEARNING_STYLES

  const preferredStyle = getLearningStyleByValue(preferredValue)
  if (!preferredStyle) return LEARNING_STYLES

  // Return array with preferred style first, then all others
  return [
    preferredStyle,
    ...LEARNING_STYLES.filter(style => style.value !== preferredValue)
  ]
}
