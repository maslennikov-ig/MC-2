/**
 * Full-featured client-side Markdown renderer using react-markdown
 *
 * This component provides comprehensive markdown rendering with support for:
 * - GFM (GitHub Flavored Markdown): tables, strikethrough, autolinks, task lists
 * - LaTeX/KaTeX math formulas (inline and block)
 * - Syntax highlighting for code blocks
 * - Copy button for code blocks
 * - Responsive tables
 *
 * Unlike MarkdownRendererClient (optimized for streaming), this renderer
 * supports ALL presets and features for rich content rendering.
 *
 * @example
 * ```tsx
 * // Lesson content with all features
 * <MarkdownRendererFull
 *   content={lessonMarkdown}
 *   preset="lesson"
 * />
 *
 * // Preview mode without heavy features
 * <MarkdownRendererFull
 *   content={previewContent}
 *   preset="preview"
 * />
 *
 * // Custom feature override
 * <MarkdownRendererFull
 *   content={content}
 *   features={{ math: false, copyButton: true }}
 * />
 * ```
 */

'use client';

import * as React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { getPresetConfig } from './presets';
import { ResponsiveTable } from './components/ResponsiveTable';
import { Link } from './components/Link';
import { MermaidDiagram } from './components/MermaidDiagram';
import type { PresetName, FeatureFlags } from './types';
import type { Components } from 'react-markdown';

// KaTeX CSS for math rendering
import 'katex/dist/katex.min.css';

/**
 * Props for the MarkdownRendererFull component
 */
export interface MarkdownRendererFullProps {
  /** Markdown content string */
  content: string;
  /** Preset configuration name */
  preset?: PresetName;
  /** Custom className for wrapper */
  className?: string;
  /** Override specific features from preset */
  features?: Partial<FeatureFlags>;
}

/**
 * Simple copy button component for code blocks
 */
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (!code.trim()) return;

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'absolute right-2 top-2 z-10',
        'rounded-md px-2 py-1 text-xs font-medium',
        'bg-muted/80 text-muted-foreground',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'transition-colors'
      )}
      aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/**
 * Extract language from className (e.g., "language-typescript" -> "typescript")
 */
function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Mermaid diagram type keywords that appear at the start of diagrams
 */
const MERMAID_KEYWORDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'mindmap',
  'timeline',
  'sankey',
  'xychart',
  'block-beta',
];

/**
 * Detects if content is likely a Mermaid diagram by checking for diagram type keywords
 * Used as fallback when code block doesn't have explicit ```mermaid language tag
 */
function isMermaidContent(content: string): boolean {
  const trimmed = content.trim();
  return MERMAID_KEYWORDS.some((keyword) =>
    trimmed.startsWith(keyword) || trimmed.startsWith(`${keyword} `) || trimmed.startsWith(`${keyword}\n`)
  );
}

/**
 * Extract text content from React children (handles strings, arrays, and nested elements)
 * Used to get code block content regardless of how react-markdown structures the children
 */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('');
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    if (props.children) {
      return extractTextFromChildren(props.children);
    }
  }
  return '';
}

/**
 * Maps common language identifiers to display names
 */
