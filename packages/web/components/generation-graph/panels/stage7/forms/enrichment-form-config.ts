/**
 * Enrichment Form Configuration Registry
 *
 * Schema-driven form field definitions per enrichment type.
 * Maps each field to its widget type, i18n key, and defaults
 * sourced from Zod schemas in enrichment-on-demand.ts.
 *
 * @module panels/stage7/forms/enrichment-form-config
 */

import type { EnrichmentType } from '@/lib/generation-graph/enrichment-config'

/**
 * Supported form field widget types
 */
export type FieldWidgetType = 'select' | 'slider' | 'checkbox'

/**
 * Option for select fields
 */
export interface SelectOption {
  value: string
  /** i18n key under enrichments.forms.{formKey}.{labelKey} */
  labelKey: string
}

/**
 * Configuration for a single form field
 */
export interface FormFieldConfig {
  /** Field name (maps to settings key sent to backend) */
  name: string
  /** Widget type to render */
  widget: FieldWidgetType
  /** i18n key for field label under enrichments.forms.{formKey}.{name} */
  labelKey: string
  /** Default value */
  defaultValue: string | number | boolean
  /** Options for select widget */
  options?: SelectOption[]
  /** Min value for slider */
  min?: number
  /** Max value for slider */
  max?: number
  /** Step for slider */
  step?: number
  /** Format function for slider display value */
  formatValue?: (value: number) => string
}

/**
 * Form configuration for a single enrichment type
 */
export interface EnrichmentFormConfig {
  /** i18n key prefix under enrichments.forms (e.g., 'quiz', 'nlmAudio') */
  formKey: string
  /** Array of field configurations */
  fields: FormFieldConfig[]
}

/**
 * Types that can be created by users (excludes card which is auto-generated)
 */
export type CreateableEnrichmentType = Exclude<EnrichmentType, 'card'>

/**
 * All user-createable enrichment types (ordered for display)
 */
export const CREATEABLE_TYPES: CreateableEnrichmentType[] = [
  'cover',
  'banner',
  'quiz',
  'presentation',
  'audio',
  'nlm_audio',
  'nlm_video',
  'video',
  'nlm_study_guide',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
  'document',
]

/**
 * Grouped createable types for section-based display
 */
export const CREATEABLE_TYPE_GROUPS: Array<{
  groupKey: string
  types: CreateableEnrichmentType[]
}> = [
  { groupKey: 'images', types: ['cover', 'banner'] },
  { groupKey: 'interactive', types: ['quiz', 'presentation'] },
  { groupKey: 'audioVideo', types: ['audio', 'nlm_audio', 'video', 'nlm_video'] },
  {
    groupKey: 'aiContent',
    types: ['nlm_study_guide', 'nlm_flashcards', 'nlm_mind_map', 'nlm_infographic'],
  },
  { groupKey: 'other', types: ['document'] },
]

/**
 * Form configuration registry per enrichment type
 *
 * Defaults sourced from Zod schemas in @megacampus/shared-types/enrichment-on-demand
 */
export const ENRICHMENT_FORM_CONFIGS: Partial<
  Record<CreateableEnrichmentType, EnrichmentFormConfig>
