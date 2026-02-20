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
  const bodyRows = lines.slice(2)

  // Preserve already-valid tables exactly as they are.
  if (
    isValidSeparatorLine(lines[1], columnCount) &&
    bodyRows.every((row) => splitTableCells(row).length === columnCount)
  ) {
    return lines
  }

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

    if (!hasNonEmptyHeaderCell || isValidSeparatorLine(nextLine, headerCells.length)) {
      normalizedLines.push(line)
      index += 1
      continue
    }

    const blockLines = [line, nextLine]
    let cursor = index + 2

    while (cursor < lines.length) {
      const current = lines[cursor]

      if (!current.trim() || FENCE_DELIMITER.test(current) || !hasPipeCharacter(current)) {
        break
      }

      blockLines.push(current)
      cursor += 1
    }

    normalizedLines.push(...normalizeTableBlock(blockLines))
    index = cursor
  }

  return normalizedLines.join('\n')
}
