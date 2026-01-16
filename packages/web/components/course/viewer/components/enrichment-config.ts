import { Video, Headphones, Presentation, HelpCircle, FileText } from 'lucide-react'

export type EnrichmentType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document'

export const PLACEHOLDER_TYPES: ('quiz' | 'audio' | 'presentation' | 'video')[] = [
  'quiz',
  'audio',
  'presentation',
  'video',
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
  document: {
    icon: FileText,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    labelKey: 'viewer.documentLabel',
  },
}
