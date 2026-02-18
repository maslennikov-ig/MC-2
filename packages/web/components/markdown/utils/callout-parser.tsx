import * as React from 'react'
import { Callout } from '../components/Callout'
import type { CalloutType } from '../types'

/**
 * Regex to detect GitHub-style callout markers at the start of text.
 * Tolerates leading whitespace and various quote characters (ASCII, Unicode, guillemets)
 * that LLMs sometimes add around callout markers.
 *
 * Matches: [!NOTE], [!TIP], [!WARNING], [!DANGER], [!INFO]
 * With optional leading: spaces, tabs, ", ', «, », \u201C, \u201D
 */
const CALLOUT_DETECT_RE = /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i

/**
 * Regex to strip the callout marker and surrounding quotes from text.
 * Used after detection to extract the remaining content.
 */
const CALLOUT_STRIP_RE =
  /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]["'«»\u201C\u201D]*\s*/i

/**
 * Parse callout syntax from blockquote children rendered by react-markdown or next-mdx-remote.
 *
 * Both renderers produce React element trees where blockquote children may include
 * whitespace text nodes ("\n") between block elements. This function correctly skips
 * those nodes to find the first <p> element and detect the [!TYPE] marker.
 *
 * @param children - React children from the blockquote component override
 * @param language - ISO 639-1 language code for localized callout titles
 * @returns A <Callout> element if a callout marker was found, null otherwise
 */
export function parseCalloutFromChildren(
  children: React.ReactNode,
  language?: string
): React.JSX.Element | null {
  const childArray = React.Children.toArray(children)

  // Find the first <p> element, skipping whitespace text nodes ("\n")
  // that react-markdown / rehype-react inserts between block elements
  const pIndex = childArray.findIndex((child) => React.isValidElement(child) && child.type === 'p')

  if (pIndex === -1) return null

  const pElement = childArray[pIndex] as React.ReactElement<{ children: React.ReactNode }>
  const pChildren = pElement.props.children

  // Extract the first meaningful text content from the paragraph
  let textContent = ''
  let textChildIndex = -1 // index within pChildren array (if array)

  if (typeof pChildren === 'string') {
    textContent = pChildren
    textChildIndex = 0
  } else if (Array.isArray(pChildren)) {
    for (let i = 0; i < pChildren.length; i++) {
      if (typeof pChildren[i] === 'string' && (pChildren[i] as string).trim()) {
        textContent = pChildren[i] as string
        textChildIndex = i
        break
      }
    }
  }

  // Try to match callout pattern
  const match = textContent.match(CALLOUT_DETECT_RE)
  if (!match) return null

  const type = match[1].toLowerCase() as CalloutType

  // Strip the [!TYPE] marker from the text
  const remainingText = textContent.replace(CALLOUT_STRIP_RE, '')

  // Reconstruct the first paragraph's children without the marker
  let newFirstParagraph: React.ReactNode = null

  if (typeof pChildren === 'string') {
    // Simple case: entire paragraph is one string
    if (remainingText) {
      newFirstParagraph = <p>{remainingText}</p>
    }
  } else if (Array.isArray(pChildren)) {
    // Complex case: paragraph has mixed text + elements (e.g. <strong>, <em>)
    const newPChildren = [...pChildren]
    if (textChildIndex >= 0) {
      if (remainingText) {
        newPChildren[textChildIndex] = remainingText
      } else {
        newPChildren.splice(textChildIndex, 1)
      }
    }
    // Filter leading whitespace-only strings after stripping the marker
    const filtered = newPChildren.filter(
      (child, i) => !(i === 0 && typeof child === 'string' && !child.trim())
    )
    if (filtered.length > 0) {
      newFirstParagraph = <p>{filtered}</p>
    }
  }

  // Collect remaining blockquote children (additional paragraphs, etc.)
  // Filter out whitespace-only text nodes between block elements
  const restChildren = childArray
    .slice(pIndex + 1)
    .filter((child) => !(typeof child === 'string' && !child.trim()))

  return (
    <Callout type={type} language={language}>
      {newFirstParagraph}
      {restChildren}
    </Callout>
  )
}