> = {
  quiz: {
    formKey: 'quiz',
    fields: [
      {
        name: 'questionCount',
        widget: 'slider',
        labelKey: 'questionCount',
        defaultValue: 5,
        min: 3,
        max: 15,
        step: 1,
      },
      {
        name: 'difficulty',
        widget: 'select',
        labelKey: 'difficulty',
        defaultValue: 'medium',
        options: [
          { value: 'easy', labelKey: 'difficultyEasy' },
          { value: 'medium', labelKey: 'difficultyMedium' },
          { value: 'hard', labelKey: 'difficultyHard' },
        ],
      },
    ],
  },

  audio: {
    formKey: 'audio',
    fields: [
      {
        name: 'voice',
        widget: 'select',
        labelKey: 'voice',
        defaultValue: 'default',
        options: [
          { value: 'default', labelKey: 'voiceDefault' },
          { value: 'male', labelKey: 'voiceMale' },
          { value: 'female', labelKey: 'voiceFemale' },
        ],
      },
      {
        name: 'speed',
        widget: 'select',
        labelKey: 'speed',
        defaultValue: 'normal',
        options: [
          { value: 'slow', labelKey: 'speedSlow' },
          { value: 'normal', labelKey: 'speedNormal' },
          { value: 'fast', labelKey: 'speedFast' },
        ],
      },
    ],
  },

  nlm_audio: {
    formKey: 'nlmAudio',
    fields: [
      {
        name: 'nlm_audio_format',
        widget: 'select',
        labelKey: 'format',
        defaultValue: 'deep_dive',
        options: [
          { value: 'deep_dive', labelKey: 'formatDeepDive' },
          { value: 'brief', labelKey: 'formatBrief' },
          { value: 'critique', labelKey: 'formatCritique' },
          { value: 'debate', labelKey: 'formatDebate' },
        ],
      },
    ],
  },

  nlm_video: {
    formKey: 'nlmVideo',
    fields: [
      {
        name: 'nlm_video_format',
        widget: 'select',
        labelKey: 'format',
        defaultValue: 'explainer',
        options: [
          { value: 'explainer', labelKey: 'formatExplainer' },
          { value: 'brief', labelKey: 'formatBrief' },
        ],
      },
      {
        name: 'nlm_video_style',
        widget: 'select',
        labelKey: 'style',
        defaultValue: 'auto_select',
        options: [
          { value: 'auto_select', labelKey: 'styleAutoSelect' },
          { value: 'custom', labelKey: 'styleCustom' },
          { value: 'classic', labelKey: 'styleClassic' },
          { value: 'whiteboard', labelKey: 'styleWhiteboard' },
          { value: 'kawaii', labelKey: 'styleKawaii' },
          { value: 'anime', labelKey: 'styleAnime' },
          { value: 'watercolor', labelKey: 'styleWatercolor' },
          { value: 'retro_print', labelKey: 'styleRetroPrint' },
          { value: 'heritage', labelKey: 'styleHeritage' },
          { value: 'paper_craft', labelKey: 'stylePaperCraft' },
        ],
      },
    ],
  },

  presentation: {
    formKey: 'presentation',
    fields: [
      {
        name: 'slideCount',
        widget: 'slider',
        labelKey: 'slideCount',
        defaultValue: 8,
        min: 5,
        max: 10,
        step: 1,
      },
      {
        name: 'theme',
        widget: 'select',
        labelKey: 'theme',
        defaultValue: 'light',
        options: [
          { value: 'light', labelKey: 'themeLight' },
          { value: 'dark', labelKey: 'themeDark' },
          { value: 'colorful', labelKey: 'themeColorful' },
        ],
      },
    ],
  },

  cover: {
    formKey: 'coverBanner',
    fields: [
      {
        name: 'style',
        widget: 'select',
        labelKey: 'style',
        defaultValue: 'premium3d',
        options: [
          { value: 'premium3d', labelKey: 'stylePremium3d' },
          { value: 'realistic', labelKey: 'styleRealistic' },
          { value: 'abstract', labelKey: 'styleAbstract' },
          { value: 'minimalist', labelKey: 'styleMinimalist' },
          { value: 'dramatic', labelKey: 'styleDramatic' },
        ],
      },
      {
        name: 'colorScheme',
        widget: 'select',
        labelKey: 'colorScheme',
        defaultValue: 'auto',
        options: [
          { value: 'auto', labelKey: 'colorSchemeAuto' },
          { value: 'warm', labelKey: 'colorSchemeWarm' },
          { value: 'cool', labelKey: 'colorSchemeCool' },
          { value: 'monochrome', labelKey: 'colorSchemeMonochrome' },
        ],
      },
    ],
  },

  banner: {
    formKey: 'coverBanner',
    fields: [
      {
        name: 'style',
        widget: 'select',
        labelKey: 'style',
        defaultValue: 'premium3d',
        options: [
          { value: 'premium3d', labelKey: 'stylePremium3d' },
          { value: 'realistic', labelKey: 'styleRealistic' },
          { value: 'abstract', labelKey: 'styleAbstract' },
          { value: 'minimalist', labelKey: 'styleMinimalist' },
          { value: 'dramatic', labelKey: 'styleDramatic' },
        ],
      },
      {
        name: 'colorScheme',
        widget: 'select',
        labelKey: 'colorScheme',
        defaultValue: 'auto',
        options: [
          { value: 'auto', labelKey: 'colorSchemeAuto' },
          { value: 'warm', labelKey: 'colorSchemeWarm' },
          { value: 'cool', labelKey: 'colorSchemeCool' },
          { value: 'monochrome', labelKey: 'colorSchemeMonochrome' },
        ],
      },
    ],
  },

  video: {
    formKey: 'video',
    fields: [
      {
        name: 'voice',
        widget: 'select',
        labelKey: 'voice',
        defaultValue: 'alloy',
        options: [
          { value: 'alloy', labelKey: 'voiceAlloy' },
          { value: 'echo', labelKey: 'voiceEcho' },
          { value: 'fable', labelKey: 'voiceFable' },
          { value: 'onyx', labelKey: 'voiceOnyx' },
          { value: 'nova', labelKey: 'voiceNova' },
          { value: 'shimmer', labelKey: 'voiceShimmer' },
        ],
      },
      {
        name: 'speed',
        widget: 'slider',
        labelKey: 'speed',
        defaultValue: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        formatValue: (v: number) => `${v.toFixed(1)}x`,
      },
    ],
  },

  nlm_study_guide: {
    formKey: 'nlmStudyGuide',
    fields: [
      {
        name: 'detailLevel',
        widget: 'select',
        labelKey: 'detailLevel',
        defaultValue: 'standard',
        options: [
          { value: 'brief', labelKey: 'detailBrief' },
          { value: 'standard', labelKey: 'detailStandard' },
          { value: 'comprehensive', labelKey: 'detailComprehensive' },
        ],
      },
    ],
  },

  nlm_flashcards: {
    formKey: 'nlmFlashcards',
    fields: [
      {
        name: 'cardCount',
        widget: 'slider',
        labelKey: 'cardCount',
        defaultValue: 15,
        min: 5,
        max: 50,
        step: 5,
      },
      {
        name: 'difficulty',
        widget: 'select',
        labelKey: 'difficulty',
        defaultValue: 'medium',
        options: [
          { value: 'easy', labelKey: 'difficultyEasy' },
          { value: 'medium', labelKey: 'difficultyMedium' },
          { value: 'hard', labelKey: 'difficultyHard' },
        ],
      },
    ],
  },

  nlm_mind_map: {
    formKey: 'nlmMindMap',
    fields: [
      {
        name: 'depth',
        widget: 'select',
        labelKey: 'depth',
        defaultValue: 'standard',
        options: [
          { value: 'shallow', labelKey: 'depthShallow' },
          { value: 'standard', labelKey: 'depthStandard' },
          { value: 'deep', labelKey: 'depthDeep' },
        ],
      },
    ],
  },

  nlm_infographic: {
    formKey: 'nlmInfographic',
    fields: [
      {
        name: 'orientation',
        widget: 'select',
        labelKey: 'orientation',
        defaultValue: 'portrait',
        options: [
          { value: 'portrait', labelKey: 'orientationPortrait' },
          { value: 'landscape', labelKey: 'orientationLandscape' },
        ],
      },
      {
        name: 'detailLevel',
        widget: 'select',
        labelKey: 'detailLevel',
        defaultValue: 'detailed',
        options: [
          { value: 'overview', labelKey: 'detailOverview' },
          { value: 'detailed', labelKey: 'detailDetailed' },
        ],
      },
    ],
  },

  // document has no settings
}

/**
 * Get form config for a given enrichment type.
 * Returns undefined for types with no settings (e.g., document).
 */
export function getFormConfig(type: CreateableEnrichmentType): EnrichmentFormConfig | undefined {
  return ENRICHMENT_FORM_CONFIGS[type]
}

/**
 * Check if an enrichment type has configurable settings
 */
export function hasFormSettings(type: CreateableEnrichmentType): boolean {
  const config = ENRICHMENT_FORM_CONFIGS[type]
  return !!config && config.fields.length > 0
}

/**
 * Get default settings object for a given enrichment type
 */
export function getDefaultSettings(type: CreateableEnrichmentType): Record<string, unknown> {
  const config = ENRICHMENT_FORM_CONFIGS[type]
  if (!config) return {}
  const defaults: Record<string, unknown> = {}
  for (const field of config.fields) {
    defaults[field.name] = field.defaultValue
  }
  return defaults
}
