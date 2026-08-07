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

/**
 * A structural container an element sits inside: a spreadsheet sheet, a slide,
 * an EPUB chapter, a list.
 *
 * MEASURED against the pinned stack (2026-08-07): this is the ONLY place the
 * defining structure of the non-paginated formats survives. An XLSX yields one
 * `sheet` group per worksheet carrying its name, an ODP yields a `chapter`
 * group per slide, an EPUB yields `section` and `list` groups — and none of it
 * reaches the Markdown rendering, which flattens every sheet into consecutive
 * tables with no way to tell which sheet a number came from.
 */
export interface DoclingContainer {
  /** Group label, e.g. `sheet`, `chapter`, `section`, `list`. */
  label: string;
  /** Group name when the format supplies one, e.g. the worksheet name. */
  name: string | null;
  /** Position among its siblings under the same parent, zero-based. */
  index: number;
  selfRef: string;
}

/** Resolved provenance for one Docling element. */
export interface DoclingRefProvenance {
  selfRef: string;
  label: string;
  pageNumbers: number[];
  bboxes: DoclingBoundingBox[];
  /** Enclosing groups, outermost first. Empty when the element sits in the body. */
  containers: DoclingContainer[];
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

/**
 * How deep a parent chain is followed before it is treated as malformed.
 *
 * A well-formed Docling document nests a handful of levels. A document that
 * exceeds this either has a cycle or is not a document, and either way walking
 * it forever is the wrong answer.
 */
const MAX_CONTAINER_DEPTH = 32;

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

function parentRef(item: UnknownRecord): string | undefined {
  const parent = item.parent;
  if (!isRecord(parent)) return undefined;
  const ref = parent.$ref ?? parent.cref;
  return typeof ref === 'string' ? ref : undefined;
}

/**
 * Walks an element's parent chain and returns the groups enclosing it,
 * outermost first.
 *
 * Only groups are containers. `#/body` terminates the walk, and a parent that
 * does not resolve ends it too rather than throwing: a missing ancestor costs
 * this element its container path, it does not invalidate the document.
 */
function readContainers(
  selfRef: string,
  records: Map<string, UnknownRecord>,
  siblingIndex: Map<string, number>
): DoclingContainer[] {
  const chain: DoclingContainer[] = [];
  const seen = new Set<string>([selfRef]);

  let current = records.get(selfRef);
  for (let depth = 0; depth < MAX_CONTAINER_DEPTH && current; depth += 1) {
    const ref = parentRef(current);
    if (!ref || ref === '#/body' || seen.has(ref)) break;
    seen.add(ref);

    const parent = records.get(ref);
    if (!parent) break;

    if (ref.startsWith('#/groups/')) {
      chain.push({
        label: typeof parent.label === 'string' ? parent.label : 'group',
        name: typeof parent.name === 'string' ? parent.name : null,
        index: siblingIndex.get(ref) ?? 0,
        selfRef: ref,
      });
    }

    current = parent;
  }

  return chain.reverse();
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
  const records = new Map<string, UnknownRecord>();

  for (const collection of REFERENCED_COLLECTIONS) {
    const items = raw[collection];
    if (!Array.isArray(items)) continue;
    items.forEach((value, index) => {
      if (!isRecord(value)) return;
      const selfRef =
        typeof value.self_ref === 'string' ? value.self_ref : `#/${collection}/${index}`;
      records.set(selfRef, value);
    });
  }

  // Position among siblings, resolved once from each parent's declared child
  // order. This is what makes "the third slide" a fact rather than an inference
  // from a group name that only some backends fill in: ODP names its groups
  // `slide-0` while numbering the titles from one, so the name is not an index.
  const siblingIndex = new Map<string, number>();
  const assignSiblings = (container: UnknownRecord): void => {
    const children = Array.isArray(container.children) ? container.children : [];
    children.forEach((child, position) => {
      if (!isRecord(child)) return;
      const ref = child.$ref ?? child.cref;
      if (typeof ref === 'string') siblingIndex.set(ref, position);
    });
  };
  if (isRecord(raw.body)) assignSiblings(raw.body);
  for (const record of records.values()) assignSiblings(record);

  for (const [selfRef, value] of records) {
    const { pageNumbers, bboxes } = readProvenance(value, pages);
    const collection = selfRef.split('/')[1] ?? 'texts';
    refs.set(selfRef, {
      selfRef,
      label: typeof value.label === 'string' ? value.label : collection,
      pageNumbers,
      bboxes,
      containers: readContainers(selfRef, records, siblingIndex),
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
  /** Distinct enclosing containers, in first-seen order. */
  containers: DoclingContainer[];
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
  const containers: DoclingContainer[] = [];
  const seenContainers = new Set<string>();

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
    for (const container of resolved.containers) {
      if (seenContainers.has(container.selfRef)) continue;
      seenContainers.add(container.selfRef);
      containers.push(container);
    }
  }

  return {
    selfRefs: [...selfRefs],
    unresolvedRefs,
    pageNumbers: pageNumbers.sort((left, right) => left - right),
    bboxes,
    labels,
    containers,
  };
}
