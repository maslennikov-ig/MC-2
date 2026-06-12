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

'use client'

import * as React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cn } from '@/lib/utils'
import { getPresetConfig } from './presets'
import { ResponsiveTable } from './components/ResponsiveTable'
import { Link } from './components/Link'
import { MermaidDiagram } from './components/MermaidDiagram'
import { escapeCurrencyDollarSigns } from './utils/escape-currency'
import { parseCalloutFromChildren } from './utils/callout-parser'
import { normalizeMalformedMarkdownTables } from './utils/normalize-markdown-tables'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PresetName, FeatureFlags } from './types'
import type { CareerPlaybookNumericFact } from '@megacampus/shared-types'
import type { Components } from 'react-markdown'

// KaTeX CSS for math rendering
import 'katex/dist/katex.min.css'
import { copyToClipboard } from '@/lib/utils/clipboard'

/**
 * Props for the MarkdownRendererFull component
 */
export interface MarkdownRendererFullProps {
  /** Markdown content string */
  content: string
  /** Preset configuration name */
  preset?: PresetName
  /** Custom className for wrapper */
  className?: string
  /** Override specific features from preset */
  features?: Partial<FeatureFlags>
  /** Content language for localized callout titles (ISO 639-1) */
  language?: string
  /** Optional Career Playbook numeric annotations rendered over plain markdown text. */
  numericFacts?: CareerPlaybookNumericFact[]
  /** Called when an annotated numeric fact is clicked. */
  onNumericFactClick?: (fact: CareerPlaybookNumericFact) => void
}

/**
 * Simple copy button component for code blocks
 */
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async () => {
    if (!code.trim()) return

    try {
      await copyToClipboard(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }, [code])

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy()
      }}
      className={cn(
        'absolute top-2 right-2 z-10',
        'rounded-md px-2 py-1 text-xs font-medium',
        'bg-muted/80 text-muted-foreground',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        'transition-colors'
      )}
      aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

/**
 * Extract language from className (e.g., "language-typescript" -> "typescript")
 */
function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : undefined
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
]

/**
 * Detects if content is likely a Mermaid diagram by checking for diagram type keywords
 * Used as fallback when code block doesn't have explicit ```mermaid language tag
 */
function isMermaidContent(content: string): boolean {
  const trimmed = content.trim()
  return MERMAID_KEYWORDS.some(
    (keyword) =>
      trimmed.startsWith(keyword) ||
      trimmed.startsWith(`${keyword} `) ||
      trimmed.startsWith(`${keyword}\n`)
  )
}

