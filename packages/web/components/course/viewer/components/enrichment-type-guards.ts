import type {
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
} from '@megacampus/shared-types/enrichment-content'

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

export function isAudioContent(content: unknown): content is AudioEnrichmentContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'audio'
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

export function isVideoContent(
  content: unknown
): content is { type: 'video'; duration_seconds?: number } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'video'
  )
}
