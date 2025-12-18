import type { PresetConfig, PresetName } from './types';

/**
 * Preset configurations for different rendering contexts
 */
export const presets: Record<PresetName, PresetConfig> = {
  /**
   * Full-featured preset for student-facing lesson content
   * - All features enabled for rich educational content
   */
  lesson: {
    math: true,
    mermaid: true,
    codeHighlight: true,
    copyButton: true,
    anchorLinks: true,
    callouts: true,
    responsiveTables: true,
    className: 'prose prose-lg dark:prose-invert max-w-none',
  },

  /**
   * Minimal preset for AI chat streaming content
   * - Performance-optimized, minimal features
   */
  chat: {
    math: false,
    mermaid: false,
    codeHighlight: true,
    copyButton: false,
    anchorLinks: false,
    callouts: false,
    responsiveTables: false,
    className: 'prose prose-sm dark:prose-invert max-w-none',
  },

  /**
   * Preview preset for content approval/review UI
   * - Most features except heavy ones (mermaid, anchor links)
   */
  preview: {
    math: true,
    mermaid: false, // Too heavy for preview context
    codeHighlight: true,
    copyButton: true,
    anchorLinks: false,
    callouts: true,
    responsiveTables: true,
    className: 'prose dark:prose-invert max-w-none',
  },

  /**
   * Bare minimum rendering for simple text display
   * - Raw prose styling only
   */
  minimal: {
    math: false,
    mermaid: false,
    codeHighlight: false,
    copyButton: false,
    anchorLinks: false,
    callouts: false,
    responsiveTables: false,
    className: 'prose prose-sm dark:prose-invert max-w-none',
  },
};

/**
 * Get merged preset config with feature overrides
 */
export function getPresetConfig(
  preset: PresetName = 'lesson',
  overrides?: Partial<PresetConfig>
): PresetConfig {
  return {
    ...presets[preset],
    ...overrides,
  };
}
