import type { RoleTitleSuggestion } from './role-title-suggestions.types'

export const mc2OverlayRole = (
  suggestion: Omit<RoleTitleSuggestion, 'source'>
): RoleTitleSuggestion => ({
  ...suggestion,
  source: 'mc2_overlay',
})
