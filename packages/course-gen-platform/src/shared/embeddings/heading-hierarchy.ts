/**
 * Honest Markdown heading-hierarchy analysis.
 *
 * The Docling quality benchmark used to prove "two heading levels" with
 * `max(#-count) >= 2`. A document whose only headings are `##` satisfies that
 * without carrying any hierarchy at all, and a scientific PDF passed the corpus
 * on exactly that false positive. Depth of the deepest heading is not the same
 * fact as the number of DISTINCT levels present, so this module reports the
 * distinct set and lets callers assert against it.
 *
 * @module shared/embeddings/heading-hierarchy
 */

const FENCE = /^\s{0,3}(?:```|~~~)/u;
const ATX_HEADING = /^\s{0,3}(#{1,6})\s+\S/u;

/**
 * Distinct-level view of a Markdown document's heading structure.
 */
export interface HeadingHierarchy {
  /** Ascending distinct heading levels actually present (e.g. `[1, 2, 3]`). */
  distinctLevels: number[];
  /** Heading count per level, keyed by level. */
  countsByLevel: Record<number, number>;
  /** Deepest heading level present, or 0 when the document has no headings. */
  maxLevel: number;
  /** Heading texts in document order, paired with their level. */
  headings: Array<{ level: number; text: string }>;
}

/**
 * Expected-structure declaration for one corpus case.
 *
 * `expectedLevels` is the stronger form: it names the exact set the fixture is
 * known to contain. `minimumDistinctLevels` is the weaker form for documents
 * whose exact heading set is not fixed but whose hierarchy must be real.
 */
export interface HeadingHierarchyExpectation {
  expectedLevels?: number[];
  minimumDistinctLevels?: number;
}

export interface HeadingHierarchyVerdict extends HeadingHierarchy {
  passed: boolean;
  details: string;
}

/**
 * Analyses ATX headings outside fenced code blocks.
 */
export function analyzeMarkdownHeadings(markdown: string): HeadingHierarchy {
  const headings: Array<{ level: number; text: string }> = [];
  let insideFence = false;

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = ATX_HEADING.exec(line);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      text: line.replace(/^\s{0,3}#{1,6}\s+/u, '').trim(),
    });
  }

  const countsByLevel: Record<number, number> = {};
  for (const heading of headings) {
    countsByLevel[heading.level] = (countsByLevel[heading.level] ?? 0) + 1;
  }

  const distinctLevels = Object.keys(countsByLevel)
    .map(Number)
    .sort((left, right) => left - right);

  return {
    distinctLevels,
    countsByLevel,
    maxLevel: distinctLevels.length > 0 ? distinctLevels[distinctLevels.length - 1] : 0,
    headings,
  };
}

/**
 * The assertion this module replaces, kept so its false positive stays visible
 * and testable rather than only described in a comment.
 *
 * @deprecated Prefer {@link evaluateHeadingHierarchy}; depth is not hierarchy.
 */
export function maximumHeadingDepth(markdown: string): number {
  return analyzeMarkdownHeadings(markdown).maxLevel;
}

/**
 * Evaluates a document's real heading hierarchy against an expectation.
 */
export function evaluateHeadingHierarchy(
  markdown: string,
  expectation: HeadingHierarchyExpectation
): HeadingHierarchyVerdict {
  const hierarchy = analyzeMarkdownHeadings(markdown);
  const found = hierarchy.distinctLevels;

  if (expectation.expectedLevels !== undefined) {
    const expected = [...expectation.expectedLevels].sort((left, right) => left - right);
    const passed =
      expected.length === found.length && expected.every((level, index) => level === found[index]);
    return {
      ...hierarchy,
      passed,
      details: `expected levels [${expected.join(', ')}], found [${found.join(', ')}]`,
    };
  }

  const minimum = expectation.minimumDistinctLevels ?? 1;
  return {
    ...hierarchy,
    passed: found.length >= minimum,
    details: `${found.length} distinct level(s) [${found.join(', ')}], required ${minimum}`,
  };
}
