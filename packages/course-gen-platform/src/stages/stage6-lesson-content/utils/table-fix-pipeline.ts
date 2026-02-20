/**
 * Deterministic Markdown table repair pipeline
 * @module stages/stage6-lesson-content/utils/table-fix-pipeline
 *
 * Repairs malformed GFM table blocks without LLM usage.
 * Scope is intentionally narrow: only obvious table-like blocks outside fenced code.
 */

import { logger } from '@/shared/logger';

const FENCE_DELIMITER = /^ {0,3}(```|~~~)/;
const SEPARATOR_CHARSET = /^[\t :|\-]+$/;

function hasPipeCharacter(line: string): boolean {
  return line.includes('|');
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutEdgePipes = withoutLeadingPipe.endsWith('|')
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;

  return withoutEdgePipes.split('|').map(cell => cell.trim());
}

function looksLikeSeparator(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('-') && hasPipeCharacter(trimmed) && SEPARATOR_CHARSET.test(trimmed);
}

function isValidSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

function isValidSeparatorLine(line: string, columnCount: number): boolean {
  const cells = splitTableCells(line);
  return cells.length === columnCount && cells.every(isValidSeparatorCell);
}

function normalizeSeparatorCell(cell?: string): string {
  if (!cell) return '---';

  const trimmed = cell.trim();
  const startsWithColon = trimmed.startsWith(':');
  const endsWithColon = trimmed.endsWith(':');

  if (startsWithColon && endsWithColon) return ':---:';
  if (startsWithColon) return ':---';
  if (endsWithColon) return '---:';
  return '---';
}

function formatRow(cells: string[], columnCount: number, indent: string): string {
  const normalizedCells = Array.from({ length: columnCount }, (_, index) =>
    (cells[index] ?? '').trim()
  );
  return `${indent}| ${normalizedCells.join(' | ')} |`;
}

interface RowNormalizationResult {
  rows: string[][];
  modified: boolean;
}

function normalizeBodyRow(cells: string[], expectedColumns: number): RowNormalizationResult {
  const trimmed = cells.map(cell => cell.trim());
  const compact = trimmed.filter(cell => cell.length > 0);

  let working = trimmed;
  let modified = false;

  // If row has many empty placeholders (e.g. "||"), compact first when deterministic.
  if (
    working.length > expectedColumns &&
    compact.length >= expectedColumns &&
    (compact.length === expectedColumns || compact.length % expectedColumns === 0)
  ) {
    working = compact;
    modified = true;
  }

  if (working.length === expectedColumns) {
    return { rows: [working], modified };
  }

  if (working.length < expectedColumns) {
    return {
      rows: [[...working, ...Array.from({ length: expectedColumns - working.length }, () => '')]],
      modified: true,
    };
  }

  // Split merged row into multiple rows when row size is cleanly divisible.
  if (working.length % expectedColumns === 0) {
    const rows: string[][] = [];
    for (let offset = 0; offset < working.length; offset += expectedColumns) {
      rows.push(working.slice(offset, offset + expectedColumns));
    }
    return { rows, modified: true };
  }

  // Last-resort deterministic repair: merge overflow into last column.
  const merged = [
    ...working.slice(0, expectedColumns - 1),
    working.slice(expectedColumns - 1).join(' / '),
  ];
  return { rows: [merged], modified: true };
}

interface BlockNormalizationResult {
  lines: string[];
  separatorNormalized: boolean;
  dataRowsNormalized: number;
  modified: boolean;
}

function normalizeTableBlock(lines: string[]): BlockNormalizationResult {
  const headerCells = splitTableCells(lines[0]);
  const hasNonEmptyHeaderCell = headerCells.some(cell => cell.length > 0);
  if (!hasNonEmptyHeaderCell || headerCells.length < 2) {
    return {
      lines,
      separatorNormalized: false,
      dataRowsNormalized: 0,
      modified: false,
    };
  }

  const columnCount = headerCells.length;
  const separatorCells = splitTableCells(lines[1]);
  const bodyRows = lines.slice(2);
  const separatorNormalized = !isValidSeparatorLine(lines[1], columnCount);
  const indent = lines[0].match(/^\s*/)?.[0] ?? '';

  // Preserve already-valid blocks exactly as-is.
  if (
    !separatorNormalized &&
    bodyRows.every(row => {
      const cells = splitTableCells(row);
      return cells.length === columnCount;
    })
  ) {
    return {
      lines,
      separatorNormalized: false,
      dataRowsNormalized: 0,
      modified: false,
    };
  }

  const normalizedSeparatorCells = Array.from({ length: columnCount }, (_, index) =>
    normalizeSeparatorCell(separatorCells[index])
  );
  const normalizedRows: string[] = [];
  let dataRowsNormalized = 0;

  for (const row of bodyRows) {
    const normalization = normalizeBodyRow(splitTableCells(row), columnCount);
    if (normalization.modified) {
      dataRowsNormalized++;
    }

    for (const normalizedRow of normalization.rows) {
      normalizedRows.push(formatRow(normalizedRow, columnCount, indent));
    }
  }

  return {
    lines: [
      formatRow(headerCells, columnCount, indent),
      formatRow(normalizedSeparatorCells, columnCount, indent),
      ...normalizedRows,
    ],
    separatorNormalized,
    dataRowsNormalized,
    modified: separatorNormalized || dataRowsNormalized > 0,
  };
}

export interface TableFixPipelineMetrics {
  tablesDetected: number;
  tablesModified: number;
  separatorRowsNormalized: number;
  dataRowsNormalized: number;
  durationMs: number;
}

export interface TableFixPipelineResult {
  content: string;
  modified: boolean;
  metrics: TableFixPipelineMetrics;
}

/**
 * Normalize malformed table blocks in markdown content.
 */
export function runTableFixPipeline(content: string): TableFixPipelineResult {
  const startTime = Date.now();

  if (!content || !content.includes('|')) {
    return {
      content,
      modified: false,
      metrics: {
        tablesDetected: 0,
        tablesModified: 0,
        separatorRowsNormalized: 0,
        dataRowsNormalized: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const lines = content.split(/\r?\n/);
  const normalizedLines: string[] = [];
  const metrics: TableFixPipelineMetrics = {
    tablesDetected: 0,
    tablesModified: 0,
    separatorRowsNormalized: 0,
    dataRowsNormalized: 0,
    durationMs: 0,
  };

  let inFencedCodeBlock = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (FENCE_DELIMITER.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      normalizedLines.push(line);
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1];
    const isTableCandidate =
      !inFencedCodeBlock &&
      Boolean(nextLine) &&
      hasPipeCharacter(line) &&
      hasPipeCharacter(nextLine) &&
      looksLikeSeparator(nextLine);

    if (!isTableCandidate) {
      normalizedLines.push(line);
      index += 1;
      continue;
    }

    metrics.tablesDetected++;

    const blockLines = [line, nextLine];
    let cursor = index + 2;

    while (cursor < lines.length) {
      const current = lines[cursor];
      if (!current.trim() || FENCE_DELIMITER.test(current) || !hasPipeCharacter(current)) {
        break;
      }

      blockLines.push(current);
      cursor += 1;
    }

    const normalizedBlock = normalizeTableBlock(blockLines);
    if (normalizedBlock.modified) {
      metrics.tablesModified++;
    }
    if (normalizedBlock.separatorNormalized) {
      metrics.separatorRowsNormalized++;
    }
    metrics.dataRowsNormalized += normalizedBlock.dataRowsNormalized;

    normalizedLines.push(...normalizedBlock.lines);
    index = cursor;
  }

  const normalizedContent = normalizedLines.join('\n');
  const modified = normalizedContent !== content;
  metrics.durationMs = Date.now() - startTime;

  if (metrics.tablesModified > 0) {
    logger.debug(
      {
        metrics,
      },
      'Table fix pipeline: normalized malformed markdown tables'
    );
  }

  return {
    content: normalizedContent,
    modified,
    metrics,
  };
}
