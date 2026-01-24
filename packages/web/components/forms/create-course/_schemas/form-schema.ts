import { z } from 'zod'
import { courseSizeSchema } from '@megacampus/shared-types'

export const formSchema = z
  .object({
    topic: z.string().min(3, 'Тема должна содержать минимум 3 символа').max(200),
    email: z.string().email('Введите корректный email'),
    description: z.string().max(7000, 'Описание должно быть менее 7000 символов').optional(),
    writingStyle: z
      .enum([
        'academic',
        'conversational',
        'storytelling',
        'practical',
        'motivational',
        'visual',
        'gamified',
        'minimalist',
        'research',
        'engaging',
        'professional',
        'socratic',
        'problem_based',
        'collaborative',
        'technical',
        'microlearning',
        'inspirational',
        'interactive',
        'analytical',
      ])
      .optional(),
    language: z
      .enum([
        'ru',
        'en',
        'zh',
        'es',
        'fr',
        'de',
        'ja',
        'ko',
        'ar',
        'pt',
        'it',
        'tr',
        'vi',
        'th',
        'id',
        'ms',
        'hi',
        'bn',
        'pl',
      ])
      .optional(),
    courseSize: courseSizeSchema.optional(),
    targetAudience: z.string().optional(),
    // Minimum values based on course size presets:
    // - micro: 1-5 lessons, 1 section
    // - comprehensive: up to 100 lessons, 18 sections
    // - custom: up to 200 lessons, 50 sections (for advanced users)
    estimatedLessons: z
      .number()
      .min(1)
      .max(200, 'Максимум 200 уроков')
      .optional()
      .or(z.nan().transform(() => undefined)),
    estimatedSections: z
      .number()
      .min(1)
      .max(50, 'Максимум 50 секций')
      .optional()
      .or(z.nan().transform(() => undefined)),
    contentStrategy: z
      .enum(['auto', 'create_from_scratch', 'expand_and_enhance', 'optimize_existing'])
      .optional(),
    lessonDuration: z.number().int().min(3).max(45).optional(),
    learningOutcomes: z.string().optional(),
    formats: z.array(z.string()).optional(),

    // Generation mode fields
    generationMode: z.enum(['automatic', 'semi_automatic']).default('automatic'),
    notifyOnCompletion: z.boolean().default(true),
    notifyOnError: z.boolean().default(true),
    notifyOnStageComplete: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // For 'auto' courseSize, estimatedLessons should be undefined (LLM decides)
      // For preset sizes or undefined courseSize, allow any valid value
      if (data.courseSize === 'auto') {
        return data.estimatedLessons === undefined
      }
      return true
    },
    {
      message: 'При выборе "Оптимальный" размер определяется автоматически',
      path: ['estimatedLessons'],
    }
  )

export type FormData = z.infer<typeof formSchema>
