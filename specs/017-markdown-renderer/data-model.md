# Data Model: Unified Markdown Rendering System

**Date**: 2025-12-11
**Status**: Complete

## Overview

This document defines the TypeScript interfaces, types, and data structures for the unified markdown rendering system. The system is presentation-layer only with no persistent storage requirements.

## 1. Core Types

### 1.1 Preset Types

```typescript
// types.ts

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
```

### 1.2 Component Props

```typescript
// types.ts

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
```

### 1.3 Sub-Component Props

```typescript
// components/types.ts

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
```

## 2. Preset Definitions

```typescript
// presets.ts

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
```

## 3. Callout Visual Styles

```typescript
// components/Callout.styles.ts

import type { CalloutType } from './types';

/**
 * Visual configuration for each callout type
 */
export const calloutStyles: Record<CalloutType, {
  borderColor: string;
  bgLight: string;
  bgDark: string;
  icon: string;
  defaultTitle: string;
}> = {
  note: {
    borderColor: 'border-blue-400',
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-950',
    icon: 'info',      // Lucide icon name
    defaultTitle: 'Note',
  },
  tip: {
    borderColor: 'border-green-400',
    bgLight: 'bg-green-50',
    bgDark: 'dark:bg-green-950',
    icon: 'lightbulb',
    defaultTitle: 'Tip',
  },
  warning: {
    borderColor: 'border-amber-400',
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-950',
    icon: 'triangle-alert',
    defaultTitle: 'Warning',
  },
  danger: {
    borderColor: 'border-red-400',
    bgLight: 'bg-red-50',
    bgDark: 'dark:bg-red-950',
    icon: 'circle-x',
    defaultTitle: 'Danger',
  },
  info: {
    borderColor: 'border-purple-400',
    bgLight: 'bg-purple-50',
    bgDark: 'dark:bg-purple-950',
    icon: 'bookmark',
    defaultTitle: 'Info',
  },
};
```

## 4. Shiki Theme Configuration

```typescript
// config/shiki.ts

import type { BundledTheme } from 'shiki';

/**
 * Dual theme configuration for light/dark mode
 */
export const shikiThemes: { light: BundledTheme; dark: BundledTheme } = {
  light: 'github-light',
  dark: 'github-dark',
};

/**
 * rehype-pretty-code options
 */
export const rehypePrettyCodeOptions = {
  theme: shikiThemes,
  keepBackground: false, // Use CSS variables instead
  defaultLang: 'plaintext',
  // Transformers can be added here
  transformers: [],
};
```

## 5. Plugin Configuration

```typescript
// config/plugins.ts

import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import type { FeatureFlags } from './types';
import { rehypePrettyCodeOptions } from './shiki';

/**
 * Get remark plugins based on feature flags
 */
export function getRemarkPlugins(features: FeatureFlags) {
  const plugins: unknown[] = [remarkGfm];

  if (features.math) {
    plugins.push(remarkMath);
  }

  plugins.push(remarkEmoji);

  return plugins;
}

/**
 * Get rehype plugins for TRUSTED content
 */
export function getRehypePluginsTrusted(features: FeatureFlags) {
  const plugins: unknown[] = [];

  if (features.anchorLinks) {
    plugins.push(rehypeSlug);
    plugins.push([rehypeAutolinkHeadings, { behavior: 'wrap' }]);
  }

  if (features.math) {
    plugins.push([rehypeKatex, { output: 'htmlAndMathml' }]);
  }

  if (features.codeHighlight) {
    plugins.push([rehypePrettyCode, rehypePrettyCodeOptions]);
  }

  return plugins;
}

/**
 * Get rehype plugins for UNTRUSTED content (UGC)
 * IMPORTANT: rehype-sanitize MUST be FIRST
 */
export function getRehypePluginsUntrusted(features: FeatureFlags) {
  // Extended schema for KaTeX MathML elements
  const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac',
    ],
    attributes: {
      ...defaultSchema.attributes,
      code: ['className'],
      span: ['className', 'style'],
    },
  };

  const plugins: unknown[] = [
    [rehypeSanitize, sanitizeSchema], // MUST BE FIRST
  ];

  if (features.anchorLinks) {
    plugins.push(rehypeSlug);
  }

  if (features.math) {
    plugins.push([rehypeKatex, { output: 'htmlAndMathml' }]);
  }

  // NO rehype-pretty-code for UGC (performance + security)

  return plugins;
}
```

## 6. Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    MarkdownRenderer (RSC)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   content   │  │   preset    │  │   features (override)   │  │
│  │   string    │  │  PresetName │  │   Partial<FeatureFlags> │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│                  ┌───────────────┐                              │
│                  │ PresetConfig  │                              │
│                  │ (merged)      │                              │
│                  └───────┬───────┘                              │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Remark      │  │ Rehype      │  │ Custom      │             │
│  │ Plugins     │  │ Plugins     │  │ Components  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                          │                                       │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Sub-Components                            │  │
│  │  ┌──────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────┐  │  │
│  │  │CodeBlock │ │Callout │ │ Heading │ │ Table  │ │ Link │  │  │
│  │  └──────────┘ └────────┘ └─────────┘ └────────┘ └──────┘  │  │
│  │                      ┌─────────────────┐                   │  │
│  │                      │ MermaidDiagram  │                   │  │
│  │                      │ (lazy, iframe)  │                   │  │
│  │                      └─────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              MarkdownRendererClient (Client)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   content   │  │ isStreaming │  │      preset             │  │
│  │   string    │  │   boolean   │  │   'chat' | 'minimal'    │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│                  ┌───────────────┐                              │
│                  │  Streamdown   │                              │
│                  │  (memoized)   │                              │
│                  └───────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## 7. State Management

This system is **stateless** at the component level. No client-side state is required except:

| Component | State | Purpose |
|-----------|-------|---------|
| CodeBlock | `copied: boolean` | Copy button feedback (2s timeout) |
| MermaidDiagram | `loaded: boolean`, `error: string?` | Loading/error states |
| Heading | `showAnchor: boolean` | Hover state for anchor icon |

All state is local to individual components with no shared state store required.
