/**
 * Server-side markdown renderer using next-mdx-remote
 *
 * This is the main RSC (React Server Component) for rendering markdown/MDX content
 * on the server with full feature support including math, syntax highlighting, and more.
 *
 * @example
 * ```tsx
 * // Full-featured lesson rendering
 * <MarkdownRenderer content={lessonMarkdown} preset="lesson" />
 *
 * // Preview with custom features
 * <MarkdownRenderer
 *   content={previewMarkdown}
 *   preset="preview"
 *   features={{ math: false }}
 * />
 *
 * // Untrusted user-generated content
 * <MarkdownRenderer
 *   content={userMarkdown}
 *   preset="minimal"
 *   trusted={false}
 * />
 * ```
 */

import * as React from 'react';
import { compileMDX } from 'next-mdx-remote/rsc';
import { getPresetConfig } from './presets';
import {
  getRemarkPlugins,
  getRehypePluginsTrusted,
  getRehypePluginsUntrusted,
} from './plugins';
import { CodeBlock, MermaidDiagram, Callout, H1, H2, H3, H4, H5, H6, ResponsiveTable, Link } from './components';
import type { MarkdownRendererProps, CalloutType } from './types';

/**
 * Server-side markdown renderer component
 *
 * Compiles and renders markdown/MDX content on the server using next-mdx-remote.
 * Supports multiple presets, feature flags, and security modes.
 *
 * @param props - Component props
 * @param props.content - Markdown/MDX content string to render
 * @param props.preset - Preset configuration name (default: 'lesson')
 * @param props.components - Additional MDX components to merge with defaults
 * @param props.className - Custom className for wrapper element
 * @param props.features - Override specific features from preset
 * @param props.trusted - Trust level for content - affects sanitization (default: true)
 * @returns Rendered markdown content wrapped in article element, or null for empty content
 */
