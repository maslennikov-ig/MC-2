import type { DoclingDocument, DoclingPictureEnrichment } from './types.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function provenance(item: UnknownRecord): UnknownRecord {
  return asRecord(asArray(item.prov)[0]);
}

function pageNumber(item: UnknownRecord): number {
  const direct = asFiniteNumber(item.page_no, 0);
  const fromProvenance = asFiniteNumber(provenance(item).page_no, 0);
  return Math.max(1, direct || fromProvenance || 1);
}

function bbox(item: UnknownRecord): [number, number, number, number] | undefined {
  const direct = item.bbox;
  if (Array.isArray(direct) && direct.length === 4) {
    return direct.map(value => asFiniteNumber(value)) as [number, number, number, number];
  }

  const source = asRecord(provenance(item).bbox);
  if (!('l' in source) || !('t' in source) || !('r' in source) || !('b' in source)) {
    return undefined;
  }

  const left = asFiniteNumber(source.l);
  const top = asFiniteNumber(source.t);
  const right = asFiniteNumber(source.r);
  const bottom = asFiniteNumber(source.b);
  return [
    Math.min(left, right),
    Math.min(top, bottom),
    Math.abs(right - left),
    Math.abs(top - bottom),
  ];
}

function reference(value: unknown): string | undefined {
  const record = asRecord(value);
  const ref = record.$ref ?? record.cref;
  return typeof ref === 'string' ? ref : undefined;
}

function resolveCaption(item: UnknownRecord, textByRef: Map<string, string>): string | undefined {
  const direct = asString(item.caption);
  if (direct) return direct;

  for (const caption of asArray(item.captions)) {
    const resolved = textByRef.get(reference(caption) ?? '');
    if (resolved) return resolved;
  }
  return undefined;
}

function extractImage(item: UnknownRecord): { data?: string; format?: string } {
  const image = asRecord(item.image);
  const uri = asString(image.uri) || asString(item.data);
  const match = uri.match(/^data:image\/([^;]+);base64,(.+)$/s);
  if (match) return { format: match[1], data: match[2] };
  return uri ? { data: uri, format: asString(item.format) || undefined } : {};
}

function extractAnnotationText(item: UnknownRecord): string | undefined {
  const texts = asArray(item.annotations)
    .map(annotation => asString(asRecord(annotation).text).trim())
    .filter(Boolean);
  return texts.length > 0 ? texts.join('\n') : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Row-major text grid from a Docling `TableData`, header row first. */
function chartRows(data: UnknownRecord): string[][] {
  const rows = new Map<number, Map<number, string>>();
  for (const rawCell of asArray(data.table_cells)) {
    const cell = asRecord(rawCell);
    const rowIndex = asFiniteNumber(cell.start_row_offset_idx, 0);
    const columnIndex = asFiniteNumber(cell.start_col_offset_idx, 0);
    const row = rows.get(rowIndex) ?? new Map<number, string>();
    row.set(columnIndex, asString(cell.text));
    rows.set(rowIndex, row);
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) =>
      [...row.entries()].sort(([left], [right]) => left - right).map(([, text]) => text)
    );
}

/**
 * Pulls advanced enrichment out of Docling's `meta` into a stable shape.
 *
 * Two things this deliberately does NOT do. It does not require the advanced
 * conversion profile: a PPTX declares its chart series in the source file, and
 * MEASURED on 2026-08-06 the baseline stack already returns both
 * `classification: bar_chart` and the full series for `reading-order-chart.pptx`
 * with no enrichment flag set — the previous adapter simply dropped `meta` on
 * the floor. And it does not invent a field from a neighbouring one: an absent
 * key stays absent, so a consumer can tell "no model ran" from "the model found
 * nothing".
 */
function pictureEnrichment(picture: UnknownRecord): DoclingPictureEnrichment | undefined {
  const meta = asRecord(picture.meta);
  const enrichment: DoclingPictureEnrichment = {};

  const predictions = asArray(asRecord(meta.classification).predictions).map(asRecord);
  const best = predictions
    .filter(prediction => optionalString(prediction.class_name))
    .sort(
      (left, right) =>
        (optionalNumber(right.confidence) ?? 0) - (optionalNumber(left.confidence) ?? 0)
    )[0];
  if (best) {
    enrichment.classification = {
      class_name: asString(best.class_name),
      confidence: optionalNumber(best.confidence),
      created_by: optionalString(best.created_by),
    };
  }

  const description = asRecord(meta.description);
  const descriptionText = optionalString(description.text);
  if (descriptionText) {
    enrichment.description = {
      text: descriptionText,
      confidence: optionalNumber(description.confidence),
      created_by: optionalString(description.created_by),
    };
  }

  const code = asRecord(meta.code);
  const codeText = optionalString(code.text);
  if (codeText) {
    enrichment.code = {
      text: codeText,
      language: optionalString(code.language),
      confidence: optionalNumber(code.confidence),
      created_by: optionalString(code.created_by),
    };
  }

  const chart = asRecord(meta.tabular_chart);
  const rows = chartRows(asRecord(chart.chart_data));
  if (rows.length > 0) {
    enrichment.chart = {
      title: optionalString(chart.title),
      rows,
      confidence: optionalNumber(chart.confidence),
      created_by: optionalString(chart.created_by),
    };
  }

  return Object.keys(enrichment).length > 0 ? enrichment : undefined;
}

