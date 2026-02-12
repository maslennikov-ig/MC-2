/**
 * Copy text to clipboard with fallback for non-secure contexts (HTTP).
 * navigator.clipboard requires a secure context (HTTPS or localhost).
 * Falls back to execCommand('copy') for HTTP environments.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // clipboard.writeText can throw even when available (e.g. permissions)
    }
  }

  // Fallback: textarea + execCommand
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
