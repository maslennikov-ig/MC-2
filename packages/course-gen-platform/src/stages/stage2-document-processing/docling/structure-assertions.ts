/**
 * Ground-truth checks for the structure a format family exists to express.
 *
 * A conversion that keeps every word and loses every boundary passes a text
 * check and is still a regression: a workbook flattened into consecutive tables
 * cannot answer "what is the rate for an assistant", because the sheet the row
 * came from is gone. So these checks are about FACTS OF SHAPE — which worksheet
 * a cell belongs to, what order the slides are in, which chapters exist, whether
 * an equation arrived as an equation — and each one names the family it defends
 * (FR-018).
 *
 * They read the RAW Docling document rather than the Markdown rendering, because
 * that is the only place the shape survives. MEASURED 2026-08-07 against the
 * pinned stack: Markdown renders a two-sheet workbook as two anonymous tables,
 * and the sheet names exist solely as `groups[].name`.
 *
 * @module stages/stage2-document-processing/docling/structure-assertions
 */

import { buildDoclingProvenanceIndex, type DoclingProvenanceIndex } from './provenance.js';

export interface ContainerExpectation {
  /** Docling group label, e.g. `sheet`, `chapter`, `section`, `list`. */
  label: string;
  /** Group name, when the format supplies one. */
  name?: string;
  /** Position among siblings, zero-based. */
  index?: number;
}

export interface ContainedTextExpectation {
  /** Text that must exist somewhere in the document. */
  text: string;
  /** Name of a container the element carrying that text must sit inside. */
  container: string;
}

export interface StructureExpectation {
  /** Containers the document must declare, in document order. */
  containers?: ContainerExpectation[];
  /** Text that must resolve to a named container. */
  containedText?: ContainedTextExpectation[];
  /** Minimum number of items per Docling label, e.g. `{ formula: 1, code: 1 }`. */
  itemLabels?: Record<string, number>;
  /** Cell sequences that must appear adjacent within one table row. */
  tableRows?: string[][];
  /** Minimum number of tables the document must contain. */
  minimumTables?: number;
}

export interface StructureCheck {
  name: string;
  passed: boolean;
  details?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU');
}

function textItems(raw: UnknownRecord): UnknownRecord[] {
  return Array.isArray(raw.texts) ? raw.texts.filter(isRecord) : [];
}

function tableItems(raw: UnknownRecord): UnknownRecord[] {
  return Array.isArray(raw.tables) ? raw.tables.filter(isRecord) : [];
}

function groupItems(raw: UnknownRecord): UnknownRecord[] {
  return Array.isArray(raw.groups) ? raw.groups.filter(isRecord) : [];
}

/** Table cells as `[rowIndex, columnIndex, text]`, in reading order. */
function tableCells(table: UnknownRecord): Array<[number, number, string]> {
  const data = isRecord(table.data) ? table.data : {};
  const cells = Array.isArray(data.table_cells) ? data.table_cells.filter(isRecord) : [];
  return cells.map(cell => [
    typeof cell.start_row_offset_idx === 'number' ? cell.start_row_offset_idx : -1,
    typeof cell.start_col_offset_idx === 'number' ? cell.start_col_offset_idx : -1,
    typeof cell.text === 'string' ? cell.text : '',
  ]);
}

function checkContainers(raw: UnknownRecord, expected: ContainerExpectation[]): StructureCheck[] {
  const declared = groupItems(raw).map(group => ({
    label: typeof group.label === 'string' ? group.label : 'group',
    name: typeof group.name === 'string' ? group.name : null,
  }));

  return expected.map((expectation, position) => {
    const actual = declared[position];
    const labelMatches = actual?.label === expectation.label;
    const nameMatches =
      expectation.name === undefined ||
      normalize(actual?.name ?? '') === normalize(expectation.name);
    return {
      name: `structure-container[${position}]:${expectation.label}`,
      passed: Boolean(actual) && labelMatches && nameMatches,
      details: actual
        ? `expected ${expectation.label}/${expectation.name ?? '*'}, got ${actual.label}/${actual.name ?? '-'}`
        : `no container at position ${position}; document declares ${declared.length}`,
    };
  });
}

/**
 * Finds every self_ref whose own text, or whose table cells, contain the needle.
 *
 * Tables are searched cell by cell rather than as joined text so that a value
 * only matches when it is genuinely one cell's content.
 */