/**
 * Extract text content from React children (handles strings, arrays, and nested elements)
 * Used to get code block content regardless of how react-markdown structures the children
 */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children
  }
  if (typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('')
  }
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode }
    if (props.children) {
      return extractTextFromChildren(props.children)
    }
  }
  return ''
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
  }
  return displayNames[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1)
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
  language,
  numericFacts,
  onNumericFactClick,
}: MarkdownRendererFullProps): React.JSX.Element {
  // Get merged preset configuration with feature overrides
  const config = getPresetConfig(preset, features)

  // Merge preset className with custom className
  const wrapperClassName = cn(config.className, className)

  // Handle empty content - return empty article to maintain layout
  if (!content?.trim()) {
    return <article className={wrapperClassName} />
  }

  const normalizedContent = normalizeMalformedMarkdownTables(content)
  const annotatableNumericFacts = getAnnotatableNumericFacts(numericFacts)
  const numericAnnotationState = createNumericAnnotationState(annotatableNumericFacts)

  // Build remark plugins array based on config
  const remarkPlugins: React.ComponentProps<typeof Markdown>['remarkPlugins'] = [remarkGfm]
  if (config.math) {
    remarkPlugins.push(remarkMath)
  }

  // Build rehype plugins array based on config
  const rehypePlugins: React.ComponentProps<typeof Markdown>['rehypePlugins'] = []
  if (config.math) {
    // Configure KaTeX to ignore Unicode text warnings (e.g., Cyrillic characters in math mode)
    rehypePlugins.push([rehypeKatex, { strict: 'ignore' }])
  }

  // Build custom components based on config
  const components: Components = {
    p: ({ children }) => (
      <p>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </p>
    ),

    li: ({ children }) => (
      <li>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </li>
    ),

    td: ({ children }) => (
      <td>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </td>
    ),

    th: ({ children }) => (
      <th>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </th>
    ),

    strong: ({ children }) => (
      <strong>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </strong>
    ),

    em: ({ children }) => (
      <em>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </em>
    ),

    h1: ({ children }) => (
      <h1>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h1>
    ),

    h2: ({ children }) => (
      <h2>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h2>
    ),

    h3: ({ children }) => (
      <h3>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h3>
    ),

    h4: ({ children }) => (
      <h4>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h4>
    ),

    h5: ({ children }) => (
      <h5>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h5>
    ),

    h6: ({ children }) => (
      <h6>
        {annotateMarkdownChildren(children, numericAnnotationState, onNumericFactClick, language)}
      </h6>
    ),

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
        )
      }
      return <table className="w-full">{children}</table>
    },

    // Custom code block with syntax highlighting classes and copy button
    pre: ({ children }) => {
      // Extract code element from children (try multiple detection methods)
      const childArray = React.Children.toArray(children)
      const codeElement = childArray.find(
        (
          child
        ): child is React.ReactElement<{ children?: React.ReactNode; className?: string }> => {
          if (!React.isValidElement(child)) return false
          // Check for 'code' element type (string or symbol)
          const type = child.type
          if (type === 'code') return true
          if (typeof type === 'string' && type.toLowerCase() === 'code') return true
          // Check displayName for component functions
          if (
            typeof type === 'function' &&
            (type as { displayName?: string }).displayName === 'code'
          )
            return true
          return false
        }
      )

      const codeProps = codeElement?.props
      // Use robust text extraction that handles strings, arrays, and nested elements
      // Fallback to extracting from all children if no code element found
      const codeString = codeProps?.children
        ? extractTextFromChildren(codeProps.children)
        : extractTextFromChildren(children)

      const codeClassName = codeProps?.className
      const language = extractLanguage(codeClassName)

      // Handle Mermaid diagrams when feature is enabled
      // Check explicit language tag OR detect by content pattern (fallback for LLM-generated content)
      if (
        config.mermaid &&
        (language === 'mermaid' || (!language && isMermaidContent(codeString)))
      ) {
        return <MermaidDiagram chart={codeString.trim()} />
      }

      return (
        <figure className="code-block group not-prose my-6" data-language={language}>
          {/* Header with language badge */}
          {language && language !== 'plaintext' && (
            <figcaption className="code-header border-border bg-muted/50 flex items-center justify-between gap-2 rounded-t-lg border border-b-0 px-4 py-2">
              <span className="language-badge bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-1 text-xs font-medium">
                {formatLanguage(language)}
              </span>
              {config.copyButton && <CopyButton code={codeString} />}
            </figcaption>
          )}
          {/* Code content */}
          <div
            className={cn(
              'code-content border-border bg-muted/30 relative overflow-x-auto rounded-lg border',
              language && language !== 'plaintext' && 'rounded-t-none border-t-0'
            )}
          >
            {/* Copy button for blocks without header */}
            {config.copyButton && (!language || language === 'plaintext') && (
              <CopyButton code={codeString} />
            )}
            <pre className="overflow-x-auto p-4">{children}</pre>
          </div>
        </figure>
      )
    },

    // Inline code styling
    code: ({ className: codeClassName, children, ...props }) => {
      // Check if this is inline code (not inside pre)
      const isInline = !codeClassName?.includes('language-')

      if (isInline) {
        return (
          <code
            className={cn('bg-muted rounded-md px-1.5 py-0.5 font-mono text-sm', codeClassName)}
            {...props}
          >
            {children}
          </code>
        )
      }

      // Block code - apply syntax highlighting class
      return (
        <code
          className={cn(
            'block font-mono text-sm',
            config.codeHighlight && codeClassName,
            codeClassName
          )}
          {...props}
        >
          {children}
        </code>
      )
    },

    // Blockquote styling with optional callout/admonition support
    blockquote: ({ children }) => {
      if (config.callouts) {
        const callout = parseCalloutFromChildren(children, language)
        if (callout) return callout
      }
      return (
        <blockquote className="border-primary/30 text-muted-foreground border-l-4 pl-4 italic">
          {children}
        </blockquote>
      )
    },

    // Image with lazy loading (next/image not usable in react-markdown custom components)
    img: ({ src, alt, title }) => {
      return (
        <img
          src={src}
          alt={alt || ''}
          title={title}
          loading="lazy"
          className="h-auto max-w-full rounded-lg"
        />
      )
    },

    // Horizontal rule
    hr: () => <hr className="border-border my-8" />,
  }

  const markdown = (
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {config.math ? escapeCurrencyDollarSigns(normalizedContent) : normalizedContent}
    </Markdown>
  )

  return (
    <article className={wrapperClassName}>
      {annotatableNumericFacts.length > 0 ? (
        <TooltipProvider delayDuration={150}>{markdown}</TooltipProvider>
      ) : (
        markdown
      )}
    </article>
  )
}

