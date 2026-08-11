/**
 * Career Playbook — canonical ledgers (single source of numeric and factual truth)
 * @module stages/stage-career-playbook/nodes/quality-ledger
 *
 * The 2026-08-11 representative run scored 2.6/5 editorially. Two of its worst
 * dimensions trace back to the same shape of defect: the spec carried metric
 * *names* but no values, and research URLs never reached block generation. Each
 * block therefore invented its own thresholds (pipeline coverage appeared as
 * both >=2x and >=3x within a single generation call) and asserted precise
 * market statistics with nothing behind them.
 *
 * This module owns the two ledgers that fix that:
 *
 * - `metric_ledger` — built by the model, then deterministically normalized here,
 *   and quoted verbatim by every block.
 * - `evidence_ledger` — built here from the research result and never by the
 *   model, so a citation cannot be hallucinated.
 *
 * Same division of labour as `spec-builder-canonical.ts`: ask the model, then
 * make the result conform. See docs/career-playbook/quality-contract.md.
 */

import type {
  CareerPlaybookEvidenceEntry,
  CareerPlaybookMetricLedgerEntry,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookWebResearchResult } from '../rag/web-research';

/** Longest claim kept per evidence entry; enough to identify it, short enough to stay cheap. */
const MAX_CLAIM_LENGTH = 220;

/** Upper bound on evidence entries carried into every block prompt. */
const MAX_EVIDENCE_ENTRIES = 12;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, limit: number): string {
  const collapsed = collapseWhitespace(value);
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Normalize a model-built metric ledger onto the contract: stable snake_case
 * keys, no duplicate metric, no entry without a target, lowercase units.
 *
 * Dropping a target-less entry is deliberate. An entry with no target cannot
 * constrain anything downstream, and keeping it would let a block "quote the
 * ledger" while still inventing the number — exactly the failure this ledger
 * exists to prevent.
 */
export function normalizeCareerPlaybookMetricLedger(
  entries: readonly CareerPlaybookMetricLedgerEntry[] | undefined
): CareerPlaybookMetricLedgerEntry[] {
  if (!entries?.length) return [];

  const byKey = new Map<string, CareerPlaybookMetricLedgerEntry>();

  for (const entry of entries) {
    const key = collapseWhitespace(entry.key)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const label = collapseWhitespace(entry.label);
    const target = collapseWhitespace(entry.target);

    if (!key || !label || !target) continue;
    // First occurrence wins: the model lists its primary definition first, and a
    // later duplicate is what produced conflicting thresholds in the first place.
    if (byKey.has(key)) continue;

    byKey.set(key, {
      ...entry,
      key,
      label,
      target,
      unit: collapseWhitespace(entry.unit ?? '').toLowerCase(),
      green: collapseWhitespace(entry.green ?? ''),
      yellow: collapseWhitespace(entry.yellow ?? ''),
      red: collapseWhitespace(entry.red ?? ''),
      review_period: collapseWhitespace(entry.review_period ?? '').toLowerCase(),
      source_ref: entry.source_ref?.trim() || null,
    });
  }

  return [...byKey.values()];
}

/**
 * Build the evidence ledger from the research result. Application-owned on
 * purpose: identifiers are assigned in retrieval order and every claim stays
 * attached to the URL it came from, so a `[Sn]` marker in the guide always
 * resolves to a real source.
 */
export function buildCareerPlaybookEvidenceLedger(
  research: CareerPlaybookWebResearchResult | null | undefined,
  retrievedAt: string
): CareerPlaybookEvidenceEntry[] {
  if (!research?.findings?.length) return [];

  const seenUrls = new Set<string>();
  const entries: CareerPlaybookEvidenceEntry[] = [];

  for (const finding of research.findings) {
    if (entries.length >= MAX_EVIDENCE_ENTRIES) break;

    const url = finding.url.trim();
    const claim = truncate(finding.claim, MAX_CLAIM_LENGTH);
    if (!url || !claim || seenUrls.has(url)) continue;

    seenUrls.add(url);
    entries.push({
      id: `S${entries.length + 1}`,
      url,
      title: truncate(finding.title, 120) || url,
      claim,
      retrieved_at: retrievedAt,
    });
  }

  return entries;
}

/**
 * Drop metric source references that point at no evidence entry. A dangling
 * `source_ref` would let a block print `[S3]` for a source that does not exist,
 * which is worse than an honest unsourced benchmark.
 */
export function reconcileMetricLedgerSourceRefs(
  metrics: readonly CareerPlaybookMetricLedgerEntry[],
  evidence: readonly CareerPlaybookEvidenceEntry[]
): CareerPlaybookMetricLedgerEntry[] {
  const ids = new Set(evidence.map(entry => entry.id));

  return metrics.map(metric => {
    if (!metric.source_ref || ids.has(metric.source_ref)) return metric;
    // A benchmark without a resolvable source is an assumption, and the guide
    // must present it as one rather than as an externally backed figure.
    return {
      ...metric,
      source_ref: null,
      provenance: metric.provenance === 'benchmark' ? 'assumption' : metric.provenance,
    };
  });
}

const METRIC_LEDGER_EMPTY = 'none — no canonical metric targets were derived for this role';

/** Render the metric ledger as the markdown table the block prompts quote from. */
export function formatCareerPlaybookMetricLedgerForPrompt(
  metrics: readonly CareerPlaybookMetricLedgerEntry[]
): string {
  if (metrics.length === 0) return METRIC_LEDGER_EMPTY;

  const rows = metrics.map(metric => {
    const thresholds = [
      metric.green && `green ${metric.green}`,
      metric.yellow && `yellow ${metric.yellow}`,
      metric.red && `red ${metric.red}`,
    ]
      .filter(Boolean)
      .join('; ');

    return `| ${metric.label} | ${metric.target}${metric.unit ? ` ${metric.unit}` : ''} | ${
      thresholds || '—'
    } | ${metric.review_period || '—'} | ${metric.provenance}${
      metric.source_ref ? ` [${metric.source_ref}]` : ''
    } |`;
  });

  return [
    '| Metric | Target | Traffic light | Review period | Provenance |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

const EVIDENCE_LEDGER_EMPTY =
  'none — no external source was retrieved for this run, so no precise external statistic may be stated';

/** Render the evidence ledger as the citable list the block prompts reference. */
export function formatCareerPlaybookEvidenceLedgerForPrompt(
  evidence: readonly CareerPlaybookEvidenceEntry[]
): string {
  if (evidence.length === 0) return EVIDENCE_LEDGER_EMPTY;

  return evidence
    .map(entry => `- [${entry.id}] ${entry.title} — ${entry.url} — supports: ${entry.claim}`)
    .join('\n');
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookMetricLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookMetricLedgerEntry[] {
  return spec?.metric_ledger ?? [];
}

/** Convenience accessor used by prompt builders and deterministic checks alike. */
export function getCareerPlaybookEvidenceLedger(
  spec: CareerPlaybookRoleProfileSpec | null | undefined
): CareerPlaybookEvidenceEntry[] {
  return spec?.evidence_ledger ?? [];
}
