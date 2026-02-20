import type {
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
} from '@megacampus/shared-types/enrichment-content'

type AudioLikeContent = Omit<AudioEnrichmentContent, 'type'> & { type: 'audio' | 'nlm_audio' }
type VideoLikeContent = {
  type: 'video' | 'nlm_video'
  duration_seconds?: number
  script?: string
  estimated_duration_seconds?: number
}

// Type guards for safe content parsing
export function isQuizContent(content: unknown): content is QuizEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'quiz' &&
    'questions' in content &&
    Array.isArray((content as Record<string, unknown>).questions)
  )
}

export function isAudioContent(content: unknown): content is AudioLikeContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    ((content as Record<string, unknown>).type === 'audio' ||
      (content as Record<string, unknown>).type === 'nlm_audio')
  )
}

export function isPresentationContent(content: unknown): content is PresentationEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'presentation' &&
    'slides' in content &&
    Array.isArray((content as Record<string, unknown>).slides)
  )
}

export function isVideoContent(content: unknown): content is VideoLikeContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    ((content as Record<string, unknown>).type === 'video' ||
      (content as Record<string, unknown>).type === 'nlm_video')
  )
}