function normalizeTableCells(data: UnknownRecord): DoclingDocument['tables'][number]['cells'] {
  const rows = new Map<number, DoclingDocument['tables'][number]['cells'][number]>();
  for (const rawCell of asArray(data.table_cells ?? data.cells)) {
    const cell = asRecord(rawCell);
    const rowIndex = Math.max(
      0,
      asFiniteNumber(cell.start_row_offset_idx, asFiniteNumber(cell.row, 0))
    );
    const row = rows.get(rowIndex) ?? [];
    row.push({
      text: asString(cell.text),
      rowspan: Math.max(1, asFiniteNumber(cell.row_span ?? cell.rowspan, 1)),
      colspan: Math.max(1, asFiniteNumber(cell.col_span ?? cell.colspan, 1)),
      is_header: cell.column_header === true || cell.row_header === true || cell.is_header === true,
      bbox: bbox(cell),
    });
    rows.set(rowIndex, row);
  }

  return [...rows.entries()].sort(([left], [right]) => left - right).map(([, row]) => row);
}

export function normalizeDoclingDocument(raw: unknown): DoclingDocument {
  if (!isRecord(raw)) {
    throw new Error('Invalid Docling document: expected an object');
  }

  for (const collection of ['texts', 'pictures', 'tables'] as const) {
    if (raw[collection] !== undefined && !Array.isArray(raw[collection])) {
      throw new Error(`Invalid Docling document: ${collection} must be an array`);
    }
  }

  if (raw.pages !== undefined && !Array.isArray(raw.pages) && !isRecord(raw.pages)) {
    throw new Error('Invalid Docling document: pages must be an array or object');
  }

  const rawTexts = asArray(raw.texts).map(asRecord);
  const textByRef = new Map(
    rawTexts.map((text, index) => [
      asString(text.self_ref, asString(text.id, `#/texts/${index}`)),
      asString(text.text),
    ])
  );

  const texts = rawTexts.map((text, index) => ({
    id: asString(text.self_ref, asString(text.id, `#/texts/${index}`)),
    text: asString(text.text, asString(text.orig)),
    type: asString(text.label, asString(text.type, 'text')),
    bbox: bbox(text),
    page_no: pageNumber(text),
    order: asFiniteNumber(text.order, index),
    level:
      typeof text.level === 'number' && Number.isFinite(text.level)
        ? Math.max(1, text.level)
        : undefined,
    // A top-level Docling field on code items, not enrichment metadata: the
    // advanced pass makes it accurate rather than makes it exist.
    code_language: optionalString(text.code_language),
    font: isRecord(text.font) ? text.font : undefined,
  }));

  const pictures = asArray(raw.pictures).map((value, index) => {
    const picture = asRecord(value);
    return {
      id: asString(picture.self_ref, asString(picture.id, `#/pictures/${index}`)),
      bbox: bbox(picture) ?? ([0, 0, 0, 0] as [number, number, number, number]),
      page_no: pageNumber(picture),
      caption: resolveCaption(picture, textByRef),
      ocr_text: asString(picture.ocr_text) || extractAnnotationText(picture),
      enrichment: pictureEnrichment(picture),
      ...extractImage(picture),
    };
  });

  const tables = asArray(raw.tables).map((value, index) => {
    const table = asRecord(value);
    const data = asRecord(table.data);
    const cells = normalizeTableCells(Object.keys(data).length > 0 ? data : table);
    return {
      id: asString(table.self_ref, asString(table.id, `#/tables/${index}`)),
      bbox: bbox(table) ?? ([0, 0, 0, 0] as [number, number, number, number]),
      page_no: pageNumber(table),
      num_rows: Math.max(cells.length, asFiniteNumber(data.num_rows ?? table.num_rows, 0)),
      num_cols: Math.max(
        ...cells.map(row => row.reduce((total, cell) => total + (cell.colspan ?? 1), 0)),
        asFiniteNumber(data.num_cols ?? table.num_cols, 0),
        0
      ),
      cells,
      caption: resolveCaption(table, textByRef),
    };
  });

  const rawPages = Array.isArray(raw.pages)
    ? raw.pages
    : isRecord(raw.pages)
      ? Object.values(raw.pages)
      : [];
  const pages = rawPages.map((value, index) => {
    const page = asRecord(value);
    const size = asRecord(page.size);
    return {
      page_no: Math.max(1, asFiniteNumber(page.page_no, index + 1)),
      size: {
        width: asFiniteNumber(size.width),
        height: asFiniteNumber(size.height),
      },
      cells: Array.isArray(page.cells)
        ? (page.cells as DoclingDocument['pages'][number]['cells'])
        : [],
    };
  });

  const inferredPageCount = Math.max(
    ...pages.map(page => page.page_no),
    ...texts.map(text => text.page_no),
    ...pictures.map(picture => picture.page_no),
    ...tables.map(table => table.page_no),
    texts.length + pictures.length + tables.length > 0 ? 1 : 0
  );
  const sourceMetadata = asRecord(raw.metadata);
  const origin = asRecord(raw.origin);

  return {
    schema_version: asString(raw.schema_version, asString(raw.version, 'unknown')),
    name: asString(raw.name, asString(origin.filename, 'document')),
    pages,
    texts,
    pictures,
    tables,
    metadata: {
      page_count: Math.max(asFiniteNumber(sourceMetadata.page_count, 0), inferredPageCount),
      language: asString(sourceMetadata.language) || undefined,
      title: asString(sourceMetadata.title) || undefined,
      authors: Array.isArray(sourceMetadata.authors)
        ? sourceMetadata.authors.filter((author): author is string => typeof author === 'string')
        : undefined,
      creation_date: asString(sourceMetadata.creation_date) || undefined,
      modification_date: asString(sourceMetadata.modification_date) || undefined,
      format: asString(sourceMetadata.format, asString(origin.mimetype)) || undefined,
      file_size: asFiniteNumber(sourceMetadata.file_size, 0) || undefined,
      processing: {
        ...(isRecord(sourceMetadata.processing) ? sourceMetadata.processing : {}),
        docling_version: asString(raw.docling_version, asString(raw.version)) || undefined,
      },
    },
  };
}