type NumericFactClickHandler = (fact: CareerPlaybookNumericFact) => void

interface NumericAnnotationState {
  factsByRawText: Map<string, CareerPlaybookNumericFact[]>
  seenByRawText: Map<string, number>
}

function getAnnotatableNumericFacts(
  numericFacts?: CareerPlaybookNumericFact[]
): CareerPlaybookNumericFact[] {
  if (!numericFacts?.length) return []

  const unique = new Map<string, CareerPlaybookNumericFact>()
  for (const fact of numericFacts) {
    const rawText = fact.raw_text.trim()
    if (!rawText) continue
    unique.set(`${fact.id}:${rawText}`, fact)
  }

  return Array.from(unique.values()).sort((left, right) => {
    const lengthDelta = right.raw_text.length - left.raw_text.length
    return lengthDelta === 0 ? left.id.localeCompare(right.id) : lengthDelta
  })
}

function createNumericAnnotationState(
  numericFacts: CareerPlaybookNumericFact[]
): NumericAnnotationState {
  const factsByRawText = new Map<string, CareerPlaybookNumericFact[]>()
  for (const fact of numericFacts) {
    const existing = factsByRawText.get(fact.raw_text) ?? []
    existing.push(fact)
    factsByRawText.set(fact.raw_text, existing)
  }

  for (const facts of factsByRawText.values()) {
    facts.sort((left, right) => {
      const occurrenceDelta = left.occurrence_index - right.occurrence_index
      return occurrenceDelta === 0 ? left.id.localeCompare(right.id) : occurrenceDelta
    })
  }

  return {
    factsByRawText,
    seenByRawText: new Map(),
  }
}

function annotateMarkdownChildren(
  children: React.ReactNode,
  numericState: NumericAnnotationState,
  onNumericFactClick?: NumericFactClickHandler,
  language?: string
): React.ReactNode {
  if (numericState.factsByRawText.size === 0) return children

  return React.Children.map(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return annotateTextNode(String(child), numericState, onNumericFactClick, language)
    }

    if (React.isValidElement(child)) {
      if (shouldSkipNumericAnnotation(child)) return child

      const elementProps = child.props as { children?: React.ReactNode }
      if (!elementProps.children) return child

      return React.cloneElement(
        child as React.ReactElement<{ children?: React.ReactNode }>,
        undefined,
        annotateMarkdownChildren(elementProps.children, numericState, onNumericFactClick, language)
      )
    }

    return child
  })
}

function shouldSkipNumericAnnotation(child: React.ReactElement) {
  const props = child.props as { node?: { tagName?: string } }
  const tagName = typeof child.type === 'string' ? child.type : props.node?.tagName
  return tagName === 'code' || tagName === 'pre' || tagName === 'a'
}

function annotateTextNode(
  text: string,
  numericState: NumericAnnotationState,
  onNumericFactClick?: NumericFactClickHandler,
  language?: string
): React.ReactNode {
  const parts: React.ReactNode[] = []
  let cursor = 0

  while (cursor < text.length) {
    const next = findNextNumericFact(text, cursor, numericState)
    if (!next) break

    if (next.index > cursor) {
      parts.push(text.slice(cursor, next.index))
    }

    parts.push(
      <NumericFactInlineTrigger
        key={`${next.fact.id}-${next.index}`}
        fact={next.fact}
        language={language}
        onClick={onNumericFactClick}
      />
    )
    incrementSeenNumericFact(next.fact.raw_text, numericState)
    cursor = next.index + next.fact.raw_text.length
  }

  if (cursor === 0) return text
  if (cursor < text.length) parts.push(text.slice(cursor))

  return parts
}

function findNextNumericFact(
  text: string,
  startIndex: number,
  numericState: NumericAnnotationState
): { fact: CareerPlaybookNumericFact; index: number } | null {
  let selected: { fact: CareerPlaybookNumericFact; index: number } | null = null

  for (const [rawText, facts] of numericState.factsByRawText.entries()) {
    const seen = numericState.seenByRawText.get(rawText) ?? 0
    const fact = facts[seen]
    if (!fact) continue

    const index = text.indexOf(rawText, startIndex)
    if (index === -1) continue
    if (
      !selected ||
      index < selected.index ||
      (index === selected.index && fact.raw_text.length > selected.fact.raw_text.length)
    ) {
      selected = { fact, index }
    }
  }

  return selected
}

