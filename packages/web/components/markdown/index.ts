/**
 * Unified Markdown Rendering System
 *
 * This module provides two renderers for different use cases:
 * - MarkdownRenderer: Server-side RSC for static content (lessons, previews)
 * - MarkdownRendererClient: Client-side for streaming AI chat and dynamic content
 *
 * @example
 * ```tsx
 * // Server-side lesson rendering (RSC pages only)
 * import { MarkdownRenderer } from '@/components/markdown';
 * <MarkdownRenderer content={lessonMarkdown} preset="lesson" />
 *
 * // Client-side rendering (streaming chat, dynamic content)
 * import { MarkdownRendererClient } from '@/components/markdown';
 * <MarkdownRendererClient content={streamingMessage} isStreaming />
 * ```
 */

// Main renderers
export { MarkdownRenderer } from './MarkdownRenderer';
export { MarkdownRendererClient } from './MarkdownRendererClient';

// Components
export { CodeBlock, MermaidDiagram, Callout, Heading, H1, H2, H3, H4, H5, H6, ResponsiveTable, Link, SkipToContent } from './components';

// Presets and configuration
export { presets, getPresetConfig } from './presets';

// Types
export type {
  PresetName,
  PresetConfig,
  FeatureFlags,
  MarkdownRendererProps,
  MarkdownRendererClientProps,
  CodeBlockProps,
  CalloutType,
  CalloutProps,
  MermaidDiagramProps,
  HeadingProps,
  LinkProps,
  ResponsiveTableProps,
} from './types';