export async function MarkdownRenderer({
  content,
  preset = 'lesson',
  components = {},
  className,
  features,
  trusted = true,
}: MarkdownRendererProps): Promise<React.JSX.Element | null> {
  // Handle empty content - return null to avoid rendering empty elements
  if (!content || content.trim() === '') {
    return null;
  }

  // Get merged preset configuration with feature overrides
  const config = getPresetConfig(preset, features);

  // Select plugins based on trust level
  // Trusted: full feature set without sanitization
  // Untrusted: includes rehype-sanitize for XSS protection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remarkPlugins = getRemarkPlugins(config) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rehypePlugins = (trusted
    ? getRehypePluginsTrusted(config)
    : getRehypePluginsUntrusted(config)) as any[];

  // Build components map based on features
  const mdxComponents: Record<string, React.ComponentType<unknown>> = {};

  // Always use Link component for accessibility (external link indicators, focus styles)
  mdxComponents.a = ((props: unknown) => {
    const { href, children, title, ...rest } = props as {
      href?: string;
      children: React.ReactNode;
      title?: string;
    };
    return <Link href={href} title={title} {...rest}>{children}</Link>;
  }) as React.ComponentType<unknown>;

  // Add CodeBlock wrapper for pre elements when copyButton is enabled
  // AND handle Mermaid diagrams when mermaid feature is enabled
  // rehype-pretty-code outputs <figure><pre> or standalone <pre>
  // We intercept the pre element to either:
  // 1. Render as MermaidDiagram if language is 'mermaid'
  // 2. Wrap with CodeBlock for copy functionality
  if (config.copyButton && config.codeHighlight) {
    mdxComponents.pre = ((props: unknown) => {
      const { children, ...rest } = props as React.PropsWithChildren<
        Record<string, unknown>
      >;
      // Extract language from data attribute set by rehype-pretty-code
      const dataLanguage = (rest as Record<string, string>)['data-language'];

      // Handle Mermaid diagrams when feature is enabled
      if (config.mermaid && dataLanguage === 'mermaid') {
        // Extract code content from children structure: <code>text</code>
        const codeElement = React.isValidElement(children)
          ? (children as React.ReactElement<{ children: React.ReactNode }>)
          : null;
        const codeContent = codeElement?.props?.children;
        const chartText = typeof codeContent === 'string' ? codeContent : '';

        return <MermaidDiagram chart={chartText} />;
      }

      // Default: wrap with CodeBlock for copy functionality
      return (
        <CodeBlock language={dataLanguage}>
          <pre {...rest}>{children}</pre>
        </CodeBlock>
      );
    }) as React.ComponentType<unknown>;
  } else if (config.mermaid) {
    // When only mermaid is enabled (no copyButton or codeHighlight)
    // Still need to intercept pre elements for mermaid diagrams
    mdxComponents.pre = ((props: unknown) => {
      const { children, ...rest } = props as React.PropsWithChildren<
        Record<string, unknown>
      >;
      const dataLanguage = (rest as Record<string, string>)['data-language'];

      if (dataLanguage === 'mermaid') {
        const codeElement = React.isValidElement(children)
          ? (children as React.ReactElement<{ children: React.ReactNode }>)
          : null;
        const codeContent = codeElement?.props?.children;
        const chartText = typeof codeContent === 'string' ? codeContent : '';

        return <MermaidDiagram chart={chartText} />;
      }

      // Not mermaid - render as plain pre
      return <pre {...rest}>{children}</pre>;
    }) as React.ComponentType<unknown>;
  }

  // Add heading components with anchor links when feature is enabled
  if (config.anchorLinks) {
    // Map MDX heading elements to our Heading components
    // rehype-slug provides the id attribute automatically
    mdxComponents.h1 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H1 id={id} {...rest}>{children}</H1>;
    }) as React.ComponentType<unknown>;

    mdxComponents.h2 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H2 id={id} {...rest}>{children}</H2>;
    }) as React.ComponentType<unknown>;

    mdxComponents.h3 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H3 id={id} {...rest}>{children}</H3>;
    }) as React.ComponentType<unknown>;

    mdxComponents.h4 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H4 id={id} {...rest}>{children}</H4>;
    }) as React.ComponentType<unknown>;

    mdxComponents.h5 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H5 id={id} {...rest}>{children}</H5>;
    }) as React.ComponentType<unknown>;

    mdxComponents.h6 = ((props: unknown) => {
      const { id, children, ...rest } = props as { id?: string; children: React.ReactNode };
      return <H6 id={id} {...rest}>{children}</H6>;
    }) as React.ComponentType<unknown>;
  }

  // Handle GitHub-style callouts in blockquotes: > [!NOTE] content
  if (config.callouts) {
    mdxComponents.blockquote = ((props: unknown) => {
      const { children, ...rest } = props as React.PropsWithChildren<
        Record<string, unknown>
      >;

      // Try to detect GitHub-style callout syntax: [!TYPE]
      // The structure from MDX is usually: blockquote > p > text
      const firstChild = React.Children.toArray(children)[0];

      if (React.isValidElement(firstChild) && firstChild.type === 'p') {
        const pChildren = (firstChild as React.ReactElement<{ children: React.ReactNode }>).props
          .children;

        // Extract text from first paragraph child
        let textContent = '';
        if (typeof pChildren === 'string') {
          textContent = pChildren;
        } else if (Array.isArray(pChildren)) {
          const firstText = pChildren.find((c) => typeof c === 'string');
          if (firstText) {
            textContent = firstText as string;
          }
        }

        // Match pattern like [!NOTE], [!TIP], [!WARNING], [!DANGER], [!INFO]
        const match = textContent.match(/^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i);

        if (match) {
          const type = match[1].toLowerCase() as CalloutType;

          // Remove the [!TYPE] marker from the text
          const remainingText = textContent.replace(
            /^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]\s*/i,
            ''
          );

          // Reconstruct children without the marker
          const newFirstParagraph = remainingText ? <p>{remainingText}</p> : null;
          const restChildren = React.Children.toArray(children).slice(1);

          return (
            <Callout type={type}>
              {newFirstParagraph}
              {restChildren}
            </Callout>
          );
        }
      }

      // Default blockquote rendering (no callout pattern detected)
      return <blockquote {...rest}>{children}</blockquote>;
    }) as React.ComponentType<unknown>;
  }

  // Wrap tables in responsive scroll container
  if (config.responsiveTables) {
    mdxComponents.table = ((props: unknown) => {
      const { children, ...rest } = props as React.PropsWithChildren<
        Record<string, unknown>
      >;
      return (
        <ResponsiveTable>
          <table {...rest}>{children}</table>
        </ResponsiveTable>
      );
    }) as React.ComponentType<unknown>;
  }

  // Compile MDX content on the server
  const { content: compiledContent } = await compileMDX({
    source: content,
    options: {
      mdxOptions: {
        remarkPlugins,
        rehypePlugins,
      },
    },
    components: {
      ...mdxComponents,
      // User-provided components can override defaults
      ...components,
    },
  });

  // Merge preset className with custom className
  const wrapperClassName = className
    ? `${config.className} ${className}`
    : config.className;

  // Render compiled content in semantic article wrapper
  return <article className={wrapperClassName}>{compiledContent}</article>;
}
