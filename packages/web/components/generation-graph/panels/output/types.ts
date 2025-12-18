// Editor field type definitions for inline editing

export type EditorFieldType = 'text' | 'textarea' | 'chips' | 'select' | 'number' | 'toggle';

export interface FieldConfig {
  path: string;           // JSON path in data structure
  label: string;          // Display label
  type: EditorFieldType;
  options?: string[];     // For 'select' type
  min?: number;           // For 'number' type
  max?: number;           // For 'number' type
  placeholder?: string;
  helpText?: string;
  regeneratable?: boolean; // Can be regenerated via AI
}

// Stage 4 field configurations
export const ANALYSIS_RESULT_FIELDS: FieldConfig[] = [
  // Course Classification
  { path: 'course_category.primary', label: 'Категория', type: 'select', options: ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'] },
  { path: 'contextual_language.why_matters_context', label: 'Почему это важно', type: 'textarea', regeneratable: true },
  { path: 'contextual_language.motivators', label: 'Мотиваторы', type: 'textarea', regeneratable: true },

  // Topic Analysis
  { path: 'topic_analysis.determined_topic', label: 'Тема', type: 'text', regeneratable: true },
  { path: 'topic_analysis.complexity', label: 'Сложность', type: 'select', options: ['narrow', 'medium', 'broad'] },
  { path: 'topic_analysis.target_audience', label: 'Аудитория', type: 'select', options: ['beginner', 'intermediate', 'advanced', 'mixed'] },
  { path: 'topic_analysis.key_concepts', label: 'Ключевые концепции', type: 'chips', regeneratable: true },

  // Recommended Structure
  { path: 'recommended_structure.total_lessons', label: 'Уроков', type: 'number', min: 10, max: 100 },
  { path: 'recommended_structure.total_sections', label: 'Модулей', type: 'number', min: 1, max: 30 },
  { path: 'recommended_structure.lesson_duration_minutes', label: 'Длительность урока (мин)', type: 'number', min: 3, max: 45 },

  // Pedagogical Strategy
  { path: 'pedagogical_strategy.teaching_style', label: 'Стиль обучения', type: 'select', options: ['hands-on', 'theory-first', 'project-based', 'mixed'] },
  { path: 'pedagogical_strategy.interactivity_level', label: 'Интерактивность', type: 'select', options: ['high', 'medium', 'low'] },
  { path: 'pedagogical_patterns.assessment_types', label: 'Типы заданий', type: 'chips' },

  // Generation Guidance
  { path: 'generation_guidance.tone', label: 'Тон', type: 'select', options: ['conversational but precise', 'formal academic', 'casual friendly', 'technical professional'] },
  { path: 'generation_guidance.use_analogies', label: 'Использовать аналогии', type: 'toggle' },
  { path: 'generation_guidance.specific_analogies', label: 'Специфичные аналогии', type: 'chips', regeneratable: true },
];

// Stage 5 field configurations (per lesson)
export const COURSE_STRUCTURE_LESSON_FIELDS: FieldConfig[] = [
  { path: 'title', label: 'Название', type: 'text', regeneratable: true },
  { path: 'learning_objectives', label: 'Цели обучения', type: 'chips', regeneratable: true },
  { path: 'key_topics', label: 'Ключевые темы', type: 'chips', regeneratable: true },
  { path: 'estimated_duration_minutes', label: 'Длительность (мин)', type: 'number', min: 3, max: 60 },
];
