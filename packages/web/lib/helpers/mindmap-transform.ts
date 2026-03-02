import type { IPureNode } from 'markmap-common'
import type { MindMapNode } from '@megacampus/shared-types'

/**
 * Nodes deeper than this level are pre-folded for a cleaner initial view.
 * Keep in sync with `initialExpandLevel` in MarkmapRenderer.
 */
export const AUTO_FOLD_DEPTH = 2

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch)
}

/**
 * Transforms our MindMapNode tree into markmap-compatible IPureNode tree.
 *
 * - HTML-escapes all text (LLM-generated content → XSS safety)
 * - Renders description as `<small>` under label
 * - Auto-folds nodes deeper than AUTO_FOLD_DEPTH for cleaner initial view
 *
 * SECURITY: `content` is rendered by markmap as innerHTML (by design — markmap
 * uses it to support rich node labels). All user/LLM-supplied text MUST be
 * HTML-escaped before inclusion. Only safe structural tags (`<br/>`, `<small>`)
 * may be added unescaped here.
 */
export function toMarkmapNode(node: MindMapNode, depth = 0): IPureNode {
  let content = escapeHtml(node.label)
  if (node.description) {
    content += `<br/><small style="opacity:0.7">${escapeHtml(node.description)}</small>`
  }
  return {
    content,
    children: node.children?.map((c) => toMarkmapNode(c, depth + 1)) ?? [],
    payload: depth > AUTO_FOLD_DEPTH ? { fold: 1 } : undefined,
  }
}
