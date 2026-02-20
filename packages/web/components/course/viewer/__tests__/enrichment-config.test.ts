import { describe, it, expect } from 'vitest'
import {
  ALL_PLACEHOLDER_TYPES,
  PLACEHOLDER_TYPES,
  ENRICHMENT_CONFIG,
} from '@/components/course/viewer/components/enrichment-config'

describe('enrichment-config', () => {
  it('includes nlm types in placeholder lists', () => {
    expect(PLACEHOLDER_TYPES).toContain('nlm_audio')
    expect(PLACEHOLDER_TYPES).toContain('nlm_video')
    expect(ALL_PLACEHOLDER_TYPES).toContain('nlm_audio')
    expect(ALL_PLACEHOLDER_TYPES).toContain('nlm_video')
  })

  it('provides config entries for nlm types', () => {
    expect(ENRICHMENT_CONFIG.nlm_audio).toBeDefined()
    expect(ENRICHMENT_CONFIG.nlm_video).toBeDefined()
    expect(ENRICHMENT_CONFIG.nlm_audio.labelKey).toBe('viewer.nlmAudioLesson')
    expect(ENRICHMENT_CONFIG.nlm_video.labelKey).toBe('viewer.nlmVideoLesson')
  })
})