function formatLanguage(lang: string): string {
  const displayNames: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    bash: 'Bash',
    shell: 'Shell',
    tsx: 'TSX',
    jsx: 'JSX',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    sql: 'SQL',
    yaml: 'YAML',
    yml: 'YAML',
    markdown: 'Markdown',
    md: 'Markdown',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    php: 'PHP',
    ruby: 'Ruby',
    swift: 'Swift',
    kotlin: 'Kotlin',
    dart: 'Dart',
    graphql: 'GraphQL',
    xml: 'XML',
  };
  return displayNames[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Full-featured client-side Markdown renderer
 *
 * Uses react-markdown with remark/rehype plugins for comprehensive markdown support.
 * Supports all presets (lesson, chat, preview, minimal) with configurable features.
 *
 * @param props - Component props
 * @param props.content - Markdown content string
 * @param props.preset - Preset configuration (default: 'lesson')
 * @param props.className - Custom className for wrapper element
 * @param props.features - Override specific features from preset
 * @returns Rendered markdown content wrapped in article element
 */
export function MarkdownRendererFull({
  content,
  preset = 'lesson',
  className,
  features,
}: MarkdownRendererFullProps): React.JSX.Element {
  // Get merged preset configuration with feature overrides
  const config = getPresetConfig(preset, features);

  // Merge preset className with custom className
  const wrapperClassName = cn(config.className, className);

  // Handle empty content - return empty article to maintain layout
  if (!content) {
    return <article className={wrapperClassName} />;
  }

  // Build remark plugins array based on config
  const remarkPlugins: React.ComponentProps<typeof Markdown>['remarkPlugins'] = [remarkGfm];
  if (config.math) {
    remarkPlugins.push(remarkMath);
  }

  // Build rehype plugins array based on config
  const rehypePlugins: React.ComponentProps<typeof Markdown>['rehypePlugins'] = [];
  if (config.math) {
    // Configure KaTeX to ignore Unicode text warnings (e.g., Cyrillic characters in math mode)
    rehypePlugins.push([rehypeKatex, { strict: 'ignore' }]);
  }

  // Build custom components based on config
  const components: Components = {
    // Custom link component with external link handling
    a: ({ href, children, title }) => (
      <Link href={href} title={title}>
        {children}
      </Link>
    ),

    // Custom table wrapper for responsive scrolling
    table: ({ children }) => {
      if (config.responsiveTables) {
        return (
          <ResponsiveTable>
            <table className="w-full">{children}</table>
          </ResponsiveTable>
        );
      }
      return <table className="w-full">{children}</table>;
    },

    // Custom code block with syntax highlighting classes and copy button
    pre: ({ children }) => {
      // Extract code element from children (try multiple detection methods)
      const childArray = React.Children.toArray(children);
      const codeElement = childArray.find(
        (child): child is React.ReactElement<{ children?: React.ReactNode; className?: string }> => {
          if (!React.isValidElement(child)) return false;
          // Check for 'code' element type (string or symbol)
          const type = child.type;
          if (type === 'code') return true;
          if (typeof type === 'string' && type.toLowerCase() === 'code') return true;
          // Check displayName for component functions
          if (typeof type === 'function' && (type as { displayName?: string }).displayName === 'code') return true;
          return false;
        }
      );

      const codeProps = codeElement?.props;
      // Use robust text extraction that handles strings, arrays, and nested elements
      // Fallback to extracting from all children if no code element found
      const codeString = codeProps?.children
        ? extractTextFromChildren(codeProps.children)
        : extractTextFromChildren(children);

      const codeClassName = codeProps?.className;
      const language = extractLanguage(codeClassName);

      // Handle Mermaid diagrams when feature is enabled
      // Check explicit language tag OR detect by content pattern (fallback for LLM-generated content)
      if (config.mermaid && (language === 'mermaid' || (!language && isMermaidContent(codeString)))) {
        return <MermaidDiagram chart={codeString.trim()} />;
      }

      return (
        <figure className="code-block group not-prose my-6" data-language={language}>
          {/* Header with language badge */}
          {language && language !== 'plaintext' && (
            <figcaption className="code-header flex items-center justify-between gap-2 rounded-t-lg border border-b-0 border-border bg-muted/50 px-4 py-2">
              <span className="language-badge inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {formatLanguage(language)}
              </span>
              {config.copyButton && <CopyButton code={codeString} />}
            </figcaption>
          )}
          {/* Code content */}
          <div
            className={cn(
              'code-content relative overflow-x-auto rounded-lg border border-border bg-muted/30',
              language && language !== 'plaintext' && 'rounded-t-none border-t-0'
            )}
          >
            {/* Copy button for blocks without header */}
            {config.copyButton && (!language || language === 'plaintext') && (
              <CopyButton code={codeString} />
            )}
            <pre className="p-4 overflow-x-auto">{children}</pre>
          </div>
        </figure>
      );
    },

    // Inline code styling
    code: ({ className: codeClassName, children, ...props }) => {
      // Check if this is inline code (not inside pre)
      const isInline = !codeClassName?.includes('language-');

      if (isInline) {
        return (
          <code
            className={cn(
              'rounded-md bg-muted px-1.5 py-0.5 text-sm font-mono',
              codeClassName
            )}
            {...props}
          >
            {children}
          </code>
        );
      }

      // Block code - apply syntax highlighting class
      return (
        <code
          className={cn(
            'block text-sm font-mono',
            config.codeHighlight && codeClassName,
            codeClassName
          )}
          {...props}
        >
          {children}
        </code>
      );
    },

    // Blockquote styling
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),

    // Image with lazy loading
    img: ({ src, alt, title }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt || ''}
        title={title}
        loading="lazy"
        className="rounded-lg max-w-full h-auto"
      />
    ),

    // Horizontal rule
    hr: () => <hr className="my-8 border-border" />,
  };

  return (
    <article className={wrapperClassName}>
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </Markdown>
    </article>
  );
}
