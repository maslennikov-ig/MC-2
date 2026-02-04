/**
 * Escapes dollar signs that represent currency amounts to prevent
 * remark-math from interpreting them as LaTeX inline math delimiters.
 *
 * Targets: $100, $1000, $50,000, $99.99
 * Preserves: $$block math$$, $x^2$, $\alpha$, $2x + 3$
 *
 * @param content - Markdown content string
 * @returns Content with currency dollar signs escaped
 */
export function escapeCurrencyDollarSigns(content: string): string {
  return content.replace(/(?<!\$)\$(\d+(?:[,.]\d+)*)(?=[^\d\w]|$)/g, '\\$$$1')
}
