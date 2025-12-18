/**
 * Type definitions for the unified markdown rendering system
 *
 * This file contains all TypeScript interfaces and types for markdown rendering,
 * including preset configurations, feature flags, and component props.
 */

import * as React from 'react';

/**
 * Available preset names for different rendering contexts
 */
export type PresetName = 'lesson' | 'chat' | 'preview' | 'minimal';

/**
 * Feature flags that can be enabled/disabled per preset
 */
export interface FeatureFlags {
  /** Enable LaTeX/KaTeX math formula rendering */
  math: boolean;
  /** Enable Mermaid diagram rendering */
  mermaid: boolean;
  /** Enable Shiki syntax highlighting for code blocks */
  codeHighlight: boolean;
  /** Show copy-to-clipboard button on code blocks */
  copyButton: boolean;
  /** Add anchor links to headings */
  anchorLinks: boolean;
  /** Enable callout/admonition blocks */
  callouts: boolean;
  /** Enable responsive table wrapper */
  responsiveTables: boolean;
}

/**
 * Preset configuration combining features with optional overrides
 */
export interface PresetConfig extends FeatureFlags {
  /** Optional custom class name for the wrapper */
  className?: string;
}

/**
 * Main MarkdownRenderer (RSC) props
 */
export interface MarkdownRendererProps {
  /** Markdown/MDX content string */
  content: string;
  /** Preset configuration name */
  preset?: PresetName;
  /** Additional MDX components to merge with defaults */
  components?: Record<string, React.ComponentType<unknown>>;
  /** Custom className for wrapper */
  className?: string;
  /** Override specific features from preset */
  features?: Partial<FeatureFlags>;
  /** Trust level for content - affects sanitization */
  trusted?: boolean;
}

/**
 * Client-side streaming renderer props
 */
export interface MarkdownRendererClientProps {
  /** Streaming markdown content */
  content: string;
  /** Preset (limited to chat/minimal for streaming) */
  preset?: 'chat' | 'minimal';
  /** Custom className for wrapper */
  className?: string;
  /** Whether content is currently streaming */
  isStreaming?: boolean;
  /** Override specific features */
  features?: Partial<Pick<FeatureFlags, 'codeHighlight' | 'responsiveTables'>>;
}

/**
 * CodeBlock component props
 */
export interface CodeBlockProps {
  /** Code content (children from MDX) */
  children: React.ReactNode;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Optional filename to display as header */
  filename?: string;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Lines to highlight (1-indexed) */
  highlightLines?: number[];
  /** Custom className */
  className?: string;
}

/**
 * Callout/admonition types
 */
export type CalloutType = 'note' | 'tip' | 'warning' | 'danger' | 'info';

/**
 * Callout component props
 */
export interface CalloutProps {
  /** Type determines styling (color, icon) */
  type: CalloutType;
  /** Optional custom title */
  title?: string;
  /** Callout content */
  children: React.ReactNode;
  /** Custom className */
  className?: string;
}

/**
 * MermaidDiagram component props
 */
export interface MermaidDiagramProps {
  /** Mermaid syntax definition */
  chart: string;
  /** Custom className for wrapper */
  className?: string;
  /** Accessible label for diagram */
  ariaLabel?: string;
}

/**
 * Heading component props (H1-H6)
 */
export interface HeadingProps {
  /** Heading level */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Auto-generated ID for anchor */
  id?: string;
  /** Heading text content */
  children: React.ReactNode;
  /** Show anchor link on hover */
  showAnchor?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Link component props
 */
export interface LinkProps {
  /** Link URL */
  href?: string;
  /** Link text */
  children: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Title attribute */
  title?: string;
}

/**
 * ResponsiveTable wrapper props
 */
export interface ResponsiveTableProps {
  /** Table content (children from MDX) */
  children: React.ReactNode;
  /** Custom className */
  className?: string;
}
