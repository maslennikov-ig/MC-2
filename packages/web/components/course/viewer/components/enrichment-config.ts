import {
  Video,
  Headphones,
  Presentation,
  HelpCircle,
  FileText,
  Image,
  BookOpen,
  Layers,
  Network,
  ImageIcon,
} from 'lucide-react'

export type EnrichmentType =
  | 'video'
  | 'audio'
  | 'nlm_audio'
  | 'nlm_video'
  | 'presentation'
  | 'quiz'
  | 'document'
  | 'cover'
  | 'card'
  | 'nlm_study_guide'
  | 'nlm_flashcards'
  | 'nlm_mind_map'
  | 'nlm_infographic'

export const PLACEHOLDER_TYPES: (
  | 'nlm_audio'
  | 'nlm_video'
  | 'nlm_study_guide'
  | 'nlm_flashcards'
  | 'nlm_mind_map'
  | 'nlm_infographic'
)[] = ['nlm_audio', 'nlm_video', 'nlm_flashcards', 'nlm_mind_map', 'nlm_infographic']

// Image types
// - cover: 16:9 hero banner for lesson header
// - card: 1:1 square thumbnail for lesson navigation
export const IMAGE_PLACEHOLDER_TYPES: ('cover' | 'card')[] = ['cover', 'card']

// Generatable enrichment types (excludes 'document' which is uploaded, not generated)
export type GeneratableEnrichmentType =
  | 'quiz'
  | 'audio'
  | 'nlm_audio'
  | 'nlm_video'
  | 'presentation'
  | 'video'
  | 'cover'
  | 'card'
  | 'nlm_study_guide'
  | 'nlm_flashcards'
  | 'nlm_mind_map'
  | 'nlm_infographic'

// All placeholder types in unified order for single grid display
export const ALL_PLACEHOLDER_TYPES: GeneratableEnrichmentType[] = [
  'cover',
  'card',
  'nlm_audio',
  'nlm_video',
  'nlm_flashcards',
  'nlm_mind_map',
  'nlm_infographic',
]

export const ENRICHMENT_CONFIG: Record<
  EnrichmentType,
  {
    icon: React.ElementType
    color: string
    bgColor: string
    labelKey: string
  }
> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    labelKey: 'viewer.videoLesson',
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    labelKey: 'viewer.audioLesson',
  },
  nlm_audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    labelKey: 'viewer.nlmAudioLesson',
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    labelKey: 'viewer.presentationLabel',
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    labelKey: 'viewer.quizLabel',
  },
  nlm_video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    labelKey: 'viewer.nlmVideoLesson',
  },
  document: {
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    labelKey: 'viewer.documentLabel',
  },
  cover: {
    icon: Image,
    color: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    labelKey: 'viewer.enrichmentTypes.cover',
  },
  card: {
    icon: Image,
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    labelKey: 'viewer.enrichmentTypes.card',
  },
  nlm_study_guide: {
    icon: BookOpen,
    color: 'text-emerald-500 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    labelKey: 'viewer.enrichmentTypes.nlm_study_guide',
  },
  nlm_flashcards: {
    icon: Layers,
    color: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    labelKey: 'viewer.enrichmentTypes.nlm_flashcards',
  },
  nlm_mind_map: {
    icon: Network,
    color: 'text-sky-500 dark:text-sky-400',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    labelKey: 'viewer.enrichmentTypes.nlm_mind_map',
  },
  nlm_infographic: {
    icon: ImageIcon,
    color: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    labelKey: 'viewer.enrichmentTypes.nlm_infographic',
  },
}
