/**
 * Client-side streaming markdown renderer using Streamdown
 *
 * This component is optimized for AI chat streaming with incremental parsing
 * and block-level memoization. It handles incomplete markdown gracefully during
 * streaming (unclosed code blocks, partial lists, incomplete formatting).
 *
 * @example
 * ```tsx
 * // AI chat with streaming indicator
 * <MarkdownRendererClient
 *   content={streamingMessage}
 *   isStreaming={isLoading}
 * />
 *
 * // Minimal preset for simple text
 * <MarkdownRendererClient
 *   content={simpleText}
 *   preset="minimal"
 * />
 *
 * // Custom styling
 * <MarkdownRendererClient
 *   content={chatMessage}
 *   className="my-custom-class"
 * />
 * ```
 */

'use client';

import * as React from 'react';
import { Streamdown } from 'streamdown';
import { getPresetConfig } from './presets';
import type { MarkdownRendererClientProps } from './types';

/**
 * Client-side streaming markdown renderer
 *
 * Uses Streamdown for optimized incremental parsing during AI streaming.
 * Automatically handles incomplete markdown syntax (unclosed tags, partial blocks).
 * Limited to 'chat' and 'minimal' presets for optimal performance.
 *
 * @param props - Component props
 * @param props.content - Streaming markdown content string
 * @param props.preset - Preset configuration (default: 'chat', limited to 'chat'|'minimal')
 * @param props.className - Custom className for wrapper element
 * @param props.isStreaming - Whether content is currently streaming (default: false)
 * @param props.features - Override specific features (limited to codeHighlight, responsiveTables)
 * @returns Rendered streaming markdown content wrapped in div element
 */
export function MarkdownRendererClient({
  content,
  preset = 'chat',
  className,
  isStreaming = false,
  features,
}: MarkdownRendererClientProps): React.JSX.Element {
  // Validate preset - only chat/minimal allowed for streaming
  // This ensures optimal performance by limiting features
  const validPreset = preset === 'minimal' ? 'minimal' : 'chat';

  // Get merged preset configuration with feature overrides
  const config = getPresetConfig(validPreset, features);

  // Merge preset className with custom className
  const wrapperClassName = className
    ? `${config.className} ${className}`
    : config.className;

  // Handle empty content - return empty div to maintain layout
  if (!content) {
    return <div className={wrapperClassName} />;
  }

  return (
    <div className={wrapperClassName}>
      <Streamdown parseIncompleteMarkdown={isStreaming}>
        {content}
      </Streamdown>
    </div>
  );
}
