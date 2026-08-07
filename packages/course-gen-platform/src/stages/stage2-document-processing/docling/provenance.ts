/**
 * Provenance index over a raw DoclingDocument.
 *
 * Native Docling chunks reference their source elements by JSON pointer
 * (`#/texts/12`, `#/tables/0`). The normalized `DoclingDocument` flattens
 * bounding boxes to `[x, y, width, height]` and drops the coordinate origin,
 * which is exactly the information a consumer needs to draw or verify a box.
 * This index therefore reads the raw document and keeps `l/t/r/b`, the
 * coordinate origin and the page size together, so a bbox can never be
 * misinterpreted downstream.
 *
 * @module stages/stage2-document-processing/docling/provenance
 */

type UnknownRecord = Record<string, unknown>;

/** Collections a Docling self_ref can point into. */
const REFERENCED_COLLECTIONS = [
  'texts',
  'tables',
  'pictures',
  'groups',
  'key_value_items',
  'form_items',
] as const;

/**
 * A bounding box in Docling's own coordinate contract.
 *
 * `coordOrigin` is `BOTTOMLEFT` for PDF-derived documents and `TOPLEFT` for
 * image-derived ones; without it, `top` and `bottom` cannot be ordered.
 */
export interface DoclingBoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  coordOrigin: string;
  pageNumber: number;
  pageWidth?: number;
  pageHeight?: number;
}

/** Resolved provenance for one Docling element. */
export interface DoclingRefProvenance {
  selfRef: string;
  label: string;
  pageNumbers: number[];
  bboxes: DoclingBoundingBox[];
}

/** Page geometry keyed by page number. */
export interface DoclingPageSize {
  width: number;
  height: number;
}

export interface DoclingProvenanceIndex {
  /** Provenance for every addressable element, keyed by self_ref. */
  refs: Map<string, DoclingRefProvenance>;
  /** Page sizes keyed by page number. */
  pages: Map<number, DoclingPageSize>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readPages(raw: UnknownRecord): Map<number, DoclingPageSize> {
  const pages = new Map<number, DoclingPageSize>();
  const source = raw.pages;
  const entries = Array.isArray(source) ? source : isRecord(source) ? Object.values(source) : [];

  entries.forEach((value, index) => {
    if (!isRecord(value)) return;
    const pageNumber = asFiniteNumber(value.page_no) ?? index + 1;
    const size = isRecord(value.size) ? value.size : {};
    const width = asFiniteNumber(size.width);
    const height = asFiniteNumber(size.height);
    if (width === undefined || height === undefined) return;
    pages.set(pageNumber, { width, height });
  });

  return pages;
}

function readProvenance(
  item: UnknownRecord,
  pages: Map<number, DoclingPageSize>
): { pageNumbers: number[]; bboxes: DoclingBoundingBox[] } {
  const pageNumbers: number[] = [];
  const bboxes: DoclingBoundingBox[] = [];

  const entries = Array.isArray(item.prov) ? item.prov : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const pageNumber = asFiniteNumber(entry.page_no);
    if (pageNumber !== undefined && !pageNumbers.includes(pageNumber)) pageNumbers.push(pageNumber);

    const box = isRecord(entry.bbox) ? entry.bbox : undefined;
    if (!box || pageNumber === undefined) continue;

    const left = asFiniteNumber(box.l);
    const top = asFiniteNumber(box.t);
    const right = asFiniteNumber(box.r);
    const bottom = asFiniteNumber(box.b);
    if (left === undefined || top === undefined || right === undefined || bottom === undefined) {
      continue;
    }

    const size = pages.get(pageNumber);
    bboxes.push({
      left,
      top,
      right,
      bottom,
      coordOrigin: typeof box.coord_origin === 'string' ? box.coord_origin : 'BOTTOMLEFT',
      pageNumber,
      ...(size ? { pageWidth: size.width, pageHeight: size.height } : {}),
    });
  }

  return { pageNumbers: pageNumbers.sort((left, right) => left - right), bboxes };
}

/**
 * Builds the self_ref -> provenance index for a raw Docling document.
 *
 * Every element of every referenced collection is indexed, including groups,
 * so a native chunk that points at a list container still resolves.
 */
export function buildDoclingProvenanceIndex(raw: unknown): DoclingProvenanceIndex {
  if (!isRecord(raw)) {
    throw new Error('Invalid Docling document: expected an object');
  }

  const pages = readPages(raw);
  const refs = new Map<string, DoclingRefProvenance>();

  for (const collection of REFERENCED_COLLECTIONS) {
    const items = raw[collection];
    if (!Array.isArray(items)) continue;

    items.forEach((value, index) => {
      if (!isRecord(value)) return;
      const selfRef =
        typeof value.self_ref === 'string' ? value.self_ref : `#/${collection}/${index}`;
      const { pageNumbers, bboxes } = readProvenance(value, pages);
      refs.set(selfRef, {
        selfRef,
        label: typeof value.label === 'string' ? value.label : collection,
        pageNumbers,
        bboxes,
      });
    });
  }

  return { refs, pages };
}

/** Aggregated provenance for a set of source refs. */
export interface AggregatedProvenance {
  selfRefs: string[];
  unresolvedRefs: string[];
  pageNumbers: number[];
  bboxes: DoclingBoundingBox[];
  labels: string[];
}

/**
 * Aggregates provenance for the refs of one native chunk.
 *
 * Unresolved refs are reported rather than silently dropped: a chunk whose refs
 * do not exist in the document it claims to come from is a consistency failure,
 * not a chunk with less metadata.
 */
export function aggregateProvenance(
  selfRefs: readonly string[],
  index: DoclingProvenanceIndex
): AggregatedProvenance {
  const pageNumbers: number[] = [];
  const bboxes: DoclingBoundingBox[] = [];
  const labels: string[] = [];
  const unresolvedRefs: string[] = [];

  for (const selfRef of selfRefs) {
    const resolved = index.refs.get(selfRef);
    if (!resolved) {
      unresolvedRefs.push(selfRef);
      continue;
    }
    for (const pageNumber of resolved.pageNumbers) {
      if (!pageNumbers.includes(pageNumber)) pageNumbers.push(pageNumber);
    }
    bboxes.push(...resolved.bboxes);
    if (!labels.includes(resolved.label)) labels.push(resolved.label);
  }

  return {
    selfRefs: [...selfRefs],
    unresolvedRefs,
    pageNumbers: pageNumbers.sort((left, right) => left - right),
    bboxes,
    labels,
  };
}
