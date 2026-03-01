// Editor field type definitions for inline editing

export type EditorFieldType = 'text' | 'textarea' | 'chips' | 'select' | 'number' | 'toggle'

export interface FieldConfig {
  path: string // JSON path in data structure
  label: string | { ru: string; en: string } // Display label (bilingual or plain string)
  type: EditorFieldType
  options?: string[] // For 'select' type
  min?: number // For 'number' type
  max?: number // For 'number' type
  placeholder?: string
  helpText?: string
  regeneratable?: boolean // Can be regenerated via AI
}

// Stage 4 field configurations
export const ANALYSIS_RESULT_FIELDS: FieldConfig[] = [
  // Course Classification
  {
    path: 'course_category.primary',
    label: { ru: 'Категория', en: 'Category' },
    type: 'select',
    options: ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'],
  },
  {
    path: 'contextual_language.why_matters_context',
    label: { ru: 'Почему это важно', en: 'Why it matters' },
    type: 'textarea',
    regeneratable: true,
  },
  {
    path: 'contextual_language.motivators',
    label: { ru: 'Мотиваторы', en: 'Motivators' },
    type: 'textarea',
    regeneratable: true,
  },

  // Topic Analysis
  {
    path: 'topic_analysis.determined_topic',
    label: { ru: 'Тема', en: 'Topic' },
    type: 'text',
    regeneratable: true,
  },
  {
    path: 'topic_analysis.complexity',
    label: { ru: 'Сложность', en: 'Complexity' },
    type: 'select',
    options: ['narrow', 'medium', 'broad'],
  },
  {
    path: 'topic_analysis.target_audience',
    label: { ru: 'Аудитория', en: 'Audience' },
    type: 'select',
    options: ['beginner', 'intermediate', 'advanced', 'mixed'],
  },
  {
    path: 'topic_analysis.key_concepts',
    label: { ru: 'Ключевые концепции', en: 'Key concepts' },
    type: 'chips',
    regeneratable: true,
  },

  // Recommended Structure
  {
    path: 'recommended_structure.total_lessons',
    label: { ru: 'Уроков', en: 'Lessons' },
    type: 'number',
    min: 10,
    max: 100,
  },
  {
    path: 'recommended_structure.total_sections',
    label: { ru: 'Модулей', en: 'Modules' },
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    path: 'recommended_structure.lesson_duration_minutes',
    label: { ru: 'Длительность урока (мин)', en: 'Lesson duration (min)' },
    type: 'number',
    min: 3,
    max: 45,
  },

  // Pedagogical Strategy
  {
    path: 'pedagogical_strategy.assessment_approach',
    label: { ru: 'Подход к оценке', en: 'Assessment approach' },
    type: 'textarea',
    regeneratable: true,
  },
  {
    path: 'pedagogical_strategy.progression_logic',
    label: { ru: 'Логика прогресса', en: 'Progression logic' },
    type: 'textarea',
    regeneratable: true,
  },

  // Generation Guidance
  {
    path: 'generation_guidance.tone',
    label: { ru: 'Тон', en: 'Tone' },
    type: 'select',
    options: [
      'conversational but precise',
      'formal academic',
      'casual friendly',
      'technical professional',
    ],
  },
  {
    path: 'generation_guidance.use_analogies',
    label: { ru: 'Использовать аналогии', en: 'Use analogies' },
    type: 'toggle',
  },
  {
    path: 'generation_guidance.specific_analogies',
    label: { ru: 'Специфичные аналогии', en: 'Specific analogies' },
    type: 'chips',
    regeneratable: true,
  },
]

// Stage 5 field configurations (per lesson)
export const COURSE_STRUCTURE_LESSON_FIELDS: FieldConfig[] = [
  { path: 'title', label: { ru: 'Название', en: 'Title' }, type: 'text', regeneratable: true },
  {
    path: 'learning_objectives',
    label: { ru: 'Цели урока', en: 'Learning objectives' },
    type: 'chips',
    regeneratable: true,
  },
  {
    path: 'key_topics',
    label: { ru: 'Ключевые темы', en: 'Key topics' },
    type: 'chips',
    regeneratable: true,
  },
  {
    path: 'estimated_duration_minutes',
    label: { ru: 'Длительность (мин)', en: 'Duration (min)' },
    type: 'number',
    min: 3,
    max: 60,
  },
]