function incrementSeenNumericFact(rawText: string, numericState: NumericAnnotationState) {
  const current = numericState.seenByRawText.get(rawText) ?? 0
  numericState.seenByRawText.set(rawText, current + 1)
}

function NumericFactInlineTrigger({
  fact,
  language,
  onClick,
}: {
  fact: CareerPlaybookNumericFact
  language?: string
  onClick?: NumericFactClickHandler
}) {
  const className = cn(
    'mx-0.5 inline-flex rounded px-1 py-0.5 align-baseline text-[0.94em] font-medium ring-1 transition-colors ring-inset',
    'focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none',
    getNumericFactStatusClassName(fact.status)
  )
  const trigger = onClick ? (
    <button
      type="button"
      className={className}
      data-numeric-fact-status={fact.status}
      data-testid="career-playbook-numeric-fact"
      onClick={() => onClick(fact)}
    >
      {fact.raw_text}
    </button>
  ) : (
    <span
      className={className}
      data-numeric-fact-status={fact.status}
      data-testid="career-playbook-numeric-fact"
      tabIndex={0}
    >
      {fact.raw_text}
    </span>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs border border-slate-200 bg-white text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="grid gap-1">
          <p className="font-medium">{getNumericFactStatusLabel(fact.status, language)}</p>
          <p className="text-slate-500 dark:text-slate-300">
            {getNumericFactSourceLabel(fact.source, language)}
            {fact.source_label ? `: ${fact.source_label}` : ''}
          </p>
          {typeof fact.confidence === 'number' ? (
            <p className="text-slate-500 dark:text-slate-300">
              {getConfidenceLabel(fact.confidence, language)}
            </p>
          ) : null}
          <p>{fact.explanation}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function getNumericFactStatusClassName(status: CareerPlaybookNumericFact['status']) {
  switch (status) {
    case 'verified':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-300/10 dark:text-emerald-100 dark:ring-emerald-300/30'
    case 'benchmark':
      return 'bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100 dark:bg-sky-300/10 dark:text-sky-100 dark:ring-sky-300/30'
    case 'suggested':
      return 'bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100 dark:bg-violet-300/10 dark:text-violet-100 dark:ring-violet-300/30'
    case 'structural':
      return 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-100 dark:ring-slate-500/50'
    case 'conflict':
      return 'bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100 dark:bg-rose-300/10 dark:text-rose-100 dark:ring-rose-300/30'
    case 'needs_review':
    default:
      return 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-300/10 dark:text-amber-100 dark:ring-amber-300/30'
  }
}

function getNumericFactStatusLabel(status: CareerPlaybookNumericFact['status'], language?: string) {
  const ru = language?.toLowerCase().startsWith('ru')
  const labels: Record<CareerPlaybookNumericFact['status'], { ru: string; en: string }> = {
    verified: { ru: 'Подтверждено', en: 'Verified' },
    benchmark: { ru: 'Бенчмарк', en: 'Benchmark' },
    suggested: { ru: 'Рекомендация', en: 'Suggested' },
    structural: { ru: 'Структурная цифра', en: 'Structural number' },
    needs_review: { ru: 'Требует согласования', en: 'Needs review' },
    conflict: { ru: 'Есть конфликт источников', en: 'Source conflict' },
  }
  return ru ? labels[status].ru : labels[status].en
}

function getNumericFactSourceLabel(source: CareerPlaybookNumericFact['source'], language?: string) {
  const ru = language?.toLowerCase().startsWith('ru')
  const labels: Record<CareerPlaybookNumericFact['source'], { ru: string; en: string }> = {
    user_input: { ru: 'Источник: ввод пользователя', en: 'Source: user input' },
    business_context: { ru: 'Источник: контекст бизнеса', en: 'Source: business context' },
    source_document: { ru: 'Источник: документ', en: 'Source: source document' },
    web_benchmark: { ru: 'Источник: рыночный бенчмарк', en: 'Source: web benchmark' },
    methodology: { ru: 'Источник: методология', en: 'Source: methodology' },
    model_suggestion: { ru: 'Источник: рекомендация модели', en: 'Source: model suggestion' },
    unknown: { ru: 'Источник: не определён', en: 'Source: unknown' },
  }
  return ru ? labels[source].ru : labels[source].en
}

function getConfidenceLabel(confidence: number, language?: string) {
  const value = Math.round(confidence * 100)
  return language?.toLowerCase().startsWith('ru')
    ? `Уверенность: ${value}%`
    : `Confidence: ${value}%`
}
