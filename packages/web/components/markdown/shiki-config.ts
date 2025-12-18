import type { BundledTheme } from 'shiki';

/**
 * Shiki theme configuration for code syntax highlighting
 *
 * Uses dual themes for automatic light/dark mode support.
 * rehype-pretty-code will generate CSS custom properties for theme switching.
 */

/**
 * Dual theme configuration for light/dark mode
 */
export const shikiThemes: { light: BundledTheme; dark: BundledTheme } = {
  light: 'github-light',
  dark: 'github-dark',
};

/**
 * rehype-pretty-code options for Shiki integration
 *
 * @see https://rehype-pretty.pages.dev/#options
 */
export const rehypePrettyCodeOptions = {
  /** Use dual themes for light/dark mode support */
  theme: shikiThemes,
  /** Don't keep background - use CSS variables instead for theme switching */
  keepBackground: false,
  /** Default language when none is specified */
  defaultLang: 'plaintext',
  /** Transformers can be added here for custom rendering */
  transformers: [],
};