function refsContaining(raw: UnknownRecord, needle: string): string[] {
  const wanted = normalize(needle);
  const refs: string[] = [];

  for (const item of textItems(raw)) {
    const text = typeof item.text === 'string' ? item.text : '';
    if (normalize(text).includes(wanted) && typeof item.self_ref === 'string') {
      refs.push(item.self_ref);
    }
  }
  for (const table of tableItems(raw)) {
    const hit = tableCells(table).some(([, , text]) => normalize(text) === wanted);
    if (hit && typeof table.self_ref === 'string') refs.push(table.self_ref);
  }

  return refs;
}

function checkContainedText(
  raw: UnknownRecord,
  index: DoclingProvenanceIndex,
  expected: ContainedTextExpectation[]
): StructureCheck[] {
  return expected.map(expectation => {
    const refs = refsContaining(raw, expectation.text);
    if (refs.length === 0) {
      return {
        name: `structure-contained:${expectation.text}`,
        passed: false,
        details: `"${expectation.text}" does not appear in the document at all`,
      };
    }

    const containerNames = refs.flatMap(
      ref => index.refs.get(ref)?.containers.map(container => container.name ?? '') ?? []
    );
    const wanted = normalize(expectation.container);
    // A container name may be decorated by the backend — ODS reports the sheet
    // as `sheet: Нагрузка` while XLSX reports it as `Нагрузка` — so containment
    // is the right test, not equality.
    const passed = containerNames.some(name => normalize(name).includes(wanted));

    return {
      name: `structure-contained:${expectation.text}`,
      passed,
      details: passed
        ? undefined
        : `"${expectation.text}" resolves to [${containerNames.join(', ') || 'no container'}], expected ${expectation.container}`,
    };
  });
}

function checkItemLabels(raw: UnknownRecord, expected: Record<string, number>): StructureCheck[] {
  const counts = new Map<string, number>();
  for (const item of textItems(raw)) {
    const label = typeof item.label === 'string' ? item.label : 'unknown';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Object.entries(expected).map(([label, minimum]) => {
    const actual = counts.get(label) ?? 0;
    return {
      name: `structure-label:${label}`,
      passed: actual >= minimum,
      details: `${actual} of at least ${minimum}`,
    };
  });
}

function checkTableRows(raw: UnknownRecord, expected: string[][]): StructureCheck[] {
  const rows: string[][] = [];
  for (const table of tableItems(raw)) {
    const byRow = new Map<number, Array<[number, string]>>();
    for (const [rowIndex, columnIndex, text] of tableCells(table)) {
      if (!byRow.has(rowIndex)) byRow.set(rowIndex, []);
      byRow.get(rowIndex)!.push([columnIndex, text]);
    }
    for (const cells of byRow.values()) {
      rows.push(cells.sort(([left], [right]) => left - right).map(([, text]) => normalize(text)));
    }
  }

  return expected.map(expectedRow => {
    const wanted = expectedRow.map(normalize);
    const passed = rows.some(row =>
      wanted.every((value, offset) => {
        const start = row.indexOf(wanted[0]);
        return start >= 0 && row[start + offset] === value;
      })
    );
    return {
      name: `structure-row:${expectedRow.join('|')}`,
      passed,
      details: passed ? undefined : `no table row contains ${expectedRow.join(' | ')} in order`,
    };
  });
}

/**
 * Runs every structural expectation a fixture declares against the raw document.
 *
 * @param raw - The accepted DoclingDocument JSON, exactly as converted.
 */
export function checkStructure(raw: unknown, expectation: StructureExpectation): StructureCheck[] {
  if (!isRecord(raw)) {
    return [{ name: 'structure', passed: false, details: 'raw document is not an object' }];
  }

  const index = buildDoclingProvenanceIndex(raw);
  const checks: StructureCheck[] = [];

  if (expectation.containers) checks.push(...checkContainers(raw, expectation.containers));
  if (expectation.containedText) {
    checks.push(...checkContainedText(raw, index, expectation.containedText));
  }
  if (expectation.itemLabels) checks.push(...checkItemLabels(raw, expectation.itemLabels));
  if (expectation.tableRows) checks.push(...checkTableRows(raw, expectation.tableRows));
  if (expectation.minimumTables !== undefined) {
    const actual = tableItems(raw).length;
    checks.push({
      name: 'structure-tables',
      passed: actual >= expectation.minimumTables,
      details: `${actual} of at least ${expectation.minimumTables}`,
    });
  }

  return checks;
}
