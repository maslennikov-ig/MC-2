import { GenerationProgress } from '@/types/course-generation'

// Re-defining GenerationTrace here to avoid importing from a component file
// Ideally this should be moved to a shared types file
// Note: input_data/output_data are optional for skeleton traces (lazy loading pattern)
export type GenerationTrace = {
  id: string
  course_id: string
  lesson_id?: string
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6'
  phase: string
  step_name: string
  input_data?: Record<string, unknown>
  output_data?: Record<string, unknown>
  error_data?: Record<string, unknown>
  model_used?: string
  prompt_text?: string
  completion_text?: string
  tokens_used?: number
  cost_usd?: number
  temperature?: number
  duration_ms?: number
  retry_attempt?: number
  was_cached?: boolean
  quality_score?: number
  created_at: string
}

export type LocalizedName = { ru: string; en: string }

export interface StageInfo {
  id: string // "stage_1", "stage_2", "stage_3", etc. (frontend numbering)
  number: number // 1, 2, 3, 4, 5 (frontend logical numbering)
  name: string // Human-readable name (resolved to current locale)
  status: 'pending' | 'active' | 'completed' | 'error' | 'awaiting'
  progress?: number // 0-100 for active stage
  startedAt?: Date
  completedAt?: Date
  iconName: 'Rocket' | 'Upload' | 'FileText' | 'Tag' | 'Moon' | 'Orbit' | 'Layers' | 'Globe'
}

export const STAGE_CONFIG = {
  stage_0: {
    number: 0,
    name: { ru: 'Запуск генерации', en: 'Starting generation' } as const,
    icon: 'Rocket' as const,
  },
  stage_1: {
    number: 1,
    name: { ru: 'Инициализация', en: 'Initialization' } as const,
    icon: 'Upload' as const,
  },
  stage_2: {
    number: 2,
    name: { ru: 'Обработка документов', en: 'Document processing' } as const,
    icon: 'FileText' as const,
  },
  stage_3: {
    number: 3,
    name: { ru: 'Классификация', en: 'Classification' } as const,
    icon: 'Tag' as const,
  },
  stage_4: { number: 4, name: { ru: 'Анализ', en: 'Analysis' } as const, icon: 'Orbit' as const },
  stage_5: {
    number: 5,
    name: { ru: 'Генерация структуры', en: 'Structure generation' } as const,
    icon: 'Layers' as const,
  },
  stage_6: {
    number: 6,
    name: { ru: 'Генерация контента', en: 'Content generation' } as const,
    icon: 'Globe' as const,
  },
} as const

export function getStageFromStatus(status: string): number | null {
  if (!status) return null
  if (
    status.includes('stage_1') ||
    status === 'initializing' ||
    status === 'pending' ||
    status === 'queued'
  )
    return 1
  if (status.includes('stage_2') || status === 'processing_documents') return 2
  if (status.includes('stage_3') || status === 'classifying') return 3
  if (status.includes('stage_4') || status === 'analyzing_task') return 4
  if (status.includes('stage_5') || status === 'generating_structure') return 5
  if (status.includes('stage_6') || status === 'generating_content') return 6
  if (status === 'completed') return 6 // All done, all stages complete
  return null
}

export function isAwaitingApproval(status: string): number | null {
  if (!status) return null
  const match = status.match(/stage_(\d+)_awaiting_approval/)
  return match ? parseInt(match[1], 10) : null
}

export function buildStagesFromStatus(
  status: string,
  progress: GenerationProgress,
  traces: GenerationTrace[],
  locale: 'ru' | 'en' = 'ru'
): StageInfo[] {
  const currentStage = getStageFromStatus(status)
  const awaitingStage = isAwaitingApproval(status)

  // Filter out stage_0 which is only used for initial start banner, not graph display
  return Object.entries(STAGE_CONFIG)
    .filter(([id]) => id !== 'stage_0')
    .map(([id, config]) => {
      let stageStatus: StageInfo['status'] = 'pending'

      if (awaitingStage === config.number) {
        stageStatus = 'awaiting'
      } else if (currentStage && config.number < currentStage) {
        stageStatus = 'completed'
      } else if (currentStage === config.number) {
        stageStatus = 'active'
        // If we are in awaiting state for THIS stage, it overrides active
        if (awaitingStage === config.number) {
          stageStatus = 'awaiting'
        }
      } else if (status === 'completed') {
        stageStatus = 'completed'
      }

      if (status === 'failed') {
        // Check if this stage failed by looking at the traces or current stage
        // If current stage is this one and status is failed
        if (currentStage === config.number) {
          stageStatus = 'error'
        }
        // Or if we have an error trace for this stage
        const hasError = traces.some((t) => t.stage === id && t.error_data)
        if (hasError) stageStatus = 'error'
      }

      return {
        id,
        number: config.number,
        name: config.name[locale],
        status: stageStatus,
        progress: stageStatus === 'active' ? progress.percentage : undefined,
        iconName: config.icon,
      }
    })
}
