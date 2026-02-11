'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CodeBlockProps } from '../types'
import { copyToClipboard } from '@/lib/utils/clipboard'

/**
 * Maps common language identifiers to properly formatted display names
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
  }
  return displayNames[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1)
}

/**
 * CodeBlock component for displaying syntax-highlighted code
 *
 * This component wraps pre-rendered code from rehype-pretty-code/Shiki
 * and adds interactive features like copy button, language badge, and line numbers.
 *
 * @example
 * ```tsx
 * <CodeBlock language="typescript" filename="example.ts" showLineNumbers>
 *   <pre><code>const hello = "world";</code></pre>
 * </CodeBlock>
 * ```
 */
export function CodeBlock({
  children,
  language,
  filename,
  showLineNumbers = false,
  highlightLines,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)
  const codeRef = React.useRef<HTMLDivElement>(null)

  const handleCopy = React.useCallback(async () => {
    if (!codeRef.current) return

    try {
      // Extract text content from the pre-rendered HTML
      const codeText = codeRef.current.textContent || ''

      // Defensive check: don't copy empty text
      if (!codeText.trim()) {
        console.warn('Attempted to copy empty code block')
        return
      }

      await copyToClipboard(codeText)
      setCopied(true)

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
      // Could add user-visible error feedback here (e.g., toast notification)
    }
  }, [])

  const showHeader = Boolean(filename || language)
  const showLanguageBadge = language && language !== 'plaintext'

  return (
    <figure
      className="code-block group not-prose my-6"
      data-language={language}
      data-highlight-lines={highlightLines?.join(',')}
    >
      {showHeader && (
        <figcaption className="code-header border-border bg-muted/50 flex items-center justify-between gap-2 rounded-t-lg border border-b-0 px-4 py-2">
          <div className="flex items-center gap-3">
            {showLanguageBadge && (
              <span className="language-badge bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-1 text-xs font-medium">
                {formatLanguage(language)}
              </span>
            )}
            {filename && (
              <span className="filename text-muted-foreground font-mono text-sm">{filename}</span>
            )}
          </div>
          <button
            type="button"
            className="copy-button text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => {
              void handleCopy()
            }}
            aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
            aria-live="polite"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </figcaption>
      )}
      <div
        ref={codeRef}
        className={cn(
          'code-content border-border bg-muted/30 relative overflow-x-auto rounded-lg border',
          showHeader && 'rounded-t-none border-t-0',
          showLineNumbers && 'line-numbers',
          className
        )}
        data-line-numbers={showLineNumbers ? 'true' : undefined}
      >
        {children}
      </div>
    </figure>
  )
}
