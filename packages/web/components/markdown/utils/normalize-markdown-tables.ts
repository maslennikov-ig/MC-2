const FENCE_DELIMITER = /^ {0,3}(```|~~~)/
const SEPARATOR_CHARSET = /^[\t :|\-]+$/

function hasPipeCharacter(line: string): boolean {
  return line.includes('|')
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim()
  const withoutLeadingPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const withoutEdgePipes = withoutLeadingPipe.endsWith('|')
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe

  return withoutEdgePipes.split('|').map((cell) => cell.trim())
}

function looksLikeSeparator(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.includes('-') && hasPipeCharacter(trimmed) && SEPARATOR_CHARSET.test(trimmed)
}

function isValidSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim())
}

function isValidSeparatorLine(line: string, columnCount: number): boolean {
  const cells = splitTableCells(line)
  return cells.length === columnCount && cells.every(isValidSeparatorCell)
}

function normalizeSeparatorCell(cell?: string): string {
  if (!cell) return '---'

  const trimmed = cell.trim()
  const startsWithColon = trimmed.startsWith(':')
  const endsWithColon = trimmed.endsWith(':')

  if (startsWithColon && endsWithColon) return ':---:'
  if (startsWithColon) return ':---'
  if (endsWithColon) return '---:'
  return '---'
}

function hasUnmatchedQuotes(text: string): boolean {
  const count = (text.match(/"/g) || []).length
  return count % 2 !== 0
}

/**
 * Detects whether a parsed row looks broken — either it has fewer cells than
 * the header, or it has the right cell count but contains an unmatched quote
 * with the remaining cells all empty (a sign the generator split a quoted
 * value across lines).
 */
function looksLikeBrokenRow(cells: string[], expectedColumns: number): boolean {
  if (cells.length < expectedColumns) return true

  if (cells.length === expectedColumns) {
    const hasUnmatched = cells.some((cell) => hasUnmatchedQuotes(cell))
    const emptyCount = cells.filter((cell) => cell.trim() === '').length
    if (hasUnmatched && emptyCount >= expectedColumns - 1) return true
  }

  return false
}

/**
 * Pre-processes body rows to merge lines that were accidentally split by the
 * generator.  Two patterns are handled:
 *
 * A) The current line has fewer pipe-separated cells than the header → try
 *    concatenating with the next line to see if together they form a complete
 *    row.
 *
 * B) The current line has the correct cell count but one cell contains an
 *    unmatched quote and the rest are empty → the next line (if it provides a
 *    valid full row) replaces the broken fragment.
 */
function repairBrokenRows(bodyLines: string[], expectedColumns: number): string[] {
  const result: string[] = []
  let i = 0

  while (i < bodyLines.length) {
    const currentCells = splitTableCells(bodyLines[i])

    if (looksLikeBrokenRow(currentCells, expectedColumns) && i + 1 < bodyLines.length) {
      const nextLine = bodyLines[i + 1]
      const nextCells = splitTableCells(nextLine)

      // Pattern A: fewer cells → merge raw lines.  The line break was
      // injected by the generator inside a cell, so original whitespace is
      // already present on one or both sides of the split point.  We
      // concatenate without adding extra space to avoid artefacts like
      // `"word "` instead of `"word"`.
      if (currentCells.length < expectedColumns) {
        const mergedLine = bodyLines[i].trimEnd() + nextLine.trimStart()
        const mergedCells = splitTableCells(mergedLine)
        if (mergedCells.length === expectedColumns) {
          result.push(mergedLine)
          i += 2
          continue
        }
      }

      // Pattern B: unmatched quote + empty cells → next line is the real row
      if (
        currentCells.length === expectedColumns &&
        nextCells.length === expectedColumns &&
        currentCells.some((c) => hasUnmatchedQuotes(c)) &&
        nextCells.every((c) => !hasUnmatchedQuotes(c))
      ) {
        const nonEmptyCurrent = currentCells.filter((c) => c.trim() !== '').length
        const nonEmptyNext = nextCells.filter((c) => c.trim() !== '').length
        if (nonEmptyCurrent <= 1 && nonEmptyNext > nonEmptyCurrent) {
          result.push(nextLine)
          i += 2
          continue
        }
      }
    }

    result.push(bodyLines[i])
    i++
  }

  return result
}

function formatRow(cells: string[], columnCount: number, indent: string): string {
  const normalizedCells = Array.from({ length: columnCount }, (_, index) =>
    (cells[index] ?? '').trim()
  )
  return `${indent}| ${normalizedCells.join(' | ')} |`
}

function normalizeBodyRow(cells: string[], expectedColumns: number): string[][] {
  const trimmed = cells.map((cell) => cell.trim())
  const compact = trimmed.filter((cell) => cell.length > 0)
  let working = trimmed

  // Compact placeholder cells from accidental double pipes when deterministic.
  if (
    working.length > expectedColumns &&
    compact.length >= expectedColumns &&
    (compact.length === expectedColumns || compact.length % expectedColumns === 0)
  ) {
    working = compact
  }

  if (working.length === expectedColumns) {
    return [working]
  }

  if (working.length < expectedColumns) {
    return [[...working, ...Array.from({ length: expectedColumns - working.length }, () => '')]]
  }

  if (working.length % expectedColumns === 0) {
    const rows: string[][] = []
    for (let offset = 0; offset < working.length; offset += expectedColumns) {
      rows.push(working.slice(offset, offset + expectedColumns))
    }
    return rows
  }

  return [
    [...working.slice(0, expectedColumns - 1), working.slice(expectedColumns - 1).join(' / ')],
  ]
}

function normalizeTableBlock(lines: string[]): string[] {
  const headerCells = splitTableCells(lines[0])
  const hasNonEmptyHeaderCell = headerCells.some((cell) => cell.length > 0)
  if (!hasNonEmptyHeaderCell || headerCells.length < 2) {
    return lines
  }

  const columnCount = headerCells.length
  const separatorCells = splitTableCells(lines[1])
  const rawBodyRows = lines.slice(2)

  // Preserve already-valid tables exactly as they are (but not if any body
  // row looks broken — e.g. unmatched quotes with empty trailing cells).
  if (
    isValidSeparatorLine(lines[1], columnCount) &&
    rawBodyRows.every((row) => {
      const cells = splitTableCells(row)
      return cells.length === columnCount && !looksLikeBrokenRow(cells, columnCount)
    })
  ) {
    return lines
  }

  // Repair rows that were accidentally split across lines by the generator.
  const bodyRows = repairBrokenRows(rawBodyRows, columnCount)

  const indent = lines[0].match(/^\s*/)?.[0] ?? ''
  const normalizedSeparatorCells = Array.from({ length: columnCount }, (_, index) =>
    normalizeSeparatorCell(separatorCells[index])
  )

  const normalizedBodyRows = bodyRows.flatMap((row) =>
    normalizeBodyRow(splitTableCells(row), columnCount)
  )

  return [
    formatRow(headerCells, columnCount, indent),
    formatRow(normalizedSeparatorCells, columnCount, indent),
    ...normalizedBodyRows.map((row) => formatRow(row, columnCount, indent)),
  ]
}

/**
 * Repairs table-like markdown blocks where the separator row is malformed.
 * This keeps the transform deterministic and scoped to obvious table syntax only.
 */
export function normalizeMalformedMarkdownTables(markdown: string): string {
  if (!markdown || !markdown.includes('|')) {
    return markdown
  }

  const lines = markdown.split(/\r?\n/)
  const normalizedLines: string[] = []

  let inFencedCodeBlock = false
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (FENCE_DELIMITER.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock
      normalizedLines.push(line)
      index += 1
      continue
    }

    const nextLine = lines[index + 1]
    const isTableCandidate =
      !inFencedCodeBlock &&
      Boolean(nextLine) &&
      hasPipeCharacter(line) &&
      hasPipeCharacter(nextLine) &&
      looksLikeSeparator(nextLine)

    if (!isTableCandidate) {
      normalizedLines.push(line)
      index += 1
      continue
    }

    const headerCells = splitTableCells(line)
    const hasNonEmptyHeaderCell = headerCells.some((cell) => cell.length > 0)

    if (!hasNonEmptyHeaderCell) {
      normalizedLines.push(line)
      index += 1
      continue
    }

    const validSeparator = isValidSeparatorLine(nextLine, headerCells.length)

    const blockLines = [line, nextLine]
    let cursor = index + 2

    while (cursor < lines.length) {
      const current = lines[cursor]

      if (FENCE_DELIMITER.test(current)) {
        break
      }

      if (!current.trim()) {
        // Empty line normally ends a table block, but if the last collected
        // body row looks broken and a pipe-containing line follows the gap,
        // pull it in as a continuation so repairBrokenRows can merge them.
        const lastBody = blockLines.length > 2 ? blockLines[blockLines.length - 1] : undefined
        const afterGap = lines[cursor + 1]

        if (
          lastBody &&
          afterGap &&
          hasPipeCharacter(afterGap) &&
          !FENCE_DELIMITER.test(afterGap) &&
          looksLikeBrokenRow(splitTableCells(lastBody), headerCells.length)
        ) {
          // Skip the empty line and pull the continuation row
          blockLines.push(afterGap)
          cursor += 2
          continue
        }

        break
      }

      if (!hasPipeCharacter(current)) {
        break
      }

      blockLines.push(current)
      cursor += 1
    }

    // Tables with a valid separator and no broken body rows can be passed
    // through unchanged — normalizeTableBlock's own early return handles this.
    // Tables with malformed separators or broken rows go through full
    // normalization including broken-row repair.
    if (validSeparator && blockLines.length === 2) {
      // Header + separator only, no body rows — nothing to repair.
      normalizedLines.push(line)
      index += 1
      continue
    }

    normalizedLines.push(...normalizeTableBlock(blockLines))
    index = cursor
  }

  return normalizedLines.join('\n')
}
