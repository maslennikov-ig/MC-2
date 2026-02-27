import type {
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
  StudyGuideEnrichmentContent,
  FlashcardsEnrichmentContent,
  MindMapEnrichmentContent,
  InfographicEnrichmentContent,
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

export function isStudyGuideContent(content: unknown): content is StudyGuideEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_study_guide' &&
    'markdown' in content &&
    typeof (content as Record<string, unknown>).markdown === 'string'
  )
}

export function isFlashcardsContent(content: unknown): content is FlashcardsEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_flashcards' &&
    'cards' in content &&
    Array.isArray((content as Record<string, unknown>).cards)
  )
}

export function isMindMapContent(content: unknown): content is MindMapEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_mind_map' &&
    'root' in content &&
    typeof (content as Record<string, unknown>).root === 'object'
  )
}

export function isInfographicContent(content: unknown): content is InfographicEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'nlm_infographic' &&
    'imageUrl' in content &&
    typeof (content as Record<string, unknown>).imageUrl === 'string'
  )
}
